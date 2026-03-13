export type AuthProvider = 'github' | 'linear'

export type UserRole = 'qa' | 'dev'

export type UserIdentity = {
    provider: AuthProvider
    providerId: string
    username: string
    email: string | null
    avatarUrl: string | null
    connectedAt: number
}

export type UserProfile = {
    activeRole: UserRole
    identities: UserIdentity[]
}
