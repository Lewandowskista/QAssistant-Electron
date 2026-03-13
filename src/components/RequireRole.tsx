import { useUserStore } from '@/store/useUserStore'
import { Lock } from 'lucide-react'
import type { UserRole } from '@/types/user'

interface Props {
    role: UserRole
    children: React.ReactNode
}

/**
 * Route guard that shows a "feature locked" fallback when the user's active
 * role doesn't match the required role. Wrap routes or sections that are
 * role-specific (e.g. Dev-only features).
 *
 * Note: this is a UI convenience gate, not a security boundary — roles are
 * stored locally and the user controls their own machine.
 */
export function RequireRole({ role, children }: Props) {
    const activeRole = useUserStore(s => s.profile?.activeRole ?? 'qa')

    if (activeRole !== role) {
        const roleName = role === 'dev' ? 'Developer' : 'QA Engineer'
        return (
            <div className="h-full flex flex-col items-center justify-center bg-surface-overlay gap-4 text-center p-8">
                <div className="w-20 h-20 rounded-full bg-surface-elevated flex items-center justify-center opacity-40">
                    <Lock className="h-10 w-10 text-qa-purple" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-qa-text mb-1">Role Required: {roleName}</h2>
                    <p className="text-sm text-qa-text-muted">
                        Switch your role to <strong>{roleName}</strong> in Settings → Account &amp; Identity to access this feature.
                    </p>
                </div>
            </div>
        )
    }

    return <>{children}</>
}

export default RequireRole
