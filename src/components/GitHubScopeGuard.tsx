import { useState, useEffect } from 'react'
import { useUserStore } from '@/store/useUserStore'
import { ExternalLink, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
    children: React.ReactNode
}

/**
 * Wraps Dev page content. Checks:
 *  1. GitHub identity is connected (via user profile)
 *  2. Token has `repo` scope (via IPC)
 *
 * Shows appropriate prompts if either check fails.
 */
export function GitHubScopeGuard({ children }: Props) {
    const profile = useUserStore(s => s.profile)
    const githubIdentity = profile?.identities.find(i => i.provider === 'github')

    const [checking, setChecking] = useState(true)
    const [hasScope, setHasScope] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!githubIdentity) {
            setChecking(false)
            return
        }

        let cancelled = false
        ;(async () => {
            try {
                const result = await window.electronAPI.githubCheckScope()
                if (cancelled) return
                setHasScope(result.hasRepoScope)
            } catch (e: any) {
                if (!cancelled) setError(e.message)
            } finally {
                if (!cancelled) setChecking(false)
            }
        })()

        return () => { cancelled = true }
    }, [githubIdentity])

    // No GitHub identity connected
    if (!githubIdentity) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-[#0F0F13] gap-4 text-center p-8">
                <div className="w-20 h-20 rounded-full bg-[#1A1A24] flex items-center justify-center">
                    <ExternalLink className="h-10 w-10 text-[#A78BFA] opacity-60" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-[#E2E8F0] mb-1">Connect GitHub</h2>
                    <p className="text-sm text-[#6B7280] max-w-md">
                        Go to <strong>Settings → Account &amp; Identity</strong> and connect your GitHub account to use Developer features.
                    </p>
                </div>
            </div>
        )
    }

    // Still checking scope
    if (checking) {
        return (
            <div className="h-full flex items-center justify-center bg-[#0F0F13]">
                <Loader2 className="h-8 w-8 text-[#A78BFA] animate-spin" />
            </div>
        )
    }

    // Error checking scope
    if (error) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-[#0F0F13] gap-4 text-center p-8">
                <div className="w-20 h-20 rounded-full bg-red-950/40 flex items-center justify-center">
                    <AlertTriangle className="h-10 w-10 text-red-400 opacity-60" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-[#E2E8F0] mb-1">GitHub Connection Error</h2>
                    <p className="text-sm text-[#6B7280] max-w-md">{error}</p>
                </div>
            </div>
        )
    }

    // Token missing repo scope
    if (!hasScope) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-[#0F0F13] gap-4 text-center p-8">
                <div className="w-20 h-20 rounded-full bg-amber-950/40 flex items-center justify-center">
                    <AlertTriangle className="h-10 w-10 text-amber-400 opacity-60" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-[#E2E8F0] mb-1">Additional Permissions Needed</h2>
                    <p className="text-sm text-[#6B7280] max-w-md mb-4">
                        Your GitHub connection needs repository access to enable Dev features. Please re-connect to grant the required permissions.
                    </p>
                    <Button
                        className="bg-[#A78BFA] hover:bg-[#C4B5FD] text-[#0F0F13] font-bold"
                        onClick={() => window.electronAPI.oauthStart('github')}
                    >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Re-connect GitHub
                    </Button>
                </div>
            </div>
        )
    }

    return <>{children}</>
}

export default GitHubScopeGuard
