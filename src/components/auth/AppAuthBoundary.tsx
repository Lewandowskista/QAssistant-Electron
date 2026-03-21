import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncStore } from '@/store/useSyncStore'
import { AuthGate } from './AuthGate'

export function AppAuthBoundary({ children }: { children: React.ReactNode }) {
    const auth = useAuthStore(s => s.auth)
    const isLoaded = useAuthStore(s => s.isLoaded)
    const bootstrap = useAuthStore(s => s.bootstrap)
    const setFromIpc = useAuthStore(s => s.setFromIpc)

    const loadSyncConfig = useSyncStore(s => s.loadConfig)
    const initSync = useSyncStore(s => s.initSync)

    const syncInitAttemptedRef = useRef(false)
    const [slowLoad, setSlowLoad] = useState(false)

    useEffect(() => {
        const unsubscribe = window.electronAPI?.onAuthStatusChanged?.((next) => {
            setFromIpc(next)
        })
        bootstrap().catch(console.error)
        return () => unsubscribe?.()
    }, [bootstrap, setFromIpc])

    useEffect(() => {
        if (isLoaded) return
        const t = window.setTimeout(() => setSlowLoad(true), 4000)
        return () => window.clearTimeout(t)
    }, [isLoaded])

    useEffect(() => {
        if (auth.status !== 'signed_in') {
            syncInitAttemptedRef.current = false
            return
        }

        if (syncInitAttemptedRef.current) return
        syncInitAttemptedRef.current = true

        let mounted = true
        ;(async () => {
            await loadSyncConfig()
            const config = useSyncStore.getState().config
            if (mounted && config?.configured) {
                await initSync().catch(console.error)
            }
        })().catch(console.error)

        return () => {
            mounted = false
        }
    }, [auth.status, initSync, loadSyncConfig])

    if (!isLoaded || auth.status === 'booting') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                {slowLoad && (
                    <p className="text-sm text-muted-foreground">Connecting to Supabase…</p>
                )}
            </div>
        )
    }

    if (!auth.configured || auth.status !== 'signed_in') {
        return <AuthGate />
    }

    return <>{children}</>
}
