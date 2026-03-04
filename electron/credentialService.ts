let keytar: any = null
let KEYTAR_AVAILABLE = false
try {
    // Use require so missing optional dependency won't crash build-time imports
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    keytar = require('keytar')
    KEYTAR_AVAILABLE = true
} catch (e) {
    KEYTAR_AVAILABLE = false
}

export const SERVICE_NAME = 'QAssistant'

// Fallback in-memory store for local dev when keytar isn't installed.
const fallbackStore: Record<string, string> = {}

export async function setCredential(account: string, secret: string): Promise<void> {
    if (KEYTAR_AVAILABLE && keytar && typeof keytar.setPassword === 'function') {
        await keytar.setPassword(SERVICE_NAME, account, secret)
        return
    }
    fallbackStore[account] = secret
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
        return true
    }
    return false
}

export async function listCredentials(): Promise<Array<{ account: string; password: string }>> {
    if (KEYTAR_AVAILABLE && keytar && typeof keytar.findCredentials === 'function') {
        return await keytar.findCredentials(SERVICE_NAME)
    }
    return Object.entries(fallbackStore).map(([account, password]) => ({ account, password }))
}
