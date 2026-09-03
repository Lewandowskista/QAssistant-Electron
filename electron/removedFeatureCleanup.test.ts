/**
 * Tests for the one-time purge of credentials orphaned by the SAP console removal.
 *
 * This code deletes secrets, so the matcher is the part that matters: it must
 * catch every key the removed features owned and must not touch anything a live
 * feature still needs.
 */
import { describe, it, expect, vi } from 'vitest'
import { isOrphanedCredentialKey, purgeRemovedFeatureCredentials } from './removedFeatureCleanup'

vi.mock('./logger', () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('isOrphanedCredentialKey', () => {
    it.each([
        'ccv2_subscription_code',
        'ccv2_api_token',
        'project:abc-123:ccv2_subscription_code',
        'project:abc-123:ccv2_api_token',
        'Env_env-1_Username',
        'Env_env-1_Password',
        'Env_9f8e7d6c-1234_Password',
    ])('treats %s as orphaned', (key) => {
        expect(isOrphanedCredentialKey(key)).toBe(true)
    })

    it.each([
        'gemini_api_key',
        'nim_api_key',
        'project:abc-123:gemini_api_key',
        'project:abc-123:automation_api_key',
        'oauth_github_access_token',
        'oauth_linear_access_token',
        'auth_access_token',
        'auth_refresh_token',
        'auth_user_json',
        'project:abc-123:linear_api_key_lc1',
        'project:abc-123:jira_api_key_jc1',
    ])('leaves %s alone', (key) => {
        expect(isOrphanedCredentialKey(key)).toBe(false)
    })

    it('does not match a key that merely mentions an environment', () => {
        // The pattern is anchored, so a live key whose name contains "Env_" in the
        // middle must not be swept up.
        expect(isOrphanedCredentialKey('project:p1:my_Env_Username_thing')).toBe(false)
    })
})

/** In-memory credential store standing in for the keychain. */
function fakeStore(initial: Record<string, string>) {
    const store = new Map(Object.entries(initial))
    return {
        store,
        listCredentials: vi.fn(async () =>
            [...store.entries()].map(([account, password]) => ({ account, password }))
        ),
        getCredential: vi.fn(async (key: string) => store.get(key) ?? null),
        setCredential: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
        deleteCredential: vi.fn(async (key: string) => store.delete(key)),
    }
}

describe('purgeRemovedFeatureCredentials', () => {
    it('removes only the orphaned keys and records that it ran', async () => {
        const io = fakeStore({
            'project:p1:ccv2_api_token': 'token',
            'project:p1:ccv2_subscription_code': 'sub',
            'Env_env-1_Username': 'admin',
            'Env_env-1_Password': 'nimda',
            'project:p1:gemini_api_key': 'keep-me',
            'auth_access_token': 'keep-me-too',
        })

        const result = await purgeRemovedFeatureCredentials(io)

        expect(result).toEqual({ alreadyDone: false, removed: 4 })
        expect([...io.store.keys()].sort()).toEqual([
            'auth_access_token',
            'cleanup_sap_credentials_v1',
            'project:p1:gemini_api_key',
        ])
    })

    it('is a no-op on the second run', async () => {
        const io = fakeStore({ 'cleanup_sap_credentials_v1': '2026-09-03T00:00:00.000Z', 'Env_e1_Password': 'x' })

        const result = await purgeRemovedFeatureCredentials(io)

        expect(result).toEqual({ alreadyDone: true, removed: 0 })
        expect(io.deleteCredential).not.toHaveBeenCalled()
        expect(io.store.has('Env_e1_Password')).toBe(true)
    })

    it('reports nothing removed on a clean store but still marks itself done', async () => {
        const io = fakeStore({ 'project:p1:gemini_api_key': 'k' })

        const result = await purgeRemovedFeatureCredentials(io)

        expect(result.removed).toBe(0)
        expect(io.store.has('cleanup_sap_credentials_v1')).toBe(true)
    })

    it('keeps going when one deletion fails', async () => {
        const io = fakeStore({ 'Env_e1_Username': 'a', 'Env_e2_Username': 'b' })
        io.deleteCredential.mockImplementationOnce(async () => { throw new Error('keychain locked') })

        const result = await purgeRemovedFeatureCredentials(io)

        expect(result.removed).toBe(1)
        expect(io.deleteCredential).toHaveBeenCalledTimes(2)
    })

    it('never throws when the credential store is unavailable', async () => {
        const io = fakeStore({})
        io.listCredentials.mockRejectedValueOnce(new Error('no keychain'))

        // Startup must not be blocked by a failed sweep.
        await expect(purgeRemovedFeatureCredentials(io)).resolves.toEqual({ alreadyDone: false, removed: 0 })
    })
})
