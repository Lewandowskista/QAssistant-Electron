import type { ArtifactLink, CollaborationEvent, HandoffPacket } from './project'

export type CloudSyncStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'error'

export type SyncConfig = {
    configured: boolean
    url?: string
    workspaceId?: string
    userId?: string
    email?: string
    displayName?: string
}

export type WorkspaceMember = {
    user_id: string
    email: string
    display_name: string
    role: string
}

export type WorkspaceInfo = {
    workspaceId: string | null
    workspaceName?: string
    inviteCode?: string
    members?: WorkspaceMember[]
}

export type SyncStatusPayload = {
    status: CloudSyncStatus
    workspaceId: string | null
    userId: string | null
    error: string | null
    pendingCount: number
    lastSyncedAt: number | null
}

export type SyncDataUpdatedPayload = {
    table?: string
    id?: string
} | null

export type SyncConflictPayload = {
    table: string
    id: string
}

export type SyncMutationFailedPayload = {
    message: string
}

export type SyncCreateWorkspaceArgs = {
    supabaseUrl: string
    supabaseAnonKey: string
    userEmail: string
    userPassword: string
    workspaceName: string
    displayName: string
}

export type SyncJoinWorkspaceArgs = {
    supabaseUrl: string
    supabaseAnonKey: string
    userEmail: string
    userPassword: string
    inviteCode: string
    displayName: string
}

export type SyncPushTaskCollabArgs = {
    projectId: string
    taskId: string
    collabState: string
    activeHandoffId?: string | null
    updatedAt?: number
}

export type SyncPushHandoffArgs = {
    projectId: string
    handoff: HandoffPacket
}

export type SyncPushCollabEventArgs = {
    projectId: string
    event: CollaborationEvent
}

export type SyncPushArtifactLinkArgs = {
    projectId: string
    link: ArtifactLink
}
