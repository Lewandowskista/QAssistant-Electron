import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthenticatedClient, getAuthStatus } from './auth'

const SNAPSHOT_TABLE = 'user_app_snapshots'
const SNAPSHOT_VERSION = 1
const LOCAL_STATE_USER_ID_KEY = 'cloudStateUserId'
const SETTINGS_LOCAL_ONLY_KEYS = new Set([
    'allowInsecureCredentialStorage',
    'deferredVersion',
    'lastUpdateCheckAt',
    LOCAL_STATE_USER_ID_KEY,
])
const CREDENTIAL_KEYS_EXCLUDED_FROM_SYNC = new Set([
    'auth_access_token',
    'auth_refresh_token',
    'auth_user_json',
    'auth_pending_email',
])
const UPLOAD_DEBOUNCE_MS = 1200

type CredentialEntry = {
    key: string
    value: string
}

type UserAppSnapshot = {
    version: number
    capturedAt: string
    projects: unknown[]
    settings: Record<string, unknown>
    userProfile: unknown | null
    credentials: CredentialEntry[]
}

type CloudStateRow = {
    user_id: string
    payload_json: UserAppSnapshot | null
    updated_at?: string | null
}

type CloudStateIo = {
    readSettings: () => Promise<Record<string, unknown>>
    writeSettings: (settings: Record<string, unknown>) => Promise<void>
    getAllProjects: () => unknown[]
    saveAllProjects: (projects: unknown[]) => void
    readUserProfile: () => Promise<unknown | null>
    writeUserProfile: (profile: unknown) => Promise<void>
    deleteUserProfile: () => Promise<void>
    listCredentials: () => Promise<Array<{ account: string; password: string }>>
    setCredential: (key: string, value: string) => Promise<void>
    deleteCredential: (key: string) => Promise<unknown>
}

let io: CloudStateIo | null = null
let uploadTimer: ReturnType<typeof setTimeout> | null = null
let uploadInFlight: Promise<void> | null = null
let applyInFlight: Promise<CloudStateEnsureResult> | null = null
let suppressUploads = 0

export type CloudStateEnsureResult =
    | { outcome: 'noop'; changed: false }
    | { outcome: 'applied_remote_snapshot'; changed: true }
    | { outcome: 'uploaded_local_snapshot'; changed: false }
    | { outcome: 'cleared_local_state'; changed: true }

export function configureCloudStateIo(nextIo: CloudStateIo) {
    io = nextIo
}

export function scheduleCloudStateUpload() {
    if (!io || suppressUploads > 0) return
    if (uploadTimer) clearTimeout(uploadTimer)
    uploadTimer = setTimeout(() => {
        uploadTimer = null
        void uploadCloudStateNow()
    }, UPLOAD_DEBOUNCE_MS)
}

export async function ensureCloudStateForSignedInUser(): Promise<CloudStateEnsureResult> {
    if (applyInFlight) {
        await applyInFlight
        return await applyInFlight
    }

    applyInFlight = (async () => {
        if (!io) return { outcome: 'noop', changed: false } as const

        const auth = getAuthStatus()
        const userId = auth.user?.id
        if (!userId) return { outcome: 'noop', changed: false } as const

        const client = await getAuthenticatedClient()
        if (!client) return { outcome: 'noop', changed: false } as const

        const remoteSnapshot = await fetchRemoteSnapshot(client, userId)
        const settings = await io.readSettings()
        const localStateUserId = typeof settings[LOCAL_STATE_USER_ID_KEY] === 'string'
            ? settings[LOCAL_STATE_USER_ID_KEY] as string
            : null

        if (remoteSnapshot) {
            await runWithoutUploads(async () => {
                await applySnapshot(remoteSnapshot, userId)
            })
            return { outcome: 'applied_remote_snapshot', changed: true } as const
        }

        if (!localStateUserId || localStateUserId === userId) {
            await runWithoutUploads(async () => {
                await writeSettingsWithMarker(settings, userId)
            })
            await uploadCloudStateNow()
            return { outcome: 'uploaded_local_snapshot', changed: false } as const
        }

        await runWithoutUploads(async () => {
            await clearLocalUserState(settings, userId)
        })
        return { outcome: 'cleared_local_state', changed: true } as const
    })().finally(() => {
        applyInFlight = null
    })

    return await applyInFlight
}

async function uploadCloudStateNow(): Promise<void> {
    if (uploadInFlight) {
        await uploadInFlight
        return
    }

    uploadInFlight = (async () => {
        if (!io) return

        const auth = getAuthStatus()
        const userId = auth.user?.id
        if (!userId) return

        const client = await getAuthenticatedClient()
        if (!client) return

        const snapshot = await captureSnapshot()
        await upsertRemoteSnapshot(client, userId, snapshot)
        const currentSettings = await io.readSettings()
        await writeSettingsWithMarker(currentSettings, userId)
    })().finally(() => {
        uploadInFlight = null
    })

    await uploadInFlight
}

async function fetchRemoteSnapshot(client: SupabaseClient, userId: string): Promise<UserAppSnapshot | null> {
    const { data, error } = await client
        .from(SNAPSHOT_TABLE)
        .select('user_id, payload_json, updated_at')
        .eq('user_id', userId)
        .maybeSingle<CloudStateRow>()

    if (error || !data?.payload_json) return null
    return normalizeSnapshot(data.payload_json)
}

async function upsertRemoteSnapshot(client: SupabaseClient, userId: string, snapshot: UserAppSnapshot): Promise<void> {
    const { error } = await client
        .from(SNAPSHOT_TABLE)
        .upsert({
            user_id: userId,
            payload_json: snapshot,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

    if (error) throw new Error(error.message)
}

async function captureSnapshot(): Promise<UserAppSnapshot> {
    if (!io) throw new Error('Cloud state IO is not configured')

    const settings = await io.readSettings()
    const userProfile = await io.readUserProfile()
    const credentials = (await io.listCredentials())
        .filter(entry => !CREDENTIAL_KEYS_EXCLUDED_FROM_SYNC.has(entry.account))
        .map(entry => ({ key: entry.account, value: entry.password }))
        .sort((a, b) => a.key.localeCompare(b.key))

    return {
        version: SNAPSHOT_VERSION,
        capturedAt: new Date().toISOString(),
        projects: io.getAllProjects(),
        settings: extractSyncedSettings(settings),
        userProfile,
        credentials,
    }
}

async function applySnapshot(snapshot: UserAppSnapshot, userId: string): Promise<void> {
    if (!io) throw new Error('Cloud state IO is not configured')

    const currentSettings = await io.readSettings()
    io.saveAllProjects(Array.isArray(snapshot.projects) ? snapshot.projects : [])
    await replaceSyncedCredentials(snapshot.credentials)

    if (snapshot.userProfile) {
        await io.writeUserProfile(snapshot.userProfile)
    } else {
        await io.deleteUserProfile()
    }

    await io.writeSettings({
        ...pickLocalOnlySettings(currentSettings),
        ...snapshot.settings,
        [LOCAL_STATE_USER_ID_KEY]: userId,
    })
}

async function clearLocalUserState(currentSettings: Record<string, unknown>, userId: string): Promise<void> {
    if (!io) throw new Error('Cloud state IO is not configured')

    io.saveAllProjects([])
    await replaceSyncedCredentials([])
    await io.deleteUserProfile()
    await io.writeSettings({
        ...pickLocalOnlySettings(currentSettings),
        [LOCAL_STATE_USER_ID_KEY]: userId,
    })
}

async function replaceSyncedCredentials(nextCredentials: CredentialEntry[]): Promise<void> {
    if (!io) throw new Error('Cloud state IO is not configured')

    const existing = await io.listCredentials()
    for (const entry of existing) {
        if (CREDENTIAL_KEYS_EXCLUDED_FROM_SYNC.has(entry.account)) continue
        await io.deleteCredential(entry.account)
    }

    for (const credential of nextCredentials) {
        await io.setCredential(credential.key, credential.value)
    }
}

function extractSyncedSettings(settings: Record<string, unknown>): Record<string, unknown> {
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(settings)) {
        if (SETTINGS_LOCAL_ONLY_KEYS.has(key)) continue
        next[key] = value
    }
    return next
}

function pickLocalOnlySettings(settings: Record<string, unknown>): Record<string, unknown> {
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(settings)) {
        if (!SETTINGS_LOCAL_ONLY_KEYS.has(key)) continue
        next[key] = value
    }
    return next
}

async function writeSettingsWithMarker(settings: Record<string, unknown>, userId: string): Promise<void> {
    if (!io) throw new Error('Cloud state IO is not configured')
    await io.writeSettings({
        ...settings,
        [LOCAL_STATE_USER_ID_KEY]: userId,
    })
}

function normalizeSnapshot(snapshot: UserAppSnapshot): UserAppSnapshot {
    return {
        version: typeof snapshot?.version === 'number' ? snapshot.version : SNAPSHOT_VERSION,
        capturedAt: typeof snapshot?.capturedAt === 'string' ? snapshot.capturedAt : new Date().toISOString(),
        projects: Array.isArray(snapshot?.projects) ? snapshot.projects : [],
        settings: isRecord(snapshot?.settings) ? snapshot.settings : {},
        userProfile: snapshot?.userProfile ?? null,
        credentials: Array.isArray(snapshot?.credentials)
            ? snapshot.credentials.filter(isCredentialEntry)
            : [],
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCredentialEntry(value: unknown): value is CredentialEntry {
    return isRecord(value) && typeof value.key === 'string' && typeof value.value === 'string'
}

async function runWithoutUploads<T>(fn: () => Promise<T>): Promise<T> {
    suppressUploads++
    try {
        return await fn()
    } finally {
        suppressUploads = Math.max(0, suppressUploads - 1)
    }
}
