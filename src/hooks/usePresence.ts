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

async function getSupabase() {
    if (supabaseClient) return supabaseClient
    try {
        const { createClient } = await import('@supabase/supabase-js')
        const config = useSyncStore.getState().config
        if (!config?.configured || !config.url) return null
        // Retrieve the anon key from secure storage via IPC
        const anonKey = await window.electronAPI?.secureStoreGet?.('sync_supabase_anon_key')
        if (!anonKey) return null
        supabaseClient = createClient(config.url, anonKey, {
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
                channelRegistry.set(channelName, ch)
                channelRef.current = ch
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
            // Untrack this user when they leave
            channelRef.current?.untrack?.().catch(() => {})
        }
    }, [taskId, config?.userId, config?.configured])

    return { viewers }
}
