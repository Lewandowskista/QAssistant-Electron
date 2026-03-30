import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUserStore } from '@/store/useUserStore'
import { recordRendererMetric } from '@/lib/perf'
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

    const cloudStateAttemptedUserIdRef = useRef<string | null>(null)
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
            cloudStateAttemptedUserIdRef.current = null
            return
        }

        const userId = authSnapshot.auth.user?.id ?? null
        if (!userId || cloudStateAttemptedUserIdRef.current === userId) return
        cloudStateAttemptedUserIdRef.current = userId

        let cancelled = false
        const timeoutId = window.setTimeout(() => {
            ;(async () => {
                const startedAt = performance.now()
                const result = await window.electronAPI?.ensureCloudState?.()
                void recordRendererMetric('cloudStateEnsureMs', performance.now() - startedAt)

                if (
                    cancelled ||
                    !result ||
                    result.error ||
                    !result.changed ||
                    (result.outcome !== 'applied_remote_snapshot' && result.outcome !== 'cleared_local_state')
                ) {
                    return
                }

                await Promise.allSettled([
                    useProjectStore.getState().loadProjects(),
                    useSettingsStore.getState().load(),
                    useUserStore.getState().loadProfile(),
                ])

                if (!cancelled) {
                    toast.info('Workspace refreshed from cloud state.', { duration: 4000 })
                }
            })().catch(console.error)
        }, 0)

        return () => {
            cancelled = true
            window.clearTimeout(timeoutId)
        }
    }, [authSnapshot.auth.status, authSnapshot.auth.user?.id])

    if (!authSnapshot.isLoaded || authSnapshot.auth.status === 'booting') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                {slowLoad && (
                    <p className="text-sm text-muted-foreground">Connecting to Supabase...</p>
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
