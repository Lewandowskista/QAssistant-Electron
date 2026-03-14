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
import { TaskStateBadge, collabStateLabel, collabStateTone, coverageStateTone, dueStateTone, handoffStateTone } from "./TaskStateBadge"

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

const severityConfig = {
    blocker: { color: "text-red-600", bg: "bg-red-500/10", border: "border-red-500/20", label: "BLOCKER" },
    critical: { color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", label: "CRITICAL" },
    major: { color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", label: "MAJOR" },
    minor: { color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20", label: "MINOR" },
    cosmetic: { color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/20", label: "COSMETIC" }
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
    const severityConfig_ = severityConfig[(task.severity || "major") as keyof typeof severityConfig]
    const PriorityIcon = config.icon
    const labels = labelList(task)
    const visibleLabels = labels.slice(0, 2)
    const hiddenLabelCount = Math.max(labels.length - visibleLabels.length, 0)

    return (
        <div
            onClick={onClick}
            className={cn(
                "group relative overflow-hidden rounded-xl border border-[#2A2A3A] bg-[#1A1A24]/60 p-4 shadow-sm transition-all hover:border-[#A78BFA]/40",
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

                <div className="flex flex-wrap gap-1.5">
                    <div className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-black", config.bg, config.color, config.border)}>
                        <PriorityIcon className="h-2.5 w-2.5" />
                        {config.label}
                    </div>
                    {["major", "critical", "blocker"].includes(task.severity || "major") && (
                        <div className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-black", severityConfig_.bg, severityConfig_.color, severityConfig_.border)}>
                            {severityConfig_.label}
                        </div>
                    )}
                    <TaskStateBadge label={collabStateLabel(task.collabState)} tone={collabStateTone(task.collabState)} />
                    {taskView?.dueState && taskView.dueState !== "none" && taskView.dueLabel ? (
                        <TaskStateBadge label={taskView.dueLabel} tone={dueStateTone(taskView.dueState)} />
                    ) : null}
                    {taskView ? (
                        <TaskStateBadge label={`${taskView.linkedTestCount} tests`} tone={coverageStateTone(taskView.coverageState)} />
                    ) : null}
                    {taskView?.hasActiveHandoff ? (
                        <TaskStateBadge
                            label={taskView.handoffState === "incomplete" ? `Need ${taskView.handoffMissingFields[0] || "evidence"}` : "Handoff"}
                            tone={handoffStateTone(taskView.handoffState)}
                        />
                    ) : null}
                </div>

                {(task.components?.length || visibleLabels.length > 0 || hiddenLabelCount > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                        {(task.components || []).slice(0, 3).map((component) => (
                            <span key={component} className="rounded-md border border-[#38BDF8]/20 bg-[#38BDF8]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#38BDF8]">
                                {component}
                            </span>
                        ))}
                        {visibleLabels.map((label) => (
                            <span key={label} className="rounded-md border border-[#3A3A3A] bg-[#2A2A3A]/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#9CA3AF]">
                                {label}
                            </span>
                        ))}
                        {hiddenLabelCount > 0 && (
                            <span className="rounded-md border border-[#3A3A3A] bg-[#2A2A3A]/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#9CA3AF]">
                                +{hiddenLabelCount}
                            </span>
                        )}
                    </div>
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
