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
                <section key={section.id} className="rounded-xl border border-ui bg-panel">
                    <header className="border-b border-ui px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                                <p className="text-[11px] text-muted-ui">{section.description}</p>
                            </div>
                            <div className="rounded-lg border border-qa-accent/20 bg-qa-accent/10 px-2.5 py-1 text-xs font-black text-brand">
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
