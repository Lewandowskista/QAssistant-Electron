import { useState } from "react"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { ChevronDown, ChevronUp, Filter, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TaskViewModel, TaskSortMode } from "@/lib/tasks"
import { SortableTaskCard } from "./TaskCard"

interface TaskColumnProps {
    col: {
        id: string
        title: string
        textColor?: string
    }
    tasksInColumn: TaskViewModel[]
    selectedTaskId: string | null
    setSelectedTaskId: (id: string | null) => void
    sourceMode: string
    onAddTask: (status?: string) => void
    onAnalyzeTask: (taskId: string) => void
    onOpenExternal: (taskId: string) => void
    onCopyReference: (taskId: string) => void
    onFilterColumn: (status: string) => void
    dragDisabled?: boolean
    sortMode: TaskSortMode
}

export function TaskColumn({
    col,
    tasksInColumn,
    selectedTaskId,
    setSelectedTaskId,
    sourceMode,
    onAddTask,
    onAnalyzeTask,
    onOpenExternal,
    onCopyReference,
    onFilterColumn,
    dragDisabled,
    sortMode
}: TaskColumnProps) {
    const { setNodeRef } = useDroppable({ id: col.id, disabled: dragDisabled })
    const [collapsed, setCollapsed] = useState(false)
    const criticalCount = tasksInColumn.filter((task) => task.isBlockedOrCritical).length
    const dueSoonCount = tasksInColumn.filter((task) => task.dueState === "soon" || task.dueState === "overdue").length

    return (
        <div className={cn("flex h-full shrink-0 flex-col rounded-xl border border-[#2A2A3A]/50 bg-[#13131A]/50 p-3", collapsed ? "w-[160px]" : "w-[320px]")}>
            <div className="flex items-start justify-between gap-2 px-1">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <span className={cn("text-[10px] font-bold tracking-[0.15em]", col.textColor || "text-[#E2E8F0]")}>{col.title}</span>
                        <span className="rounded border border-[#2A2A3A] bg-[#1A1A24] px-1.5 py-0.5 text-[10px] font-bold text-[#6B7280]">
                            {tasksInColumn.length}
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {criticalCount > 0 && <span className="rounded border border-[#EF4444]/20 bg-[#EF4444]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#EF4444]">{criticalCount} critical</span>}
                        {dueSoonCount > 0 && <span className="rounded border border-[#F59E0B]/20 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#F59E0B]">{dueSoonCount} due</span>}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => onFilterColumn(col.id)}
                        className="rounded-md border border-[#2A2A3A] bg-[#0F0F13] p-1 text-[#6B7280] hover:text-[#38BDF8]"
                        title="Filter to this column"
                    >
                        <Filter className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setCollapsed((value) => !value)}
                        className="rounded-md border border-[#2A2A3A] bg-[#0F0F13] p-1 text-[#6B7280] hover:text-[#E2E8F0]"
                        title={collapsed ? "Expand column" : "Collapse column"}
                    >
                        {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                    </button>
                </div>
            </div>

            {!collapsed && (
                <>
                    {dragDisabled && (
                        <div className="mt-3 rounded-lg border border-[#38BDF8]/20 bg-[#38BDF8]/10 px-3 py-2 text-[10px] text-[#38BDF8]">
                            Sorted view active: drag is disabled while sorted by {sortMode}.
                        </div>
                    )}
                    <SortableContext id={col.id} items={tasksInColumn.map((task) => task.task.id)} strategy={verticalListSortingStrategy}>
                        <div ref={setNodeRef} className="mt-3 flex min-h-[50px] flex-1 flex-col space-y-3 overflow-y-auto pr-1 custom-scrollbar-slim">
                            {tasksInColumn.map((taskView) => (
                                <SortableTaskCard
                                    key={taskView.task.id}
                                    task={taskView.task}
                                    taskView={taskView}
                                    isSelected={selectedTaskId === taskView.task.id}
                                    onClick={() => setSelectedTaskId(taskView.task.id)}
                                    onAnalyze={() => onAnalyzeTask(taskView.task.id)}
                                    onOpenExternal={() => onOpenExternal(taskView.task.id)}
                                    onOpenHandoff={() => setSelectedTaskId(taskView.task.id)}
                                    onCopyReference={() => onCopyReference(taskView.task.id)}
                                    dragDisabled={dragDisabled}
                                />
                            ))}
                            {sourceMode === "manual" && (
                                <button
                                    type="button"
                                    onClick={() => onAddTask(col.id)}
                                    className="group mt-2 flex h-20 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#2A2A3A] transition-all hover:border-[#A78BFA]/30 hover:bg-[#A78BFA]/5"
                                >
                                    <Plus className="h-5 w-5 text-[#6B7280] transition-colors group-hover:text-[#A78BFA]" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280] group-hover:text-[#A78BFA]">New Task</span>
                                </button>
                            )}
                            <div className="h-px w-full pointer-events-none" />
                        </div>
                    </SortableContext>
                </>
            )}
        </div>
    )
}
