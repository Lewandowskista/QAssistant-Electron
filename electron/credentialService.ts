import { safeStorage } from 'electron'
import fs from 'node:fs'

type KeytarModule = {
    setPassword: (service: string, account: string, password: string) => Promise<void>
    getPassword: (service: string, account: string) => Promise<string | null>
    deletePassword: (service: string, account: string) => Promise<boolean>
}

let keytar: KeytarModule | null = null
let KEYTAR_AVAILABLE = false
try {
    // Use require so missing optional dependency won't crash build-time imports
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    keytar = require('keytar')
    KEYTAR_AVAILABLE = true
} catch {
    KEYTAR_AVAILABLE = false
}

export const SERVICE_NAME = 'QAssistant'

// Fallback in-memory store for local dev when keytar isn't installed.
const fallbackStore: Record<string, string> = {}
let storagePath: string | null = null
let plaintextFallbackAllowed = false

export type CredentialStorageStatus = {
    mode: 'keychain' | 'safeStorage' | 'plaintext'
    encrypted: boolean
    acknowledged: boolean
    requiresAcknowledgement: boolean
    canPersistSecrets: boolean
}

type SetCredentialOptions = {
    allowInsecureImport?: boolean
}

export function setPlaintextFallbackAllowed(allowed: boolean): void {
    plaintextFallbackAllowed = allowed
}

export function isPlaintextFallbackAllowed(): boolean {
    return plaintextFallbackAllowed
}

export function getCredentialStorageStatus(): CredentialStorageStatus {
    if (KEYTAR_AVAILABLE) {
        return {
            mode: 'keychain',
            encrypted: true,
            acknowledged: true,
            requiresAcknowledgement: false,
            canPersistSecrets: true,
        }
    }
    if (safeStorage.isEncryptionAvailable()) {
        return {
            mode: 'safeStorage',
            encrypted: true,
            acknowledged: true,
            requiresAcknowledgement: false,
            canPersistSecrets: true,
        }
    }
    return {
        mode: 'plaintext',
        encrypted: false,
        acknowledged: plaintextFallbackAllowed,
        requiresAcknowledgement: true,
        canPersistSecrets: plaintextFallbackAllowed,
    }
}

export function initCredentials(path: string): void {
    storagePath = path
    if (fs.existsSync(path)) {
        try {
            const raw = fs.readFileSync(path)
            if (raw.length > 0) {
                let decrypted = ''
                if (safeStorage.isEncryptionAvailable()) {
                    decrypted = safeStorage.decryptString(raw)
                } else {
                    decrypted = raw.toString('utf8')
                }
                const parsed = JSON.parse(decrypted)
                Object.assign(fallbackStore, parsed)
            }
        } catch (e) {
            console.error('Failed to load credentials from file:', e)
        }
    }
}

async function saveToFile(): Promise<void> {
    if (!storagePath) return
    try {
        const content = JSON.stringify(fallbackStore)
        let encrypted: Buffer
        if (safeStorage.isEncryptionAvailable()) {
            encrypted = safeStorage.encryptString(content)
        } else {
            console.warn('[QAssistant] safeStorage encryption is unavailable on this system. Credentials are being stored unencrypted. Consider upgrading your OS keyring or running the app with a desktop session.')
            encrypted = Buffer.from(content, 'utf8')
        }
        fs.writeFileSync(storagePath, encrypted)
    } catch (e) {
        console.error('Failed to save credentials to file:', e)
    }
}

export async function setCredential(account: string, secret: string, options: SetCredentialOptions = {}): Promise<void> {
    const status = getCredentialStorageStatus()
    if (status.mode === 'plaintext' && !status.canPersistSecrets && !options.allowInsecureImport) {
        throw new Error('Credential storage is unavailable until insecure plaintext storage is explicitly allowed in Settings.')
    }
    if (KEYTAR_AVAILABLE && keytar && typeof keytar.setPassword === 'function') {
        await keytar.setPassword(SERVICE_NAME, account, secret)
        return
    }
    fallbackStore[account] = secret
    await saveToFile()
}

export async function importLegacyCredential(account: string, secret: string): Promise<void> {
    await setCredential(account, secret, { allowInsecureImport: true })
}

export async function getCredential(account: string): Promise<string | null> {
    if (KEYTAR_AVAILABLE && keytar && typeof keytar.getPassword === 'function') {
        return await keytar.getPassword(SERVICE_NAME, account)
    }
    return fallbackStore[account] || null
}

export async function deleteCredential(account: string): Promise<boolean> {
    if (KEYTAR_AVAILABLE && keytar && typeof keytar.deletePassword === 'function') {
        return await keytar.deletePassword(SERVICE_NAME, account)
    }
    if (account in fallbackStore) {
        delete fallbackStore[account]
        await saveToFile()
        return true
    }
    return false
}

export function isKeychainAvailable(): boolean {
    return KEYTAR_AVAILABLE
}

export async function listCredentials(): Promise<Array<{ account: string; password: string }>> {
    if (KEYTAR_AVAILABLE && keytar && typeof keytar.findCredentials === 'function') {
        return await keytar.findCredentials(SERVICE_NAME)
    }
    return Object.entries(fallbackStore).map(([account, password]) => ({ account, password }))
}
