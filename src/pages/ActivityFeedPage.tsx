import { useMemo, useState } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { useSyncStore } from "@/store/useSyncStore"
import { Activity, CheckCircle2, XCircle, GitPullRequest, Paperclip, StickyNote, Play, ShieldCheck, ShieldX, Package, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import type { CollaborationEvent, CollaborationEventType } from "@/types/project"
import type { WorkspaceMember } from "@/types/sync"

const EMPTY_MEMBERS: WorkspaceMember[] = []

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

const AVATAR_COLORS = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500',
]
function colorForId(id: string): string {
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
function initials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function MemberAvatar({ userId, displayName, size = 'sm' }: { userId?: string; displayName?: string; size?: 'sm' | 'md' }) {
    if (!displayName) return null
    const dim = size === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-8 h-8 text-xs'
    return (
        <div
            title={displayName}
            className={cn('rounded-full flex items-center justify-center font-bold text-white shrink-0', dim, colorForId(userId ?? displayName))}
        >
            {initials(displayName)}
        </div>
    )
}

export default function ActivityFeedPage() {
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const members = useSyncStore(s => s.workspaceInfo?.members ?? EMPTY_MEMBERS)
    const isConnected = useSyncStore(s => s.config?.configured)

    const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
    const [typeFilter, setTypeFilter] = useState<CollaborationEventType | "all">("all")
    const [searchQuery, setSearchQuery] = useState("")
    const [memberFilter, setMemberFilter] = useState<string>("all")

    // Build a userId → member map for fast lookup
    const memberMap = useMemo(() => {
        const m = new Map<string, { display_name: string; email: string; role: string }>()
        for (const mem of members) m.set(mem.user_id, mem)
        return m
    }, [members])

    const events: CollaborationEvent[] = useMemo(() => {
        const all = (activeProject?.collaborationEvents || [])
            .slice()
            .sort((a, b) => b.timestamp - a.timestamp)
        return all.filter(event => {
            if (roleFilter !== "all" && event.actorRole !== roleFilter) return false
            if (typeFilter !== "all" && event.eventType !== typeFilter) return false
            if (memberFilter !== "all" && event.actorUserId !== memberFilter) return false
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase()
                const name = event.actorDisplayName?.toLowerCase() ?? ''
                return (
                    event.title.toLowerCase().includes(q) ||
                    event.details?.toLowerCase().includes(q) ||
                    name.includes(q)
                )
            }
            return true
        })
    }, [activeProject?.collaborationEvents, roleFilter, typeFilter, searchQuery, memberFilter])

    const taskMap = useMemo(() => {
        const map = new Map<string, string>()
        for (const task of activeProject?.tasks || []) {
            map.set(task.id, task.title)
        }
        return map
    }, [activeProject?.tasks])

    // Aggregate per-member stats for the team panel
    const memberStats = useMemo(() => {
        const stats = new Map<string, { displayName: string; count: number; lastAt: number; userId: string }>()
        for (const event of activeProject?.collaborationEvents ?? []) {
            if (!event.actorUserId) continue
            const existing = stats.get(event.actorUserId)
            const displayName = event.actorDisplayName ?? memberMap.get(event.actorUserId)?.display_name ?? 'Unknown'
            if (existing) {
                existing.count++
                if (event.timestamp > existing.lastAt) existing.lastAt = event.timestamp
            } else {
                stats.set(event.actorUserId, { displayName, count: 1, lastAt: event.timestamp, userId: event.actorUserId })
            }
        }
        return Array.from(stats.values()).sort((a, b) => b.count - a.count)
    }, [activeProject?.collaborationEvents, memberMap])

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
        <div className="h-full flex animate-in fade-in duration-500 bg-[#0F0F13] overflow-hidden">
            {/* Main feed */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
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
                    {members.length > 0 && (
                        <select
                            value={memberFilter}
                            onChange={e => setMemberFilter(e.target.value)}
                            className="h-8 rounded-lg border border-[#2A2A3A] bg-[#0F0F13] px-2 text-xs text-[#E2E8F0] focus:outline-none"
                        >
                            <option value="all">All Members</option>
                            {members.map(m => (
                                <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
                            ))}
                        </select>
                    )}
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
                        <div className="flex flex-col items-center justify-center h-full gap-5 py-16">
                            {searchQuery || typeFilter !== "all" || roleFilter !== "all" || memberFilter !== "all" ? (
                                <div className="flex flex-col items-center gap-3 opacity-40">
                                    <Activity className="h-12 w-12 text-[#6B7280]" strokeWidth={1} />
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#6B7280]">No events match your filters</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-[#1A1A24] border border-[#2A2A3A] flex items-center justify-center opacity-60">
                                        <Activity className="h-8 w-8 text-[#6B7280]" strokeWidth={1.5} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-[#E2E8F0] mb-2">No collaboration events yet</p>
                                        <p className="text-xs text-[#6B7280] leading-relaxed">
                                            Events appear here when tasks are handed off, PRs are linked, fixes are verified, or evidence is added. Start by creating a task and sending it through the handoff workflow.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="relative">
                            <div className="absolute left-5 top-0 bottom-0 w-px bg-[#2A2A3A]" />
                            <div className="space-y-4">
                                {events.map((event, index) => {
                                    const config = EVENT_CONFIG[event.eventType] ?? { icon: Activity, color: "text-[#6B7280]", label: event.eventType }
                                    const Icon = config.icon
                                    const taskTitle = taskMap.get(event.taskId)
                                    const prevEvent = events[index - 1]
                                    const showDivider = !prevEvent || new Date(prevEvent.timestamp).toDateString() !== new Date(event.timestamp).toDateString()
                                    const actorName = event.actorDisplayName
                                        ?? (event.actorUserId ? memberMap.get(event.actorUserId)?.display_name : undefined)

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
                                                            {/* Member avatar + name */}
                                                            {actorName && (
                                                                <div className="flex items-center gap-1.5">
                                                                    <MemberAvatar userId={event.actorUserId} displayName={actorName} />
                                                                    <span className="text-[10px] text-[#9CA3AF] font-medium">{actorName}</span>
                                                                </div>
                                                            )}
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
                            {(roleFilter !== 'all' || typeFilter !== 'all' || searchQuery || memberFilter !== 'all') ? ' (filtered)' : ''}
                        </span>
                    </div>
                )}
            </div>

            {/* Team sidebar — only when sync is connected */}
            {isConnected && (members.length > 0 || memberStats.length > 0) && (
                <aside className="w-64 shrink-0 border-l border-[#2A2A3A] bg-[#13131A] flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#2A2A3A] flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-[#A78BFA]" />
                        <span className="text-xs font-black text-[#E2E8F0] uppercase tracking-widest">Team</span>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
                        {/* Workspace members */}
                        {members.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider px-1">Members</p>
                                {members.map(m => (
                                    <button
                                        key={m.user_id}
                                        onClick={() => setMemberFilter(memberFilter === m.user_id ? 'all' : m.user_id)}
                                        className={cn(
                                            'w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors text-left',
                                            memberFilter === m.user_id
                                                ? 'bg-[#A78BFA]/10 border border-[#A78BFA]/20'
                                                : 'hover:bg-[#1A1A2E]'
                                        )}
                                    >
                                        <div className={cn(
                                            'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0',
                                            colorForId(m.user_id)
                                        )}>
                                            {initials(m.display_name || '?')}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold text-[#E2E8F0] truncate">{m.display_name}</p>
                                            <p className="text-[10px] text-[#6B7280] truncate">{m.email}</p>
                                        </div>
                                        <span className={cn(
                                            'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0',
                                            m.role === 'owner'
                                                ? 'bg-[#A78BFA]/10 text-[#A78BFA]'
                                                : 'bg-[#2A2A3A] text-[#6B7280]'
                                        )}>
                                            {m.role}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Activity by member */}
                        {memberStats.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider px-1">Activity</p>
                                {memberStats.map(stat => (
                                    <div key={stat.userId} className="flex items-center gap-2 px-2 py-1.5">
                                        <MemberAvatar userId={stat.userId} displayName={stat.displayName} size="md" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold text-[#E2E8F0] truncate">{stat.displayName}</p>
                                            <p className="text-[10px] text-[#6B7280]">{stat.count} event{stat.count !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>
            )}
        </div>
    )
}
