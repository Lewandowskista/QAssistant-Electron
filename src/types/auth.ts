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
}
