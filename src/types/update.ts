export type AppUpdateStatus =
    | 'idle'
    | 'disabled'
    | 'checking'
    | 'available'
    | 'none'
    | 'downloading'
    | 'downloaded'
    | 'error'

export interface AppUpdateState {
    status: AppUpdateStatus
    currentVersion: string
    availableVersion?: string
    releaseNotes?: string
    downloadProgressPercent?: number
    errorMessage?: string
    lastCheckedAt?: number
}
