import { CollaborationEvent } from '@/types/project'
import { useSyncStore } from '@/store/useSyncStore'
import { cn } from '@/lib/utils'
import type { WorkspaceMember } from '@/types/sync'

interface CollaborationTimelineProps {
    events: CollaborationEvent[]
}

const AVATAR_COLORS = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
]
const EMPTY_MEMBERS: WorkspaceMember[] = []

function colorForId(id: string): string {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
    return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function initials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export function CollaborationTimeline({ events }: CollaborationTimelineProps) {
    const members = useSyncStore(s => s.workspaceInfo?.members ?? EMPTY_MEMBERS)
    const memberMap = new Map(members.map(m => [m.user_id, m.display_name]))

    if (events.length === 0) {
        return <div className="text-xs text-[#6B7280] italic">No collaboration activity yet.</div>
    }

    return (
        <div className="space-y-3">
            {events
                .sort((a, b) => b.timestamp - a.timestamp)
                .map((event) => {
                    const actorName = event.actorDisplayName
                        ?? (event.actorUserId ? memberMap.get(event.actorUserId) : undefined)
                    return (
                        <div key={event.id} className="relative pl-5 border-l border-[#2A2A3A]">
                            <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-[#A78BFA]" />
                            <div className="bg-[#1A1A24] border border-[#2A2A3A] rounded-xl p-3 space-y-1">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-xs font-bold text-[#E2E8F0]">{event.title}</span>
                                    <span className="text-[10px] text-[#6B7280] shrink-0">{new Date(event.timestamp).toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] uppercase tracking-wider text-[#A78BFA]">{event.actorRole}</span>
                                    {actorName && (
                                        <div className="flex items-center gap-1">
                                            <div className={cn(
                                                'w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white',
                                                colorForId(event.actorUserId ?? actorName)
                                            )}>
                                                {initials(actorName)}
                                            </div>
                                            <span className="text-[10px] text-[#9CA3AF]">{actorName}</span>
                                        </div>
                                    )}
                                </div>
                                {event.details && <p className="text-[11px] text-[#9CA3AF]">{event.details}</p>}
                            </div>
                        </div>
                    )
                })}
        </div>
    )
}
