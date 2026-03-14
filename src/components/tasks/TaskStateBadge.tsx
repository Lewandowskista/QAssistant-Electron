import { cn } from "@/lib/utils"
import type { TaskCoverageState, TaskDueState, TaskHandoffState } from "@/lib/tasks"
import type { CollabState } from "@/types/project"

type BadgeTone = "neutral" | "blue" | "amber" | "red" | "green" | "purple"

function toneClasses(tone: BadgeTone) {
    if (tone === "blue") return "border-[#38BDF8]/20 bg-[#38BDF8]/10 text-[#38BDF8]"
    if (tone === "amber") return "border-[#F59E0B]/20 bg-[#F59E0B]/10 text-[#F59E0B]"
    if (tone === "red") return "border-[#EF4444]/20 bg-[#EF4444]/10 text-[#EF4444]"
    if (tone === "green") return "border-[#10B981]/20 bg-[#10B981]/10 text-[#10B981]"
    if (tone === "purple") return "border-[#A78BFA]/20 bg-[#A78BFA]/10 text-[#C4B5FD]"
    return "border-[#2A2A3A] bg-[#1A1A24] text-[#9CA3AF]"
}

export function TaskStateBadge({ label, tone }: { label: string; tone: BadgeTone }) {
    return (
        <span className={cn("inline-flex items-center rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em]", toneClasses(tone))}>
            {label}
        </span>
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
