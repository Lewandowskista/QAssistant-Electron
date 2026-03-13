/**
 * OAuth 2.0 + PKCE flow for GitHub and Linear.
 *
 * Flow:
 *  1. generateAuthUrl()  → open in system browser via shell.openExternal()
 *  2. Express route at /auth/callback receives the redirect with ?code=...&state=...
 *  3. exchangeCode()     → swaps code for tokens, fetches user identity
 *  4. Tokens stored via credentialService (OS keyring / safeStorage)
 *
 * Client secrets for desktop OAuth apps are not truly secret (they ship in the
 * binary and can be extracted). This is the accepted industry pattern — VS Code,
 * GitHub Desktop, and similar apps all follow it. PKCE mitigates the risk.
 */

import crypto from 'node:crypto'
import https from 'node:https'
import { setCredential, getCredential, deleteCredential } from './credentialService'

export type AuthProvider = 'github' | 'linear'

export type OAuthTokens = {
    accessToken: string
    refreshToken: string | null
    expiresAt: number | null   // epoch ms, null if no expiry info
}

export type OAuthUserInfo = {
    providerId: string
    username: string
    email: string | null
    avatarUrl: string | null
}

// ── Per-provider configuration ─────────────────────────────────────────────

interface ProviderConfig {
    authUrl: string
    tokenUrl: string
    scopes: string
    clientId: string
    clientSecretEnvVar: string
    supportsPkce: boolean  // GitHub OAuth Apps don't support PKCE; GitHub Apps and Linear do
}

const PROVIDER_CONFIG: Record<AuthProvider, ProviderConfig> = {
    github: {
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scopes: 'read:user user:email repo',
        clientId: process.env['GITHUB_CLIENT_ID'] || '',
        clientSecretEnvVar: 'GITHUB_CLIENT_SECRET',
        supportsPkce: false,
    },
    linear: {
        authUrl: 'https://linear.app/oauth/authorize',
        tokenUrl: 'https://api.linear.app/oauth/token',
        scopes: 'read',
        clientId: process.env['LINEAR_CLIENT_ID'] || '',
        clientSecretEnvVar: 'LINEAR_CLIENT_SECRET',
        supportsPkce: true,
    },
}

function getClientSecret(provider: AuthProvider): string {
    const envVar = PROVIDER_CONFIG[provider].clientSecretEnvVar
    return process.env[envVar] || ''
}

// ── In-memory PKCE state (per pending auth session) ────────────────────────

type PendingAuth = {
    state: string
    codeVerifier: string
    provider: AuthProvider
    callbackPort: number
}

let pendingAuth: PendingAuth | null = null

// ── PKCE helpers ───────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url')
}

// ── Public API ─────────────────────────────────────────────────────────────

export function generateAuthUrl(provider: AuthProvider, callbackPort: number): string {
    const config = PROVIDER_CONFIG[provider]
    const state = crypto.randomBytes(16).toString('hex')
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    pendingAuth = { state, codeVerifier, provider, callbackPort }

    const params: Record<string, string> = {
        client_id: config.clientId,
        redirect_uri: `http://localhost:${callbackPort}/auth/callback`,
        scope: config.scopes,
        state,
        response_type: 'code',
    }

    if (config.supportsPkce) {
        params['code_challenge'] = codeChallenge
        params['code_challenge_method'] = 'S256'
    }

    return `${config.authUrl}?${new URLSearchParams(params).toString()}`
}

export function getPendingAuth(): PendingAuth | null {
    return pendingAuth
}

export function clearPendingAuth(): void {
    pendingAuth = null
}

export async function exchangeCode(
    provider: AuthProvider,
    code: string,
    state: string,
    callbackPort: number
): Promise<OAuthUserInfo> {
    if (!pendingAuth || pendingAuth.state !== state || pendingAuth.provider !== provider) {
        throw new Error('OAuth state mismatch — possible CSRF attack or stale session')
    }

    const config = PROVIDER_CONFIG[provider]
    const codeVerifier = pendingAuth.codeVerifier
    clearPendingAuth()

    // Exchange code for tokens
    const tokenParams: Record<string, string> = {
        client_id: config.clientId,
        client_secret: getClientSecret(provider),
        code,
        redirect_uri: `http://localhost:${callbackPort}/auth/callback`,
        grant_type: 'authorization_code',
    }
    if (config.supportsPkce) {
        tokenParams['code_verifier'] = codeVerifier
    }
    const tokenBody = new URLSearchParams(tokenParams)

    const tokenResponse = await httpPost(config.tokenUrl, tokenBody.toString(), {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
    })

    let tokenData: any
    try {
        tokenData = JSON.parse(tokenResponse)
    } catch {
        // GitHub can return form-encoded response for older setups
        const parsed = new URLSearchParams(tokenResponse)
        tokenData = Object.fromEntries(parsed.entries())
    }

    if (tokenData.error) {
        throw new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`)
    }

    const accessToken: string = tokenData.access_token
    const refreshToken: string | null = tokenData.refresh_token || null
    const expiresIn: number | null = tokenData.expires_in ? Number(tokenData.expires_in) : null
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null

    // Store tokens securely
    await setCredential(`oauth_${provider}_access_token`, accessToken)
    if (refreshToken) {
        await setCredential(`oauth_${provider}_refresh_token`, refreshToken)
    }
    if (expiresAt) {
        await setCredential(`oauth_${provider}_expires_at`, String(expiresAt))
    }

    // Fetch user identity
    const userInfo = await fetchUserInfo(provider, accessToken)
    return userInfo
}

async function fetchUserInfo(provider: AuthProvider, accessToken: string): Promise<OAuthUserInfo> {
    if (provider === 'github') {
        const userData = await httpGet('api.github.com', '/user', {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'QAssistant-Electron',
            'X-GitHub-Api-Version': '2022-11-28',
        })
        const user = JSON.parse(userData)

        let email: string | null = user.email || null
        if (!email) {
            // Try fetching private email
            try {
                const emailsData = await httpGet('api.github.com', '/user/emails', {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'QAssistant-Electron',
                    'X-GitHub-Api-Version': '2022-11-28',
                })
                const emails = JSON.parse(emailsData)
                const primary = emails.find((e: any) => e.primary && e.verified)
                email = primary?.email || null
            } catch {
                // email remains null
            }
        }

        return {
            providerId: String(user.id),
            username: user.login,
            email,
            avatarUrl: user.avatar_url || null,
        }
    }

    if (provider === 'linear') {
        const query = `{ viewer { id name email avatarUrl } }`
        const responseData = await httpPostJson('api.linear.app', '/graphql', { query }, {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        })
        const result = JSON.parse(responseData)
        const viewer = result?.data?.viewer
        if (!viewer) throw new Error('Failed to fetch Linear user info')

        return {
            providerId: viewer.id,
            username: viewer.name,
            email: viewer.email || null,
            avatarUrl: viewer.avatarUrl || null,
        }
    }

    throw new Error(`Unknown provider: ${provider}`)
}

// ── Token management ───────────────────────────────────────────────────────

export async function getStoredTokens(provider: AuthProvider): Promise<OAuthTokens | null> {
    const accessToken = await getCredential(`oauth_${provider}_access_token`)
    if (!accessToken) return null

    const refreshToken = await getCredential(`oauth_${provider}_refresh_token`)
    const expiresAtStr = await getCredential(`oauth_${provider}_expires_at`)
    const expiresAt = expiresAtStr ? Number(expiresAtStr) : null

    return { accessToken, refreshToken, expiresAt }
}

export async function revokeTokens(provider: AuthProvider): Promise<void> {
    await deleteCredential(`oauth_${provider}_access_token`)
    await deleteCredential(`oauth_${provider}_refresh_token`)
    await deleteCredential(`oauth_${provider}_expires_at`)
}

export async function isConnected(provider: AuthProvider): Promise<boolean> {
    const token = await getCredential(`oauth_${provider}_access_token`)
    return !!token
}

// ── HTTP helpers (uses Node https — avoids fetch which isn't available in older Electron main process) ──

function httpPost(url: string, body: string, headers: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url)
        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
            let data = ''
            res.on('data', (chunk) => data += chunk)
            res.on('end', () => resolve(data))
        })
        req.on('error', reject)
        req.write(body)
        req.end()
    })
}

function httpGet(hostname: string, path: string, headers: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
        const req = https.request({ hostname, path, method: 'GET', headers }, (res) => {
            let data = ''
            res.on('data', (chunk) => data += chunk)
            res.on('end', () => resolve(data))
        })
        req.on('error', reject)
        req.end()
    })
}

function httpPostJson(hostname: string, path: string, body: object, headers: Record<string, string>): Promise<string> {
    const bodyStr = JSON.stringify(body)
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname,
            path,
            method: 'POST',
            headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) },
        }, (res) => {
            let data = ''
            res.on('data', (chunk) => data += chunk)
            res.on('end', () => resolve(data))
        })
        req.on('error', reject)
        req.write(bodyStr)
        req.end()
    })
}
