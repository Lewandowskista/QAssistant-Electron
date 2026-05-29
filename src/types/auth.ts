export type AuthStateName =
    | 'booting'
    | 'signed_out'
    | 'signing_in'
    | 'signed_in'
    | 'error'

export type AuthenticatedUser = {
    id: string
    email: string | null
    displayName: string
    emailConfirmedAt: string | null
}

export type AuthStatus = {
    configured: boolean
    status: AuthStateName
    user: AuthenticatedUser | null
    error: string | null
    supabaseUrl?: string
    supabaseAnonKey?: string
    usingOfflineSession?: boolean
    /**
     * True when the app is running fully locally without a reachable cloud
     * backend. In this mode the login gate is skipped and a synthetic local
     * user is used. All cloud calls (sync, cloud snapshot) become no-ops.
     */
    localMode?: boolean
}
