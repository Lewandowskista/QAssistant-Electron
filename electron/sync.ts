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

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import { getCredential, setCredential, deleteCredential } from './credentialService'
import {
    getDb,
    enqueueSyncMutation,
    loadSyncPendingQueue,
    removeSyncMutation,
    incrementSyncMutationRetry,
} from './database'

// ─── Credential keys ──────────────────────────────────────────────────────────
const CRED_SUPABASE_URL      = 'sync_supabase_url'
const CRED_SUPABASE_ANON_KEY = 'sync_supabase_anon_key'
const CRED_WORKSPACE_ID      = 'sync_workspace_id'
const CRED_ACCESS_TOKEN      = 'sync_access_token'
const CRED_REFRESH_TOKEN     = 'sync_refresh_token'
const CRED_USER_ID           = 'sync_user_id'
const CRED_USER_EMAIL        = 'sync_user_email'
const CRED_USER_DISPLAY_NAME = 'sync_user_display_name'

// ─── State ────────────────────────────────────────────────────────────────────

type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'error'

let supabase: SupabaseClient | null = null
let realtimeChannel: RealtimeChannel | null = null
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

// Flush debounce
let flushTimer: ReturnType<typeof setTimeout> | null = null

// ─── Init / teardown ──────────────────────────────────────────────────────────

export function setSyncWindowSender(fn: (channel: string, ...args: any[]) => void) {
    mainWindowSender = fn
}

function notifyRenderer(channel: string, data: unknown) {
    mainWindowSender?.(channel, data)
}

export async function initSync(): Promise<{ ok: boolean; status: SyncStatus }> {
    const url     = await getCredential(CRED_SUPABASE_URL)
    const anonKey = await getCredential(CRED_SUPABASE_ANON_KEY)
    const wsId    = await getCredential(CRED_WORKSPACE_ID)
    const accessToken  = await getCredential(CRED_ACCESS_TOKEN)
    const refreshToken = await getCredential(CRED_REFRESH_TOKEN)

    if (!url || !anonKey || !wsId) {
        setSyncStatus('disconnected')
        return { ok: false, status: syncStatus }
    }

    currentWorkspaceId = wsId
    currentUserId = await getCredential(CRED_USER_ID)

    supabase = createClient(url, anonKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: false,
        }
    })

    setSyncStatus('connecting')

    // Restore session from credentials
    if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
        })
        if (error) {
            console.warn('[sync] Could not restore session:', error.message)
            setSyncStatus('error')
            lastSyncError = error.message
            notifyRenderer('sync-status-changed', getStatus())
            return { ok: false, status: syncStatus }
        }

        // Keep tokens fresh
        supabase.auth.onAuthStateChange(async (event, session) => {
            if (session) {
                await setCredential(CRED_ACCESS_TOKEN, session.access_token)
                await setCredential(CRED_REFRESH_TOKEN, session.refresh_token ?? '')
                currentUserId = session.user.id
                await setCredential(CRED_USER_ID, session.user.id)
            }
            if (event === 'SIGNED_OUT') {
                setSyncStatus('disconnected')
                notifyRenderer('sync-status-changed', getStatus())
            }
        })
    }

    setSyncStatus('connected')
    notifyRenderer('sync-status-changed', getStatus())

    // Pull all remote changes since last sync, then subscribe to real-time
    await performInitialPull()
    subscribeRealtime()

    // Flush any persisted pending mutations (from before crash/restart)
    await flushPendingMutations()

    // Start auto-sync (periodic pull + focus handler)
    startAutoSync()

    // Reset reconnect state on successful init
    reconnectAttempts = 0
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }

    return { ok: true, status: syncStatus }
}

export async function teardownSync() {
    stopAutoSync()
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (realtimeChannel) {
        await supabase?.removeChannel(realtimeChannel)
        realtimeChannel = null
    }
    supabase = null
    currentWorkspaceId = null
    setSyncStatus('disconnected')
}

function setSyncStatus(s: SyncStatus) {
    syncStatus = s
    if (s !== 'error') lastSyncError = null
}

// ─── Auto-sync (Improvement 1) ────────────────────────────────────────────────

function startAutoSync() {
    stopAutoSync()
    autoSyncInterval = setInterval(async () => {
        if (syncStatus === 'connected' || syncStatus === 'syncing') {
            await performInitialPull()
            await flushPendingMutations()
            notifyRenderer('sync-members-updated', null)
        }
    }, AUTO_SYNC_INTERVAL_MS)
}

function stopAutoSync() {
    if (autoSyncInterval) { clearInterval(autoSyncInterval); autoSyncInterval = null }
}

/** Called by main.ts when the BrowserWindow gains focus */
export async function onAppFocused() {
    if (!supabase || !currentWorkspaceId) return
    if (syncStatus === 'connected' || syncStatus === 'syncing') {
        await performInitialPull()
        await flushPendingMutations()
    }
}

// ─── Reconnection with exponential backoff (Improvement 2) ───────────────────

function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.warn('[sync] Max reconnect attempts reached — staying in error state')
        setSyncStatus('error')
        lastSyncError = 'Connection lost. Please check your network and manually reconnect.'
        notifyRenderer('sync-status-changed', getStatus())
        return
    }
    const delay = RECONNECT_BACKOFF_MS[reconnectAttempts] ?? 30000
    reconnectAttempts++
    console.log(`[sync] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)
    reconnectTimer = setTimeout(async () => {
        // Full re-init to re-establish session + subscriptions
        if (realtimeChannel) {
            await supabase?.removeChannel(realtimeChannel)
            realtimeChannel = null
        }
        await performInitialPull()
        subscribeRealtime()
        await flushPendingMutations()
    }, delay)
}

// ─── Status ───────────────────────────────────────────────────────────────────

export function getStatus() {
    const db = getDb()
    let pendingCount = 0
    try {
        const row = db.prepare('SELECT COUNT(*) as cnt FROM sync_pending_queue').get() as { cnt: number }
        pendingCount = row.cnt
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

// ─── Workspace management ─────────────────────────────────────────────────────

export async function createWorkspace(
    supabaseUrl: string,
    supabaseAnonKey: string,
    userEmail: string,
    userPassword: string,
    workspaceName: string,
    displayName: string,
): Promise<{ ok: boolean; workspaceId?: string; inviteCode?: string; error?: string }> {
    try {
        const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })

        let userId: string
        let accessToken: string
        let refreshToken: string | undefined

        const { data: signUpData, error: signUpError } = await client.auth.signUp({
            email: userEmail,
            password: userPassword,
        })

        if (signUpError && !signUpError.message.includes('already registered')) {
            return { ok: false, error: signUpError.message }
        }

        if (signUpData?.session) {
            userId = signUpData.session.user.id
            accessToken = signUpData.session.access_token
            refreshToken = signUpData.session.refresh_token
        } else {
            const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
                email: userEmail,
                password: userPassword,
            })
            if (signInError || !signInData.session) {
                return { ok: false, error: signInError?.message ?? 'Sign-in failed' }
            }
            userId = signInData.session.user.id
            accessToken = signInData.session.access_token
            refreshToken = signInData.session.refresh_token
        }

        const inviteCode = generateInviteCode()
        const { data: wsData, error: wsError } = await client
            .from('workspaces')
            .insert({
                name: workspaceName,
                owner_id: userId,
                invite_code: inviteCode,
            })
            .select('id')
            .single()

        if (wsError || !wsData) {
            return { ok: false, error: wsError?.message ?? 'Could not create workspace' }
        }

        const workspaceId = wsData.id

        await client.from('workspace_members').insert({
            workspace_id: workspaceId,
            user_id: userId,
            email: userEmail,
            display_name: displayName,
            role: 'owner',
        })

        await saveCloudCredentials(supabaseUrl, supabaseAnonKey, workspaceId, userId, userEmail, displayName, accessToken, refreshToken ?? '')

        return { ok: true, workspaceId, inviteCode }
    } catch (e: any) {
        return { ok: false, error: e.message }
    }
}

export async function joinWorkspace(
    supabaseUrl: string,
    supabaseAnonKey: string,
    userEmail: string,
    userPassword: string,
    inviteCode: string,
    displayName: string,
): Promise<{ ok: boolean; workspaceId?: string; workspaceName?: string; error?: string }> {
    try {
        const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })

        let userId: string
        let accessToken: string
        let refreshToken: string | undefined

        const { data: signUpData, error: signUpError } = await client.auth.signUp({
            email: userEmail,
            password: userPassword,
        })

        if (signUpError && !signUpError.message.includes('already registered')) {
            return { ok: false, error: signUpError.message }
        }

        if (signUpData?.session) {
            userId = signUpData.session.user.id
            accessToken = signUpData.session.access_token
            refreshToken = signUpData.session.refresh_token
        } else {
            const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
                email: userEmail,
                password: userPassword,
            })
            if (signInError || !signInData.session) {
                return { ok: false, error: signInError?.message ?? 'Sign-in failed' }
            }
            userId = signInData.session.user.id
            accessToken = signInData.session.access_token
            refreshToken = signInData.session.refresh_token
        }

        const { data: wsData, error: wsError } = await client
            .from('workspaces')
            .select('id, name')
            .eq('invite_code', inviteCode.toUpperCase())
            .single()

        if (wsError || !wsData) {
            return { ok: false, error: 'Invalid invite code' }
        }

        const workspaceId = wsData.id

        await client.from('workspace_members').upsert({
            workspace_id: workspaceId,
            user_id: userId,
            email: userEmail,
            display_name: displayName,
            role: 'member',
        }, { onConflict: 'workspace_id,user_id' })

        await saveCloudCredentials(supabaseUrl, supabaseAnonKey, workspaceId, userId, userEmail, displayName, accessToken, refreshToken ?? '')

        return { ok: true, workspaceId, workspaceName: wsData.name }
    } catch (e: any) {
        return { ok: false, error: e.message }
    }
}

export async function disconnectWorkspace(): Promise<void> {
    await teardownSync()
    await deleteCredential(CRED_SUPABASE_URL)
    await deleteCredential(CRED_SUPABASE_ANON_KEY)
    await deleteCredential(CRED_WORKSPACE_ID)
    await deleteCredential(CRED_ACCESS_TOKEN)
    await deleteCredential(CRED_REFRESH_TOKEN)
    await deleteCredential(CRED_USER_ID)
    await deleteCredential(CRED_USER_EMAIL)
    await deleteCredential(CRED_USER_DISPLAY_NAME)
    currentWorkspaceId = null
    currentUserId = null
    notifyRenderer('sync-status-changed', getStatus())
}

export async function getWorkspaceInfo(): Promise<{ workspaceId: string | null; workspaceName?: string; inviteCode?: string; members?: any[] }> {
    if (!supabase || !currentWorkspaceId) return { workspaceId: null }
    const { data } = await supabase
        .from('workspaces')
        .select('id, name, invite_code')
        .eq('id', currentWorkspaceId)
        .single()
    const { data: members } = await supabase
        .from('workspace_members')
        .select('user_id, email, display_name, role')
        .eq('workspace_id', currentWorkspaceId)
    return {
        workspaceId: currentWorkspaceId,
        workspaceName: data?.name,
        inviteCode: data?.invite_code,
        members: members ?? [],
    }
}

async function saveCloudCredentials(
    url: string, anonKey: string, workspaceId: string,
    userId: string, email: string, displayName: string,
    accessToken: string, refreshToken: string,
) {
    await setCredential(CRED_SUPABASE_URL, url)
    await setCredential(CRED_SUPABASE_ANON_KEY, anonKey)
    await setCredential(CRED_WORKSPACE_ID, workspaceId)
    await setCredential(CRED_USER_ID, userId)
    await setCredential(CRED_USER_EMAIL, email)
    await setCredential(CRED_USER_DISPLAY_NAME, displayName)
    await setCredential(CRED_ACCESS_TOKEN, accessToken)
    await setCredential(CRED_REFRESH_TOKEN, refreshToken)
    currentWorkspaceId = workspaceId
    currentUserId = userId
}

// ─── Invite code ──────────────────────────────────────────────────────────────

function generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)]
    }
    return code
}

// ─── Pull: remote → local ─────────────────────────────────────────────────────

async function performInitialPull() {
    if (!supabase || !currentWorkspaceId) return

    setSyncStatus('syncing')
    notifyRenderer('sync-status-changed', getStatus())

    try {
        const { data: tasks } = await supabase
            .from('sync_tasks')
            .select('*')
            .eq('workspace_id', currentWorkspaceId)

        if (tasks) applyRemoteTasks(tasks)

        const { data: handoffs } = await supabase
            .from('sync_handoffs')
            .select('*')
            .eq('workspace_id', currentWorkspaceId)

        if (handoffs) applyRemoteHandoffs(handoffs)

        const { data: events } = await supabase
            .from('sync_collab_events')
            .select('*')
            .eq('workspace_id', currentWorkspaceId)

        if (events) applyRemoteCollabEvents(events)

        const { data: links } = await supabase
            .from('sync_artifact_links')
            .select('*')
            .eq('workspace_id', currentWorkspaceId)

        if (links) applyRemoteArtifactLinks(links)

        lastSyncedAt = Date.now()
        setSyncStatus('connected')
        notifyRenderer('sync-status-changed', getStatus())
        notifyRenderer('sync-data-updated', null)
    } catch (e: any) {
        console.error('[sync] Initial pull failed:', e)
        setSyncStatus('error')
        lastSyncError = e.message
        notifyRenderer('sync-status-changed', getStatus())
    }
}

// ─── Real-time subscriptions ──────────────────────────────────────────────────

function subscribeRealtime() {
    if (!supabase || !currentWorkspaceId) return

    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel)
    }

    realtimeChannel = supabase
        .channel(`workspace:${currentWorkspaceId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'sync_tasks',
            filter: `workspace_id=eq.${currentWorkspaceId}`,
        }, (payload) => {
            if (payload.new && (payload.new as any).updated_by !== currentUserId) {
                applyRemoteTasks([payload.new as any])
                notifyRenderer('sync-data-updated', { table: 'tasks', id: (payload.new as any).task_id })
            }
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'sync_handoffs',
            filter: `workspace_id=eq.${currentWorkspaceId}`,
        }, (payload) => {
            if (payload.new && (payload.new as any).updated_by !== currentUserId) {
                applyRemoteHandoffs([payload.new as any])
                notifyRenderer('sync-data-updated', { table: 'handoffs', id: (payload.new as any).handoff_id })
            }
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'sync_collab_events',
            filter: `workspace_id=eq.${currentWorkspaceId}`,
        }, (payload) => {
            if (payload.new && (payload.new as any).actor_user_id !== currentUserId) {
                applyRemoteCollabEvents([payload.new as any])
                notifyRenderer('sync-data-updated', { table: 'collab_events', id: (payload.new as any).event_id })
            }
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'sync_artifact_links',
            filter: `workspace_id=eq.${currentWorkspaceId}`,
        }, (payload) => {
            if (payload.new && (payload.new as any).created_by !== currentUserId) {
                applyRemoteArtifactLinks([payload.new as any])
                notifyRenderer('sync-data-updated', { table: 'artifact_links', id: (payload.new as any).link_id })
            }
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                reconnectAttempts = 0
                if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
                setSyncStatus('connected')
                notifyRenderer('sync-status-changed', getStatus())
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.warn('[sync] Realtime channel error:', status)
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
export function pushHandoff(projectId: string, handoff: any) {
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
export function pushCollabEvent(projectId: string, event: any) {
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
export function pushArtifactLink(projectId: string, link: any) {
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
        enqueueSyncMutation(mutation.table, mutation.op, mutation.rowId, mutation.payload)
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

    let pending: ReturnType<typeof loadSyncPendingQueue>
    try {
        pending = loadSyncPendingQueue()
    } catch (e) {
        console.error('[sync] Could not load pending queue:', e)
        return
    }
    if (pending.length === 0) return

    setSyncStatus('syncing')
    notifyRenderer('sync-status-changed', getStatus())

    let anyFailed = false
    let maxRetryFailed = false

    for (const mutation of pending) {
        try {
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
                    .upsert(mutation.payload as any, { onConflict: getPkColumn(mutation.table) })
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
}

function scheduleRetry() {
    if (retryTimer) return // Already scheduled

    // Get current max retry count from queue to pick backoff
    let pending: ReturnType<typeof loadSyncPendingQueue> = []
    try { pending = loadSyncPendingQueue() } catch { /* ignore */ }
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
    workspaceId?: string
    userId?: string
    email?: string
    displayName?: string
}> {
    const url = await getCredential(CRED_SUPABASE_URL)
    const wsId = await getCredential(CRED_WORKSPACE_ID)
    const userId = await getCredential(CRED_USER_ID)
    const email = await getCredential(CRED_USER_EMAIL)
    const displayName = await getCredential(CRED_USER_DISPLAY_NAME)
    return {
        configured: !!(url && wsId),
        url: url ?? undefined,
        workspaceId: wsId ?? undefined,
        userId: userId ?? undefined,
        email: email ?? undefined,
        displayName: displayName ?? undefined,
    }
}
