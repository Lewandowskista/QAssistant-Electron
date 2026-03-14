import { cn } from "@/lib/utils"
import { StatusBadge } from "@/components/ui/status-badge"
import type { TaskCoverageState, TaskDueState, TaskHandoffState } from "@/lib/tasks"
import type { CollabState } from "@/types/project"

type BadgeTone = "neutral" | "blue" | "amber" | "red" | "green" | "purple"

function toneClasses(tone: BadgeTone) {
    if (tone === "blue") return "info"
    if (tone === "amber") return "warning"
    if (tone === "red") return "danger"
    if (tone === "green") return "success"
    if (tone === "purple") return "accent"
    return "neutral"
}

export function TaskStateBadge({ label, tone }: { label: string; tone: BadgeTone }) {
    return (
        <StatusBadge tone={toneClasses(tone) as any} className={cn("px-2 py-1 text-[9px] tracking-[0.12em]")}>
            {label}
        </StatusBadge>
    )
}

export function collabStateTone(collabState?: CollabState): BadgeTone {
    if (collabState === "ready_for_qa" || collabState === "qa_retesting") return "blue"
    if (collabState === "verified" || collabState === "closed") return "green"
    if (collabState === "ready_for_dev" || collabState === "dev_acknowledged" || collabState === "in_fix") return "purple"
    return "neutral"
}

export function collabStateLabel(collabState?: CollabState) {
    if (!collabState) return "Draft"
    return collabState.replace(/_/g, " ")
}

export function dueStateTone(dueState: TaskDueState): BadgeTone {
    if (dueState === "overdue") return "red"
    if (dueState === "soon") return "amber"
    if (dueState === "future") return "blue"
    return "neutral"
}

export function handoffStateTone(handoffState: TaskHandoffState): BadgeTone {
    if (handoffState === "ready") return "green"
    if (handoffState === "incomplete") return "red"
    if (handoffState === "draft") return "amber"
    return "neutral"
}

export function coverageStateTone(coverageState: TaskCoverageState): BadgeTone {
    return coverageState === "linked" ? "green" : "red"
}
