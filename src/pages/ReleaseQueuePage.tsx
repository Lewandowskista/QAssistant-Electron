import { AlertTriangle, CheckCircle2, FlaskConical, GitPullRequest } from "lucide-react"
import { useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  CompactPageHeader,
  DenseListRow,
  InlineStatusSummary,
  PageScaffold,
  SurfaceBlock,
} from "@/components/ui/workspace"
import {
  getCollaborationMetrics,
  getReleaseQueue,
  getTaskWorkflowSummary,
  type ReleaseQueueItem,
} from "@/lib/collaboration"
import { cn } from "@/lib/utils"
import { useProjectStore } from "@/store/useProjectStore"
import { useSyncStore } from "@/store/useSyncStore"
import type { WorkspaceMember } from "@/types/sync"

const EMPTY_MEMBERS: WorkspaceMember[] = []
const AVATAR_COLORS = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
]

function colorForId(id: string): string {
  let hash = 0
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function MemberChip({ userId, displayName }: { userId?: string; displayName?: string }) {
  if (!displayName) return null

  return (
    <div className="inline-flex items-center gap-2">
      <div
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white",
          colorForId(userId ?? displayName)
        )}
      >
        {initials(displayName)}
      </div>
      <span className="truncate text-[10px] text-muted-ui">{displayName}</span>
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

  const queue = useMemo(() => (activeProject ? getReleaseQueue(activeProject) : null), [activeProject])
  const metrics = useMemo(() => (activeProject ? getCollaborationMetrics(activeProject) : null), [activeProject])

  const taskActorMap = useMemo(() => {
    const map = new Map<string, { userId?: string; displayName?: string }>()
    for (const event of (activeProject?.collaborationEvents ?? []).sort(
      (left, right) => left.timestamp - right.timestamp
    )) {
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

  const getActorName = useCallback(
    (taskId: string): { userId?: string; displayName?: string } | undefined => {
      const actor = taskActorMap.get(taskId)
      if (!actor) return undefined
      const displayName = actor.displayName ?? (actor.userId ? memberMap.get(actor.userId) : undefined)
      return displayName ? { ...actor, displayName } : undefined
    },
    [memberMap, taskActorMap]
  )

  const queueSections = {
    tasksReadyForQa: queue?.tasksReadyForQa ?? [],
    handoffsMissingEvidence: queue?.handoffsMissingEvidence ?? [],
    prsLinkedButNotRetested: queue?.prsLinkedButNotRetested ?? [],
    failedVerificationsNeedingDev: queue?.failedVerificationsNeedingDev ?? [],
  }

  const sections: Array<{
    title: string
    icon: typeof CheckCircle2
    items: ReleaseQueueItem[]
    empty: string
  }> = [
    {
      title: "Ready for QA",
      icon: CheckCircle2,
      items: queueSections.tasksReadyForQa,
      empty: "No fixes are currently waiting for QA verification.",
    },
    {
      title: "Missing Evidence",
      icon: AlertTriangle,
      items: queueSections.handoffsMissingEvidence,
      empty: "All active handoffs currently include evidence.",
    },
    {
      title: "PRs Waiting for Retest",
      icon: GitPullRequest,
      items: queueSections.prsLinkedButNotRetested,
      empty: "No linked PRs are waiting on QA retest.",
    },
    {
      title: "Failed Verification",
      icon: FlaskConical,
      items: queueSections.failedVerificationsNeedingDev,
      empty: "No failed verifications are waiting on developer follow-up.",
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
      <PageScaffold>
        <CompactPageHeader
          eyebrow="Release flow"
          title="Release Queue"
          description="Select or create a project to review verification work."
        />
      </PageScaffold>
    )
  }

  const queueSummary = [
    `${queue.tasksReadyForQa.length} ready for QA`,
    `${queue.handoffsMissingEvidence.length} need evidence`,
    metrics.avgDevAcknowledgementHours === null ? "dev ack n/a" : `dev ack ${metrics.avgDevAcknowledgementHours}h`,
    `reopen rate ${metrics.reopenRate}%`,
  ]

  const workloadSummary = memberWorkload
    .slice(0, 3)
    .map((member) => `${member.displayName} ${member.count}`)
    .join(" / ")

  return (
    <PageScaffold className="max-w-[1260px]">
      <CompactPageHeader
        eyebrow="Release flow"
        title="Release Queue"
        description="Review what is blocked, what needs proof, and what should move next."
        summary={<InlineStatusSummary items={queueSummary} />}
        actions={
          <Button onClick={() => navigate("/tasks")}>
            Open Task Board
          </Button>
        }
      />

      {isConnected && workloadSummary ? (
        <SurfaceBlock className="surface-muted px-4 py-3 text-sm text-soft">
          Team workload: <span className="text-foreground">{workloadSummary}</span>
        </SurfaceBlock>
      ) : null}

      <div className="space-y-4">
        {sections.map((section) => (
          <SurfaceBlock key={section.title} className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-ui px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-ui bg-panel-muted">
                  <section.icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
                  <p className="app-helper-text">{section.items.length} items</p>
                </div>
              </div>
            </div>

            {section.items.length === 0 ? (
              <div className="px-5 py-5 text-sm text-soft">{section.empty}</div>
            ) : (
              <div className="dense-list">
                {section.items.map((item) => {
                  const actor = getActorName(item.task.id)
                  const workflowSummary = getTaskWorkflowSummary(activeProject, item.task)

                  return (
                    <DenseListRow
                      key={`${section.title}-${item.task.id}`}
                      title={item.task.title}
                      description={
                        <div className="space-y-2">
                          <p>{workflowSummary.nextAction}</p>
                          {item.handoff?.missingFields?.length ? (
                            <p className="text-xs text-amber-300">
                              Missing: {item.handoff.missingFields.join(", ")}
                            </p>
                          ) : null}
                          {item.handoff?.linkedPrs?.length ? (
                            <p className="text-xs text-sky-300">
                              PRs: {item.handoff.linkedPrs
                                .map((pr) => `${pr.repoFullName}#${pr.prNumber}`)
                                .join(", ")}
                            </p>
                          ) : null}
                        </div>
                      }
                      meta={
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{item.handoff?.environmentName || "No environment"}</span>
                          <span>/</span>
                          <span>{workflowSummary?.stateLabel || item.task.collabState || "draft"}</span>
                          {actor?.displayName ? (
                            <>
                              <span>/</span>
                              <MemberChip userId={actor.userId} displayName={actor.displayName} />
                            </>
                          ) : null}
                        </div>
                      }
                      actions={
                        <Button variant="outline" onClick={() => navigate("/tasks")}>
                          Review
                        </Button>
                      }
                      icon={section.icon}
                    />
                  )
                })}
              </div>
            )}
          </SurfaceBlock>
        ))}
      </div>
    </PageScaffold>
  )
}
