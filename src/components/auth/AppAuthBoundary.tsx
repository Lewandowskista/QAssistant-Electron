import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncStore } from '@/store/useSyncStore'
import { AuthGate } from './AuthGate'
import type { AuthStatus } from '@/types/auth'

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

export function AppAuthBoundary({ children }: { children: React.ReactNode }) {
    const [authSnapshot, setAuthSnapshot] = useState(() => {
        const state = useAuthStore.getState()
        return { auth: state.auth, isLoaded: state.isLoaded }
    })

    const syncInitAttemptedRef = useRef(false)
    const [slowLoad, setSlowLoad] = useState(false)

    useEffect(() => {
        const unsubscribeStore = useAuthStore.subscribe((state) => {
            setAuthSnapshot((current) => (
                current.isLoaded === state.isLoaded && isSameAuthStatus(current.auth, state.auth)
                    ? current
                    : { auth: state.auth, isLoaded: state.isLoaded }
            ))
        })
        const unsubscribe = window.electronAPI?.onAuthStatusChanged?.((next) => {
            useAuthStore.getState().setFromIpc(next)
        })
        useAuthStore.getState().bootstrap().catch(console.error)
        return () => {
            unsubscribeStore()
            unsubscribe?.()
        }
    }, [])

    useEffect(() => {
        if (authSnapshot.isLoaded) return
        const t = window.setTimeout(() => setSlowLoad(true), 4000)
        return () => window.clearTimeout(t)
    }, [authSnapshot.isLoaded])

    useEffect(() => {
        if (authSnapshot.auth.status !== 'signed_in') {
            syncInitAttemptedRef.current = false
            return
        }

        if (syncInitAttemptedRef.current) return
        syncInitAttemptedRef.current = true

        let mounted = true
        ;(async () => {
            await useSyncStore.getState().loadConfig()
            const config = useSyncStore.getState().config
            if (mounted && config?.configured) {
                await useSyncStore.getState().initSync().catch(console.error)
            }
        })().catch(console.error)

        return () => {
            mounted = false
        }
    }, [authSnapshot.auth.status])

    if (!authSnapshot.isLoaded || authSnapshot.auth.status === 'booting') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                {slowLoad && (
                    <p className="text-sm text-muted-foreground">Connecting to Supabase…</p>
                )}
            </div>
        )
    }

    if (!authSnapshot.auth.configured || authSnapshot.auth.status !== 'signed_in') {
        const store = useAuthStore.getState()
        return <AuthGate auth={authSnapshot.auth} signIn={store.signIn} signUp={store.signUp} />
    }

    return <>{children}</>
}
