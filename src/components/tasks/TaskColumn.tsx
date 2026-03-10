import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { Task } from "@/store/useProjectStore"
import { cn } from "@/lib/utils"
import { Plus } from "lucide-react"
import { SortableTaskCard } from "./TaskCard"

interface TaskColumnProps {
    col: {
        id: string
        title: string
        textColor: string
    }
    tasksInColumn: Task[]
    selectedTaskId: string | null
    setSelectedTaskId: (id: string | null) => void
    sourceMode: string
    onAddTask: () => void
}

export function TaskColumn({ col, tasksInColumn, selectedTaskId, setSelectedTaskId, sourceMode, onAddTask }: TaskColumnProps) {
    const { setNodeRef } = useDroppable({ id: col.id })

    return (
        <div
            className="w-[300px] shrink-0 flex flex-col gap-3 bg-[#13131A]/50 rounded-xl border border-[#2A2A3A]/50 p-3"
        >
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] font-bold tracking-[0.15em]", col.textColor)}>{col.title}</span>
                    <span className="text-[10px] font-bold text-[#6B7280] bg-[#1A1A24] px-1.5 py-0.5 rounded border border-[#2A2A3A]">
                        {tasksInColumn.length}
                    </span>
                </div>
            </div>

            <SortableContext
                id={col.id}
                items={tasksInColumn.map((t: Task) => t.id)}
                strategy={verticalListSortingStrategy}
            >
                <div
                    ref={setNodeRef}
                    className="flex-1 overflow-y-auto custom-scrollbar-slim space-y-3 pr-1 min-h-[50px]"
                >
                    {tasksInColumn.map((task: Task) => (
                        <SortableTaskCard
                            key={task.id}
                            task={task}
                            isSelected={selectedTaskId === task.id}
                            onClick={() => setSelectedTaskId(task.id)}
                        />
                    ))}
                    {col.id === 'todo' && sourceMode === 'manual' && (
                        <button
                            onClick={onAddTask}
                            className="w-full h-20 rounded-xl border-2 border-dashed border-[#2A2A3A] hover:border-[#A78BFA]/30 hover:bg-[#A78BFA]/5 transition-all flex flex-col items-center justify-center gap-2 group mt-2"
                        >
                            <Plus className="h-5 w-5 text-[#6B7280] group-hover:text-[#A78BFA] transition-colors" />
                            <span className="text-[10px] font-bold text-[#6B7280] group-hover:text-[#A78BFA] uppercase tracking-widest">New Task</span>
                        </button>
                    )}
                    <div className="h-px w-full pointer-events-none" />
                </div>
            </SortableContext>
        </div>
    )
}
