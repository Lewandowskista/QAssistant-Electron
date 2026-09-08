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
  MoreHorizontal,
  Send,
  User,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  onCreateHandoff?: () => void
  onCopyReference?: () => void
  dragHandleProps?: Record<string, unknown>
  dragDisabled?: boolean
}

const priorityConfig = {
  critical: { icon: AlertCircle, color: "text-state-danger", bg: "bg-state-danger-soft", border: "border-state-danger-border", label: "CRITICAL" },
  high: { icon: ChevronUp, color: "text-state-warning", bg: "bg-state-warning-soft", border: "border-state-warning-border", label: "HIGH" },
  medium: { icon: Minus, color: "text-state-warning", bg: "bg-state-warning-soft", border: "border-state-warning-border", label: "MEDIUM" },
  low: { icon: ChevronDown, color: "text-state-success", bg: "bg-state-success-soft", border: "border-state-success-border", label: "LOW" },
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
  if (task.source === "jira") return "bg-state-info-soft border-state-info-border text-state-info"
  if (task.source === "linear") return "bg-primary/10 border-primary/20 text-primary"
  return "bg-state-warning-soft border-state-warning-border text-state-warning"
}

function taskHint(task: Task, taskView?: TaskViewModel) {
  if (task.collabState === "ready_for_qa") return "Next: QA retest & verification"
  if (task.collabState === "ready_for_dev") return "Next: developer acknowledgement"
  if (task.collabState === "in_fix") return "Next: link PR & return to QA"
  if (taskView?.handoffState === "incomplete") return `Next: complete ${taskView.handoffMissingFields[0] || "handoff details"}`
  if (taskView?.coverageState === "uncovered") return "Next: link test coverage"
  return "Next: review & move workflow forward"
}

function secondaryTaskState(taskView?: TaskViewModel) {
  if (!taskView) return null
  if (taskView.handoffState === "incomplete") {
    return {
      label: `Need ${taskView.handoffMissingFields[0] || "evidence"}`,
      tone: handoffStateTone(taskView.handoffState),
    }
  }
  if (taskView.dueState && taskView.dueState !== "none" && taskView.dueLabel) {
    return {
      label: taskView.dueLabel,
      tone: dueStateTone(taskView.dueState),
    }
  }
  if (taskView.coverageState === "uncovered") {
    return {
      label: "No tests",
      tone: "red" as const,
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
  onCreateHandoff,
  onCopyReference,
  dragHandleProps,
  dragDisabled,
}: TaskCardProps) {
  const config = priorityConfig[task.priority] || priorityConfig.medium
  const PriorityIcon = config.icon
  const labels = labelList(task)
  const secondaryState = secondaryTaskState(taskView)
  // Components and labels frequently carry the same word ("orders"), which read
  // as "orders • orders • +2" on the card. De-duplicate before slicing.
  const metaTags = [...new Set([...(task.components || []), ...labels])]
  const metadataLabels = metaTags.slice(0, 2)
  const hiddenMetaCount = Math.max(metaTags.length - metadataLabels.length, 0)

  /*
   * A real focusable control, not a bare `div onClick`. The board was
   * mouse-only: no card could be reached with Tab, so the inspector — the
   * primary way to read or edit a task — had no keyboard route into it at all.
   * The drag overlay copy is inert, so it stays out of the tab order.
   */
  const interactive = Boolean(onClick) && !isOverlay

  return (
    <div
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? isSelected : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        // Space scrolls the column otherwise, and both keys would fall through
        // to the board's own handlers.
        event.preventDefault()
        onClick?.()
      } : undefined}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-ui bg-panel p-4 shadow-sm transition-[border-color,background-color,box-shadow,transform]",
        "hover:border-ui-strong hover:bg-[hsl(var(--surface-card-alt)/0.92)]",
        interactive && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        isSelected && "border-primary/40 ring-1 ring-primary/20 bg-[hsl(var(--surface-selected)/0.75)]",
        isOverlay && "scale-[1.02] border-primary/40 shadow-lg opacity-95"
      )}
    >
      <div className={cn("absolute bottom-0 left-0 top-0 w-1", config.color.replace("text-", "bg-"))} />

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className={cn("rounded border px-1.5 py-1", sourceClasses(task))}>
              <span className="text-[11px] font-black">{sourceLabel(task)}</span>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-tight text-muted-ui">
              {task.sourceIssueId || task.externalId || "Draft"}
            </span>
          </div>

          {/*
            One menu, not a row of five. Every card previously grew a strip of
            up to five bordered icon buttons on hover — copy, analyse, open
            ticket, handoff, drag — so moving the pointer across a column lit up
            twenty-five little controls in sequence, none of them labelled. The
            grab handle stays out (dragging must be direct); the rest are named
            items behind one affordance.
          */}
          <div className="flex items-center gap-1">
            {!dragDisabled && dragHandleProps ? (
              <button
                type="button"
                aria-label="Drag task"
                className="cursor-grab rounded-lg p-1 text-muted-ui opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                onClick={(event) => event.stopPropagation()}
                {...dragHandleProps}
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Actions for ${task.title}`}
                  className="rounded-lg p-1 text-muted-ui opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52" onClick={(event) => event.stopPropagation()}>
                <DropdownMenuItem onSelect={() => onAnalyze?.()}>
                  <Microscope className="mr-2 h-3.5 w-3.5" /> Analyze issue
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onCopyReference?.()}>
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy reference
                </DropdownMenuItem>
                {taskView?.hasActiveHandoff ? (
                  <DropdownMenuItem onSelect={() => onOpenHandoff?.()}>
                    <AlertTriangle className="mr-2 h-3.5 w-3.5" /> Open handoff
                  </DropdownMenuItem>
                ) : onCreateHandoff ? (
                  <DropdownMenuItem onSelect={() => onCreateHandoff()}>
                    <Send className="mr-2 h-3.5 w-3.5" /> Create handoff
                  </DropdownMenuItem>
                ) : null}
                {task.source !== "manual" && task.ticketUrl ? (
                  <DropdownMenuItem onSelect={() => onOpenExternal?.()}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open source ticket
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <h4 className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground transition-colors group-hover:text-foreground">
          {task.title}
        </h4>

        <p className="text-[11px] leading-relaxed text-soft">{taskHint(task, taskView)}</p>

        <div className="flex flex-wrap gap-1.5">
          {(task.priority === "critical" || task.severity === "blocker" || task.severity === "critical") ? (
            <div className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-black", config.bg, config.color, config.border)}>
              <PriorityIcon className="h-2.5 w-2.5" />
              {task.severity === "blocker" ? "BLOCKER" : config.label}
            </div>
          ) : null}
          <TaskStateBadge label={collabStateLabel(task.collabState)} tone={collabStateTone(task.collabState)} />
          {secondaryState ? <TaskStateBadge label={secondaryState.label} tone={secondaryState.tone} /> : null}
        </div>

        {(metadataLabels.length > 0 || hiddenMetaCount > 0) ? (
          <p className="text-[11px] text-muted-ui">
            {[...metadataLabels, hiddenMetaCount > 0 ? `+${hiddenMetaCount}` : null].filter(Boolean).join(" • ")}
          </p>
        ) : null}

        <div className="flex items-center justify-between border-t border-ui/40 pt-3">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary/10">
              {task.assignee ? (
                <span className="text-[11px] font-bold text-primary">{task.assignee.substring(0, 2).toUpperCase()}</span>
              ) : (
                <User className="h-2.5 w-2.5 text-muted-ui" />
              )}
            </div>
            <span className="max-w-[90px] truncate text-[11px] font-semibold text-soft">{task.assignee || "Unassigned"}</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-ui">
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
  onCreateHandoff,
  onCopyReference,
  dragDisabled,
}: {
  task: Task
  taskView: TaskViewModel
  isSelected: boolean
  onClick: () => void
  onAnalyze?: () => void
  onOpenExternal?: () => void
  onOpenHandoff?: () => void
  onCreateHandoff?: () => void
  onCopyReference?: () => void
  dragDisabled?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: dragDisabled })
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  if (isDragging) {
    return <div ref={setNodeRef} style={style} className="h-[160px] rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5" />
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
        onCreateHandoff={onCreateHandoff}
        onCopyReference={onCopyReference}
        dragHandleProps={listeners}
        dragDisabled={dragDisabled}
      />
    </div>
  )
}
