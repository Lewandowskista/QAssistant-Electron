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
import { measureAsync } from '@/lib/perf'
import { getProjectSyncBridge, setSyncConfigSnapshot } from './syncProjectBridge'

interface SyncState {
    config: SyncConfig | null
    status: CloudSyncStatus
    workspaceInfo: WorkspaceInfo | null
    workspaceInvite: WorkspaceInviteInfo | null
    pendingCount: number
    error: string | null
    lastSyncedAt: number | null
    isLoaded: boolean

    // Actions
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

export const useSyncStore = create<SyncState>((set, get) => ({
    config: null,
    status: 'disconnected',
    workspaceInfo: null,
    workspaceInvite: null,
    pendingCount: 0,
    error: null,
    lastSyncedAt: null,
    isLoaded: false,

    async loadConfig() {
        const config = await window.electronAPI.syncGetConfig()
        setSyncConfigSnapshot(config)
        set({ config, isLoaded: true, status: config.configured ? 'connecting' : 'disconnected' })
    },

    async initSync() {
        set({ status: 'connecting' })
        const result = await measureAsync('syncInitMs', () => window.electronAPI.syncInit())
        // Don't clobber status — the main process sends sync-status-changed events
        // throughout initSync (pull, flush, realtime subscribe), so the IPC listener
        // already keeps us up to date. Only update if result reports a hard failure.
        if (!result.ok) {
            set({ status: result.status as CloudSyncStatus })
        }
        if (result.ok) {
            await get().loadWorkspaceInfo()
        }
        return { ok: result.ok }
    },

    async createWorkspace(args) {
        const result = await window.electronAPI.syncCreateWorkspace(args)
        if (result.ok && result.workspaceId) {
            const config = await window.electronAPI.syncGetConfig()
            setSyncConfigSnapshot(config)
            set({ config, workspaceInvite: null })
            // Kick off sync in the background — don't block the dialog from showing success
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
            // Kick off sync in the background — don't block the dialog from showing success
            get().initSync().catch(console.error)
        }
        return result
    },

    async disconnect() {
        await window.electronAPI.syncDisconnect()
        setSyncConfigSnapshot({ configured: false })
        set({ config: { configured: false }, status: 'disconnected', workspaceInfo: null, workspaceInvite: null, pendingCount: 0, error: null, lastSyncedAt: null })
        // Clear the presence singleton so it re-initialises with fresh credentials
        // if the user connects to a different workspace later.
        import('@/hooks/usePresence').then(m => m.clearPresenceClient?.())
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
        set({ status: result.ok ? 'connected' : 'error', error: result.error ?? null })
        // Refresh members after every manual sync (Improvement 8)
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
        })
    },

    // Granular post-sync refresh (Improvement 5):
    // When we know which entity changed, update just that entity in the store.
    // Fallback to full project reload for unknown/bulk changes.
    reloadProjectsAfterSync(data) {
        const bridge = getProjectSyncBridge()
        if (!bridge) return

        if (data?.table === 'tasks' && data.id) {
            // Fetch the single task and merge it into the active project store
            window.electronAPI.getTaskById?.(data.id).then((task) => {
                if (!task) {
                    // Task not found locally — do a full reload as fallback
                    fullReload()
                    return
                }
                bridge.mergeRemoteTask(task)
            }).catch(() => fullReload())
            return
        }

        if (data?.table === 'handoffs' && data.id) {
            window.electronAPI.getHandoffById?.(data.id).then((handoff) => {
                if (!handoff) { fullReload(); return }
                bridge.mergeRemoteHandoff(handoff)
            }).catch(() => fullReload())
            return
        }

        // For collab_events, artifact_links, or bulk null updates — full reload
        fullReload()
    },
}))

function fullReload() {
    getProjectSyncBridge()?.loadProjects().catch(console.error)
}
