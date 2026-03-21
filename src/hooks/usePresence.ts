/**
 * Phase 3 — Real-time presence
 *
 * Uses Supabase Realtime Presence channels to broadcast which user is
 * currently viewing a given task. Falls back gracefully when sync is not
 * configured.
 *
 * Usage:
 *   const { viewers } = usePresence(taskId)
 */
import { useEffect, useState, useRef } from 'react'
import { useSyncStore } from '@/store/useSyncStore'

export interface PresenceUser {
    userId: string
    displayName: string
    role: string
    joinedAt: number
}

// Singleton map of channel refs keyed by taskId so multiple component instances
// on the same task share one channel.
const channelRegistry = new Map<string, any>()
let supabaseClient: any = null

/** Called by useSyncStore.disconnect() to clear the singleton on logout. */
export function clearPresenceClient() {
    supabaseClient = null
    channelRegistry.clear()
}

async function getSupabase() {
    if (supabaseClient) return supabaseClient
    try {
        const { createClient } = await import('@supabase/supabase-js')
        const config = useSyncStore.getState().config
        if (!config?.configured || !config.url || !config.anonKey) return null
        supabaseClient = createClient(config.url, config.anonKey, {
            realtime: { params: { eventsPerSecond: 2 } }
        })
        return supabaseClient
    } catch {
        return null
    }
}

export function usePresence(taskId: string | undefined) {
    const [viewers, setViewers] = useState<PresenceUser[]>([])
    const channelRef = useRef<any>(null)
    const config = useSyncStore(s => s.config)

    useEffect(() => {
        if (!taskId || !config?.configured || !config.userId) return

        let mounted = true

        async function setup() {
            const sb = await getSupabase()
            if (!sb || !mounted) return

            const channelName = `presence:task:${taskId}`
            const existing = channelRegistry.get(channelName)
            if (existing) {
                channelRef.current = existing
            } else {
                const ch = sb.channel(channelName, {
                    config: { presence: { key: config!.userId! } }
                })
                // Guard: only register if still mounted to prevent orphaned entries
                // when the component unmounts before the async getSupabase() resolves.
                if (!mounted) return
                channelRegistry.set(channelName, ch)
                channelRef.current = ch
            }

            // Periodic sweep: remove channels that are stuck in a non-joined state
            // (e.g. due to network loss) to prevent unbounded registry growth.
            for (const [key, ch] of channelRegistry) {
                if (ch.state !== 'joined' && ch.state !== 'joining') {
                    channelRegistry.delete(key)
                }
            }

            const ch = channelRef.current

            ch.on('presence', { event: 'sync' }, () => {
                if (!mounted) return
                const state = ch.presenceState()
                const active: PresenceUser[] = Object.values(state).flatMap((arr: any) => arr)
                setViewers(active.filter((u: PresenceUser) => u.userId !== config!.userId))
            })

            if (ch.state !== 'joined') {
                ch.subscribe(async (status: string) => {
                    if (status === 'SUBSCRIBED' && mounted) {
                        await ch.track({
                            userId: config!.userId,
                            displayName: config!.displayName ?? 'Unknown',
                            role: 'viewer',
                            joinedAt: Date.now(),
                        })
                    }
                })
            } else {
                // Already subscribed — just track
                await ch.track({
                    userId: config!.userId,
                    displayName: config!.displayName ?? 'Unknown',
                    role: 'viewer',
                    joinedAt: Date.now(),
                })
            }
        }

        setup()

        return () => {
            mounted = false
            // Untrack this user and remove the channel from the registry
            // to prevent unbounded growth when many tasks are visited.
            if (channelRef.current) {
                channelRef.current.untrack?.().catch(() => {})
                const channelName = `presence:task:${taskId}`
                const registered = channelRegistry.get(channelName)
                if (registered === channelRef.current) {
                    channelRegistry.delete(channelName)
                }
            }
        }
    }, [taskId, config?.userId, config?.configured])

    return { viewers }
}
