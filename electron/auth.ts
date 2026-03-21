import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js'
import { deleteCredential, getCredential, setCredential } from './credentialService'

const SETTINGS_SUPABASE_URL = 'supabaseUrl'
const SETTINGS_SUPABASE_ANON_KEY = 'supabaseAnonKey'

const CRED_AUTH_ACCESS_TOKEN = 'auth_access_token'
const CRED_AUTH_REFRESH_TOKEN = 'auth_refresh_token'
const CRED_AUTH_USER_JSON = 'auth_user_json'
const CRED_AUTH_PENDING_EMAIL_LEGACY = 'auth_pending_email'
const AUTH_INIT_TIMEOUT_MS = 10000
const AUTH_REQUEST_TIMEOUT_MS = 10000
const AUTH_PROFILE_TIMEOUT_MS = 5000

export type AuthStateName =
    | 'booting'
    | 'signed_out'
    | 'signing_in'
    | 'signed_in'
    | 'error'

export type AuthenticatedUser = {
    id: string
    email: string | null
    displayName: string
    emailConfirmedAt: string | null
}

export type AuthStatusPayload = {
    configured: boolean
    status: AuthStateName
    user: AuthenticatedUser | null
    error: string | null
    supabaseUrl?: string
    supabaseAnonKey?: string
    usingOfflineSession?: boolean
}

let supabase: SupabaseClient | null = null
let authStatus: AuthStateName = 'booting'
let authError: string | null = null
let currentUser: AuthenticatedUser | null = null
let usingOfflineSession = false
let currentConfig: { url?: string; anonKey?: string } = {}
let sender: ((channel: string, ...args: unknown[]) => void) | null = null
let settingsReader: (() => Promise<Record<string, unknown>>) | null = null
let authChangeSubscription: { unsubscribe: () => void } | null = null
let initAuthPromise: Promise<AuthStatusPayload> | null = null
let authInitialized = false

export function setAuthWindowSender(fn: (channel: string, ...args: unknown[]) => void) {
    sender = fn
}

export function configureAuthIo(io: {
    readSettings: () => Promise<Record<string, unknown>>
    writeSettings: (next: Record<string, unknown>) => Promise<void>
}) {
    settingsReader = io.readSettings
    void io.writeSettings
}

function notifyRenderer() {
    sender?.('auth-status-changed', getAuthStatus())
}

function setStatus(next: AuthStateName, updates?: Partial<Pick<AuthStatusPayload, 'error' | 'usingOfflineSession' | 'user'>>) {
    authStatus = next
    if (updates?.error !== undefined) authError = updates.error
    if (updates?.usingOfflineSession !== undefined) usingOfflineSession = !!updates.usingOfflineSession
    if (updates?.user !== undefined) currentUser = updates.user ?? null
    if (next !== 'error' && updates?.error === undefined) authError = null
    notifyRenderer()
}

function getEnvSetting(name: string): string | null {
    const value = process.env[name]?.trim()
    return value ? value : null
}

async function readSettingsValue(key: string): Promise<string | null> {
    if (!settingsReader) return null
    const settings = await settingsReader()
    const raw = settings[key]
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

async function resolveSupabaseConfig(): Promise<{ url?: string; anonKey?: string }> {
    const envUrl = getEnvSetting('SUPABASE_URL') ?? getEnvSetting('VITE_SUPABASE_URL')
    const envAnonKey = getEnvSetting('SUPABASE_ANON_KEY') ?? getEnvSetting('VITE_SUPABASE_ANON_KEY')

    const url = envUrl ?? await readSettingsValue(SETTINGS_SUPABASE_URL) ?? undefined
    const anonKey = envAnonKey ?? await readSettingsValue(SETTINGS_SUPABASE_ANON_KEY) ?? undefined

    return { url, anonKey }
}

function normalizeUser(user: Pick<User, 'id' | 'email' | 'email_confirmed_at' | 'user_metadata'>, displayName?: string | null): AuthenticatedUser {
    const derivedDisplayName =
        displayName?.trim() ||
        (typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name.trim() : '') ||
        user.email?.split('@')[0] ||
        'User'

    return {
        id: user.id,
        email: user.email ?? null,
        displayName: derivedDisplayName,
        emailConfirmedAt: user.email_confirmed_at ?? null,
    }
}

async function persistUserSnapshot(user: AuthenticatedUser | null) {
    if (!user) {
        await deleteCredential(CRED_AUTH_USER_JSON)
        return
    }
    await setCredential(CRED_AUTH_USER_JSON, JSON.stringify(user))
}

async function clearSessionCredentials() {
    await deleteCredential(CRED_AUTH_ACCESS_TOKEN)
    await deleteCredential(CRED_AUTH_REFRESH_TOKEN)
    await deleteCredential(CRED_AUTH_USER_JSON)
    await deleteCredential(CRED_AUTH_PENDING_EMAIL_LEGACY)
}

async function persistSession(session: Session, displayName?: string | null) {
    const normalized = normalizeUser(session.user, displayName)
    currentUser = normalized
    usingOfflineSession = false
    await setCredential(CRED_AUTH_ACCESS_TOKEN, session.access_token)
    await setCredential(CRED_AUTH_REFRESH_TOKEN, session.refresh_token ?? '')
    await persistUserSnapshot(normalized)
}

function parseJson<T>(value: string | null): T | null {
    if (!value) return null
    try {
        return JSON.parse(value) as T
    } catch {
        return null
    }
}

function isLikelyOfflineError(message: string): boolean {
    const normalized = message.toLowerCase()
    return normalized.includes('fetch failed') ||
        normalized.includes('network') ||
        normalized.includes('offline') ||
        normalized.includes('timed out') ||
        normalized.includes('dns')
}

function parseJwtExpiry(accessToken: string | null): number | null {
    if (!accessToken) return null
    try {
        const parts = accessToken.split('.')
        if (parts.length < 2) return null
        const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as { exp?: number }
        return typeof payload.exp === 'number' ? payload.exp * 1000 : null
    } catch {
        return null
    }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
        promise.then(
            value => {
                clearTimeout(timeoutId)
                resolve(value)
            },
            error => {
                clearTimeout(timeoutId)
                reject(error)
            },
        )
    })
}

async function withAuthTimeout<T>(promise: Promise<T>, message: string, timeoutMs = AUTH_REQUEST_TIMEOUT_MS): Promise<T> {
    return await withTimeout(promise, timeoutMs, message)
}

async function ensureClient(): Promise<SupabaseClient | null> {
    const config = await resolveSupabaseConfig()
    const previousConfig = currentConfig
    currentConfig = config
    if (!config.url || !config.anonKey) {
        supabase = null
        return null
    }

    const needsNewClient =
        !supabase ||
        previousConfig.url !== config.url ||
        previousConfig.anonKey !== config.anonKey

    if (!needsNewClient && supabase) {
        return supabase
    }

    if (authChangeSubscription) {
        authChangeSubscription.unsubscribe()
        authChangeSubscription = null
    }

    supabase = createClient(config.url, config.anonKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: false,
        },
    })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
        void (async () => {
            try {
                if (session) {
                    await persistSession(session)
                    await upsertCurrentUserProfile()
                    setStatus('signed_in', { user: currentUser, usingOfflineSession: false })
                    return
                }

                if (event === 'SIGNED_OUT') {
                    await clearSessionCredentials()
                    currentUser = null
                    usingOfflineSession = false
                    setStatus('signed_out', { user: null })
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                setStatus('error', { error: message, user: null, usingOfflineSession: false })
            }
        })()
    })
    authChangeSubscription = data.subscription

    return supabase
}

async function upsertCurrentUserProfile(preferredDisplayName?: string | null): Promise<AuthenticatedUser | null> {
    if (!supabase || !currentUser) return currentUser

    const displayName = preferredDisplayName?.trim() || currentUser.displayName || currentUser.email?.split('@')[0] || 'User'

    try {
        const { data, error } = await withTimeout(
            Promise.resolve(
                supabase
                    .from('user_profiles')
                    .upsert({
                        user_id: currentUser.id,
                        display_name: displayName,
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'user_id' })
                    .select('display_name')
                    .single(),
            ),
            AUTH_PROFILE_TIMEOUT_MS,
            'Profile sync timed out',
        )

        if (!error && data?.display_name) {
            currentUser = { ...currentUser, displayName: data.display_name }
            await persistUserSnapshot(currentUser)
        }
    } catch {
        // Keep the auth flow usable even if the profile table is not deployed yet.
    }

    return currentUser
}

async function performInitAuth(): Promise<AuthStatusPayload> {
    setStatus('booting', { error: null })

    await deleteCredential(CRED_AUTH_PENDING_EMAIL_LEGACY)
    const cachedUser = parseJson<AuthenticatedUser>(await getCredential(CRED_AUTH_USER_JSON))
    const accessToken = await getCredential(CRED_AUTH_ACCESS_TOKEN)
    const refreshToken = await getCredential(CRED_AUTH_REFRESH_TOKEN)
    const client = await ensureClient()

    if (!client || !currentConfig.url || !currentConfig.anonKey) {
        currentUser = null
        usingOfflineSession = false
        setStatus('signed_out', { user: null })
        authInitialized = true
        return getAuthStatus()
    }

    if (!accessToken || !refreshToken) {
        currentUser = null
        usingOfflineSession = false
        setStatus('signed_out', { user: null })
        authInitialized = true
        return getAuthStatus()
    }

    try {
        const { data, error } = await withTimeout(
            client.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
            }),
            AUTH_INIT_TIMEOUT_MS,
            'network timeout',
        )

        if (error || !data.session) {
            throw new Error(error?.message ?? 'Could not restore session')
        }

        await persistSession(data.session)
        await upsertCurrentUserProfile()
        setStatus('signed_in', { user: currentUser })
        authInitialized = true
        return getAuthStatus()
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const expiry = parseJwtExpiry(accessToken)
        const isNetworkIssue = isLikelyOfflineError(message)

        // JWT still valid + network down → use offline cached session
        if (cachedUser && expiry && expiry > Date.now() && isNetworkIssue) {
            currentUser = cachedUser
            usingOfflineSession = true
            setStatus('signed_in', {
                user: cachedUser,
                usingOfflineSession: true,
                error: null,
            })
            authInitialized = true
            return getAuthStatus()
        }

        // In all other cases (bad token, expired JWT, or network issue with expired JWT)
        // clear stale credentials so the next startup doesn't retry them
        await clearSessionCredentials()
        currentUser = null
        usingOfflineSession = false
        setStatus('signed_out', { user: null, error: null })
        authInitialized = true
        return getAuthStatus()
    }
}

export async function initAuth(): Promise<AuthStatusPayload> {
    if (authInitialized && authStatus !== 'booting') {
        return getAuthStatus()
    }

    if (initAuthPromise) {
        return await initAuthPromise
    }

    initAuthPromise = performInitAuth().finally(() => {
        initAuthPromise = null
    })
    return await initAuthPromise
}

export function getAuthStatus(): AuthStatusPayload {
    return {
        configured: !!(currentConfig.url && currentConfig.anonKey),
        status: authStatus,
        user: currentUser,
        error: authError,
        supabaseUrl: currentConfig.url,
        supabaseAnonKey: currentConfig.anonKey,
        usingOfflineSession,
    }
}

export async function authGetStatus(): Promise<AuthStatusPayload> {
    if (authStatus === 'booting') {
        return await initAuth()
    }
    return getAuthStatus()
}

function assertConfigured(client: SupabaseClient | null): asserts client is SupabaseClient {
    if (!client || !currentConfig.url || !currentConfig.anonKey) {
        throw new Error('Supabase app configuration is missing')
    }
}

function isUnconfirmedEmailError(message: string): boolean {
    const m = message.toLowerCase()
    return m.includes('email not confirmed') ||
        m.includes('email_not_confirmed') ||
        m.includes('confirmation') ||
        m.includes('not confirmed')
}

function isDuplicateEmailError(message: string): boolean {
    const m = message.toLowerCase()
    return m.includes('user already registered') ||
        m.includes('already registered') ||
        m.includes('already exists') ||
        m.includes('email address is already')
}

function getVerificationUnavailableMessage(): string {
    return 'This Supabase project requires email verification, but SMTP is not configured. Disable email confirmation in Supabase or configure SMTP.'
}

export function getAuthErrorStatus(message: string): AuthStatusPayload {
    return {
        ...getAuthStatus(),
        status: 'error',
        user: null,
        error: message,
    }
}

export async function authSignIn(email: string, password: string): Promise<AuthStatusPayload> {
    setStatus('signing_in', { error: null, usingOfflineSession: false })
    const client = await ensureClient()
    assertConfigured(client)

    const { data, error } = await withAuthTimeout(
        client.auth.signInWithPassword({ email, password }),
        'Sign-in timed out. Check your network and Supabase configuration.',
    )
    if (error || !data.user) {
        const message = error?.message ?? 'Sign-in failed'
        if (isUnconfirmedEmailError(message)) {
            await client.auth.signOut().catch(() => {})
            setStatus('error', { user: null, error: getVerificationUnavailableMessage() })
            return getAuthStatus()
        }
        setStatus('error', { error: message, user: null })
        return getAuthStatus()
    }

    if (!data.session) {
        setStatus('error', { error: 'No authenticated session returned after sign-in' })
        return getAuthStatus()
    }

    await persistSession(data.session)
    await upsertCurrentUserProfile()
    setStatus('signed_in', { user: currentUser })
    return getAuthStatus()
}

export async function authSignUp(email: string, password: string, displayName: string): Promise<AuthStatusPayload> {
    setStatus('signing_in', { error: null, usingOfflineSession: false })
    const client = await ensureClient()
    assertConfigured(client)

    const { data, error } = await withAuthTimeout(
        client.auth.signUp({
            email,
            password,
            options: {
                data: {
                    display_name: displayName,
                },
            },
        }),
        'Sign-up timed out. Check your network and Supabase configuration.',
    )

    if (error) {
        if (isDuplicateEmailError(error.message)) {
            setStatus('error', {
                error: 'An account with this email already exists. Sign in instead.',
                user: null,
            })
            return getAuthStatus()
        }
        setStatus('error', { error: error.message, user: null })
        return getAuthStatus()
    }

    if (data.session) {
        await persistSession(data.session, displayName)
        await upsertCurrentUserProfile(displayName)
        setStatus('signed_in', { user: currentUser })
        return getAuthStatus()
    }

    await client.auth.signOut().catch(() => {})
    currentUser = null
    usingOfflineSession = false
    setStatus('error', { user: null, error: getVerificationUnavailableMessage() })
    return getAuthStatus()
}

export async function authSignOut(): Promise<AuthStatusPayload> {
    const client = await ensureClient()
    if (client) {
        await client.auth.signOut().catch(() => {})
    }
    await clearSessionCredentials()
    currentUser = null
    usingOfflineSession = false
    setStatus('signed_out', { user: null, error: null })
    return getAuthStatus()
}

export async function authRefreshProfile(): Promise<AuthStatusPayload> {
    const client = await ensureClient()
    assertConfigured(client)
    const { data } = await withAuthTimeout(
        client.auth.getUser(),
        'Profile refresh timed out. Check your network and Supabase configuration.',
    )
    if (!data.user) {
        setStatus('signed_out', { user: null })
        return getAuthStatus()
    }
    currentUser = normalizeUser(data.user, currentUser?.displayName)
    await upsertCurrentUserProfile()
    setStatus('signed_in', { user: currentUser })
    return getAuthStatus()
}

export async function getAuthenticatedClient(): Promise<SupabaseClient | null> {
    if (authStatus === 'booting') {
        await initAuth()
    }
    const client = await ensureClient()
    if (!client || authStatus !== 'signed_in') return null
    return client
}
