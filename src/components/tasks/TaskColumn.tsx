import { memo, useState } from "react"
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

export const TaskColumn = memo(function TaskColumn({
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
        <div className={cn("flex h-full shrink-0 flex-col rounded-xl border border-line/50 bg-surface/50 p-3", collapsed ? "w-[160px]" : "w-[320px]")}>
            <div className="flex items-start justify-between gap-2 px-1">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <span className={cn("text-[11px] font-bold tracking-[0.15em]", col.textColor || "text-foreground")}>{col.title}</span>
                        <span className="rounded border border-ui bg-panel-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-ui">
                            {tasksInColumn.length}
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {criticalCount > 0 && <span className="rounded border border-state-danger-border bg-state-danger-soft px-1.5 py-0.5 text-[11px] font-bold text-state-danger">{criticalCount} critical</span>}
                        {dueSoonCount > 0 && <span className="rounded border border-state-warning-border bg-state-warning-soft px-1.5 py-0.5 text-[11px] font-bold text-state-warning">{dueSoonCount} due</span>}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => onFilterColumn(col.id)}
                        className="rounded-md border border-ui bg-app p-1 text-muted-ui hover:text-state-info"
                        title="Filter to this column"
                    >
                        <Filter className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setCollapsed((value) => !value)}
                        className="rounded-md border border-ui bg-app p-1 text-muted-ui hover:text-foreground"
                        title={collapsed ? "Expand column" : "Collapse column"}
                    >
                        {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                    </button>
                </div>
            </div>

            {!collapsed && (
                <>
                    {dragDisabled && (
                        <div className="mt-3 rounded-lg border border-state-info-border bg-state-info-soft px-3 py-2 text-[11px] text-state-info">
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
                                    className="group mt-2 flex h-20 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ui transition-all hover:border-qa-accent/30 hover:bg-qa-accent/5"
                                >
                                    <Plus className="h-5 w-5 text-muted-ui transition-colors group-hover:text-qa-accent" />
                                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-ui group-hover:text-qa-accent">New Task</span>
                                </button>
                            )}
                            <div className="h-px w-full pointer-events-none" />
                        </div>
                    </SortableContext>
                </>
            )}
        </div>
    )
})
