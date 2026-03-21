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

export const useAuthStore = create<AuthState>((set) => ({
    auth: DEFAULT_STATUS,
    isLoaded: false,

    async bootstrap() {
        try {
            const auth = await window.electronAPI.authGetStatus()
            set({ auth, isLoaded: true })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'App login bootstrap failed.'
            set({
                auth: {
                    configured: typeof window.electronAPI !== 'undefined',
                    status: 'error',
                    user: null,
                    error: message,
                },
                isLoaded: true,
            })
        }
    },

    setFromIpc(auth) {
        set({ auth, isLoaded: true })
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
