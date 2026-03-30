import type { SyncConfig } from '@/types/sync'

type ProjectSyncBridge = {
    loadProjects: () => Promise<void>
    mergeRemoteTask: (task: any) => void
    mergeRemoteHandoff: (handoff: any) => void
    mergeRemoteCollaborationEvent: (projectId: string, event: any) => void
    mergeRemoteArtifactLink: (projectId: string, link: any) => void
}

let projectBridge: ProjectSyncBridge | null = null
let syncConfigSnapshot: SyncConfig | null = null

export function registerProjectSyncBridge(next: ProjectSyncBridge) {
    projectBridge = next
}

export function getProjectSyncBridge(): ProjectSyncBridge | null {
    return projectBridge
}

export function setSyncConfigSnapshot(config: SyncConfig | null) {
    syncConfigSnapshot = config
}

export function getSyncActorIdentity(): { userId?: string; displayName?: string } {
    return {
        userId: syncConfigSnapshot?.userId ?? undefined,
        displayName: syncConfigSnapshot?.displayName ?? undefined,
    }
}
