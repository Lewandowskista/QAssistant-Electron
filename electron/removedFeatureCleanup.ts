/**
 * removedFeatureCleanup.ts — one-time purge of credentials whose feature is gone.
 *
 * The SAP console features (HAC, CCv2) and the per-environment HAC credentials
 * were removed, but their secrets are already sitting in users' keychains — and,
 * for anyone with cloud sync on, in their Supabase snapshot as plaintext. Nothing
 * reads them any more, so leaving them is pure liability.
 *
 * Runs once, guarded by a marker credential so a re-run is cheap. The caller is
 * expected to trigger a cloud-state upload afterwards so the deletions propagate
 * off-device too.
 */
import { log } from './logger'

/** Marker so the sweep only runs once per machine. */
const CLEANUP_MARKER_KEY = 'cleanup_sap_credentials_v1'

/**
 * Keys to remove. HAC and CCv2 are matched by suffix because they are stored
 * per-project with a `project:<id>:` prefix; environment credentials are matched
 * by the `Env_<id>_Username` / `Env_<id>_Password` shape.
 */
const ORPHANED_SUFFIXES = [
    'ccv2_subscription_code',
    'ccv2_api_token',
    'hac_username',
    'hac_password',
]

const ENVIRONMENT_CREDENTIAL_PATTERN = /^Env_.+_(Username|Password)$/

export function isOrphanedCredentialKey(account: string): boolean {
    if (ENVIRONMENT_CREDENTIAL_PATTERN.test(account)) return true
    return ORPHANED_SUFFIXES.some(suffix => account === suffix || account.endsWith(`:${suffix}`))
}

export async function purgeRemovedFeatureCredentials(io: {
    listCredentials: () => Promise<Array<{ account: string; password: string }>>
    getCredential: (key: string) => Promise<string | null>
    setCredential: (key: string, value: string) => Promise<void>
    deleteCredential: (key: string) => Promise<boolean>
}): Promise<{ alreadyDone: boolean; removed: number }> {
    try {
        if (await io.getCredential(CLEANUP_MARKER_KEY)) {
            return { alreadyDone: true, removed: 0 }
        }
    } catch {
        // An unreadable credential store means we cannot tell whether this already
        // ran. Attempting the sweep again is harmless, so carry on.
    }

    let removed = 0
    try {
        const entries = await io.listCredentials()
        for (const entry of entries) {
            if (!isOrphanedCredentialKey(entry.account)) continue
            try {
                await io.deleteCredential(entry.account)
                removed += 1
            } catch (error) {
                log.warn(`[cleanup] Could not remove orphaned credential ${entry.account}:`, error)
            }
        }
        await io.setCredential(CLEANUP_MARKER_KEY, new Date().toISOString())
    } catch (error) {
        // Never block startup on this.
        log.warn('[cleanup] Orphaned credential sweep failed:', error)
        return { alreadyDone: false, removed }
    }

    if (removed > 0) {
        log.info(`[cleanup] Removed ${removed} credential(s) belonging to removed SAP features.`)
    }
    return { alreadyDone: false, removed }
}
