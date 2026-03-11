import { memo } from "react"
import { Task } from "@/store/useProjectStore"
import { cn } from "@/lib/utils"
import {
    User,
    AlertCircle,
    ChevronUp,
    ChevronDown,
    Minus,
    Clock3
} from "lucide-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface TaskCardProps {
    task: Task
    isOverlay?: boolean
    isSelected?: boolean
    onClick?: () => void
}

// Moved outside component - this object is constant and doesn't need to be recreated on every render
const priorityConfig = {
    critical: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", label: "CRITICAL" },
    high: { icon: ChevronUp, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", label: "HIGH" },
    medium: { icon: Minus, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20", label: "MEDIUM" },
    low: { icon: ChevronDown, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "LOW" },
} as const

export const TaskCard = memo(function TaskCard({ task, isOverlay, isSelected, onClick }: TaskCardProps) {

    const config = priorityConfig[task.priority] || priorityConfig.medium
    const PriorityIcon = config.icon

    return (
        <div 
            onClick={onClick}
            className={cn(
                "bg-[#1A1A24]/60 backdrop-blur-md border border-[#2A2A3A] rounded-xl p-4 shadow-sm hover:border-[#A78BFA]/50 transition-all select-none group relative overflow-hidden",
                isSelected && "border-[#A78BFA] ring-1 ring-[#A78BFA]/30 bg-[#1A1A24]/90",
                isOverlay && "opacity-90 shadow-2xl scale-[1.02] border-[#A78BFA] z-[100]"
            )}
        >
            {/* Priority accent border */}
            <div className={cn("absolute left-0 top-0 bottom-0 w-1", config.color.replace('text-', 'bg-'))} />

            <div className="space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {task.source === 'jira' ? (
                            <div className="p-1 px-1.5 rounded bg-blue-500/10 border border-blue-500/20">
                                <span className="text-[9px] font-black text-blue-400">JIRA</span>
                            </div>
                        ) : task.source === 'linear' ? (
                            <div className="p-1 px-1.5 rounded bg-[#5E6AD2]/10 border border-[#5E6AD2]/20">
                                <span className="text-[9px] font-black text-[#5E6AD2]">LINEAR</span>
                            </div>
                        ) : (
                            <div className="p-1 px-1.5 rounded bg-amber-500/10 border border-amber-500/20">
                                <span className="text-[9px] font-black text-amber-400">MANUAL</span>
                            </div>
                        )}
                        <span className="text-[9px] font-bold text-[#6B7280] tracking-tight uppercase">{task.sourceIssueId || 'Draft'}</span>
                    </div>

                    <div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-black", config.bg, config.color, config.border)}>
                        <PriorityIcon className="h-2.5 w-2.5" />
                        {config.label}
                    </div>
                </div>

                {/* Title */}
                <h4 className="text-[13px] font-bold text-[#E2E8F0] leading-snug line-clamp-2 group-hover:text-white transition-colors">
                    {task.title}
                </h4>

                {/* Labels */}
                {task.labels && task.labels.trim() !== "" && (
                    <div className="flex flex-wrap gap-1.5">
                        {task.labels.split(',').map((label, idx) => (
                            <div key={idx} className="px-2 py-0.5 rounded-md bg-[#2A2A3A]/50 border border-[#3A3A3A] text-[9px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                                {label.trim()}
                            </div>
                        ))}
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-[#2A2A3A]/40">
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#A78BFA]/20 to-[#6366F1]/20 flex items-center justify-center overflow-hidden border border-[#A78BFA]/30">
                            {task.assignee ? (
                                <span className="text-[8px] font-bold text-[#A78BFA]">{task.assignee.substring(0, 2).toUpperCase()}</span>
                            ) : (
                                <User className="h-2.5 w-2.5 text-[#6B7280]" />
                            )}
                        </div>
                        <span className="text-[10px] font-bold text-[#8E9196] truncate max-w-[80px]">{task.assignee || 'Unassigned'}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5 text-[9px] font-medium text-[#6B7280]">
                        <Clock3 className="h-3 w-3 opacity-60" />
                        {new Date(task.updatedAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </div>
                </div>
            </div>
        </div>
    )
})

export function SortableTaskCard({ task, isSelected, onClick }: { task: Task, isSelected: boolean, onClick: () => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: task.id })

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    }

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="h-[100px] rounded-xl border-2 border-dashed border-[#A78BFA]/30 bg-[#A78BFA]/5"
            />
        )
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            className="cursor-default"
        >
            <TaskCard task={task} isSelected={isSelected} />
        </div>
    )
}
