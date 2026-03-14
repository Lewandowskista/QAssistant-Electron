import { CollaborationEvent } from '@/types/project'

interface CollaborationTimelineProps {
    events: CollaborationEvent[]
}

export function CollaborationTimeline({ events }: CollaborationTimelineProps) {
    if (events.length === 0) {
        return <div className="text-xs text-[#6B7280] italic">No collaboration activity yet.</div>
    }

    return (
        <div className="space-y-3">
            {events
                .sort((a, b) => b.timestamp - a.timestamp)
                .map((event) => (
                    <div key={event.id} className="relative pl-5 border-l border-[#2A2A3A]">
                        <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-[#A78BFA]" />
                        <div className="bg-[#1A1A24] border border-[#2A2A3A] rounded-xl p-3 space-y-1">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-bold text-[#E2E8F0]">{event.title}</span>
                                <span className="text-[10px] text-[#6B7280]">{new Date(event.timestamp).toLocaleString()}</span>
                            </div>
                            <div className="text-[10px] uppercase tracking-wider text-[#A78BFA]">{event.actorRole}</div>
                            {event.details && <p className="text-[11px] text-[#9CA3AF]">{event.details}</p>}
                        </div>
                    </div>
                ))}
        </div>
    )
}
