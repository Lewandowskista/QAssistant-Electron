/**
 * sync.ts — Phase 2+: Cloud sync layer (with post-implementation improvements)
 *
 * Improvements over initial implementation:
 *  1. Auto-sync on app focus + periodic background pull (every 60s)
 *  2. Automatic reconnection with exponential backoff (up to 10 retries)
 *  3. Pending mutations persisted to SQLite (survive app crashes)
 *  4. Failed mutations retried with exponential backoff
 *  5. lastSyncedAt timestamp tracked and exposed to renderer
 *  6. Members refreshed on every successful sync
 *  7. Conflict detection: warns when remote is newer than local push
 *
 * Architecture:
 *  - Supabase (PostgreSQL + Realtime) is the cloud backend
 *  - Local SQLite (Phase 1) is always the source of truth for reads
 *  - This module pushes mutations UP (local → cloud) and pulls changes DOWN
 *    (cloud → local SQLite → notify renderer via IPC)
 *  - Only the "collaborative" subset of data is synced:
 *      tasks (collab fields), handoff_packets, artifact_links, collaboration_events
 */

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import { getCredential, setCredential, deleteCredential } from './credentialService'
import { getAuthenticatedClient, getAuthStatus, initAuth } from './auth'
import {
    getDb,
    countSyncPendingQueue,
    enqueueSyncMutation,
    quarantineSyncPendingQueue,
    loadSyncPendingQueue,
    removeSyncMutation,
    incrementSyncMutationRetry,
} from './database'
import type { ArtifactLink, CollaborationEvent, HandoffPacket } from '../src/types/project'
import type { WorkspaceInfo, WorkspaceInviteInfo, WorkspaceMember } from '../src/types/sync'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { log } from './logger'

// ─── Credential keys ──────────────────────────────────────────────────────────
const CRED_WORKSPACE_ID      = 'sync_workspace_id'

// ─── State ────────────────────────────────────────────────────────────────────

type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'error'

let supabase: SupabaseClient | null = null
let syncLogDir: string | null = null
let realtimeChannel: RealtimeChannel | null = null
let realtimeChannelOwner: SupabaseClient | null = null
let currentWorkspaceId: string | null = null
let currentUserId: string | null = null
let syncStatus: SyncStatus = 'disconnected'
let lastSyncError: string | null = null
let lastSyncedAt: number | null = null
let mainWindowSender: ((channel: string, ...args: any[]) => void) | null = null

// Auto-sync
let autoSyncInterval: ReturnType<typeof setInterval> | null = null
const AUTO_SYNC_INTERVAL_MS = 60_000

// Reconnection
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BACKOFF_MS = [2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000, 30000, 30000]

// Retry timer for failed mutations
let retryTimer: ReturnType<typeof setTimeout> | null = null
const RETRY_BACKOFF_MS = [2000, 5000, 15000, 30000, 60000]
const MAX_MUTATION_RETRIES = 5

// Flush debounce + mutex
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushInProgress = false
let autoSyncInProgress = false
let lastFocusSyncAt = 0

const PULL_TIMEOUT_MS = 20_000
const CONNECTION_TEST_TIMEOUT_MS = 8_000
const FOCUS_SYNC_MIN_INTERVAL_MS = 15_000

// ─── Init / teardown ──────────────────────────────────────────────────────────

export function setSyncWindowSender(fn: (channel: string, ...args: any[]) => void) {
    mainWindowSender = fn
}

export function setSyncLogDir(dir: string) {
    syncLogDir = dir
}

/** Append a permanently-failed mutation to a dead-letter log for later review. */
function writeDeadLetter(mutation: { id: number; workspace_id: string | null; table_name: string; op: string; row_id: string; payload_json: string; retry_count: number }): void {
    if (!syncLogDir) return
    try {
        mkdirSync(syncLogDir, { recursive: true })
        const logPath = join(syncLogDir, 'sync_dead_letters.jsonl')
        const entry = JSON.stringify({
            droppedAt: new Date().toISOString(),
            workspaceId: mutation.workspace_id,
            table: mutation.table_name,
            op: mutation.op,
            rowId: mutation.row_id,
            retryCount: mutation.retry_count,
            payload: JSON.parse(mutation.payload_json),
        })
        appendFileSync(logPath, entry + '\n', 'utf8')
    } catch (e) {
        console.warn('[sync] Could not write dead-letter log:', e)
    }
}

function notifyRenderer(channel: string, data: unknown) {
    mainWindowSender?.(channel, data)
}

async function closeRealtimeChannel(channel = realtimeChannel, owner = realtimeChannelOwner) {
    if (!channel) return

    const isCurrentChannel = realtimeChannel === channel
    if (isCurrentChannel) {
        realtimeChannel = null
        realtimeChannelOwner = null
    }

    await Promise.race([
        owner
            ? owner.removeChannel(channel)
            : channel.unsubscribe(),
        new Promise<void>(resolve => setTimeout(resolve, 3000)),
    ]).catch(() => {})
}

export async function initSync(): Promise<{ ok: boolean; status: SyncStatus }> {
    // Cancel any in-flight reconnect attempt before re-initialising
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }

    const wsId = await getCredential(CRED_WORKSPACE_ID)
    const auth = await initAuth()
    const client = await getAuthenticatedClient()

    if (!auth.configured) {
        console.warn('[sync] initSync: Supabase not configured')
        setSyncStatus('disconnected')
        notifyRenderer('sync-status-changed', getStatus())
        return { ok: false, status: syncStatus }
    }
    if (!auth.user) {
        console.warn('[sync] initSync: No authenticated user')
        setSyncStatus('disconnected')
        notifyRenderer('sync-status-changed', getStatus())
        return { ok: false, status: syncStatus }
    }
    if (!wsId) {
        console.warn('[sync] initSync: No workspace ID stored')
        setSyncStatus('disconnected')
        notifyRenderer('sync-status-changed', getStatus())
        return { ok: false, status: syncStatus }
    }
    if (!client) {
        console.warn('[sync] initSync: Could not get authenticated Supabase client (session may have expired)')
        setSyncStatus('error')
        lastSyncError = 'Session expired — please sign out and sign back in.'
        notifyRenderer('sync-status-changed', getStatus())
        return { ok: false, status: syncStatus }
    }

    currentWorkspaceId = wsId
    currentUserId = auth.user.id
    supabase = client

    log.info(`[sync] initSync: user=${auth.user.email} workspace=${wsId}`)
    setSyncStatus('connecting')
    notifyRenderer('sync-status-changed', getStatus())

    // Pull all remote changes, then subscribe to real-time
    await performInitialPull()

    if (syncStatus === 'error') {
        // Pull failed — scheduleReconnect() already queued; don't start auto-sync yet
        return { ok: false, status: syncStatus }
    }

    await subscribeRealtime()

    // Flush any persisted pending mutations (from before crash/restart)
    await flushPendingMutations()

    // Start auto-sync (periodic pull + focus handler)
    startAutoSync()

    // Clear reconnect state on successful init
    reconnectAttempts = 0

    return { ok: true, status: syncStatus }
}

export async function teardownSync() {
    // Cancel all timers first so no callbacks fire after teardown
    stopAutoSync()
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }

    // Remove realtime channel with a 3s cap — broken channels must not block sign-out
    if (realtimeChannel) {
        const ch = realtimeChannel
        const owner = realtimeChannelOwner
        await closeRealtimeChannel(ch, owner)
    }
    realtimeChannel = null
    realtimeChannelOwner = null
    supabase = null
    currentWorkspaceId = null
    currentUserId = null
    flushInProgress = false
    autoSyncInProgress = false
    lastFocusSyncAt = 0
    reconnectAttempts = 0
    setSyncStatus('disconnected')
    notifyRenderer('sync-status-changed', getStatus())
}

function setSyncStatus(s: SyncStatus) {
    syncStatus = s
    if (s !== 'error') lastSyncError = null
}

// ─── Auto-sync (Improvement 1) ────────────────────────────────────────────────

function startAutoSync() {
    stopAutoSync()
    autoSyncInterval = setInterval(async () => {
        // Skip if another auto-sync tick is already running
        if (autoSyncInProgress) return
        // Only run if connected or in error (allow self-recovery), and workspace is set
        if (!currentWorkspaceId) return
        if (syncStatus !== 'connected' && syncStatus !== 'syncing' && syncStatus !== 'error') return
        autoSyncInProgress = true
        try {
            // Refresh the client each tick — the token may have been silently refreshed
            const freshClient = await getAuthenticatedClient()
            if (!freshClient) {
                console.warn('[sync] Auto-sync: no authenticated client, skipping tick')
                autoSyncInProgress = false
                return
            }
            supabase = freshClient
            await performInitialPull()
            await flushPendingMutations()
            notifyRenderer('sync-members-updated', null)
        } catch (e) {
            console.warn('[sync] Auto-sync tick failed:', e)
        } finally {
            autoSyncInProgress = false
        }
    }, AUTO_SYNC_INTERVAL_MS)
}

function stopAutoSync() {
    if (autoSyncInterval) { clearInterval(autoSyncInterval); autoSyncInterval = null }
}

/** Called by main.ts when the BrowserWindow gains focus */
export async function onAppFocused() {
    if (!currentWorkspaceId) return
    if (autoSyncInProgress || flushInProgress) return
    const now = Date.now()
    if (now - lastFocusSyncAt < FOCUS_SYNC_MIN_INTERVAL_MS) return
    if (syncStatus === 'connected' || syncStatus === 'syncing' || syncStatus === 'error') {
        try {
            lastFocusSyncAt = now
            const freshClient = await getAuthenticatedClient()
            if (!freshClient) return
            supabase = freshClient
            await performInitialPull()
            await flushPendingMutations()
        } catch (e) {
            console.warn('[sync] onAppFocused sync failed:', e)
        }
    }
}

// ─── Reconnection with exponential backoff (Improvement 2) ───────────────────

function scheduleReconnect() {
    if (reconnectTimer) return

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.warn('[sync] Max reconnect attempts reached — staying in error state')
        setSyncStatus('error')
        lastSyncError = 'Connection lost. Please check your network and manually reconnect.'
        notifyRenderer('sync-status-changed', getStatus())
        return
    }
    const delay = RECONNECT_BACKOFF_MS[reconnectAttempts] ?? 30000
    reconnectAttempts++
    log.info(`[sync] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)
    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null
        // Guard: if teardownSync was called while waiting, abort
        if (!currentWorkspaceId) return

        if (realtimeChannel) {
            const ch = realtimeChannel
            const owner = realtimeChannelOwner
            await closeRealtimeChannel(ch, owner)
        }

        // Refresh the auth client — the token may have expired while we were waiting
        const freshClient = await getAuthenticatedClient()
        if (!freshClient) {
            console.warn('[sync] Reconnect aborted: could not get authenticated client')
            setSyncStatus('error')
            lastSyncError = 'Session expired. Please sign out and sign back in.'
            notifyRenderer('sync-status-changed', getStatus())
            return
        }
        supabase = freshClient

        // Reset mutexes in case they were stuck from the failed attempt
        flushInProgress = false
        autoSyncInProgress = false

        try {
            await performInitialPull()
            if (syncStatus !== 'error') {
                await subscribeRealtime()
                await flushPendingMutations()
            }
        } catch (e) {
            console.warn('[sync] Reconnect attempt failed:', e)
        }
    }, delay)
}

// ─── Status ───────────────────────────────────────────────────────────────────

export function getStatus() {
    let pendingCount = 0
    try {
        pendingCount = countSyncPendingQueue(currentWorkspaceId)
    } catch { /* db may not be init */ }
    return {
        status: syncStatus,
        workspaceId: currentWorkspaceId,
        userId: currentUserId,
        error: lastSyncError,
        pendingCount,
        lastSyncedAt,
    }
}

type RpcResult<T> = { data: T; error: { message?: string; code?: string } | null }

async function callWorkspaceRpc<T>(
    client: SupabaseClient,
    rpcName: 'create_workspace_with_owner' | 'join_workspace_by_invite',
    rpcArgs: Record<string, string>,
    timeoutMs = 30_000,
): Promise<RpcResult<T>> {
    return await withTimeout<RpcResult<T>>(
        Promise.resolve(client.rpc(rpcName, rpcArgs) as PromiseLike<RpcResult<T>>),
        timeoutMs,
        `${rpcName} RPC timed out after ${timeoutMs}ms`,
    )
}

// ─── Workspace management ─────────────────────────────────────────────────────

export async function createWorkspace(
    workspaceName: string,
    displayName?: string,
): Promise<{ ok: boolean; workspaceId?: string; inviteCode?: string; error?: string }> {
    try {
        const auth = await initAuth()
        const client = await getAuthenticatedClient()
        log.info('[sync] createWorkspace: auth.configured=', auth.configured, 'user=', auth.user?.email, 'client=', !!client)
        if (!client || !auth.user) {
            return { ok: false, error: 'You must be signed in before creating a workspace' }
        }

        const memberEmail = auth.user.email ?? ''
        const memberDisplayName = displayName?.trim() || auth.user.displayName || auth.user.email?.split('@')[0] || 'User'
        const rpcArgs = {
            p_workspace_name: workspaceName.trim(),
            p_member_email: memberEmail,
            p_member_display_name: memberDisplayName,
        }
        log.info('[sync] createWorkspace: calling RPC with', JSON.stringify(rpcArgs))

        const t0 = Date.now()
        const { data, error } = await callWorkspaceRpc(
            client,
            'create_workspace_with_owner',
            rpcArgs,
        )
        log.info(`[sync] createWorkspace: RPC took ${Date.now() - t0}ms, data=`, JSON.stringify(data), 'error=', error?.message, 'code=', error?.code)

        const workspaceRow = Array.isArray(data) ? data[0] : data
        const wsId = workspaceRow?.workspace_id ?? workspaceRow?.out_workspace_id
        const invCode = workspaceRow?.invite_code ?? workspaceRow?.out_invite_code
        if (error || !wsId || !invCode) {
            const msg = error?.message ?? (data === null ? 'RPC returned no data — schema may not be applied in Supabase' : 'Could not create workspace')
            console.error('[sync] createWorkspace failed:', msg, '| raw data:', JSON.stringify(data))
            return { ok: false, error: msg }
        }

        await saveWorkspaceSelection(wsId, auth.user.id)
        supabase = client
        currentUserId = auth.user.id
        log.info('[sync] createWorkspace: success, workspaceId=', wsId)
        return { ok: true, workspaceId: wsId, inviteCode: invCode }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[sync] createWorkspace exception:', msg)
        return { ok: false, error: msg }
    }
}

export async function joinWorkspace(
    inviteCode: string,
    displayName?: string,
): Promise<{ ok: boolean; workspaceId?: string; workspaceName?: string; error?: string }> {
    try {
        const auth = await initAuth()
        const client = await getAuthenticatedClient()
        if (!client || !auth.user) {
            return { ok: false, error: 'You must be signed in before joining a workspace' }
        }
        const memberEmail = auth.user.email ?? ''
        const memberDisplayName = displayName?.trim() || auth.user.displayName || auth.user.email?.split('@')[0] || 'User'
        const rpcArgs = {
            p_invite_code: inviteCode.trim().toUpperCase(),
            p_member_email: memberEmail,
            p_member_display_name: memberDisplayName,
        }
        const { data, error } = await callWorkspaceRpc(
            client,
            'join_workspace_by_invite',
            rpcArgs,
        )

        const workspaceRow = Array.isArray(data) ? data[0] : data
        const wsId = workspaceRow?.workspace_id ?? workspaceRow?.out_workspace_id
        const wsName = workspaceRow?.workspace_name ?? workspaceRow?.out_workspace_name
        if (error || !wsId || !wsName) {
            console.error('[sync] joinWorkspace RPC error:', error?.message, 'data:', JSON.stringify(data))
            return { ok: false, error: error?.message ?? 'Invalid invite code' }
        }

        await saveWorkspaceSelection(wsId, auth.user.id)
        supabase = client
        currentUserId = auth.user.id
        return { ok: true, workspaceId: wsId, workspaceName: wsName }
    } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
}

export async function disconnectWorkspace(): Promise<void> {
    const workspaceToDisconnect = currentWorkspaceId
    await teardownSync()
    if (workspaceToDisconnect) {
        const quarantined = quarantineSyncPendingQueue(workspaceToDisconnect, 'workspace_disconnected')
        if (quarantined > 0) {
            console.warn(`[sync] Quarantined ${quarantined} pending mutation(s) for disconnected workspace ${workspaceToDisconnect}`)
        }
    }
    await deleteCredential(CRED_WORKSPACE_ID)
    currentWorkspaceId = null
    currentUserId = null
    notifyRenderer('sync-status-changed', getStatus())
}

export async function getWorkspaceInfo(): Promise<WorkspaceInfo> {
    if (!supabase || !currentWorkspaceId) return { workspaceId: null }
    const authUserId = currentUserId ?? getAuthStatus().user?.id ?? null
    const { data } = await supabase
        .from('workspaces')
        .select('id, name, invite_code_expires_at, invite_code_rotated_at')
        .eq('id', currentWorkspaceId)
        .single()
    const { data: members } = await supabase
        .from('workspace_members')
        .select('user_id, email, display_name, role')
        .eq('workspace_id', currentWorkspaceId)
    const currentMember = (members ?? []).find((member: any) => member.user_id === authUserId)
    return {
        workspaceId: currentWorkspaceId,
        workspaceName: data?.name,
        currentUserRole: currentMember?.role,
        canManageInvite: currentMember?.role === 'owner',
        inviteCodeExpiresAt: data?.invite_code_expires_at ?? null,
        inviteCodeRotatedAt: data?.invite_code_rotated_at ?? null,
        members: (members ?? []) as WorkspaceMember[],
    }
}

function mapInviteRow(data: any): WorkspaceInviteInfo | null {
    const inviteRow = Array.isArray(data) ? data[0] : data
    if (!inviteRow?.invite_code) return null
    return {
        inviteCode: inviteRow.invite_code,
        inviteCodeExpiresAt: inviteRow.invite_code_expires_at ?? null,
        inviteCodeRotatedAt: inviteRow.invite_code_rotated_at ?? null,
    }
}

export async function getWorkspaceInvite(): Promise<{ ok: boolean; invite?: WorkspaceInviteInfo; error?: string }> {
    if (!supabase || !currentWorkspaceId) {
        return { ok: false, error: 'Not connected to a workspace' }
    }
    const { data, error } = await supabase.rpc('get_workspace_invite_code', {
        workspace_id_input: currentWorkspaceId,
    })
    const invite = mapInviteRow(data)
    if (error || !invite) {
        return { ok: false, error: error?.message ?? 'Invite code unavailable' }
    }
    return { ok: true, invite }
}

export async function rotateWorkspaceInvite(): Promise<{ ok: boolean; invite?: WorkspaceInviteInfo; error?: string }> {
    if (!supabase || !currentWorkspaceId) {
        return { ok: false, error: 'Not connected to a workspace' }
    }
    const { data, error } = await supabase.rpc('rotate_workspace_invite_code', {
        workspace_id_input: currentWorkspaceId,
    })
    const invite = mapInviteRow(data)
    if (error || !invite) {
        return { ok: false, error: error?.message ?? 'Could not rotate invite code' }
    }
    return { ok: true, invite }
}

async function saveWorkspaceSelection(workspaceId: string, userId: string) {
    if (currentWorkspaceId && currentWorkspaceId !== workspaceId) {
        const quarantined = quarantineSyncPendingQueue(currentWorkspaceId, 'workspace_switched')
        if (quarantined > 0) {
            console.warn(`[sync] Quarantined ${quarantined} pending mutation(s) while switching workspaces`)
        }
    }
    await setCredential(CRED_WORKSPACE_ID, workspaceId)
    currentWorkspaceId = workspaceId
    currentUserId = userId
}

// ─── Invite code ──────────────────────────────────────────────────────────────

// ─── Pull: remote → local ─────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        promise.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
    })
}

/** Lightweight PostgREST ping — fetches at most 1 row from workspace_members.
 *  This goes through the same network path as the real pull queries, so if it
 *  succeeds we know PostgREST is reachable and the JWT is accepted. */
async function testConnection(): Promise<void> {
    if (!supabase || !currentWorkspaceId) throw new Error('Not initialised')

    const { error } = await withTimeout(
        supabase
            .from('workspace_members')
            .select('user_id', { count: 'exact', head: true })
            .eq('workspace_id', currentWorkspaceId)
            .limit(1),
        CONNECTION_TEST_TIMEOUT_MS,
        'Connection test',
    )

    if (error) {
        throw new Error(`Supabase connection error: ${error.message} (${error.code})`)
    }
}

async function performInitialPull() {
    if (!supabase || !currentWorkspaceId) return

    const wsId = currentWorkspaceId
    setSyncStatus('syncing')
    notifyRenderer('sync-status-changed', getStatus())

    try {
        // Verify the session and workspace exist before launching parallel queries.
        await testConnection()

        const [tasksRes, handoffsRes, eventsRes, linksRes] = await withTimeout(
            Promise.all([
                supabase.from('sync_tasks').select('*').eq('workspace_id', wsId),
                supabase.from('sync_handoffs').select('*').eq('workspace_id', wsId),
                supabase.from('sync_collab_events').select('*').eq('workspace_id', wsId),
                supabase.from('sync_artifact_links').select('*').eq('workspace_id', wsId),
            ]),
            PULL_TIMEOUT_MS,
            'Sync pull',
        )

        // Bail out if workspace changed while we were awaiting
        if (currentWorkspaceId !== wsId) return

        // Surface any per-table Supabase errors
        for (const [res, name] of [
            [tasksRes, 'sync_tasks'],
            [handoffsRes, 'sync_handoffs'],
            [eventsRes, 'sync_collab_events'],
            [linksRes, 'sync_artifact_links'],
        ] as const) {
            if (res.error) {
                throw new Error(`${name}: ${res.error.message} (code: ${res.error.code})`)
            }
        }

        if (tasksRes.data) applyRemoteTasks(tasksRes.data)
        if (handoffsRes.data) applyRemoteHandoffs(handoffsRes.data)
        if (eventsRes.data) applyRemoteCollabEvents(eventsRes.data)
        if (linksRes.data) applyRemoteArtifactLinks(linksRes.data)

        lastSyncedAt = Date.now()
        setSyncStatus('connected')
        notifyRenderer('sync-status-changed', getStatus())
        notifyRenderer('sync-data-updated', null)
    } catch (e: any) {
        console.error('[sync] Initial pull failed:', e.message)
        lastSyncError = e.message
        setSyncStatus('error')
        notifyRenderer('sync-status-changed', getStatus())
        scheduleReconnect()
    }
}

// ─── Real-time subscriptions ──────────────────────────────────────────────────

async function subscribeRealtime() {
    if (!supabase || !currentWorkspaceId) return

    if (realtimeChannel) {
        const ch = realtimeChannel
        const owner = realtimeChannelOwner
        await closeRealtimeChannel(ch, owner)
    }

    const client = supabase
    const workspaceId = currentWorkspaceId
    const channel = client
        .channel(`workspace:${workspaceId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'sync_tasks',
            filter: `workspace_id=eq.${workspaceId}`,
        }, (payload) => {
            try {
                if (payload.new && (payload.new as any).updated_by !== currentUserId) {
                    applyRemoteTasks([payload.new as any])
                    notifyRenderer('sync-data-updated', { table: 'tasks', id: (payload.new as any).task_id })
                }
            } catch (e) { console.warn('[sync] realtime task handler error:', e) }
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'sync_handoffs',
            filter: `workspace_id=eq.${workspaceId}`,
        }, (payload) => {
            try {
                if (payload.new && (payload.new as any).updated_by !== currentUserId) {
                    applyRemoteHandoffs([payload.new as any])
                    notifyRenderer('sync-data-updated', { table: 'handoffs', id: (payload.new as any).handoff_id })
                }
            } catch (e) { console.warn('[sync] realtime handoff handler error:', e) }
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'sync_collab_events',
            filter: `workspace_id=eq.${workspaceId}`,
        }, (payload) => {
            try {
                if (payload.new && (payload.new as any).actor_user_id !== currentUserId) {
                    applyRemoteCollabEvents([payload.new as any])
                    notifyRenderer('sync-data-updated', { table: 'collab_events', id: (payload.new as any).event_id })
                }
            } catch (e) { console.warn('[sync] realtime collab_events handler error:', e) }
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'sync_artifact_links',
            filter: `workspace_id=eq.${workspaceId}`,
        }, (payload) => {
            try {
                if (payload.new && (payload.new as any).created_by !== currentUserId) {
                    applyRemoteArtifactLinks([payload.new as any])
                    notifyRenderer('sync-data-updated', { table: 'artifact_links', id: (payload.new as any).link_id })
                }
            } catch (e) { console.warn('[sync] realtime artifact_links handler error:', e) }
        })
    realtimeChannel = channel
    realtimeChannelOwner = client

    channel.subscribe((status, err) => {
            if (realtimeChannel !== channel) return

            if (status === 'SUBSCRIBED') {
                reconnectAttempts = 0
                if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
                setSyncStatus('connected')
                notifyRenderer('sync-status-changed', getStatus())
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.warn('[sync] Realtime channel error:', status, err?.message ?? '')
                setSyncStatus('error')
                lastSyncError = 'Realtime connection lost — reconnecting…'
                notifyRenderer('sync-status-changed', getStatus())
                scheduleReconnect()
            }
        })
}

// ─── Apply remote rows → local SQLite ────────────────────────────────────────

function applyRemoteTasks(rows: any[]) {
    const db = getDb()
    const upsert = db.prepare(`
        UPDATE tasks SET
            collab_state = @collab_state,
            active_handoff_id = @active_handoff_id,
            last_collab_updated_at = @last_collab_updated_at,
            updated_at = @updated_at
        WHERE id = @task_id AND project_id IN (
            SELECT id FROM projects WHERE id = @project_id
        )
    `)
    const tx = db.transaction((rows: any[]) => {
        for (const row of rows) {
            upsert.run({
                task_id: row.task_id,
                project_id: row.project_id,
                collab_state: row.collab_state,
                active_handoff_id: row.active_handoff_id ?? null,
                last_collab_updated_at: row.last_collab_updated_at ?? null,
                updated_at: row.updated_at ?? Date.now(),
            })
        }
    })
    tx(rows)
}

function applyRemoteHandoffs(rows: any[]) {
    const db = getDb()
    const upsert = db.prepare(`
        INSERT OR REPLACE INTO handoff_packets (
            id, project_id, task_id, type, created_by_role, created_at, updated_at,
            summary, repro_steps, expected_result, actual_result,
            environment_id, environment_name, severity, branch_name, release_version,
            reproducibility, frequency,
            linked_test_case_ids_json, linked_execution_refs_json,
            linked_note_ids_json, linked_file_ids_json, linked_prs_json,
            developer_response, qa_verification_notes, resolution_summary,
            acknowledged_at, completed_at, is_complete, missing_fields_json
        ) VALUES (
            @id, @project_id, @task_id, @type, @created_by_role, @created_at, @updated_at,
            @summary, @repro_steps, @expected_result, @actual_result,
            @environment_id, @environment_name, @severity, @branch_name, @release_version,
            @reproducibility, @frequency,
            @linked_test_case_ids_json, @linked_execution_refs_json,
            @linked_note_ids_json, @linked_file_ids_json, @linked_prs_json,
            @developer_response, @qa_verification_notes, @resolution_summary,
            @acknowledged_at, @completed_at, @is_complete, @missing_fields_json
        )
    `)
    const tx = db.transaction((rows: any[]) => {
        for (const row of rows) {
            upsert.run({
                id: row.handoff_id,
                project_id: row.project_id,
                task_id: row.task_id,
                type: row.type ?? 'bug_handoff',
                created_by_role: row.created_by_role ?? 'qa',
                created_at: row.created_at ?? Date.now(),
                updated_at: row.updated_at ?? Date.now(),
                summary: row.summary ?? '',
                repro_steps: row.repro_steps ?? '',
                expected_result: row.expected_result ?? '',
                actual_result: row.actual_result ?? '',
                environment_id: row.environment_id ?? null,
                environment_name: row.environment_name ?? null,
                severity: row.severity ?? null,
                branch_name: row.branch_name ?? null,
                release_version: row.release_version ?? null,
                reproducibility: row.reproducibility ?? null,
                frequency: row.frequency ?? null,
                linked_test_case_ids_json: row.linked_test_case_ids_json ?? null,
                linked_execution_refs_json: row.linked_execution_refs_json ?? null,
                linked_note_ids_json: row.linked_note_ids_json ?? null,
                linked_file_ids_json: row.linked_file_ids_json ?? null,
                linked_prs_json: row.linked_prs_json ?? null,
                developer_response: row.developer_response ?? null,
                qa_verification_notes: row.qa_verification_notes ?? null,
                resolution_summary: row.resolution_summary ?? null,
                acknowledged_at: row.acknowledged_at ?? null,
                completed_at: row.completed_at ?? null,
                is_complete: row.is_complete ? 1 : 0,
                missing_fields_json: row.missing_fields_json ?? null,
            })
        }
    })
    tx(rows)
}

function applyRemoteCollabEvents(rows: any[]) {
    const db = getDb()
    const insert = db.prepare(`
        INSERT OR IGNORE INTO collaboration_events (
            id, project_id, task_id, handoff_id, event_type, actor_role,
            timestamp, title, details, metadata_json
        ) VALUES (
            @id, @project_id, @task_id, @handoff_id, @event_type, @actor_role,
            @timestamp, @title, @details, @metadata_json
        )
    `)
    const tx = db.transaction((rows: any[]) => {
        for (const row of rows) {
            insert.run({
                id: row.event_id,
                project_id: row.project_id,
                task_id: row.task_id,
                handoff_id: row.handoff_id ?? null,
                event_type: row.event_type,
                actor_role: row.actor_role,
                timestamp: row.timestamp,
                title: row.title ?? '',
                details: row.details ?? null,
                metadata_json: row.metadata_json ?? null,
            })
        }
    })
    tx(rows)
}

function applyRemoteArtifactLinks(rows: any[]) {
    const db = getDb()
    const insert = db.prepare(`
        INSERT OR IGNORE INTO artifact_links (
            id, project_id, source_type, source_id, target_type, target_id, label, created_at
        ) VALUES (
            @id, @project_id, @source_type, @source_id, @target_type, @target_id, @label, @created_at
        )
    `)
    const tx = db.transaction((rows: any[]) => {
        for (const row of rows) {
            insert.run({
                id: row.link_id,
                project_id: row.project_id,
                source_type: row.source_type,
                source_id: row.source_id,
                target_type: row.target_type,
                target_id: row.target_id,
                label: row.label,
                created_at: row.created_at,
            })
        }
    })
    tx(rows)
}

// ─── Push: local → remote ─────────────────────────────────────────────────────

/** Push a task's collab fields to Supabase */
export function pushTaskCollab(projectId: string, taskId: string, collabState: string, activeHandoffId: string | null, updatedAt: number) {
    enqueue({
        table: 'sync_tasks',
        op: 'upsert',
        rowId: taskId,
        payload: {
            workspace_id: currentWorkspaceId,
            project_id: projectId,
            task_id: taskId,
            collab_state: collabState,
            active_handoff_id: activeHandoffId,
            last_collab_updated_at: updatedAt,
            updated_at: updatedAt,
            updated_by: currentUserId,
        },
    })
}

/** Push a full handoff packet to Supabase */
export function pushHandoff(projectId: string, handoff: HandoffPacket) {
    const now = Date.now()
    enqueue({
        table: 'sync_handoffs',
        op: 'upsert',
        rowId: handoff.id,
        payload: {
            workspace_id: currentWorkspaceId,
            project_id: projectId,
            handoff_id: handoff.id,
            task_id: handoff.taskId,
            type: handoff.type,
            created_by_role: handoff.createdByRole,
            created_at: handoff.createdAt,
            updated_at: handoff.updatedAt ?? now,
            summary: handoff.summary ?? '',
            repro_steps: handoff.reproSteps ?? '',
            expected_result: handoff.expectedResult ?? '',
            actual_result: handoff.actualResult ?? '',
            environment_id: handoff.environmentId ?? null,
            environment_name: handoff.environmentName ?? null,
            severity: handoff.severity ?? null,
            branch_name: handoff.branchName ?? null,
            release_version: handoff.releaseVersion ?? null,
            reproducibility: handoff.reproducibility ?? null,
            frequency: handoff.frequency ?? null,
            linked_test_case_ids_json: JSON.stringify(handoff.linkedTestCaseIds ?? []),
            linked_execution_refs_json: JSON.stringify(handoff.linkedExecutionRefs ?? []),
            linked_note_ids_json: JSON.stringify(handoff.linkedNoteIds ?? []),
            linked_file_ids_json: JSON.stringify(handoff.linkedFileIds ?? []),
            linked_prs_json: JSON.stringify(handoff.linkedPrs ?? []),
            developer_response: handoff.developerResponse ?? null,
            qa_verification_notes: handoff.qaVerificationNotes ?? null,
            resolution_summary: handoff.resolutionSummary ?? null,
            acknowledged_at: handoff.acknowledgedAt ?? null,
            completed_at: handoff.completedAt ?? null,
            is_complete: handoff.isComplete ?? false,
            missing_fields_json: JSON.stringify(handoff.missingFields ?? []),
            updated_by: currentUserId,
        },
    })
}

/** Push a collaboration event to Supabase */
export function pushCollabEvent(projectId: string, event: CollaborationEvent) {
    enqueue({
        table: 'sync_collab_events',
        op: 'upsert',
        rowId: event.id,
        payload: {
            workspace_id: currentWorkspaceId,
            project_id: projectId,
            event_id: event.id,
            task_id: event.taskId,
            handoff_id: event.handoffId ?? null,
            event_type: event.eventType,
            actor_role: event.actorRole,
            actor_user_id: currentUserId,
            timestamp: event.timestamp,
            title: event.title ?? '',
            details: event.details ?? null,
            metadata_json: event.metadata ? JSON.stringify(event.metadata) : null,
        },
    })
}

/** Push an artifact link to Supabase */
export function pushArtifactLink(projectId: string, link: ArtifactLink) {
    enqueue({
        table: 'sync_artifact_links',
        op: 'upsert',
        rowId: link.id,
        payload: {
            workspace_id: currentWorkspaceId,
            project_id: projectId,
            link_id: link.id,
            source_type: link.sourceType,
            source_id: link.sourceId,
            target_type: link.targetType,
            target_id: link.targetId,
            label: link.label,
            created_at: link.createdAt,
            created_by: currentUserId,
        },
    })
}

// ─── Persistent mutation queue (Improvements 3 + 4) ──────────────────────────

function enqueue(mutation: { table: string; op: string; rowId: string; payload: Record<string, unknown> }) {
    if (!currentWorkspaceId) return // Not in a workspace — skip cloud push

    try {
        enqueueSyncMutation(currentWorkspaceId, mutation.table, mutation.op, mutation.rowId, mutation.payload)
    } catch (e) {
        console.error('[sync] Failed to persist mutation to queue:', e)
    }

    // Debounce flush by 500ms
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(flushPendingMutations, 500)

    notifyRenderer('sync-status-changed', getStatus())
}

export async function flushPendingMutations() {
    if (!supabase || !currentWorkspaceId) return
    // Mutex: prevent concurrent flushes
    if (flushInProgress) return
    flushInProgress = true

    let pending: ReturnType<typeof loadSyncPendingQueue>
    try {
        pending = loadSyncPendingQueue(currentWorkspaceId)
    } catch (e) {
        console.error('[sync] Could not load pending queue:', e)
        flushInProgress = false
        return
    }
    if (pending.length === 0) {
        flushInProgress = false
        return
    }

    setSyncStatus('syncing')
    notifyRenderer('sync-status-changed', getStatus())

    let anyFailed = false
    let maxRetryFailed = false

    for (const mutation of pending) {
        try {
            if (mutation.workspace_id !== currentWorkspaceId) {
                console.warn(`[sync] Skipping queued mutation for mismatched workspace ${mutation.workspace_id ?? 'unknown'} while connected to ${currentWorkspaceId}`)
                removeSyncMutation(mutation.id)
                continue
            }
            if (mutation.op === 'upsert') {
                // Conflict detection (Improvement 9): check remote updated_at before upserting
                const remoteupdatedAt = await fetchRemoteUpdatedAt(mutation.table, mutation.row_id)
                const localUpdatedAt = (mutation.payload.updated_at as number | undefined) ?? 0
                if (remoteupdatedAt && remoteupdatedAt > localUpdatedAt) {
                    // Remote is newer — skip push, pull the fresh remote version instead
                    console.warn(`[sync] Conflict on ${mutation.table}/${mutation.row_id}: remote is newer. Pulling remote version.`)
                    await pullSingleRow(mutation.table, mutation.row_id)
                    removeSyncMutation(mutation.id)
                    notifyRenderer('sync-conflict-detected', { table: mutation.table, id: mutation.row_id })
                    continue
                }

                const { error } = await supabase
                    .from(mutation.table)
                    .upsert(mutation.payload as any, { onConflict: getConflictColumns(mutation.table) })
                if (error) throw error
            } else if (mutation.op === 'delete') {
                const { error } = await supabase
                    .from(mutation.table)
                    .delete()
                    .eq(getPkColumn(mutation.table), mutation.row_id)
                    .eq('workspace_id', currentWorkspaceId)
                if (error) throw error
            }
            removeSyncMutation(mutation.id)
        } catch (e: any) {
            console.error(`[sync] Failed to flush ${mutation.table}/${mutation.row_id}:`, e.message)
            if (mutation.retry_count >= MAX_MUTATION_RETRIES) {
                console.error(`[sync] Dropping mutation after ${MAX_MUTATION_RETRIES} retries: ${mutation.table}/${mutation.row_id}`)
                writeDeadLetter(mutation)
                removeSyncMutation(mutation.id)
                maxRetryFailed = true
            } else {
                incrementSyncMutationRetry(mutation.id)
                anyFailed = true
            }
        }
    }

    if (maxRetryFailed) {
        notifyRenderer('sync-mutation-failed', { message: 'Some changes could not be synced and were dropped after too many retries.' })
    }

    if (anyFailed) {
        setSyncStatus('error')
        lastSyncError = 'Some changes failed to sync — retrying…'
        notifyRenderer('sync-status-changed', getStatus())
        scheduleRetry()
    } else {
        lastSyncedAt = Date.now()
        setSyncStatus('connected')
        notifyRenderer('sync-status-changed', getStatus())
    }

    flushInProgress = false
}

function scheduleRetry() {
    if (retryTimer) return // Already scheduled

    // Get current max retry count from queue to pick backoff
    let pending: ReturnType<typeof loadSyncPendingQueue> = []
    try { pending = currentWorkspaceId ? loadSyncPendingQueue(currentWorkspaceId) : [] } catch { /* ignore */ }
    const maxRetries = pending.reduce((m, p) => Math.max(m, p.retry_count), 0)
    const delay = RETRY_BACKOFF_MS[Math.min(maxRetries, RETRY_BACKOFF_MS.length - 1)]

    retryTimer = setTimeout(async () => {
        retryTimer = null
        await flushPendingMutations()
    }, delay)
}

// ─── Conflict detection helpers ───────────────────────────────────────────────

async function fetchRemoteUpdatedAt(table: string, rowId: string): Promise<number | null> {
    if (!supabase) return null
    try {
        const pk = getPkColumn(table)
        const { data } = await supabase
            .from(table)
            .select('updated_at')
            .eq(pk, rowId)
            .eq('workspace_id', currentWorkspaceId!)
            .single()
        return data?.updated_at ?? null
    } catch {
        return null
    }
}

async function pullSingleRow(table: string, rowId: string): Promise<void> {
    if (!supabase) return
    try {
        const pk = getPkColumn(table)
        const { data } = await supabase
            .from(table)
            .select('*')
            .eq(pk, rowId)
            .eq('workspace_id', currentWorkspaceId!)
            .single()
        if (!data) return
        switch (table) {
            case 'sync_tasks': applyRemoteTasks([data]); break
            case 'sync_handoffs': applyRemoteHandoffs([data]); break
            case 'sync_collab_events': applyRemoteCollabEvents([data]); break
            case 'sync_artifact_links': applyRemoteArtifactLinks([data]); break
        }
    } catch (e) {
        console.warn('[sync] pullSingleRow failed:', e)
    }
}

function getPkColumn(table: string): string {
    switch (table) {
        case 'sync_tasks':          return 'task_id'
        case 'sync_handoffs':       return 'handoff_id'
        case 'sync_collab_events':  return 'event_id'
        case 'sync_artifact_links': return 'link_id'
        default:                    return 'id'
    }
}

/** Returns the full composite conflict target for Supabase upsert (workspace_id + row PK). */
function getConflictColumns(table: string): string {
    switch (table) {
        case 'sync_tasks':          return 'workspace_id,task_id'
        case 'sync_handoffs':       return 'workspace_id,handoff_id'
        case 'sync_collab_events':  return 'workspace_id,event_id'
        case 'sync_artifact_links': return 'workspace_id,link_id'
        default:                    return 'id'
    }
}

/** Manual full sync — re-pull and re-push everything */
export async function triggerManualSync(): Promise<{ ok: boolean; error?: string }> {
    if (!supabase || !currentWorkspaceId) {
        return { ok: false, error: 'Not connected to a workspace' }
    }
    try {
        await performInitialPull()
        await flushPendingMutations()
        return { ok: true }
    } catch (e: any) {
        return { ok: false, error: e.message }
    }
}

/** Called on app startup to check if cloud is configured */
export async function getSyncConfig(): Promise<{
    configured: boolean
    url?: string
    anonKey?: string
    workspaceId?: string
    userId?: string
    email?: string
    displayName?: string
}> {
    const auth = getAuthStatus()
    const wsId = await getCredential(CRED_WORKSPACE_ID)
    return {
        configured: !!(auth.configured && wsId),
        url: auth.supabaseUrl ?? undefined,
        anonKey: auth.supabaseAnonKey ?? undefined,
        workspaceId: wsId ?? undefined,
        userId: auth.user?.id ?? undefined,
        email: auth.user?.email ?? undefined,
        displayName: auth.user?.displayName ?? undefined,
    }
}
