import { AlertTriangle, CheckCircle2, FlaskConical, GitPullRequest } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { getCollaborationMetrics, getReleaseQueue, getTaskWorkflowSummary, type ReleaseQueueItem } from '@/lib/collaboration'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/useProjectStore'
import { useSyncStore } from '@/store/useSyncStore'
import type { WorkspaceMember } from '@/types/sync'

const EMPTY_MEMBERS: WorkspaceMember[] = []
const AVATAR_COLORS = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
]

function colorForId(id: string): string {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
    return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initials(name: string): string {
    return name.split(' ').map((word) => word[0]).join('').toUpperCase().slice(0, 2)
}

interface MemberChipProps {
    userId?: string
    displayName?: string
}

function MemberChip({ userId, displayName }: MemberChipProps) {
    if (!displayName) return null
    return (
        <div className="flex items-center gap-1.5">
            <div className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white',
                colorForId(userId ?? displayName)
            )}>
                {initials(displayName)}
            </div>
            <span className="truncate text-[10px] text-[#9CA3AF]">{displayName}</span>
        </div>
    )
}

export default function ReleaseQueuePage() {
    const navigate = useNavigate()
    const projects = useProjectStore((state) => state.projects)
    const activeProjectId = useProjectStore((state) => state.activeProjectId)
    const activeProject = projects.find((project) => project.id === activeProjectId)
    const members = useSyncStore((state) => state.workspaceInfo?.members ?? EMPTY_MEMBERS)
    const isConnected = useSyncStore((state) => state.config?.configured)

    const queue = useMemo(() => activeProject ? getReleaseQueue(activeProject) : null, [activeProject])
    const metrics = useMemo(() => activeProject ? getCollaborationMetrics(activeProject) : null, [activeProject])

    const taskActorMap = useMemo(() => {
        const map = new Map<string, { userId?: string; displayName?: string }>()
        for (const event of (activeProject?.collaborationEvents ?? []).sort((left, right) => left.timestamp - right.timestamp)) {
            if (event.actorUserId || event.actorDisplayName) {
                map.set(event.taskId, { userId: event.actorUserId, displayName: event.actorDisplayName })
            }
        }
        return map
    }, [activeProject?.collaborationEvents])

    const memberMap = useMemo(() => {
        const map = new Map<string, string>()
        for (const member of members) map.set(member.user_id, member.display_name)
        return map
    }, [members])

    const getActorName = useCallback((taskId: string): { userId?: string; displayName?: string } | undefined => {
        const actor = taskActorMap.get(taskId)
        if (!actor) return undefined
        const displayName = actor.displayName ?? (actor.userId ? memberMap.get(actor.userId) : undefined)
        return displayName ? { ...actor, displayName } : undefined
    }, [memberMap, taskActorMap])

    const queueSections = {
        tasksReadyForQa: queue?.tasksReadyForQa ?? [],
        handoffsMissingEvidence: queue?.handoffsMissingEvidence ?? [],
        prsLinkedButNotRetested: queue?.prsLinkedButNotRetested ?? [],
        failedVerificationsNeedingDev: queue?.failedVerificationsNeedingDev ?? [],
    }

    const sections: Array<{ title: string; icon: typeof CheckCircle2; items: ReleaseQueueItem[]; empty: string }> = [
        {
            title: 'Ready for QA',
            icon: CheckCircle2,
            items: queueSections.tasksReadyForQa,
            empty: 'No fixes are currently waiting for QA verification.',
        },
        {
            title: 'Missing Evidence',
            icon: AlertTriangle,
            items: queueSections.handoffsMissingEvidence,
            empty: 'All active handoffs currently include evidence.',
        },
        {
            title: 'PRs Waiting for Retest',
            icon: GitPullRequest,
            items: queueSections.prsLinkedButNotRetested,
            empty: 'No linked PRs are waiting on QA retest.',
        },
        {
            title: 'Failed Verification',
            icon: FlaskConical,
            items: queueSections.failedVerificationsNeedingDev,
            empty: 'No failed verifications are waiting on developer follow-up.',
        },
    ]

    const memberWorkload = (() => {
        if (!isConnected || members.length === 0) return []
        const allItems = [
            ...queueSections.tasksReadyForQa,
            ...queueSections.handoffsMissingEvidence,
            ...queueSections.prsLinkedButNotRetested,
            ...queueSections.failedVerificationsNeedingDev,
        ]
        const counts = new Map<string, { displayName: string; count: number; userId: string }>()
        for (const item of allItems) {
            const actor = getActorName(item.task.id)
            if (!actor?.userId) continue
            const existing = counts.get(actor.userId)
            if (existing) existing.count++
            else counts.set(actor.userId, { displayName: actor.displayName!, count: 1, userId: actor.userId })
        }
        return Array.from(counts.values()).sort((left, right) => right.count - left.count)
    })()

    if (!activeProject || !queue || !metrics) {
        return (
            <div className="space-y-4">
                <h1 className="text-2xl font-semibold text-[#E2E8F0]">Release Queue</h1>
                <p className="text-sm text-[#6B7280]">Select or create a project to review verification work.</p>
            </div>
        )
    }

    const queueSummary = [
        `${queue.tasksReadyForQa.length} ready for QA`,
        `${queue.handoffsMissingEvidence.length} need evidence`,
        metrics.avgDevAcknowledgementHours === null ? 'dev ack n/a' : `dev ack ${metrics.avgDevAcknowledgementHours}h`,
        `reopen rate ${metrics.reopenRate}%`,
    ].join(' | ')

    const workloadSummary = memberWorkload.slice(0, 3).map((member) => `${member.displayName} ${member.count}`).join(' | ')

    return (
        <div className="max-w-[1200px] space-y-5 pb-10">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#2A2A3A] pb-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-[#E2E8F0]">Release Queue</h1>
                    <p className="mt-1 text-xs text-[#8E9196]">{queueSummary}</p>
                    {isConnected && workloadSummary ? (
                        <p className="mt-1 text-xs text-[#6B7280]">Team workload: {workloadSummary}</p>
                    ) : null}
                </div>
                <Button className="bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD]" onClick={() => navigate('/tasks')}>
                    Open Task Board
                </Button>
            </header>

            <div className="space-y-4">
                {sections.map((section) => (
                    <section key={section.title} className="rounded-xl border border-[#2A2A3A] bg-[#13131A] p-5">
                        <div className="mb-2 flex items-center justify-between gap-3 border-b border-[#2A2A3A] pb-3">
                            <div className="flex items-center gap-2">
                                <section.icon className="h-4 w-4 text-[#A78BFA]" />
                                <h2 className="text-sm font-semibold text-[#E2E8F0]">{section.title}</h2>
                            </div>
                            <span className="text-xs text-[#8E9196]">{section.items.length}</span>
                        </div>

                        {section.items.length === 0 ? (
                            <p className="py-4 text-sm text-[#6B7280]">{section.empty}</p>
                        ) : (
                            <div className="divide-y divide-[#2A2A3A]">
                                {section.items.map((item) => {
                                    const actor = getActorName(item.task.id)
                                    const workflowSummary = getTaskWorkflowSummary(activeProject, item.task)
                                    return (
                                        <div key={`${section.title}-${item.task.id}`} className="flex items-start justify-between gap-4 py-4">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium text-[#E2E8F0]">{item.task.title}</div>
                                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8E9196]">
                                                    <span>{item.handoff?.environmentName || 'No environment'}</span>
                                                    <span>|</span>
                                                    <span>{workflowSummary?.stateLabel || item.task.collabState || 'draft'}</span>
                                                    {actor?.displayName ? (
                                                        <>
                                                            <span>|</span>
                                                            <MemberChip userId={actor.userId} displayName={actor.displayName} />
                                                        </>
                                                    ) : null}
                                                </div>
                                                <p className="mt-2 text-sm text-[#E2E8F0]">{workflowSummary.nextAction}</p>
                                                {item.handoff?.missingFields?.length ? (
                                                    <p className="mt-1 text-xs text-[#FCA5A5]">Missing: {item.handoff.missingFields.join(', ')}</p>
                                                ) : null}
                                                {item.handoff?.linkedPrs?.length ? (
                                                    <p className="mt-1 text-xs text-[#7DD3FC]">
                                                        PRs: {item.handoff.linkedPrs.map((pr) => `${pr.repoFullName}#${pr.prNumber}`).join(', ')}
                                                    </p>
                                                ) : null}
                                            </div>
                                            <Button variant="outline" className="shrink-0 border-[#2A2A3A] text-[#E2E8F0]" onClick={() => navigate('/tasks')}>
                                                Review
                                            </Button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </section>
                ))}
            </div>
        </div>
    )
}
