import { create } from 'zustand'
import type { AuthStatus } from '@/types/auth'

const DEFAULT_STATUS: AuthStatus = {
    configured: false,
    status: 'booting',
    user: null,
    error: null,
}

interface AuthState {
    auth: AuthStatus
    isLoaded: boolean
    bootstrap: () => Promise<void>
    setFromIpc: (auth: AuthStatus) => void
    signIn: (args: { email: string; password: string }) => Promise<AuthStatus>
    signUp: (args: { email: string; password: string; displayName: string }) => Promise<AuthStatus>
    signOut: () => Promise<AuthStatus>
    refreshProfile: () => Promise<AuthStatus>
}

let bootstrapPromise: Promise<void> | null = null

function isSameAuthStatus(a: AuthStatus, b: AuthStatus): boolean {
    return (
        a.configured === b.configured &&
        a.status === b.status &&
        a.error === b.error &&
        a.supabaseUrl === b.supabaseUrl &&
        a.supabaseAnonKey === b.supabaseAnonKey &&
        a.usingOfflineSession === b.usingOfflineSession &&
        a.user?.id === b.user?.id &&
        a.user?.email === b.user?.email &&
        a.user?.displayName === b.user?.displayName &&
        a.user?.emailConfirmedAt === b.user?.emailConfirmedAt
    )
}

export const useAuthStore = create<AuthState>((set) => ({
    auth: DEFAULT_STATUS,
    isLoaded: false,

    async bootstrap() {
        if (bootstrapPromise) {
            return await bootstrapPromise
        }

        bootstrapPromise = (async () => {
            try {
                const auth = await window.electronAPI.authGetStatus()
                set((state) => (
                    state.isLoaded && isSameAuthStatus(state.auth, auth)
                        ? state
                        : { auth, isLoaded: true }
                ))
            } catch (error) {
                const message = error instanceof Error ? error.message : 'App login bootstrap failed.'
                const nextAuth: AuthStatus = {
                    configured: typeof window.electronAPI !== 'undefined',
                    status: 'error',
                    user: null,
                    error: message,
                }
                set((state) => (
                    state.isLoaded && isSameAuthStatus(state.auth, nextAuth)
                        ? state
                        : { auth: nextAuth, isLoaded: true }
                ))
            } finally {
                bootstrapPromise = null
            }
        })()

        try {
            await bootstrapPromise
        } finally {
            bootstrapPromise = null
        }
    },

    setFromIpc(auth) {
        set((state) => (
            state.isLoaded && isSameAuthStatus(state.auth, auth)
                ? state
                : { auth, isLoaded: true }
        ))
    },

    async signIn(args) {
        const auth = await window.electronAPI.authSignIn(args)
        set({ auth, isLoaded: true })
        return auth
    },

    async signUp(args) {
        const auth = await window.electronAPI.authSignUp(args)
        set({ auth, isLoaded: true })
        return auth
    },

    async signOut() {
        const auth = await window.electronAPI.authSignOut()
        set({ auth, isLoaded: true })
        return auth
    },

    async refreshProfile() {
        const auth = await window.electronAPI.authRefreshProfile()
        set({ auth, isLoaded: true })
        return auth
    },
}))
