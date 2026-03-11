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

            for (const conn of conns) {
                try {
                    const apiKey = await window.electronAPI.secureStoreGet(
                        `project:${activeProject.id}:linear_api_key_${conn.id}`
                    ) || await window.electronAPI.secureStoreGet(`linear_api_key_${conn.id}`)

                    if (apiKey) {
                        const syncedTasks = await api.syncLinear({
                            apiKey,
                            teamKey: conn.teamId,
                            connectionId: conn.id
                        })
                        allSyncedTasks = [...allSyncedTasks, ...syncedTasks]
                    }
                } catch (e) {
                    if (!isBackground) {
                        console.warn(`Failed to sync Linear connection ${conn.id}:`, e)
                    }
                }
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
                if (intervalRef.current) clearInterval(intervalRef.current)
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
