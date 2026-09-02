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
        return <div className="text-xs text-muted-ui italic">No collaboration activity yet.</div>
    }

    return (
        <div className="space-y-3">
            {events
                .sort((a, b) => b.timestamp - a.timestamp)
                .map((event) => {
                    const actorName = event.actorDisplayName
                        ?? (event.actorUserId ? memberMap.get(event.actorUserId) : undefined)
                    return (
                        <div key={event.id} className="relative pl-5 border-l border-ui">
                            <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-primary" />
                            <div className="bg-panel-muted border border-ui rounded-xl p-3 space-y-1">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-xs font-bold text-foreground">{event.title}</span>
                                    <span className="text-[11px] text-muted-ui shrink-0">{new Date(event.timestamp).toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] uppercase tracking-wider text-brand">{event.actorRole}</span>
                                    {actorName && (
                                        <div className="flex items-center gap-1">
                                            <div className={cn(
                                                'w-4 h-4 rounded-full flex items-center justify-center text-[11px] font-bold text-primary-foreground',
                                                colorForId(event.actorUserId ?? actorName)
                                            )}>
                                                {initials(actorName)}
                                            </div>
                                            <span className="text-[11px] text-soft">{actorName}</span>
                                        </div>
                                    )}
                                </div>
                                {event.details && <p className="text-[11px] text-soft">{event.details}</p>}
                            </div>
                        </div>
                    )
                })}
        </div>
    )
}
