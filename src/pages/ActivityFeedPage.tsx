import { useMemo, useState } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { Activity, CheckCircle2, XCircle, GitPullRequest, Paperclip, StickyNote, Play, ShieldCheck, ShieldX, Package } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import type { CollaborationEvent, CollaborationEventType } from "@/types/project"

const EVENT_CONFIG: Record<CollaborationEventType, { icon: typeof Activity; color: string; label: string }> = {
    handoff_created:      { icon: Package,      color: "text-[#A78BFA]", label: "Handoff Created" },
    handoff_sent:         { icon: Package,      color: "text-[#A78BFA]", label: "Handoff Sent" },
    handoff_acknowledged: { icon: CheckCircle2, color: "text-[#10B981]", label: "Handoff Acknowledged" },
    fix_started:          { icon: Play,         color: "text-[#3B82F6]", label: "Fix Started" },
    pr_linked:            { icon: GitPullRequest,color: "text-[#6366F1]", label: "PR Linked" },
    ready_for_qa:         { icon: ShieldCheck,  color: "text-[#10B981]", label: "Ready for QA" },
    retest_started:       { icon: Play,         color: "text-[#3B82F6]", label: "Retest Started" },
    verification_passed:  { icon: CheckCircle2, color: "text-[#10B981]", label: "Verification Passed" },
    verification_failed:  { icon: XCircle,      color: "text-[#EF4444]", label: "Verification Failed" },
    evidence_added:       { icon: Paperclip,    color: "text-[#F59E0B]", label: "Evidence Added" },
    note_linked:          { icon: StickyNote,   color: "text-[#6B7280]", label: "Note Linked" },
    execution_linked:     { icon: ShieldX,      color: "text-[#6B7280]", label: "Execution Linked" },
}

const ROLE_FILTERS = ["all", "qa", "dev"] as const
type RoleFilter = typeof ROLE_FILTERS[number]

const EVENT_TYPE_OPTIONS: Array<{ value: CollaborationEventType | "all"; label: string }> = [
    { value: "all", label: "All Events" },
    { value: "handoff_created", label: "Handoff Created" },
    { value: "handoff_sent", label: "Handoff Sent" },
    { value: "handoff_acknowledged", label: "Acknowledged" },
    { value: "fix_started", label: "Fix Started" },
    { value: "pr_linked", label: "PR Linked" },
    { value: "ready_for_qa", label: "Ready for QA" },
    { value: "retest_started", label: "Retest Started" },
    { value: "verification_passed", label: "Verified" },
    { value: "verification_failed", label: "Failed Verification" },
    { value: "evidence_added", label: "Evidence Added" },
]

export default function ActivityFeedPage() {
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
    const [typeFilter, setTypeFilter] = useState<CollaborationEventType | "all">("all")
    const [searchQuery, setSearchQuery] = useState("")

    const events: CollaborationEvent[] = useMemo(() => {
        const all = (activeProject?.collaborationEvents || [])
            .slice()
            .sort((a, b) => b.timestamp - a.timestamp)
        return all.filter(event => {
            if (roleFilter !== "all" && event.actorRole !== roleFilter) return false
            if (typeFilter !== "all" && event.eventType !== typeFilter) return false
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase()
                return event.title.toLowerCase().includes(q) || event.details?.toLowerCase().includes(q)
            }
            return true
        })
    }, [activeProject?.collaborationEvents, roleFilter, typeFilter, searchQuery])

    const taskMap = useMemo(() => {
        const map = new Map<string, string>()
        for (const task of activeProject?.tasks || []) {
            map.set(task.id, task.title)
        }
        return map
    }, [activeProject?.tasks])

    if (!activeProject) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-[#0F0F13] gap-4 text-center">
                <div className="w-20 h-20 rounded-full bg-[#1A1A24] flex items-center justify-center opacity-40">
                    <Activity className="h-9 w-9 text-[#6B7280]" strokeWidth={1} />
                </div>
                <div className="opacity-60 space-y-1">
                    <p className="text-sm font-bold text-[#E2E8F0] uppercase tracking-widest">No Project Selected</p>
                    <p className="text-xs text-[#6B7280]">Select a project to view activity.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-500 bg-[#0F0F13] overflow-hidden">
            {/* Header */}
            <header className="bg-[#13131A] border-b border-[#2A2A3A] p-4 flex flex-wrap items-center gap-3 flex-none">
                <Activity className="h-4 w-4 text-[#A78BFA] shrink-0" />
                <span className="text-xs font-black text-[#E2E8F0] uppercase tracking-widest">Activity Feed</span>
                <div className="flex-1" />
                <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search events..."
                    className="h-8 rounded-lg border border-[#2A2A3A] bg-[#0F0F13] px-3 text-xs text-[#E2E8F0] placeholder:text-[#6B7280] focus:outline-none focus:border-[#A78BFA]/40 w-52"
                />
                <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value as CollaborationEventType | "all")}
                    className="h-8 rounded-lg border border-[#2A2A3A] bg-[#0F0F13] px-2 text-xs text-[#E2E8F0] focus:outline-none"
                >
                    {EVENT_TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                <div className="flex rounded-lg border border-[#2A2A3A] bg-[#0F0F13] p-0.5">
                    {ROLE_FILTERS.map(role => (
                        <button
                            key={role}
                            onClick={() => setRoleFilter(role)}
                            className={cn(
                                "h-7 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all",
                                roleFilter === role ? "bg-[#A78BFA] text-[#0F0F13]" : "text-[#6B7280] hover:text-[#E2E8F0]"
                            )}
                        >
                            {role === "all" ? "All" : role.toUpperCase()}
                        </button>
                    ))}
                </div>
            </header>

            {/* Feed */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {events.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-30 gap-4">
                        <Activity className="h-16 w-16 text-[#6B7280]" strokeWidth={1} />
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#6B7280]">
                            {searchQuery || typeFilter !== "all" || roleFilter !== "all"
                                ? "No events match your filters"
                                : "No collaboration events yet"}
                        </p>
                    </div>
                ) : (
                    <div className="relative">
                        {/* Timeline line */}
                        <div className="absolute left-5 top-0 bottom-0 w-px bg-[#2A2A3A]" />

                        <div className="space-y-4">
                            {events.map((event, index) => {
                                const config = EVENT_CONFIG[event.eventType] ?? { icon: Activity, color: "text-[#6B7280]", label: event.eventType }
                                const Icon = config.icon
                                const taskTitle = taskMap.get(event.taskId)

                                // Show date divider when day changes
                                const prevEvent = events[index - 1]
                                const showDivider = !prevEvent || new Date(prevEvent.timestamp).toDateString() !== new Date(event.timestamp).toDateString()

                                return (
                                    <div key={event.id}>
                                        {showDivider && (
                                            <div className="flex items-center gap-3 mb-4 mt-2 pl-14">
                                                <div className="flex-1 h-px bg-[#2A2A3A]" />
                                                <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">
                                                    {format(event.timestamp, "EEEE, MMM d")}
                                                </span>
                                                <div className="flex-1 h-px bg-[#2A2A3A]" />
                                            </div>
                                        )}
                                        <div className="flex gap-4 group">
                                            {/* Icon bubble */}
                                            <div className="relative z-10 shrink-0">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-full bg-[#1A1A24] border border-[#2A2A3A] flex items-center justify-center transition-all group-hover:border-[#A78BFA]/30",
                                                )}>
                                                    <Icon className={cn("h-4 w-4", config.color)} />
                                                </div>
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 group-hover:border-[#2A2A3A]/70 transition-all">
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={cn("text-[10px] font-black uppercase tracking-widest", config.color)}>
                                                            {config.label}
                                                        </span>
                                                        <span className={cn(
                                                            "text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded",
                                                            event.actorRole === "qa"
                                                                ? "bg-[#A78BFA]/10 text-[#A78BFA]"
                                                                : "bg-[#3B82F6]/10 text-[#3B82F6]"
                                                        )}>
                                                            {event.actorRole.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-[#6B7280] shrink-0">
                                                        {format(event.timestamp, "HH:mm")}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-bold text-[#E2E8F0] mb-1">{event.title}</p>
                                                {event.details && (
                                                    <p className="text-xs text-[#9CA3AF] leading-relaxed">{event.details}</p>
                                                )}
                                                {taskTitle && (
                                                    <div className="mt-2">
                                                        <span className="text-[9px] font-bold text-[#6B7280] uppercase tracking-widest">Task: </span>
                                                        <span className="text-[10px] text-[#A78BFA] font-medium">{taskTitle}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer count */}
            {events.length > 0 && (
                <div className="border-t border-[#2A2A3A] px-6 py-3 bg-[#13131A]">
                    <span className="text-[10px] text-[#6B7280] font-bold">
                        {events.length} event{events.length !== 1 ? 's' : ''}
                        {(roleFilter !== 'all' || typeFilter !== 'all' || searchQuery) ? ' (filtered)' : ''}
                    </span>
                </div>
            )}
        </div>
    )
}
