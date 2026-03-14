import type { TriageSection, TaskViewModel } from "@/lib/tasks"
import { TaskCard } from "./TaskCard"

interface TaskTriageViewProps {
    sections: TriageSection[]
    selectedTaskId: string | null
    onSelectTask: (taskId: string) => void
    onAnalyzeTask: (task: TaskViewModel["task"]) => void
}

export function TaskTriageView({ sections, selectedTaskId, onSelectTask, onAnalyzeTask }: TaskTriageViewProps) {
    return (
        <div className="space-y-4">
            {sections.map((section) => (
                <section key={section.id} className="rounded-xl border border-[#2A2A3A] bg-[#13131A]">
                    <header className="border-b border-[#2A2A3A] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-[#E2E8F0]">{section.title}</h3>
                                <p className="text-[11px] text-[#6B7280]">{section.description}</p>
                            </div>
                            <div className="rounded-lg border border-[#A78BFA]/20 bg-[#A78BFA]/10 px-2.5 py-1 text-xs font-black text-[#C4B5FD]">
                                {section.tasks.length}
                            </div>
                        </div>
                    </header>
                    <div className="grid grid-cols-2 gap-3 p-4">
                        {section.tasks.map((taskView) => (
                            <TaskCard
                                key={taskView.task.id}
                                task={taskView.task}
                                taskView={taskView}
                                isSelected={selectedTaskId === taskView.task.id}
                                onClick={() => onSelectTask(taskView.task.id)}
                                onAnalyze={() => onAnalyzeTask(taskView.task)}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    )
}
