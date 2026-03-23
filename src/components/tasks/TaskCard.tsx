import { memo } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
    AlertCircle,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    Clock3,
    Copy,
    ExternalLink,
    GripVertical,
    Minus,
    Microscope,
    User
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Task } from "@/store/useProjectStore"
import type { TaskViewModel } from "@/lib/tasks"
import { TaskStateBadge, collabStateLabel, collabStateTone, dueStateTone, handoffStateTone } from "./TaskStateBadge"

interface TaskCardProps {
    task: Task
    taskView?: TaskViewModel
    isOverlay?: boolean
    isSelected?: boolean
    onClick?: () => void
    onAnalyze?: () => void
    onOpenExternal?: () => void
    onOpenHandoff?: () => void
    onCopyReference?: () => void
    dragHandleProps?: Record<string, unknown>
    dragDisabled?: boolean
}

const priorityConfig = {
    critical: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", label: "CRITICAL" },
    high: { icon: ChevronUp, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", label: "HIGH" },
    medium: { icon: Minus, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20", label: "MEDIUM" },
    low: { icon: ChevronDown, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "LOW" }
} as const

function labelList(task: Task) {
    return (task.labels || "")
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean)
}

function sourceLabel(task: Task) {
    if (task.source === "jira") return "JIRA"
    if (task.source === "linear") return "LINEAR"
    return "MANUAL"
}

function sourceClasses(task: Task) {
    if (task.source === "jira") return "bg-blue-500/10 border-blue-500/20 text-blue-400"
    if (task.source === "linear") return "bg-[#5E6AD2]/10 border-[#5E6AD2]/20 text-[#5E6AD2]"
    return "bg-amber-500/10 border-amber-500/20 text-amber-400"
}

function taskHint(task: Task, taskView?: TaskViewModel) {
    if (task.collabState === "ready_for_qa") return "Next: QA retest and verification"
    if (task.collabState === "ready_for_dev") return "Next: developer acknowledgement"
    if (task.collabState === "in_fix") return "Next: link PR and return to QA"
    if (taskView?.handoffState === "incomplete") return `Next: complete ${taskView.handoffMissingFields[0] || "handoff details"}`
    if (taskView?.coverageState === "uncovered") return "Next: link test coverage"
    return "Next: review and move workflow forward"
}

function secondaryTaskState(taskView?: TaskViewModel) {
    if (!taskView) return null
    if (taskView.handoffState === "incomplete") {
        return {
            label: `Need ${taskView.handoffMissingFields[0] || "evidence"}`,
            tone: handoffStateTone(taskView.handoffState)
        }
    }
    if (taskView.dueState && taskView.dueState !== "none" && taskView.dueLabel) {
        return {
            label: taskView.dueLabel,
            tone: dueStateTone(taskView.dueState)
        }
    }
    if (taskView.coverageState === "uncovered") {
        return {
            label: "No tests",
            tone: "red" as const
        }
    }
    return null
}

export const TaskCard = memo(function TaskCard({
    task,
    taskView,
    isOverlay,
    isSelected,
    onClick,
    onAnalyze,
    onOpenExternal,
    onOpenHandoff,
    onCopyReference,
    dragHandleProps,
    dragDisabled
}: TaskCardProps) {
    const config = priorityConfig[task.priority] || priorityConfig.medium
    const PriorityIcon = config.icon
    const labels = labelList(task)
    const secondaryState = secondaryTaskState(taskView)
    const metadataLabels = [...(task.components || []).slice(0, 1), ...labels.slice(0, 1)]
    const hiddenMetaCount = Math.max((task.components?.length || 0) + labels.length - metadataLabels.length, 0)

    return (
        <div
            onClick={onClick}
            className={cn(
                "group relative overflow-hidden rounded-xl border border-[#2A2A3A] bg-[#15151D] p-4 shadow-sm transition-all hover:border-[#A78BFA]/30",
                isSelected && "border-[#A78BFA] ring-1 ring-[#A78BFA]/30 bg-[#1A1A24]/90",
                isOverlay && "scale-[1.02] border-[#A78BFA] shadow-2xl opacity-95"
            )}
        >
            <div className={cn("absolute left-0 top-0 bottom-0 w-1", config.color.replace("text-", "bg-"))} />

            <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <div className={cn("rounded border px-1.5 py-1", sourceClasses(task))}>
                            <span className="text-[9px] font-black">{sourceLabel(task)}</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-tight text-[#6B7280]">
                            {task.sourceIssueId || task.externalId || "Draft"}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                            type="button"
                            className="rounded-md border border-[#2A2A3A] bg-[#0F0F13] p-1 text-[#6B7280] hover:text-[#E2E8F0]"
                            onClick={(event) => {
                                event.stopPropagation()
                                onCopyReference?.()
                            }}
                            title="Copy task reference"
                        >
                            <Copy className="h-3 w-3" />
                        </button>
                        <button
                            type="button"
                            className="rounded-md border border-[#2A2A3A] bg-[#0F0F13] p-1 text-[#6B7280] hover:text-[#C4B5FD]"
                            onClick={(event) => {
                                event.stopPropagation()
                                onAnalyze?.()
                            }}
                            title="Analyze issue"
                        >
                            <Microscope className="h-3 w-3" />
                        </button>
                        {task.source !== "manual" && task.ticketUrl && (
                            <button
                                type="button"
                                className="rounded-md border border-[#2A2A3A] bg-[#0F0F13] p-1 text-[#6B7280] hover:text-[#38BDF8]"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onOpenExternal?.()
                                }}
                                title="Open source ticket"
                            >
                                <ExternalLink className="h-3 w-3" />
                            </button>
                        )}
                        {taskView?.hasActiveHandoff && (
                            <button
                                type="button"
                                className="rounded-md border border-[#2A2A3A] bg-[#0F0F13] p-1 text-[#6B7280] hover:text-[#A78BFA]"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onOpenHandoff?.()
                                }}
                                title="Open handoff"
                            >
                                <AlertTriangle className="h-3 w-3" />
                            </button>
                        )}
                        {!dragDisabled && dragHandleProps && (
                            <button
                                type="button"
                                className="cursor-grab rounded-md border border-[#2A2A3A] bg-[#0F0F13] p-1 text-[#6B7280] hover:text-[#E2E8F0]"
                                onClick={(event) => event.stopPropagation()}
                                title="Drag task"
                                {...dragHandleProps}
                            >
                                <GripVertical className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                </div>

                <h4 className="line-clamp-2 text-[13px] font-bold leading-snug text-[#E2E8F0] transition-colors group-hover:text-white">
                    {task.title}
                </h4>

                <p className="text-[11px] leading-relaxed text-[#9CA3AF]">
                    {taskHint(task, taskView)}
                </p>

                <div className="flex flex-wrap gap-1.5">
                    {(task.priority === "critical" || task.severity === "blocker" || task.severity === "critical") && (
                        <div className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-black", config.bg, config.color, config.border)}>
                            <PriorityIcon className="h-2.5 w-2.5" />
                            {task.severity === "blocker" ? "BLOCKER" : config.label}
                        </div>
                    )}
                    <TaskStateBadge label={collabStateLabel(task.collabState)} tone={collabStateTone(task.collabState)} />
                    {secondaryState ? <TaskStateBadge label={secondaryState.label} tone={secondaryState.tone} /> : null}
                </div>

                {(metadataLabels.length > 0 || hiddenMetaCount > 0) && (
                    <p className="text-[10px] text-[#7C8393]">
                        {[...metadataLabels, hiddenMetaCount > 0 ? `+${hiddenMetaCount}` : null].filter(Boolean).join(" · ")}
                    </p>
                )}

                <div className="flex items-center justify-between border-t border-[#2A2A3A]/40 pt-3">
                    <div className="flex items-center gap-2">
                        <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-[#A78BFA]/30 bg-gradient-to-br from-[#A78BFA]/20 to-[#6366F1]/20">
                            {task.assignee ? (
                                <span className="text-[8px] font-bold text-[#A78BFA]">{task.assignee.substring(0, 2).toUpperCase()}</span>
                            ) : (
                                <User className="h-2.5 w-2.5 text-[#6B7280]" />
                            )}
                        </div>
                        <span className="max-w-[90px] truncate text-[10px] font-bold text-[#8E9196]">{task.assignee || "Unassigned"}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[9px] font-medium text-[#6B7280]">
                        <Clock3 className="h-3 w-3 opacity-60" />
                        {new Date(task.updatedAt || Date.now()).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </div>
                </div>
            </div>
        </div>
    )
})

export function SortableTaskCard({
    task,
    taskView,
    isSelected,
    onClick,
    onAnalyze,
    onOpenExternal,
    onOpenHandoff,
    onCopyReference,
    dragDisabled
}: {
    task: Task
    taskView: TaskViewModel
    isSelected: boolean
    onClick: () => void
    onAnalyze?: () => void
    onOpenExternal?: () => void
    onOpenHandoff?: () => void
    onCopyReference?: () => void
    dragDisabled?: boolean
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: dragDisabled })
    const style = {
        transform: CSS.Translate.toString(transform),
        transition
    }

    if (isDragging) {
        return <div ref={setNodeRef} style={style} className="h-[160px] rounded-xl border-2 border-dashed border-[#A78BFA]/30 bg-[#A78BFA]/5" />
    }

    return (
        <div ref={setNodeRef} style={style} {...attributes} className="cursor-default">
            <TaskCard
                task={task}
                taskView={taskView}
                isSelected={isSelected}
                onClick={onClick}
                onAnalyze={onAnalyze}
                onOpenExternal={onOpenExternal}
                onOpenHandoff={onOpenHandoff}
                onCopyReference={onCopyReference}
                dragHandleProps={listeners}
                dragDisabled={dragDisabled}
            />
        </div>
    )
}
