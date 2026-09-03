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

/**
 * The state patch for a profile change. activeRole and identities are stored as
 * plain values rather than getters, so every write to `profile` has to refresh
 * them here — going through this helper is what stops a call site forgetting.
 */
function profilePatch(profile: UserProfile | null) {
    return {
        profile,
        activeRole: profile?.activeRole ?? ('qa' as UserRole),
        identities: profile?.identities ?? [],
    }
}

export const useUserStore = create<UserState>((set, get) => ({
    profile: null,
    isLoaded: false,

    /*
     * Plain values, not getters. zustand's set() does Object.assign, which copies
     * a getter's *current value* and replaces the accessor — so after the first
     * set() these stopped tracking `profile` and returned whatever they happened
     * to evaluate to at store creation. AiCopilot reads state.activeRole, so the
     * Copilot kept using a stale role for context and history filtering.
     * Kept in sync by every mutation that touches `profile`.
     */
    activeRole: 'qa',
    identities: [],

    isConnected(provider: AuthProvider) {
        return !!(get().profile?.identities.find(i => i.provider === provider))
    },

    getIdentity(provider: AuthProvider) {
        return get().profile?.identities.find(i => i.provider === provider)
    },

    async loadProfile() {
        const data = await window.electronAPI.readUserProfile()
        set({ ...profilePatch(data ?? null), isLoaded: true })
    },

    async setRole(role: UserRole) {
        const current = get().profile
        const updated: UserProfile = {
            activeRole: role,
            identities: current?.identities ?? [],
        }
        set(profilePatch(updated))
        await persistProfile(updated)
    },

    async addIdentity(identity: UserIdentity) {
        const current = get().profile
        const identities = current?.identities.filter(i => i.provider !== identity.provider) ?? []
        const updated: UserProfile = {
            activeRole: current?.activeRole ?? 'qa',
            identities: [...identities, identity],
        }
        set(profilePatch(updated))
        await persistProfile(updated)
    },

    async removeIdentity(provider: AuthProvider) {
        const current = get().profile
        if (!current) return
        const updated: UserProfile = {
            ...current,
            identities: current.identities.filter(i => i.provider !== provider),
        }
        set(profilePatch(updated))
        await persistProfile(updated)
    },
}))
