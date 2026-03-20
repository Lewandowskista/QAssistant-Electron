/**
 * Phase 3 — Presence indicator
 * Shows avatar bubbles for teammates currently viewing the same task.
 */
import { usePresence } from '@/hooks/usePresence'
import { cn } from '@/lib/utils'
import { useSyncStore } from '@/store/useSyncStore'

interface PresenceAvatarsProps {
    taskId: string | undefined
    className?: string
}

function initials(name: string): string {
    return name
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
}

// Stable color per userId
const AVATAR_COLORS = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500',
]
function colorForId(id: string): string {
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function PresenceAvatars({ taskId, className }: PresenceAvatarsProps) {
    const isConfigured = useSyncStore(s => s.config?.configured)
    const { viewers } = usePresence(isConfigured ? taskId : undefined)

    if (!isConfigured || viewers.length === 0) return null

    return (
        <div className={cn('flex items-center gap-1', className)} title="Currently viewing">
            <span className="text-[10px] text-[#6B7280] mr-1">Also viewing:</span>
            <div className="flex -space-x-1.5">
                {viewers.slice(0, 4).map(v => (
                    <div
                        key={v.userId}
                        title={v.displayName}
                        className={cn(
                            'w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-[#0F0F13]',
                            colorForId(v.userId)
                        )}
                    >
                        {initials(v.displayName || '?')}
                    </div>
                ))}
                {viewers.length > 4 && (
                    <div className="w-6 h-6 rounded-full bg-[#2A2A3A] flex items-center justify-center text-[9px] font-bold text-[#9CA3AF] ring-2 ring-[#0F0F13]">
                        +{viewers.length - 4}
                    </div>
                )}
            </div>
        </div>
    )
}
