/**
 * Tests for the Linear auto-sync guard.
 *
 * The consumer of onSyncComplete replaces every Linear-sourced task with
 * whatever it is handed, so a partial result deletes the remainder. Combined
 * with a 45-second poll, one failing connection used to wipe the Linear board
 * repeatedly — and because synced tasks carry local-only state (handoffs,
 * analysis history, collaboration state), that loss was not recoverable by a
 * later successful sync.
 *
 * These exercise the decision directly rather than through React, so no DOM or
 * renderer is needed: the rule under test is "publish only when every
 * connection succeeded".
 */
import { describe, it, expect, vi } from 'vitest'

/**
 * Mirrors performSync's per-connection loop. Kept in the test rather than
 * exported from the hook because the hook's own body is bound up with React
 * state; the invariant being pinned is the publish decision.
 */
async function syncAll(
    connections: Array<{ id: string }>,
    io: {
        getKey: (connectionId: string) => Promise<string | null>
        sync: (args: { apiKey: string; connectionId: string }) => Promise<unknown>
    },
): Promise<{ published: boolean; tasks: unknown[]; failed: string[] }> {
    let tasks: unknown[] = []
    const failed: string[] = []

    for (const connection of connections) {
        try {
            const apiKey = await io.getKey(connection.id)
            if (!apiKey) { failed.push(connection.id); continue }

            const synced = await io.sync({ apiKey, connectionId: connection.id })
            if (!Array.isArray(synced)) { failed.push(connection.id); continue }

            tasks = [...tasks, ...synced]
        } catch {
            failed.push(connection.id)
        }
    }

    if (failed.length > 0) return { published: false, tasks: [], failed }
    return { published: true, tasks, failed }
}

const key = async () => 'linear-key'

describe('publishing synced Linear tasks', () => {
    it('publishes when every connection succeeds', async () => {
        const result = await syncAll([{ id: 'c1' }, { id: 'c2' }], {
            getKey: key,
            sync: async ({ connectionId }) => [{ id: `${connectionId}-t1` }],
        })

        expect(result.published).toBe(true)
        expect(result.tasks).toHaveLength(2)
    })

    it('does not publish when a connection throws', async () => {
        // The old behaviour published the surviving subset, deleting the rest.
        const result = await syncAll([{ id: 'c1' }, { id: 'c2' }], {
            getKey: key,
            sync: async ({ connectionId }) => {
                if (connectionId === 'c2') throw new Error('network timeout')
                return [{ id: 'c1-t1' }]
            },
        })

        expect(result.published).toBe(false)
        expect(result.failed).toEqual(['c2'])
    })

    it('does not publish when every connection fails', async () => {
        // This was the worst case: an empty array replaced the whole board.
        const result = await syncAll([{ id: 'c1' }, { id: 'c2' }], {
            getKey: key,
            sync: async () => { throw new Error('429 Too Many Requests') },
        })

        expect(result.published).toBe(false)
        expect(result.tasks).toEqual([])
    })

    it('treats an error-shaped result as a failure, not as zero tasks', async () => {
        // The IPC layer reports failure in the resolved value rather than by
        // rejecting, so a 401 arrives as an object and used to spread to nothing.
        const result = await syncAll([{ id: 'c1' }], {
            getKey: key,
            sync: async () => ({ success: false, error: 'Unauthorized' }),
        })

        expect(result.published).toBe(false)
        expect(result.failed).toEqual(['c1'])
    })

    it('treats a missing credential as a failure rather than an empty team', async () => {
        // A connection that is configured but has no stored key must not be read
        // as "this team has no tasks any more".
        const result = await syncAll([{ id: 'c1' }, { id: 'c2' }], {
            getKey: async (id) => (id === 'c2' ? null : 'linear-key'),
            sync: async () => [{ id: 't1' }],
        })

        expect(result.published).toBe(false)
        expect(result.failed).toEqual(['c2'])
    })

    it('publishes an empty list only when the sync genuinely returned nothing', async () => {
        const sync = vi.fn(async () => [])
        const result = await syncAll([{ id: 'c1' }], { getKey: key, sync })

        expect(result.published).toBe(true)
        expect(result.tasks).toEqual([])
        expect(sync).toHaveBeenCalledOnce()
    })

    it('still attempts every connection after one fails', async () => {
        const sync = vi.fn(async ({ connectionId }: { connectionId: string }) => {
            if (connectionId === 'c1') throw new Error('boom')
            return [{ id: 'c2-t1' }]
        })

        const result = await syncAll([{ id: 'c1' }, { id: 'c2' }], { getKey: key, sync })

        // Reporting which connections are broken needs all of them tried.
        expect(sync).toHaveBeenCalledTimes(2)
        expect(result.published).toBe(false)
    })
})
