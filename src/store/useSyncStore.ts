import { create } from 'zustand'

export type CloudSyncStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'error'

export type SyncConfig = {
    configured: boolean
    url?: string
    workspaceId?: string
    userId?: string
    email?: string
    displayName?: string
}

export type WorkspaceInfo = {
    workspaceId: string | null
    workspaceName?: string
    inviteCode?: string
    members?: Array<{ user_id: string; email: string; display_name: string; role: string }>
}

interface SyncState {
    config: SyncConfig | null
    status: CloudSyncStatus
    workspaceInfo: WorkspaceInfo | null
    pendingCount: number
    error: string | null
    lastSyncedAt: number | null
    isLoaded: boolean

    // Actions
    loadConfig: () => Promise<void>
    initSync: () => Promise<{ ok: boolean }>
    createWorkspace: (args: {
        supabaseUrl: string
        supabaseAnonKey: string
        userEmail: string
        userPassword: string
        workspaceName: string
        displayName: string
    }) => Promise<{ ok: boolean; inviteCode?: string; error?: string }>
    joinWorkspace: (args: {
        supabaseUrl: string
        supabaseAnonKey: string
        userEmail: string
        userPassword: string
        inviteCode: string
        displayName: string
    }) => Promise<{ ok: boolean; workspaceName?: string; error?: string }>
    disconnect: () => Promise<void>
    loadWorkspaceInfo: () => Promise<void>
    manualSync: () => Promise<{ ok: boolean; error?: string }>
    setStatusFromIpc: (data: { status: string; workspaceId: string | null; error: string | null; pendingCount: number; lastSyncedAt: number | null }) => void
    reloadProjectsAfterSync: (data?: { table?: string; id?: string } | null) => void
}

export const useSyncStore = create<SyncState>((set, get) => ({
    config: null,
    status: 'disconnected',
    workspaceInfo: null,
    pendingCount: 0,
    error: null,
    lastSyncedAt: null,
    isLoaded: false,

    async loadConfig() {
        const config = await window.electronAPI.syncGetConfig()
        set({ config, isLoaded: true, status: config.configured ? 'connecting' : 'disconnected' })
    },

    async initSync() {
        set({ status: 'connecting' })
        const result = await window.electronAPI.syncInit()
        set({ status: result.status as CloudSyncStatus })
        if (result.ok) {
            await get().loadWorkspaceInfo()
        }
        return { ok: result.ok }
    },

    async createWorkspace(args) {
        const result = await window.electronAPI.syncCreateWorkspace(args)
        if (result.ok && result.workspaceId) {
            const config = await window.electronAPI.syncGetConfig()
            set({ config })
            await get().initSync()
        }
        return result
    },

    async joinWorkspace(args) {
        const result = await window.electronAPI.syncJoinWorkspace(args)
        if (result.ok && result.workspaceId) {
            const config = await window.electronAPI.syncGetConfig()
            set({ config })
            await get().initSync()
        }
        return result
    },

    async disconnect() {
        await window.electronAPI.syncDisconnect()
        set({ config: { configured: false }, status: 'disconnected', workspaceInfo: null, pendingCount: 0, error: null, lastSyncedAt: null })
    },

    async loadWorkspaceInfo() {
        const info = await window.electronAPI.syncGetWorkspaceInfo()
        set({ workspaceInfo: info })
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
        if (data?.table === 'tasks' && data.id) {
            // Fetch the single task and merge it into the active project store
            window.electronAPI.getTaskById?.(data.id).then((task) => {
                if (!task) {
                    // Task not found locally — do a full reload as fallback
                    fullReload()
                    return
                }
                import('./useProjectStore').then(({ useProjectStore }) => {
                    useProjectStore.getState().mergeRemoteTask(task)
                }).catch(() => fullReload())
            }).catch(() => fullReload())
            return
        }

        if (data?.table === 'handoffs' && data.id) {
            window.electronAPI.getHandoffById?.(data.id).then((handoff) => {
                if (!handoff) { fullReload(); return }
                import('./useProjectStore').then(({ useProjectStore }) => {
                    useProjectStore.getState().mergeRemoteHandoff(handoff)
                }).catch(() => fullReload())
            }).catch(() => fullReload())
            return
        }

        // For collab_events, artifact_links, or bulk null updates — full reload
        fullReload()
    },
}))

function fullReload() {
    import('./useProjectStore').then(({ useProjectStore }) => {
        useProjectStore.getState().loadProjects()
    }).catch(console.error)
}
