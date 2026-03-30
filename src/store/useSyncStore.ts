import { create } from 'zustand'
import type {
    CloudSyncStatus,
    SyncConfig,
    SyncCreateWorkspaceArgs,
    SyncDataUpdatedPayload,
    SyncJoinWorkspaceArgs,
    SyncStatusPayload,
    WorkspaceInviteInfo,
    WorkspaceInfo,
} from '@/types/sync'
import { measureAsync, recordRendererMetric } from '@/lib/perf'
import { getProjectSyncBridge, setSyncConfigSnapshot } from './syncProjectBridge'

interface SyncState {
    config: SyncConfig | null
    status: CloudSyncStatus
    workspaceInfo: WorkspaceInfo | null
    workspaceInvite: WorkspaceInviteInfo | null
    pendingCount: number
    error: string | null
    lastSyncedAt: number | null
    initialSyncInProgress: boolean
    isLoaded: boolean

    loadConfig: () => Promise<void>
    initSync: () => Promise<{ ok: boolean }>
    createWorkspace: (args: SyncCreateWorkspaceArgs) => Promise<{ ok: boolean; inviteCode?: string; error?: string }>
    joinWorkspace: (args: SyncJoinWorkspaceArgs) => Promise<{ ok: boolean; workspaceName?: string; error?: string }>
    disconnect: () => Promise<void>
    loadWorkspaceInfo: () => Promise<void>
    loadWorkspaceInvite: () => Promise<{ ok: boolean; error?: string }>
    rotateWorkspaceInvite: () => Promise<{ ok: boolean; error?: string }>
    manualSync: () => Promise<{ ok: boolean; error?: string }>
    setStatusFromIpc: (data: SyncStatusPayload) => void
    reloadProjectsAfterSync: (data?: SyncDataUpdatedPayload) => void
}

let initSyncPromise: Promise<{ ok: boolean }> | null = null

export const useSyncStore = create<SyncState>((set, get) => ({
    config: null,
    status: 'disconnected',
    workspaceInfo: null,
    workspaceInvite: null,
    pendingCount: 0,
    error: null,
    lastSyncedAt: null,
    initialSyncInProgress: false,
    isLoaded: false,

    async loadConfig() {
        const config = await window.electronAPI.syncGetConfig()
        void recordRendererMetric('sampleSyncConfigured', config.configured ? 1 : 0)
        setSyncConfigSnapshot(config)
        set((state) => ({
            config,
            isLoaded: true,
            status: config.configured ? state.status : 'disconnected',
        }))
    },

    async initSync() {
        if (initSyncPromise) {
            return await initSyncPromise
        }

        initSyncPromise = (async () => {
            set((state) => ({
                status: state.status === 'error' ? 'error' : 'connecting',
            }))
            const result = await measureAsync('syncInitMs', () => window.electronAPI.syncInit())
            if (!result.ok) {
                set({ status: result.status as CloudSyncStatus })
            } else {
                await get().loadWorkspaceInfo()
            }
            return { ok: result.ok }
        })().finally(() => {
            initSyncPromise = null
        })

        return await initSyncPromise
    },

    async createWorkspace(args) {
        const result = await window.electronAPI.syncCreateWorkspace(args)
        if (result.ok && result.workspaceId) {
            const config = await window.electronAPI.syncGetConfig()
            setSyncConfigSnapshot(config)
            set({ config, workspaceInvite: null })
            get().initSync().catch(console.error)
        }
        return result
    },

    async joinWorkspace(args) {
        const result = await window.electronAPI.syncJoinWorkspace(args)
        if (result.ok && result.workspaceId) {
            const config = await window.electronAPI.syncGetConfig()
            setSyncConfigSnapshot(config)
            set({ config, workspaceInvite: null })
            get().initSync().catch(console.error)
        }
        return result
    },

    async disconnect() {
        await window.electronAPI.syncDisconnect()
        setSyncConfigSnapshot({ configured: false })
        set({
            config: { configured: false },
            status: 'disconnected',
            workspaceInfo: null,
            workspaceInvite: null,
            pendingCount: 0,
            error: null,
            lastSyncedAt: null,
            initialSyncInProgress: false,
        })
        import('@/hooks/usePresence').then((m) => m.clearPresenceClient?.()).catch(() => {})
    },

    async loadWorkspaceInfo() {
        const info = await window.electronAPI.syncGetWorkspaceInfo()
        set({ workspaceInfo: info })
    },

    async loadWorkspaceInvite() {
        const result = await window.electronAPI.syncGetWorkspaceInvite()
        if (result.ok) {
            set({ workspaceInvite: result.invite ?? null })
        }
        return { ok: result.ok, error: result.error }
    },

    async rotateWorkspaceInvite() {
        const result = await window.electronAPI.syncRotateWorkspaceInvite()
        if (result.ok) {
            set({ workspaceInvite: result.invite ?? null })
            await get().loadWorkspaceInfo()
        }
        return { ok: result.ok, error: result.error }
    },

    async manualSync() {
        set({ status: 'syncing' })
        const result = await window.electronAPI.syncManual()
        set({
            status: result.ok ? 'connected' : 'error',
            error: result.error ?? null,
            initialSyncInProgress: false,
        })
        if (result.ok) {
            await get().loadWorkspaceInfo()
        }
        return result
    },

    setStatusFromIpc(data) {
        set({
            status: data.status as CloudSyncStatus,
            error: data.error,
            pendingCount: data.pendingCount,
            lastSyncedAt: data.lastSyncedAt ?? null,
            initialSyncInProgress: data.initialSyncInProgress,
        })
    },

    reloadProjectsAfterSync(data) {
        const bridge = getProjectSyncBridge()
        if (!bridge) return

        if (data?.table === 'tasks' && data.id) {
            window.electronAPI.getTaskById?.(data.id).then((task) => {
                if (!task) {
                    fullReload('task-miss')
                    return
                }
                bridge.mergeRemoteTask(task)
            }).catch(() => fullReload('task-error'))
            return
        }

        if (data?.table === 'handoffs' && data.id) {
            window.electronAPI.getHandoffById?.(data.id).then((handoff) => {
                if (!handoff) {
                    fullReload('handoff-miss')
                    return
                }
                bridge.mergeRemoteHandoff(handoff)
            }).catch(() => fullReload('handoff-error'))
            return
        }

        if (data?.table === 'collab_events' && data.projectId && data.row) {
            bridge.mergeRemoteCollaborationEvent(data.projectId, data.row)
            return
        }

        if (data?.table === 'artifact_links' && data.projectId && data.row) {
            bridge.mergeRemoteArtifactLink(data.projectId, data.row)
            return
        }

        fullReload(data?.table ? `${data.table}-bulk` : 'bulk')
    },
}))

let fullReloadTimer: number | null = null
let pendingFullReloadReason = 'unknown'

function fullReload(reason: string) {
    pendingFullReloadReason = reason
    if (fullReloadTimer !== null) return
    fullReloadTimer = window.setTimeout(() => {
        const reloadReason = pendingFullReloadReason
        pendingFullReloadReason = 'unknown'
        fullReloadTimer = null
        void Promise.all([
            window.electronAPI?.incrementPerformanceCounter?.('syncFallbackReloads'),
            window.electronAPI?.incrementPerformanceCounter?.(`syncFallbackReloadReason:${reloadReason}`),
        ])
        getProjectSyncBridge()?.loadProjects().catch(console.error)
    }, 250)
}
