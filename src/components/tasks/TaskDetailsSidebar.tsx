import { useEffect, useMemo, useState } from "react"
import {
    Activity as ActivityIcon,
    Calendar,
    ExternalLink,
    Loader2,
    MessageSquare,
    Tag,
    Target,
    Trash2,
    User,
    X
} from "lucide-react"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import FormattedText from "@/components/FormattedText"
import { Project, Task, TaskStatus, useProjectStore } from "@/store/useProjectStore"
import { DetailItem, MediaSection } from "./TaskDetailsComponents"
import { HandoffPanel } from "./HandoffPanel"
import { TraceabilityPanel } from "./TraceabilityPanel"
import { CollaborationTimeline } from "./CollaborationTimeline"
import { TaskStateBadge, collabStateLabel, collabStateTone, dueStateTone, handoffStateTone } from "./TaskStateBadge"
import { deriveTaskViewModels } from "@/lib/tasks"
import { getConnectionApiKey } from "@/lib/credentials"
import { PresenceAvatars } from "@/components/sync/PresenceAvatars"
import { getTaskWorkflowSummary } from "@/lib/collaboration"

interface TaskDetailsSidebarProps {
    selectedTask: Task | null
    activeProject: Project | undefined
    currentColumns: Array<{ id: string; title: string; textColor?: string }>
    onClose: () => void
    onUpdateTask: (updates: Partial<Task>) => Promise<void>
    onAnalyze: (task: Task) => Promise<void>
    isAnalyzing: boolean
    onGenerateBugReport: () => Promise<void>
    onDeleteAnalysis: (entry: any) => void
    onDelete: () => void
    api: any
}

function SectionTitle({ children }: { children: string }) {
    return <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">{children}</h3>
}

export function TaskDetailsSidebar({
    selectedTask,
    activeProject,
    currentColumns,
    onClose,
    onUpdateTask,
    onAnalyze,
    isAnalyzing,
    onGenerateBugReport,
    onDeleteAnalysis,
    onDelete,
    api
}: TaskDetailsSidebarProps) {
    const [activeTab, setActiveTab] = useState("overview")
    const [isEditing, setIsEditing] = useState(false)
    const [draft, setDraft] = useState<Partial<Task>>({})
    const [comments, setComments] = useState<any[]>([])
    const [commentsError, setCommentsError] = useState<string | null>(null)
    const [activity, setActivity] = useState<any[]>([])
    const [newComment, setNewComment] = useState("")
    const [isLoadingTab, setIsLoadingTab] = useState(false)
    const [isPostingComment, setIsPostingComment] = useState(false)
    const getTaskTraceability = useProjectStore((state) => state.getTaskTraceability)

    useEffect(() => {
        if (!selectedTask) return
        setDraft({
            title: selectedTask.title,
            description: selectedTask.description,
            status: selectedTask.status,
            priority: selectedTask.priority,
            severity: selectedTask.severity || "major",
            acceptanceCriteria: selectedTask.acceptanceCriteria || "",
            version: selectedTask.version || "",
            assignee: selectedTask.assignee || "",
            labels: selectedTask.labels || "",
            components: selectedTask.components || [],
            dueDate: selectedTask.dueDate
        })
        setIsEditing(false)
        setActiveTab("overview")
    }, [selectedTask?.id])

    const traceability = useMemo(() => {
        if (!activeProject || !selectedTask) return null
        return getTaskTraceability(activeProject.id, selectedTask.id)
    }, [activeProject, selectedTask, getTaskTraceability])

    const taskView = useMemo(() => {
        if (!activeProject || !selectedTask) return null
        return deriveTaskViewModels(activeProject).find((entry) => entry.task.id === selectedTask.id) || null
    }, [activeProject, selectedTask])
    const workflowSummary = useMemo(() => {
        if (!activeProject || !selectedTask) return null
        return getTaskWorkflowSummary(activeProject, selectedTask)
    }, [activeProject, selectedTask])

    const timelineEvents = (activeProject?.collaborationEvents || []).filter((event) => event.taskId === selectedTask?.id)
    const activeHandoff = traceability?.activeHandoff || traceability?.handoffs?.[0]
    const statusLabel = currentColumns.find((col) => col.id === selectedTask?.status)?.title || selectedTask?.status || "Unknown"

    const loadTabContent = async (tab: string) => {
        setActiveTab(tab)
        if (!selectedTask || !["comments", "activity"].includes(tab)) return
        setIsLoadingTab(true)
        if (tab === "comments") setCommentsError(null)
        try {
            if (tab === "comments") {
                if (selectedTask.source === "linear") {
                    const key = await getConnectionApiKey(api, "linear_api_key", selectedTask.connectionId, activeProject?.id)
                    if (!key) throw new Error("Linear API key not configured.")
                    setComments(await api.getLinearComments({ apiKey: key, issueId: selectedTask.sourceIssueId }))
                } else if (selectedTask.source === "jira") {
                    const conn = activeProject?.jiraConnections?.find((item) => item.id === selectedTask.connectionId)
                    const apiKey = await getConnectionApiKey(api, "jira_api_token", selectedTask.connectionId, activeProject?.id)
                    if (!conn || !apiKey) throw new Error("Jira credentials not configured.")
                    setComments(await api.getJiraComments({ domain: conn.domain, email: conn.email, apiKey, issueKey: selectedTask.sourceIssueId }))
                }
            }
            if (tab === "activity") {
                if (selectedTask.source === "linear") {
                    const key = await getConnectionApiKey(api, "linear_api_key", selectedTask.connectionId, activeProject?.id)
                    if (key) setActivity(await api.getLinearHistory({ apiKey: key, issueId: selectedTask.sourceIssueId }))
                } else if (selectedTask.source === "jira") {
                    const conn = activeProject?.jiraConnections?.find((item) => item.id === selectedTask.connectionId)
                    const apiKey = await getConnectionApiKey(api, "jira_api_token", selectedTask.connectionId, activeProject?.id)
                    if (conn && apiKey) setActivity(await api.getJiraHistory({ domain: conn.domain, email: conn.email, apiKey, issueKey: selectedTask.sourceIssueId }))
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to load task data."
            if (tab === "comments") setCommentsError(message)
            else toast.error(message)
        } finally {
            setIsLoadingTab(false)
        }
    }

    const handleSave = async () => {
        await onUpdateTask({
            ...draft,
            components: Array.isArray(draft.components)
                ? draft.components
                : String(draft.components || "").split(",").map((value) => value.trim()).filter(Boolean)
        })
        setIsEditing(false)
    }

    const handlePostComment = async () => {
        if (!selectedTask || !newComment.trim()) return
        setIsPostingComment(true)
        try {
            if (selectedTask.source === "linear") {
                const apiKey = await getConnectionApiKey(api, "linear_api_key", selectedTask.connectionId, activeProject?.id)
                if (!apiKey) throw new Error("Linear API key not configured.")
                await api.addLinearComment({ apiKey, issueId: selectedTask.externalId, body: newComment })
            } else if (selectedTask.source === "jira") {
                const conn = activeProject?.jiraConnections?.find((item) => item.id === selectedTask.connectionId)
                const apiKey = await getConnectionApiKey(api, "jira_api_token", selectedTask.connectionId, activeProject?.id)
                if (!conn || !apiKey) throw new Error("Jira credentials not configured.")
                await api.addJiraComment({ domain: conn.domain, email: conn.email, apiKey, issueKey: selectedTask.sourceIssueId, body: newComment })
            } else {
                throw new Error("Comments are only available for synced tasks.")
            }
            setNewComment("")
            await loadTabContent("comments")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to post comment.")
        } finally {
            setIsPostingComment(false)
        }
    }

    if (!selectedTask) return null

    return (
        <div className="flex w-full max-w-[520px] shrink-0 flex-col overflow-hidden border-l border-[#2A2A3A] bg-[#13131A] shadow-2xl">
            <div className="space-y-4 border-b border-[#2A2A3A] p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">{selectedTask.sourceIssueId || selectedTask.externalId || "MANUAL TASK"}</p>
                        <h2 className="text-lg font-semibold leading-tight text-[#E2E8F0]">{selectedTask.title}</h2>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B7280] hover:text-[#E2E8F0]" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="space-y-3 rounded-xl border border-[#2A2A3A] bg-[#0F0F13] p-4">
                    <div className="flex flex-wrap gap-2">
                        <TaskStateBadge label={statusLabel} tone="neutral" />
                        <TaskStateBadge label={collabStateLabel(selectedTask.collabState)} tone={collabStateTone(selectedTask.collabState)} />
                        {taskView?.handoffState === "incomplete" ? <TaskStateBadge label={`Need ${taskView.handoffMissingFields[0] || "evidence"}`} tone={handoffStateTone(taskView.handoffState)} /> : null}
                        {taskView && taskView.dueState !== "none" && taskView.dueLabel ? <TaskStateBadge label={taskView.dueLabel} tone={dueStateTone(taskView.dueState)} /> : null}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs text-[#9CA3AF]">
                        <div>
                            <span className="text-[#6B7280]">Assignee</span>
                            <p className="mt-1 text-[#E2E8F0]">{selectedTask.assignee || "Unassigned"}</p>
                        </div>
                        <div>
                            <span className="text-[#6B7280]">Due date</span>
                            <p className="mt-1 text-[#E2E8F0]">{selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : "No date"}</p>
                        </div>
                        <div>
                            <span className="text-[#6B7280]">Components</span>
                            <p className="mt-1 text-[#E2E8F0]">{selectedTask.components?.join(", ") || "No components"}</p>
                        </div>
                        <div>
                            <span className="text-[#6B7280]">Handoff</span>
                            <p className="mt-1 text-[#E2E8F0]">{activeHandoff ? (activeHandoff.isComplete ? "Complete" : "Needs fields") : "No handoff"}</p>
                        </div>
                    </div>
                    {workflowSummary ? <p className="text-sm text-[#E2E8F0]">{workflowSummary.nextAction}</p> : null}
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={loadTabContent} variant="underline" className="flex min-h-0 flex-1 flex-col">
                <div className="overflow-x-auto border-b border-[#2A2A3A] custom-scrollbar">
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="collaboration">Collaboration</TabsTrigger>
                        <TabsTrigger value="traceability">Traceability</TabsTrigger>
                        <TabsTrigger value="comments">Comments</TabsTrigger>
                        <TabsTrigger value="history">History</TabsTrigger>
                        <TabsTrigger value="activity">Activity</TabsTrigger>
                    </TabsList>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <TabsContent value="overview" className="m-0 space-y-5">
                        <div className="flex items-center justify-between">
                            <SectionTitle>Overview</SectionTitle>
                            <Button variant="outline" className="border-[#2A2A3A] text-[#E2E8F0]" onClick={() => setIsEditing((value) => !value)}>
                                {isEditing ? "Cancel Edit" : "Edit Task"}
                            </Button>
                        </div>
                        {isEditing ? (
                            <div className="space-y-4">
                                <Input value={String(draft.title || "")} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className="border-[#2A2A3A] bg-[#1A1A24] text-sm" />
                                <Textarea value={String(draft.acceptanceCriteria || "")} onChange={(event) => setDraft((current) => ({ ...current, acceptanceCriteria: event.target.value }))} placeholder="Acceptance criteria" className="min-h-[90px] border-[#2A2A3A] bg-[#1A1A24] text-sm" />
                                <Textarea value={String(draft.description || "")} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Description" className="min-h-[140px] border-[#2A2A3A] bg-[#1A1A24] text-sm" />
                                <div className="grid grid-cols-2 gap-4">
                                    <select value={String(draft.status || selectedTask.status)} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as TaskStatus }))} className="h-10 rounded-md border border-[#2A2A3A] bg-[#1A1A24] px-3 text-xs text-[#E2E8F0]">
                                        {currentColumns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}
                                    </select>
                                    <Input value={String(draft.assignee || "")} onChange={(event) => setDraft((current) => ({ ...current, assignee: event.target.value }))} placeholder="Assignee" className="border-[#2A2A3A] bg-[#1A1A24] text-sm" />
                                    <Input value={String(draft.version || "")} onChange={(event) => setDraft((current) => ({ ...current, version: event.target.value }))} placeholder="Version" className="border-[#2A2A3A] bg-[#1A1A24] text-sm" />
                                    <Input type="date" value={draft.dueDate ? new Date(draft.dueDate).toISOString().slice(0, 10) : ""} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value ? new Date(event.target.value).getTime() : undefined }))} className="border-[#2A2A3A] bg-[#1A1A24] text-sm" />
                                    <Input value={String(draft.labels || "")} onChange={(event) => setDraft((current) => ({ ...current, labels: event.target.value }))} placeholder="Labels" className="border-[#2A2A3A] bg-[#1A1A24] text-sm" />
                                    <Input value={Array.isArray(draft.components) ? draft.components.join(", ") : String(draft.components || "")} onChange={(event) => setDraft((current) => ({ ...current, components: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) }))} placeholder="Components" className="border-[#2A2A3A] bg-[#1A1A24] text-sm" />
                                </div>
                                <Button className="w-full bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD]" onClick={handleSave}>Save Changes</Button>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <div>
                                    <SectionTitle>Acceptance Criteria</SectionTitle>
                                    <div className="mt-2 rounded-xl border border-[#2A2A3A] bg-[#1A1A24] p-4 text-sm leading-relaxed text-[#E2E8F0]">
                                        <FormattedText content={selectedTask.acceptanceCriteria || "No acceptance criteria yet."} source={selectedTask.source} connectionId={selectedTask.connectionId} projectId={activeProject?.id} />
                                    </div>
                                </div>
                                <div>
                                    <SectionTitle>Description</SectionTitle>
                                    <div className="mt-2 rounded-xl border border-[#2A2A3A] bg-[#1A1A24] p-4 text-sm leading-relaxed text-[#E2E8F0]">
                                        <FormattedText content={selectedTask.description || "No description yet."} source={selectedTask.source} connectionId={selectedTask.connectionId} projectId={activeProject?.id} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <DetailItem icon={User} label="ASSIGNEE" value={selectedTask.assignee || "Unassigned"} />
                                    <DetailItem icon={Calendar} label="DUE DATE" value={selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : "No date"} />
                                    <DetailItem icon={Tag} label="LABELS" value={selectedTask.labels || "No labels"} />
                                    <DetailItem icon={Tag} label="COMPONENTS" value={selectedTask.components?.join(", ") || "No components"} />
                                </div>
                                <MediaSection task={selectedTask} projectId={activeProject?.id} onImageClick={(url) => api.openUrl(url)} />
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="collaboration" className="m-0 space-y-5">
                        <div>
                            <div className="flex items-center justify-between">
                                <SectionTitle>Collaboration</SectionTitle>
                                <PresenceAvatars taskId={selectedTask.id} />
                            </div>
                            <p className="mt-2 text-xs text-[#9CA3AF]">Track handoff completeness, PR context, release state, and QA verification without leaving the drawer.</p>
                        </div>
                        {activeProject ? <HandoffPanel activeProject={activeProject} task={selectedTask} /> : null}
                        {timelineEvents.length > 0 && (
                            <div>
                                <SectionTitle>Recent Timeline</SectionTitle>
                                <div className="mt-3">
                                    <CollaborationTimeline events={timelineEvents.slice(0, 6)} />
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="traceability" className="m-0 space-y-5">
                        <div>
                            <SectionTitle>Traceability</SectionTitle>
                            <p className="mt-2 text-xs text-[#9CA3AF]">Coverage is derived from linked test cases, linked defects, and shared component tags.</p>
                        </div>
                        {traceability ? <TraceabilityPanel traceability={traceability} /> : null}
                    </TabsContent>

                    <TabsContent value="comments" className="m-0 space-y-4">
                        {isLoadingTab ? (
                            <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#A78BFA]" /></div>
                        ) : commentsError ? (
                            <div className="rounded-xl border border-[#EF4444]/20 bg-[#EF4444]/10 p-4 text-xs text-[#FCA5A5]">{commentsError}</div>
                        ) : comments.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center opacity-40">
                                <MessageSquare className="mb-2 h-10 w-10" />
                                <p className="text-xs font-bold uppercase tracking-wider">No comments yet</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {comments.map((comment, index) => (
                                    <div key={index} className="rounded-xl border border-[#2A2A3A] bg-[#1A1A24] p-3">
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-[#A78BFA]">{comment.authorName}</span>
                                            <span className="text-[9px] text-[#6B7280]">{new Date(comment.createdAt).toLocaleString()}</span>
                                        </div>
                                        <div className="text-xs text-[#E2E8F0]">
                                            <FormattedText content={comment.body} source={selectedTask.source} connectionId={selectedTask.connectionId} projectId={activeProject?.id} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {(selectedTask.externalId || selectedTask.sourceIssueId) && selectedTask.source !== "manual" && (
                            <div className="flex gap-2 border-t border-[#2A2A3A] pt-4">
                                <Input value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder="Add a comment..." className="h-10 border-[#2A2A3A] bg-[#1A1A24] text-xs" />
                                <Button className="bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD]" onClick={handlePostComment} disabled={isPostingComment || !newComment.trim()}>
                                    {isPostingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
                                </Button>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="history" className="m-0 space-y-4">
                        {!selectedTask.analysisHistory?.length ? (
                            <div className="py-10 text-center opacity-40">
                                <p className="text-xs font-bold uppercase tracking-wider">No analysis history</p>
                            </div>
                        ) : (
                            [...selectedTask.analysisHistory].sort((left, right) => right.version - left.version).map((entry) => (
                                <div key={entry.hash} className="rounded-xl border border-[#2A2A3A] bg-[#1A1A24] p-4">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-[#6B7280]">{new Date(entry.timestamp).toLocaleString()}</span>
                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-[#6B7280] hover:text-[#EF4444]" onClick={() => onDeleteAnalysis(entry)}>
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <div className="text-[11px] text-[#E2E8F0]">
                                        <FormattedText content={entry.summary} source={selectedTask.source} connectionId={selectedTask.connectionId} projectId={activeProject?.id} />
                                    </div>
                                </div>
                            ))
                        )}
                    </TabsContent>

                    <TabsContent value="activity" className="m-0 space-y-4">
                        {isLoadingTab ? (
                            <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#A78BFA]" /></div>
                        ) : activity.length === 0 ? (
                            <div className="py-10 text-center opacity-40">
                                <p className="text-xs font-bold uppercase tracking-wider">No activity recorded</p>
                            </div>
                        ) : (
                            activity.map((item, index) => (
                                <div key={`${item.timestamp}-${index}`} className="rounded-xl border border-[#2A2A3A] bg-[#1A1A24] p-4">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-[#E2E8F0]">{item.author}</span>
                                        <span className="text-[10px] text-[#6B7280]">{new Date(item.timestamp).toLocaleString()}</span>
                                    </div>
                                    <div className="text-[11px] text-[#9CA3AF]">
                                        {item.fromValue ? `${item.fromValue} -> ` : ""}<span className="font-semibold text-[#38BDF8]">{item.toValue}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </TabsContent>
                </div>
            </Tabs>

            <div className="space-y-2 border-t border-[#2A2A3A] bg-[#0F0F13] p-5">
                <Button className="w-full gap-2 bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD]" onClick={() => onAnalyze(selectedTask)} disabled={isAnalyzing}>
                    {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ActivityIcon className="h-4 w-4" />}
                    {isAnalyzing ? "ANALYZING..." : "ANALYZE ISSUE"}
                </Button>
                <Button className="w-full gap-1.5 border border-[#10B981]/20 bg-[#1E2A1E] text-[10px] font-bold text-[#10B981]" onClick={onGenerateBugReport}>
                    <Target className="h-3.5 w-3.5" /> GENERATE BUG REPORT
                </Button>
                {selectedTask.source !== "manual" && selectedTask.ticketUrl && (
                    <Button className="w-full gap-1.5 border border-[#A78BFA]/20 bg-[#1A1A24] text-[10px] font-bold text-[#A78BFA]" onClick={() => api.openUrl(selectedTask.ticketUrl)}>
                        <ExternalLink className="h-3.5 w-3.5" /> OPEN SOURCE TICKET
                    </Button>
                )}
                <Button className="w-full gap-1.5 border border-[#EF4444]/20 bg-[#1E1010] text-[10px] font-bold text-[#EF4444]" onClick={onDelete}>
                    <Trash2 className="h-3.5 w-3.5" /> DELETE TASK
                </Button>
            </div>
        </div>
    )
}
