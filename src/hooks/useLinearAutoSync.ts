import { useRef, useState, useEffect, useCallback } from 'react'
import { Project, Task } from '@/store/useProjectStore'

interface UseLinearAutoSyncOptions {
    activeProject: Project | null
    sourceMode: 'manual' | 'linear' | 'jira'
    api: any
    onSyncComplete: (tasks: Task[]) => Promise<void>
    intervalMs?: number
}

interface UseLinearAutoSyncResult {
    lastSyncedAt: number | null
    isSyncing: boolean
    triggerManualSync: () => void
}

export function useLinearAutoSync({
    activeProject,
    sourceMode,
    api,
    onSyncComplete,
    intervalMs = 45_000
}: UseLinearAutoSyncOptions): UseLinearAutoSyncResult {
    const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
    const [isSyncing, setIsSyncing] = useState(false)
    const isRunningRef = useRef(false)
    const intervalRef = useRef<NodeJS.Timeout | null>(null)

    const performSync = useCallback(async (isBackground = false) => {
        if (isRunningRef.current || sourceMode !== 'linear' || !activeProject?.linearConnections?.length) {
            return
        }

        isRunningRef.current = true
        try {
            if (!isBackground) setIsSyncing(true)

            const conns = activeProject.linearConnections || []
            let allSyncedTasks: Task[] = []
            const failed: string[] = []

            for (const conn of conns) {
                try {
                    const apiKey = await window.electronAPI.secureStoreGet(
                        `project:${activeProject.id}:linear_api_key_${conn.id}`
                    ) || await window.electronAPI.secureStoreGet(`linear_api_key_${conn.id}`)

                    if (!apiKey) {
                        // No credential is not a failure — the connection is simply
                        // not set up — but its tasks must not be treated as gone.
                        failed.push(conn.id)
                        continue
                    }

                    const syncedTasks = await api.syncLinear({
                        apiKey,
                        teamKey: conn.teamId,
                        connectionId: conn.id
                    })

                    // Handlers report failure in the result rather than throwing,
                    // so a non-array here means the sync did not happen.
                    if (!Array.isArray(syncedTasks)) {
                        failed.push(conn.id)
                        console.warn(`Linear sync for connection ${conn.id} returned an error:`, syncedTasks)
                        continue
                    }

                    allSyncedTasks = [...allSyncedTasks, ...syncedTasks]
                } catch (e) {
                    failed.push(conn.id)
                    if (!isBackground) {
                        console.warn(`Failed to sync Linear connection ${conn.id}:`, e)
                    }
                }
            }

            /*
             * onSyncComplete replaces every Linear-sourced task with what it is
             * given, so handing it a partial result deletes the rest. A network
             * blip, a 429 or an expired key used to wipe the whole Linear board
             * every 45 seconds. Only publish when every connection succeeded.
             */
            if (failed.length > 0) {
                console.warn(`[linear] Skipping task update: ${failed.length} of ${conns.length} connection(s) did not sync.`)
                return
            }

            await onSyncComplete(allSyncedTasks)
            setLastSyncedAt(Date.now())
        } catch (e) {
            console.warn('Linear auto-sync failed:', e)
        } finally {
            isRunningRef.current = false
            if (!isBackground) setIsSyncing(false)
        }
    }, [activeProject, sourceMode, api, onSyncComplete])

    const triggerManualSync = useCallback(() => {
        // Reset the interval timer to avoid double-syncing
        if (intervalRef.current) clearInterval(intervalRef.current)

        performSync(false).then(() => {
            // Restart interval after manual sync
            if (sourceMode === 'linear' && activeProject?.linearConnections?.length) {
                intervalRef.current = setInterval(() => performSync(true), intervalMs)
            }
        })
    }, [performSync, sourceMode, activeProject, intervalMs])

    useEffect(() => {
        if (sourceMode !== 'linear' || !activeProject?.linearConnections?.length) {
            if (intervalRef.current) clearInterval(intervalRef.current)
            return
        }

        const handleVisibilityChange = () => {
            // Only poll when document is visible (window not minimized/hidden)
            if (document.hidden) {
                // Null the ref too: the resume branch below checks it, so leaving
                // it set meant polling never restarted after the tab was hidden.
                if (intervalRef.current) {
                    clearInterval(intervalRef.current)
                    intervalRef.current = null
                }
            } else {
                if (!intervalRef.current) {
                    intervalRef.current = setInterval(() => performSync(true), intervalMs)
                }
            }
        }

        // Start initial interval
        intervalRef.current = setInterval(() => performSync(true), intervalMs)

        // Listen for visibility changes
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [sourceMode, activeProject, intervalMs, performSync])

    return {
        lastSyncedAt,
        isSyncing,
        triggerManualSync
    }
}
