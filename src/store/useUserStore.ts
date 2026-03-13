import { create } from 'zustand'
import type { UserProfile, UserIdentity, UserRole, AuthProvider } from '@/types/user'

interface UserState {
    profile: UserProfile | null
    isLoaded: boolean

    // Derived
    activeRole: UserRole
    identities: UserIdentity[]
    isConnected: (provider: AuthProvider) => boolean
    getIdentity: (provider: AuthProvider) => UserIdentity | undefined

    // Actions
    loadProfile: () => Promise<void>
    setRole: (role: UserRole) => Promise<void>
    addIdentity: (identity: UserIdentity) => Promise<void>
    removeIdentity: (provider: AuthProvider) => Promise<void>
}

async function persistProfile(profile: UserProfile): Promise<void> {
    await window.electronAPI.writeUserProfile(profile)
}

export const useUserStore = create<UserState>((set, get) => ({
    profile: null,
    isLoaded: false,

    get activeRole() {
        return get().profile?.activeRole ?? 'qa'
    },

    get identities() {
        return get().profile?.identities ?? []
    },

    isConnected(provider: AuthProvider) {
        return !!(get().profile?.identities.find(i => i.provider === provider))
    },

    getIdentity(provider: AuthProvider) {
        return get().profile?.identities.find(i => i.provider === provider)
    },

    async loadProfile() {
        const data = await window.electronAPI.readUserProfile()
        set({
            profile: data ?? null,
            isLoaded: true,
        })
    },

    async setRole(role: UserRole) {
        const current = get().profile
        const updated: UserProfile = {
            activeRole: role,
            identities: current?.identities ?? [],
        }
        set({ profile: updated })
        await persistProfile(updated)
    },

    async addIdentity(identity: UserIdentity) {
        const current = get().profile
        const identities = current?.identities.filter(i => i.provider !== identity.provider) ?? []
        const updated: UserProfile = {
            activeRole: current?.activeRole ?? 'qa',
            identities: [...identities, identity],
        }
        set({ profile: updated })
        await persistProfile(updated)
    },

    async removeIdentity(provider: AuthProvider) {
        const current = get().profile
        if (!current) return
        const updated: UserProfile = {
            ...current,
            identities: current.identities.filter(i => i.provider !== provider),
        }
        set({ profile: updated })
        await persistProfile(updated)
    },
}))
