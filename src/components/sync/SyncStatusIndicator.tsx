import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Cloud, CloudOff, RefreshCw, AlertTriangle, Wifi, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSyncStore, CloudSyncStatus } from '@/store/useSyncStore'
import { SyncSetupDialog } from './SyncSetupDialog'

const STATUS_CONFIG: Record<CloudSyncStatus, {
    icon: typeof Cloud
    label: string
    color: string
    dot: string
    pulse?: boolean
}> = {
    disconnected: { icon: CloudOff, label: 'Not connected', color: 'text-[#4B5563]', dot: 'bg-[#4B5563]' },
    connecting:   { icon: Cloud,    label: 'Connecting…',  color: 'text-amber-400',  dot: 'bg-amber-400', pulse: true },
    connected:    { icon: Cloud,    label: 'Synced',        color: 'text-emerald-400', dot: 'bg-emerald-400' },
    syncing:      { icon: RefreshCw, label: 'Syncing…',    color: 'text-[#A78BFA]',  dot: 'bg-[#A78BFA]',  pulse: true },
    error:        { icon: AlertTriangle, label: 'Sync error', color: 'text-red-400', dot: 'bg-red-400' },
}

function useRelativeTime(ts: number | null): string | null {
    const [, setTick] = useState(0)
    useEffect(() => {
        if (!ts) return
        const id = setInterval(() => setTick(t => t + 1), 30_000)
        return () => clearInterval(id)
    }, [ts])

    if (!ts) return null
    const diff = Date.now() - ts
    if (diff < 60_000) return 'just now'
    const mins = Math.floor(diff / 60_000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
}

export function SyncStatusIndicator() {
    const {
        status,
        config,
        workspaceInfo,
        pendingCount,
        error,
        lastSyncedAt,
        isLoaded,
        loadConfig,
        setStatusFromIpc,
        reloadProjectsAfterSync,
        manualSync,
    } = useSyncStore()

    const [setupOpen, setSetupOpen] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const prevErrorRef = useRef<string | null>(null)
    const lastToastRef = useRef<number>(0)
    const relativeTime = useRelativeTime(lastSyncedAt)

    // Load config on mount
    useEffect(() => {
        if (!isLoaded) loadConfig()
    }, [isLoaded, loadConfig])

    // Subscribe to IPC events
    useEffect(() => {
        if (!window.electronAPI) return
        const removeStatus = window.electronAPI.onSyncStatusChanged?.((data) => {
            setStatusFromIpc(data)
        })
        const removeData = window.electronAPI.onSyncDataUpdated?.((data) => {
            reloadProjectsAfterSync(data)
        })
        // Conflict detection toast (Improvement 9)
        const removeConflict = window.electronAPI.onSyncConflictDetected?.(() => {
            toast.info('A teammate updated this item — your view has been refreshed', { duration: 4000 })
        })
        // Permanent mutation failure toast (Improvement 4)
        const removeFailed = window.electronAPI.onSyncMutationFailed?.((data) => {
            toast.error(data.message, { duration: 8000 })
        })
        return () => {
            removeStatus?.()
            removeData?.()
            removeConflict?.()
            removeFailed?.()
        }
    }, [setStatusFromIpc, reloadProjectsAfterSync])

    // Error toast (Improvement 6): show a toast when a new sync error appears
    useEffect(() => {
        if (error && error !== prevErrorRef.current) {
            const now = Date.now()
            // Debounce: at most one error toast per 10s
            if (now - lastToastRef.current > 10_000) {
                toast.error(`Sync: ${error}`, { duration: 5000 })
                lastToastRef.current = now
            }
        }
        prevErrorRef.current = error
    }, [error])

    async function handleManualSync() {
        setSyncing(true)
        await manualSync()
        setSyncing(false)
    }

    const cfg = STATUS_CONFIG[status]
    const Icon = syncing ? RefreshCw : cfg.icon
    const isConfigured = config?.configured

    if (!isLoaded) return null

    return (
        <>
            <button
                onClick={() => isConfigured ? handleManualSync() : setSetupOpen(true)}
                title={
                    isConfigured
                        ? `${cfg.label}${pendingCount > 0 ? ` · ${pendingCount} pending` : ''}${error ? `\nError: ${error}` : ''}\nClick to sync now`
                        : 'Set up cloud sync'
                }
                className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors group',
                    'hover:bg-[#252535] text-left',
                )}
            >
                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-[#1A1A2E]">
                    <Icon className={cn(
                        'h-3.5 w-3.5 transition-colors',
                        cfg.color,
                        (syncing || status === 'syncing') && 'animate-spin',
                    )} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className={cn('text-xs font-medium', isConfigured ? cfg.color : 'text-[#4B5563]')}>
                            {isConfigured ? cfg.label : 'Cloud Sync'}
                        </span>
                        {pendingCount > 0 && (
                            <span className="text-[10px] font-bold bg-[#A78BFA]/20 text-[#A78BFA] px-1.5 py-0.5 rounded-full leading-none">
                                {pendingCount}
                            </span>
                        )}
                    </div>
                    {/* Last synced timestamp (Improvement 7) */}
                    {isConfigured && status === 'connected' && relativeTime ? (
                        <div className="flex items-center gap-1 mt-0.5">
                            <Wifi className="h-2.5 w-2.5 text-[#4B5563] shrink-0" />
                            <span className="text-[10px] text-[#4B5563] truncate">
                                {workspaceInfo?.workspaceName ? `${workspaceInfo.workspaceName} · ` : ''}
                                {relativeTime}
                            </span>
                        </div>
                    ) : isConfigured && workspaceInfo?.workspaceName ? (
                        <div className="flex items-center gap-1 mt-0.5">
                            <Users className="h-2.5 w-2.5 text-[#4B5563] shrink-0" />
                            <span className="text-[10px] text-[#4B5563] truncate">{workspaceInfo.workspaceName}</span>
                        </div>
                    ) : !isConfigured ? (
                        <span className="text-[10px] text-[#4B5563]">Click to set up</span>
                    ) : null}
                </div>
                <div className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    cfg.dot,
                    cfg.pulse && 'animate-pulse'
                )} />
            </button>

            <SyncSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
        </>
    )
}
