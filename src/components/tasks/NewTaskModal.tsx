import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Project, TaskStatus } from "@/store/useProjectStore"
import { toast } from "sonner"

interface NewTaskModalProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    activeProject: Project | undefined
    currentColumns: Array<{ id: string; title: string }>
    onConfirm: (taskData: any) => Promise<void>
    initialStatus?: string | null
}

type TaskTemplate = "bug" | "story" | "investigation" | "retest_request"

const templates: Record<TaskTemplate, { titlePrefix: string; severity: "major" | "critical" | "minor"; priority: "medium" | "high"; acceptanceCriteria: string; description: string }> = {
    bug: {
        titlePrefix: "[BUG] ",
        severity: "major",
        priority: "high",
        acceptanceCriteria: "Given the affected workflow,\nWhen the issue is reproduced,\nThen the expected result should occur without regression.",
        description: "Steps to reproduce:\n1.\n2.\n3.\n\nExpected result:\nActual result:"
    },
    story: {
        titlePrefix: "",
        severity: "minor",
        priority: "medium",
        acceptanceCriteria: "Given the intended user flow,\nWhen the work is complete,\nThen the outcome is testable and releasable.",
        description: "Context:\n\nImplementation notes:"
    },
    investigation: {
        titlePrefix: "[INVESTIGATE] ",
        severity: "minor",
        priority: "medium",
        acceptanceCriteria: "Investigation completes with clear findings, impacted scope, and next-step recommendation.",
        description: "Observed behavior:\n\nSuspected area:\n\nQuestions to answer:"
    },
    retest_request: {
        titlePrefix: "[RETEST] ",
        severity: "major",
        priority: "high",
        acceptanceCriteria: "QA can verify the fix on the target branch or release build with linked evidence.",
        description: "Fix context:\n\nBranch / build:\n\nRetest focus:"
    }
}

export function NewTaskModal({ isOpen, onOpenChange, activeProject, currentColumns, onConfirm, initialStatus }: NewTaskModalProps) {
    const [newTaskTitle, setNewTaskTitle] = useState("")
    const [newTaskDescription, setNewTaskDescription] = useState("")
    const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("todo")
    const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high" | "critical">("medium")
    const [newTaskSeverity, setNewTaskSeverity] = useState<"cosmetic" | "minor" | "major" | "critical" | "blocker">("major")
    const [newTaskAcceptanceCriteria, setNewTaskAcceptanceCriteria] = useState("")
    const [newTaskVersion, setNewTaskVersion] = useState("")
    const [newTaskSource, setNewTaskSource] = useState<"manual" | "linear" | "jira">("manual")
    const [newTaskLabels, setNewTaskLabels] = useState("")
    const [newTaskConnectionId, setNewTaskConnectionId] = useState("")
    const [newTaskAssignee, setNewTaskAssignee] = useState("")
    const [newTaskDueDate, setNewTaskDueDate] = useState("")
    const [newTaskComponents, setNewTaskComponents] = useState("")
    const [taskTemplate, setTaskTemplate] = useState<TaskTemplate>("story")
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setNewTaskStatus((initialStatus as TaskStatus) || "todo")
        }
    }, [initialStatus, isOpen])

    const resetForm = () => {
        setNewTaskTitle("")
        setNewTaskDescription("")
        setNewTaskStatus((initialStatus as TaskStatus) || "todo")
        setNewTaskPriority("medium")
        setNewTaskSeverity("major")
        setNewTaskAcceptanceCriteria("")
        setNewTaskVersion("")
        setNewTaskSource("manual")
        setNewTaskLabels("")
        setNewTaskConnectionId("")
        setNewTaskAssignee("")
        setNewTaskDueDate("")
        setNewTaskComponents("")
        setTaskTemplate("story")
    }

    const applyTemplate = (template: TaskTemplate) => {
        const config = templates[template]
        setTaskTemplate(template)
        setNewTaskPriority(config.priority)
        setNewTaskSeverity(config.severity)
        setNewTaskAcceptanceCriteria(config.acceptanceCriteria)
        setNewTaskDescription(config.description)
        setNewTaskTitle((current) => {
            const stripped = current.replace(/^\[(BUG|INVESTIGATE|RETEST)\]\s*/i, "")
            return `${config.titlePrefix}${stripped}`.trimStart()
        })
    }

    const handleConfirm = async () => {
        setIsSubmitting(true)
        try {
            await onConfirm({
                title: newTaskTitle,
                description: newTaskDescription,
                status: newTaskStatus,
                priority: newTaskPriority,
                severity: newTaskSeverity,
                acceptanceCriteria: newTaskAcceptanceCriteria,
                version: newTaskVersion,
                source: newTaskSource,
                labels: newTaskLabels,
                connectionId: newTaskConnectionId,
                assignee: newTaskAssignee || undefined,
                dueDate: newTaskDueDate ? new Date(newTaskDueDate).getTime() : undefined,
                components: newTaskComponents.split(",").map((value) => value.trim()).filter(Boolean)
            })
            resetForm()
        } catch {
            toast.error("Failed to create task. Please try again.")
        } finally {
            setIsSubmitting(false)
        }
    }

    const noExternalConnections = newTaskSource === "linear"
        ? (activeProject?.linearConnections?.length ?? 0) === 0
        : newTaskSource === "jira"
            ? (activeProject?.jiraConnections?.length ?? 0) === 0
            : false

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] overflow-hidden border-[#2A2A3A] bg-[#13131A] p-0 shadow-2xl sm:max-w-[760px]">
                <DialogHeader className="border-b border-[#2A2A3A] p-6 pb-4">
                    <DialogTitle className="text-xl font-bold tracking-tight text-[#E2E8F0]">Create Task</DialogTitle>
                </DialogHeader>

                <div className="max-h-[calc(92vh-140px)] space-y-6 overflow-y-auto p-6">
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Source</Label>
                            <div className="flex rounded-lg border border-[#2A2A3A] bg-[#1A1A24] p-1">
                                {(["manual", "linear", "jira"] as const).map((source) => (
                                    <Button
                                        key={source}
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setNewTaskSource(source)}
                                        className={cn("h-8 text-[11px] font-bold", newTaskSource === source ? "bg-[#2A2A3A]/80 text-[#A78BFA]" : "text-[#6B7280] hover:text-[#E2E8F0]")}
                                    >
                                        {source.charAt(0).toUpperCase() + source.slice(1)}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {newTaskSource !== "manual" && (
                            <div className="rounded-xl border border-[#2A2A3A] bg-[#0F0F13] p-4">
                                <div className="mb-3 text-[11px] text-[#9CA3AF]">
                                    Upstream ticket fields sync from {newTaskSource}. Components, QA notes, linked tests, handoffs, and due dates remain local enrichment after sync.
                                </div>
                                <Select value={newTaskConnectionId} onValueChange={setNewTaskConnectionId}>
                                    <SelectTrigger className="h-10 border-[#2A2A3A] bg-[#1A1A24] text-xs text-[#E2E8F0]">
                                        <SelectValue placeholder={`Select ${newTaskSource} connection`} />
                                    </SelectTrigger>
                                    <SelectContent className="border-[#2A2A3A] bg-[#1A1A24]">
                                        {newTaskSource === "linear"
                                            ? activeProject?.linearConnections?.map((connection) => (
                                                <SelectItem key={connection.id} value={connection.id}>{connection.label || connection.teamId}</SelectItem>
                                            ))
                                            : activeProject?.jiraConnections?.map((connection) => (
                                                <SelectItem key={connection.id} value={connection.id}>{connection.label || `${connection.domain} - ${connection.projectKey}`}</SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                                {noExternalConnections && (
                                    <p className="mt-3 text-[11px] text-[#F59E0B]">No {newTaskSource} connections configured. Add one in Settings before creating upstream work.</p>
                                )}
                            </div>
                        )}
                    </section>

                    <section className="space-y-3">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Template</Label>
                        <div className="grid grid-cols-4 gap-2">
                            {(["bug", "story", "investigation", "retest_request"] as const).map((template) => (
                                <Button
                                    key={template}
                                    type="button"
                                    variant="ghost"
                                    onClick={() => applyTemplate(template)}
                                    className={cn("h-10 rounded-xl border border-[#2A2A3A] bg-[#0F0F13] text-[11px] font-bold text-[#9CA3AF]", taskTemplate === template && "border-[#A78BFA]/40 bg-[#A78BFA]/10 text-[#C4B5FD]")}
                                >
                                    {template.replace("_", " ")}
                                </Button>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-4">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Core Details</Label>
                        <Input
                            autoFocus
                            value={newTaskTitle}
                            onChange={(event) => setNewTaskTitle(event.target.value)}
                            placeholder="Task title"
                            className="h-10 border-[#2A2A3A] bg-[#1A1A24] text-sm"
                        />
                        <Textarea
                            value={newTaskAcceptanceCriteria}
                            onChange={(event) => setNewTaskAcceptanceCriteria(event.target.value)}
                            placeholder="Acceptance criteria"
                            className="min-h-[86px] border-[#2A2A3A] bg-[#1A1A24] text-sm"
                        />
                        <Textarea
                            value={newTaskDescription}
                            onChange={(event) => setNewTaskDescription(event.target.value)}
                            placeholder="Description, context, repro notes, or implementation guidance"
                            className="min-h-[120px] border-[#2A2A3A] bg-[#1A1A24] text-sm"
                        />
                    </section>

                    <section className="space-y-4">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Triage Metadata</Label>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Status</Label>
                                <Select value={newTaskStatus} onValueChange={(value: TaskStatus) => setNewTaskStatus(value)}>
                                    <SelectTrigger className="h-10 border-[#2A2A3A] bg-[#1A1A24] text-xs text-[#E2E8F0]"><SelectValue /></SelectTrigger>
                                    <SelectContent className="border-[#2A2A3A] bg-[#1A1A24]">
                                        {currentColumns.map((col) => <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Priority</Label>
                                <Select value={newTaskPriority} onValueChange={(value: any) => setNewTaskPriority(value)}>
                                    <SelectTrigger className="h-10 border-[#2A2A3A] bg-[#1A1A24] text-xs text-[#E2E8F0]"><SelectValue /></SelectTrigger>
                                    <SelectContent className="border-[#2A2A3A] bg-[#1A1A24]">
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="critical">Critical</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Severity</Label>
                                <Select value={newTaskSeverity} onValueChange={(value: any) => setNewTaskSeverity(value)}>
                                    <SelectTrigger className="h-10 border-[#2A2A3A] bg-[#1A1A24] text-xs text-[#E2E8F0]"><SelectValue /></SelectTrigger>
                                    <SelectContent className="border-[#2A2A3A] bg-[#1A1A24]">
                                        <SelectItem value="cosmetic">Cosmetic</SelectItem>
                                        <SelectItem value="minor">Minor</SelectItem>
                                        <SelectItem value="major">Major</SelectItem>
                                        <SelectItem value="critical">Critical</SelectItem>
                                        <SelectItem value="blocker">Blocker</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Input value={newTaskAssignee} onChange={(event) => setNewTaskAssignee(event.target.value)} placeholder="Assignee" className="h-10 border-[#2A2A3A] bg-[#1A1A24] text-sm" />
                            <Input type="date" value={newTaskDueDate} onChange={(event) => setNewTaskDueDate(event.target.value)} className="h-10 border-[#2A2A3A] bg-[#1A1A24] text-sm" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Input value={newTaskVersion} onChange={(event) => setNewTaskVersion(event.target.value)} placeholder="Release version" className="h-10 border-[#2A2A3A] bg-[#1A1A24] text-sm" />
                            <Input value={newTaskComponents} onChange={(event) => setNewTaskComponents(event.target.value)} placeholder="Components: checkout, payments" className="h-10 border-[#2A2A3A] bg-[#1A1A24] text-sm" />
                        </div>
                        <Input value={newTaskLabels} onChange={(event) => setNewTaskLabels(event.target.value)} placeholder="Labels: bug, ui, regression" className="h-10 border-[#2A2A3A] bg-[#1A1A24] text-sm" />
                    </section>

                    <section className="rounded-xl border border-[#2A2A3A] bg-[#0F0F13] p-4">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Collaboration Hints</Label>
                        <p className="mt-2 text-[11px] leading-relaxed text-[#9CA3AF]">
                            Use components and acceptance criteria if this task should link back to tests. For bug and retest work, add enough context so the handoff packet can be completed with minimal rework.
                        </p>
                    </section>
                </div>

                <DialogFooter className="gap-2 border-t border-[#2A2A3A] bg-[#13131A] p-6 pt-4">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-xs font-bold text-[#6B7280] hover:text-[#E2E8F0]">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={isSubmitting || !newTaskTitle.trim() || (newTaskSource !== "manual" && (!newTaskConnectionId || noExternalConnections))}
                        className="h-10 bg-[#A78BFA] px-8 text-xs font-bold text-[#0F0F13] hover:bg-[#C4B5FD]"
                    >
                        {isSubmitting ? "CREATING..." : newTaskSource === "manual" ? "CREATE TASK" : `CREATE IN ${newTaskSource.toUpperCase()}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
