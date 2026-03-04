import { useState, useMemo } from "react"
import { useProjectStore, Task, TaskStatus } from "@/store/useProjectStore"
import {
    Plus,
    Trash2,
    Clock,
    Search,
    User,
    Calendar,
    Tag,
    X,
    ExternalLink,
    MessageSquare,
    Activity,
    Target,
    Send,
    RefreshCw,
    Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragOverEvent,
} from "@dnd-kit/core"
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import FormattedText from "@/components/FormattedText"

const COLUMNS: { id: TaskStatus; title: string, color: string, textColor: string }[] = [
    { id: 'backlog', title: 'BACKLOG', color: 'bg-[#9CA3AF]', textColor: 'text-[#9CA3AF]' },
    { id: 'todo', title: 'TODO', color: 'bg-[#6B7280]', textColor: 'text-[#6B7280]' },
    { id: 'in-progress', title: 'IN PROGRESS', color: 'bg-[#3B82F6]', textColor: 'text-[#3B82F6]' },
    { id: 'in-review', title: 'IN REVIEW', color: 'bg-[#A78BFA]', textColor: 'text-[#A78BFA]' },
    { id: 'done', title: 'DONE', color: 'bg-[#10B981]', textColor: 'text-[#10B981]' },
    { id: 'canceled', title: 'CANCELED', color: 'bg-[#EF4444]', textColor: 'text-[#EF4444]' },
    { id: 'duplicate', title: 'DUPLICATE', color: 'bg-[#F59E0B]', textColor: 'text-[#F59E0B]' },
]

export default function TasksPage() {
    const api = window.electronAPI as any
    const { projects, activeProjectId, addTask, deleteTask, moveTask, updateProject, loadProjects } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const tasks = activeProject?.tasks || []

    const [activeTask, setActiveTask] = useState<Task | null>(null)
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [sourceMode, setSourceMode] = useState<'manual' | 'linear' | 'jira'>('manual')
    const [isSyncing, setIsSyncing] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analysisResult, setAnalysisResult] = useState<string | null>(null)
    const [comments, setComments] = useState<any[]>([])
    const [history, setHistory] = useState<any[]>([])
    const [worklog, setWorklog] = useState<any[]>([])
    const [isLoadingTab, setIsLoadingTab] = useState(false)
    const [newComment, setNewComment] = useState("")
    const [isPostingComment, setIsPostingComment] = useState(false)


    const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId) || null, [tasks, selectedTaskId])

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const filteredTasks = useMemo(() => {
        return tasks.filter(t =>
            t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.sourceIssueId?.toLowerCase().includes(searchQuery.toLowerCase())
        )
    }, [tasks, searchQuery])

    const tasksByColumn = useMemo(() => {
        return COLUMNS.reduce((acc, col) => {
            acc[col.id] = filteredTasks.filter(t => t.status === col.id)
            return acc
        }, {} as Record<TaskStatus, Task[]>)
    }, [filteredTasks])

    const handleAddTask = () => {
        if (!activeProjectId) return
        const title = prompt("Task title:")
        if (title) addTask(activeProjectId, title).catch(console.error)
    }

    const handleSync = async () => {
        if (!activeProjectId || !activeProject) return
        setIsSyncing(true)
        try {
            const prefix = activeProject ? `project:${activeProject.id}:` : ''
            if (sourceMode === 'linear') {
                const conns = activeProject.linearConnections || []
                if (conns.length === 0) {
                    // Try legacy global key
                    const apiKey = await api.secureStoreGet(`${prefix}linear_api_key`) || await api.secureStoreGet('linear_api_key')
                    if (!apiKey) { alert('Please set your Linear API key in Settings.'); return }
                    const tasks = await api.syncLinear({ apiKey, teamKey: '' })
                    const existing = activeProject.tasks || []
                    const manualTasks = existing.filter((t: any) => t.source !== 'linear')
                    const merged = [...manualTasks, ...tasks]
                    await updateProject(activeProjectId, { tasks: merged })
                } else {
                    let allSyncedTasks: any[] = []
                    for (const conn of conns) {
                        const apiKey = await api.secureStoreGet(`${prefix}linear_api_key_${conn.id}`) || await api.secureStoreGet(`linear_api_key_${conn.id}`)
                        if (apiKey) {
                            const tasks = await api.syncLinear({ apiKey, teamKey: conn.teamId, connectionId: conn.id })
                            allSyncedTasks = [...allSyncedTasks, ...tasks]
                        }
                    }
                    const existing = activeProject.tasks || []
                    const otherSourceTasks = existing.filter((t: any) => t.source !== 'linear')
                    const merged = [...otherSourceTasks, ...allSyncedTasks]
                    await updateProject(activeProjectId, { tasks: merged })
                }
                await loadProjects()
            } else if (sourceMode === 'jira') {
                const conns = activeProject.jiraConnections || []
                if (conns.length === 0) {
                    const domain = await api.secureStoreGet(`${prefix}jira_domain`) || await api.secureStoreGet('jira_domain') || ''
                    const email = await api.secureStoreGet(`${prefix}jira_email`) || await api.secureStoreGet('jira_email') || ''
                    const apiKey = await api.secureStoreGet(`${prefix}jira_api_key`) || await api.secureStoreGet('jira_api_key')
                    if (!domain || !email || !apiKey) { alert('Please configure Jira credentials in Settings.'); return }
                    const tasks = await api.syncJira({ domain, email, apiKey, projectKey: '' })
                    const existing = activeProject.tasks || []
                    const otherSourceTasks = existing.filter((t: any) => t.source !== 'jira')
                    const merged = [...otherSourceTasks, ...tasks]
                    await updateProject(activeProjectId, { tasks: merged })
                } else {
                    let allSyncedTasks: any[] = []
                    for (const conn of conns) {
                        const apiKey = await api.secureStoreGet(`${prefix}jira_api_token_${conn.id}`) || await api.secureStoreGet(`jira_api_token_${conn.id}`)
                        if (apiKey) {
                            const tasks = await api.syncJira({ domain: conn.domain, email: conn.email, apiKey, projectKey: conn.projectKey, connectionId: conn.id })
                            allSyncedTasks = [...allSyncedTasks, ...tasks]
                        }
                    }
                    const existing = activeProject.tasks || []
                    const otherSourceTasks = existing.filter((t: any) => t.source !== 'jira')
                    const merged = [...otherSourceTasks, ...allSyncedTasks]
                    await updateProject(activeProjectId, { tasks: merged })
                }
                await loadProjects()
            }
        } catch (e: any) {
            alert(`Sync failed: ${e.message}`)
        } finally {
            setIsSyncing(false)
        }
    }

    const handleAnalyzeIssue = async () => {
        if (!selectedTask || !activeProject) return
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        const apiKey = await api.secureStoreGet(`${prefix}gemini_api_key`) || await api.secureStoreGet('gemini_api_key')
        if (!apiKey) { alert('Please set your Gemini API key in Settings.'); return }

        setIsAnalyzing(true)
        setAnalysisResult(null)
        try {
            // Fetch comments for context
            let currentComments: any[] = []
            const connId = selectedTask.connectionId
            if (selectedTask.externalId && selectedTask.source === 'linear') {
                const key = await api.secureStoreGet(connId ? `${prefix}linear_api_key_${connId}` : `${prefix}linear_api_key`) || await api.secureStoreGet(connId ? `linear_api_key_${connId}` : 'linear_api_key')
                if (key) {
                    try { currentComments = await api.getLinearComments({ apiKey: key, issueId: selectedTask.externalId }) } catch { /* ignore */ }
                }
            } else if (selectedTask.externalId && selectedTask.source === 'jira') {
                const conn = activeProject?.jiraConnections.find(c => c.id === connId)
                const key = await api.secureStoreGet(connId ? `${prefix}jira_api_token_${connId}` : `${prefix}jira_api_key`) || await api.secureStoreGet(connId ? `jira_api_token_${connId}` : 'jira_api_key')
                if (conn && key) {
                    try { currentComments = await api.getJiraComments({ domain: conn.domain, email: conn.email, apiKey: key, issueKey: selectedTask.sourceIssueId }) } catch { /* ignore */ }
                }
            }
            const result = await api.aiAnalyzeIssue({ apiKey, task: selectedTask, comments: currentComments, project: activeProject })
            setAnalysisResult(result)
        } finally {
            setIsAnalyzing(false)
        }
    }

    const handleGenerateBugReport = async () => {
        if (!selectedTask || !activeProject) return

        try {
            const api = window.electronAPI as any
            const result = await api.generateBugReportTask({
                task: selectedTask,
                environment: activeProject.environments.find((e: any) => e.isDefault)?.name || 'N/A',
                reporter: 'QAssistant User',
                aiAnalysis: analysisResult || ""
            })

            if (result.success) {
                alert(`Bug report generated: ${result.fileName}`)
                if (result.path) api.openFile(result.path)
            } else {
                alert(`Failed to generate bug report: ${result.error}`)
            }
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        }
    }

    const loadTabContent = async (tab: string) => {
        if (!selectedTask) return
        setIsLoadingTab(true)
        try {
            const connId = selectedTask.connectionId
            const prefix = activeProject ? `project:${activeProject.id}:` : ''
            if (tab === 'comments') {
                if (selectedTask.source === 'linear') {
                    const key = await api.secureStoreGet(connId ? `${prefix}linear_api_key_${connId}` : `${prefix}linear_api_key`) || await api.secureStoreGet(connId ? `linear_api_key_${conn.id}` : 'linear_api_key')
                    if (key) setComments(await api.getLinearComments({ apiKey: key, issueId: selectedTask.externalId }))
                } else if (selectedTask.source === 'jira') {
                    const conn = activeProject?.jiraConnections.find(c => c.id === connId)
                    const key = await api.secureStoreGet(connId ? `${prefix}jira_api_token_${connId}` : `${prefix}jira_api_key`) || await api.secureStoreGet(connId ? `jira_api_token_${connId}` : 'jira_api_key')
                    if (conn && key) setComments(await api.getJiraComments({ domain: conn.domain, email: conn.email, apiKey: key, issueKey: selectedTask.sourceIssueId }))
                }
            } else if (tab === 'worklog') {
                if (selectedTask.source === 'linear') {
                    const key = await api.secureStoreGet(connId ? `${prefix}linear_api_key_${connId}` : `${prefix}linear_api_key`) || await api.secureStoreGet(connId ? `linear_api_key_${connId}` : 'linear_api_key')
                    if (key) setWorklog(await api.getLinearHistory({ apiKey: key, issueId: selectedTask.externalId }))
                } else if (selectedTask.source === 'jira') {
                    const conn = activeProject?.jiraConnections.find(c => c.id === connId)
                    const key = await api.secureStoreGet(connId ? `${prefix}jira_api_token_${connId}` : `${prefix}jira_api_key`) || await api.secureStoreGet(connId ? `jira_api_token_${connId}` : 'jira_api_key')
                    if (conn && key) setWorklog(await api.getJiraHistory({ domain: conn.domain, email: conn.email, apiKey: key, issueKey: selectedTask.sourceIssueId }))
                }
            } else if (tab === 'history') {
                setHistory(selectedTask.analysisHistory || [])
            }
        } catch (e) {
            console.error("Failed to load tab content:", e)
        } finally {
            setIsLoadingTab(false)
        }
    }

    const handlePostComment = async () => {
        if (!selectedTask || !newComment.trim()) return
        setIsPostingComment(true)
        const connId = selectedTask.connectionId
        try {
            if (selectedTask.source === 'linear') {
                const prefix = activeProject ? `project:${activeProject.id}:` : ''
                const key = await api.secureStoreGet(connId ? `${prefix}linear_api_key_${connId}` : `${prefix}linear_api_key`) || await api.secureStoreGet(connId ? `linear_api_key_${connId}` : 'linear_api_key')
                if (key) {
                    await api.addLinearComment({ apiKey: key, issueId: selectedTask.externalId, body: newComment })
                    setNewComment("")
                    loadTabContent('comments')
                }
            } else if (selectedTask.source === 'jira') {
                const conn = activeProject?.jiraConnections.find(c => c.id === connId)
                const prefix = activeProject ? `project:${activeProject.id}:` : ''
                const key = await api.secureStoreGet(connId ? `${prefix}jira_api_token_${connId}` : `${prefix}jira_api_key`) || await api.secureStoreGet(connId ? `jira_api_token_${connId}` : 'jira_api_key')
                if (conn && key) {
                    await api.addJiraComment({ domain: conn.domain, email: conn.email, apiKey: key, issueKey: selectedTask.sourceIssueId, body: newComment })
                    setNewComment("")
                    loadTabContent('comments')
                }
            }
        } catch (e: any) {
            alert(`Failed to post comment: ${e.message}`)
        } finally {
            setIsPostingComment(false)
        }
    }

    const onDragStart = (event: DragStartEvent) => {
        const { active } = event
        const task = tasks.find(t => t.id === active.id)
        if (task) setActiveTask(task)
    }

    const onDragOver = (event: DragOverEvent) => {
        const { active, over } = event
        if (!over) return
        const activeId = active.id
        const overId = over.id
        if (activeId === overId) return

        const activeTaskCandidate = tasks.find(t => t.id === activeId)
        const overColumn = COLUMNS.find(c => c.id === overId)

        if (activeTaskCandidate && overColumn && activeTaskCandidate.status !== overColumn.id) {
            if (activeProjectId) {
                moveTask(activeProjectId, activeId.toString(), overColumn.id)
                // Optional: Trigger remote status transition if synced task
                if (activeTaskCandidate.externalId) {
                    handleRemoteStatusTransition(activeTaskCandidate, overColumn.id)
                }
            }
        }
    }

    const handleRemoteStatusTransition = async (task: Task, newStatus: TaskStatus) => {
        const connId = task.connectionId
        try {
            if (task.source === 'linear') {
                const prefix = activeProject ? `project:${activeProject.id}:` : ''
                const apiKey = await api.secureStoreGet(connId ? `${prefix}linear_api_key_${connId}` : `${prefix}linear_api_key`) || await api.secureStoreGet(connId ? `linear_api_key_${connId}` : 'linear_api_key')
                if (!apiKey) return
                const states = await api.getLinearWorkflowStates({ apiKey })
                // Simple heuristic: match state name to our status
                const match = states.find((s: any) => s.name.toLowerCase().includes(newStatus.toLowerCase()))
                if (match) await api.updateLinearStatus({ apiKey, issueId: task.externalId, stateId: match.id })
            } else if (task.source === 'jira') {
                const conn = activeProject?.jiraConnections.find(c => c.id === connId)
                const prefix = activeProject ? `project:${activeProject.id}:` : ''
                const key = await api.secureStoreGet(connId ? `${prefix}jira_api_token_${connId}` : `${prefix}jira_api_key`) || await api.secureStoreGet(connId ? `jira_api_token_${connId}` : 'jira_api_key')
                if (conn && key) {
                    await api.transitionJiraIssue({ domain: conn.domain, email: conn.email, apiKey: key, issueKey: task.sourceIssueId, transitionName: newStatus.replace('-', ' ') })
                }
            }
        } catch (e) {
            console.error("Remote status transition failed:", e)
        }
    }

    const onDragEnd = () => setActiveTask(null)

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-500 overflow-hidden">
            {/* Toolbar */}
            <header className="flex-none bg-[#0F0F13] border-b border-[#2A2A3A] px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="flex bg-[#1A1A24] p-1 rounded-lg border border-[#2A2A3A]">
                        {(['manual', 'linear', 'jira'] as const).map(mode => (
                            <Button
                                key={mode}
                                variant="ghost"
                                size="sm"
                                onClick={() => setSourceMode(mode)}
                                className={cn(
                                    "h-8 px-3 text-[11px] font-bold transition-all",
                                    sourceMode === mode
                                        ? "bg-[#2A2A3A]/80 text-[#A78BFA]"
                                        : "text-[#6B7280] hover:text-[#E2E8F0]"
                                )}
                            >
                                {mode.charAt(0).toUpperCase() + mode.slice(1)}
                            </Button>
                        ))}
                    </div>
                    {sourceMode !== 'manual' && (
                        <Button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className="h-8 px-3 text-[11px] font-bold bg-[#A78BFA]/10 text-[#A78BFA] hover:bg-[#A78BFA]/20 gap-1.5 border border-[#A78BFA]/20"
                            variant="ghost"
                        >
                            {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Sync {sourceMode.charAt(0).toUpperCase() + sourceMode.slice(1)}
                        </Button>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative group">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#6B7280] opacity-40 group-focus-within:text-[#A78BFA] transition-all" />
                        <Input
                            placeholder="Search board..."
                            className="h-9 pl-9 w-64 bg-[#13131A] border-[#2A2A3A] text-xs font-medium focus-visible:ring-[#A78BFA]/30"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Button onClick={handleAddTask} className="h-9 px-4 bg-[#1A1A24] hover:bg-[#252535] text-[#A78BFA] border border-[#A78BFA]/30 font-bold text-xs gap-2">
                        <Plus className="h-3.5 w-3.5" /> NEW TASK
                    </Button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Kanban Board */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#0F0F13]">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCorners}
                        onDragStart={onDragStart}
                        onDragOver={onDragOver}
                        onDragEnd={onDragEnd}
                    >
                        <div className="flex h-full min-w-max p-4 gap-4">
                            {COLUMNS.map((col) => (
                                <div key={col.id} className="w-[300px] shrink-0 flex flex-col gap-3 bg-[#13131A]/50 rounded-xl border border-[#2A2A3A]/50 p-3">
                                    <div className="flex items-center justify-between px-1">
                                        <div className="flex items-center gap-2">
                                            <span className={cn("text-[10px] font-bold tracking-[0.15em]", col.textColor)}>{col.title}</span>
                                            <span className="text-[10px] font-bold text-[#6B7280] bg-[#1A1A24] px-1.5 py-0.5 rounded border border-[#2A2A3A]">
                                                {tasksByColumn[col.id].length}
                                            </span>
                                        </div>
                                    </div>

                                    <SortableContext
                                        id={col.id}
                                        items={tasksByColumn[col.id].map(t => t.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <div className="flex-1 overflow-y-auto custom-scrollbar-slim space-y-3 pr-1">
                                            {tasksByColumn[col.id].map((task) => (
                                                <SortableTaskCard
                                                    key={task.id}
                                                    task={task}
                                                    isSelected={selectedTaskId === task.id}
                                                    onClick={() => setSelectedTaskId(task.id)}
                                                />
                                            ))}
                                            <div className="h-px w-full pointer-events-none" />
                                        </div>
                                    </SortableContext>
                                </div>
                            ))}
                        </div>

                        <DragOverlay>
                            {activeTask ? <TaskCard task={activeTask} isOverlay /> : null}
                        </DragOverlay>
                    </DndContext>
                </div>

                {/* Detail Panel */}
                <div className={cn(
                    "bg-[#13131A] border-l border-[#2A2A3A] transition-all duration-300 ease-in-out flex flex-col overflow-hidden shadow-2xl",
                    selectedTask ? "w-[500px]" : "w-0 border-l-0"
                )}>
                    {selectedTask && (
                        <>
                            <div className="flex-none p-5 border-b border-[#2A2A3A] space-y-4">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">{selectedTask.sourceIssueId || 'MANUAL TASK'}</p>
                                        <h2 className="text-lg font-semibold text-[#E2E8F0] leading-tight">{selectedTask.title}</h2>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B7280] hover:text-[#E2E8F0]" onClick={() => setSelectedTaskId(null)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase",
                                        COLUMNS.find(c => c.id === selectedTask.status)?.color,
                                        "text-[#0F0F13]"
                                    )}>
                                        {selectedTask.status}
                                    </div>
                                    <div className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-[#2A2010] text-[#F59E0B] border border-[#F59E0B]/20">
                                        {selectedTask.priority}
                                    </div>
                                </div>
                            </div>

                            <Tabs defaultValue="description" className="flex-1 flex flex-col min-h-0" onValueChange={loadTabContent}>
                                <TabsList className="flex-none w-full justify-start rounded-none bg-transparent border-b border-[#2A2A3A] h-10 px-2 gap-4">
                                    <TabsTrigger value="description" className="text-xs font-bold data-[state=active]:bg-transparent data-[state=active]:text-[#A78BFA] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#A78BFA] transition-none rounded-none px-2 h-full">Description</TabsTrigger>
                                    <TabsTrigger value="details" className="text-xs font-bold data-[state=active]:bg-transparent data-[state=active]:text-[#A78BFA] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#A78BFA] transition-none rounded-none px-2 h-full">Details</TabsTrigger>
                                    <TabsTrigger value="comments" className="text-xs font-bold data-[state=active]:bg-transparent data-[state=active]:text-[#A78BFA] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#A78BFA] transition-none rounded-none px-2 h-full">Comments</TabsTrigger>
                                    <TabsTrigger value="history" className="text-xs font-bold data-[state=active]:bg-transparent data-[state=active]:text-[#A78BFA] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#A78BFA] transition-none rounded-none px-2 h-full">History</TabsTrigger>
                                    <TabsTrigger value="worklog" className="text-xs font-bold data-[state=active]:bg-transparent data-[state=active]:text-[#A78BFA] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#A78BFA] transition-none rounded-none px-2 h-full">Worklog</TabsTrigger>
                                </TabsList>
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                    <TabsContent value="description" className="m-0 focus-visible:ring-0">
                                        <div className="text-sm text-[#E2E8F0] leading-relaxed">
                                            <FormattedText content={selectedTask.description} />
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="details" className="m-0 focus-visible:ring-0 space-y-6">
                                        <div className="space-y-4">
                                            <DetailItem icon={User} label="Assignee" value={selectedTask.assignee || "Unassigned"} />
                                            <DetailItem icon={Calendar} label="Due Date" value={selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : "No date set"} />
                                            <DetailItem icon={Tag} label="Labels" value={selectedTask.labels || "No labels"} />
                                        </div>
                                        <div className="pt-6 border-t border-[#2A2A3A]">
                                            <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.18em] mb-4">ISSUE PARAMETERS</p>
                                            <div className="space-y-4">
                                                <DetailItem label="Source" value={selectedTask.sourceIssueId ? "Linear Sync" : "Manual Entry"} />
                                                <DetailItem label="Identifier" value={selectedTask.sourceIssueId || "N/A"} />
                                                <DetailItem label="Updated" value={new Date(selectedTask.updatedAt).toLocaleString()} />
                                            </div>
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="comments" className="m-0 h-full flex flex-col gap-4">
                                        {isLoadingTab ? (
                                            <div className="flex-1 flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#A78BFA]" /></div>
                                        ) : comments.length === 0 ? (
                                            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 mt-10">
                                                <MessageSquare className="h-10 w-10 mb-2" />
                                                <p className="text-xs font-bold uppercase tracking-wider">No comments yet</p>
                                            </div>
                                        ) : (
                                            <div className="flex-1 space-y-4">
                                                {comments.map((c, i) => (
                                                    <div key={i} className="bg-[#1A1A24] border border-[#2A2A3A] rounded-xl p-3 space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] font-bold text-[#A78BFA]">{c.authorName}</span>
                                                            <span className="text-[9px] text-[#6B7280]">{new Date(c.createdAt).toLocaleString()}</span>
                                                        </div>
                                                        <div className="text-xs text-[#E2E8F0] leading-relaxed"><FormattedText content={c.body} /></div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {selectedTask.externalId && (
                                            <div className="flex-none flex gap-2 pt-4 border-t border-[#2A2A3A]">
                                                <Input
                                                    placeholder="Add a comment..."
                                                    className="flex-1 h-10 bg-[#1A1A24] border-[#2A2A3A] text-xs"
                                                    value={newComment}
                                                    onChange={e => setNewComment(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handlePostComment()}
                                                />
                                                <Button
                                                    size="icon"
                                                    className="bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD]"
                                                    onClick={handlePostComment}
                                                    disabled={isPostingComment || !newComment.trim()}
                                                >
                                                    {isPostingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        )}
                                    </TabsContent>
                                    <TabsContent value="history" className="m-0 space-y-4">
                                        {history.length === 0 ? (
                                            <div className="text-center opacity-30 py-10">
                                                <p className="text-xs font-bold uppercase tracking-wider">No analysis history</p>
                                            </div>
                                        ) : (
                                            history.map((h, i) => (
                                                <div key={i} className="flex items-start gap-4 py-2 border-l-2 border-[#2A2A3A] pl-4 ml-2 group">
                                                    <div className="w-2.5 h-2.5 rounded-full bg-[#A78BFA] -ml-[21.5px] mt-1.5 ring-4 ring-[#13131A] transition-transform group-hover:scale-125" />
                                                    <div className="flex-1 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl p-3 space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] font-bold text-[#A78BFA] tracking-mono">v{h.version} · {h.hash || 'GEN'}</span>
                                                            <span className="text-[9px] text-[#6B7280]">{new Date(h.timestamp).toLocaleString()}</span>
                                                        </div>
                                                        <p className="text-xs text-[#E2E8F0] font-medium leading-relaxed">{h.summary}</p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </TabsContent>
                                    <TabsContent value="worklog" className="m-0 space-y-4">
                                        {isLoadingTab ? (
                                            <div className="flex-1 flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#A78BFA]" /></div>
                                        ) : worklog.length === 0 ? (
                                            <div className="text-center opacity-30 py-10">
                                                <p className="text-xs font-bold uppercase tracking-wider">No activity recorded</p>
                                            </div>
                                        ) : (
                                            worklog.map((w, i) => (
                                                <div key={i} className="flex items-start gap-4 py-2 border-l-2 border-[#2A2A3A] pl-4 ml-2 group">
                                                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500/80 -ml-[21.5px] mt-1.5 ring-4 ring-[#13131A]" />
                                                    <div className="flex-1 space-y-1">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">{w.field}</span>
                                                            <span className="text-[9px] text-[#6B7280]">{new Date(w.timestamp).toLocaleString()}</span>
                                                        </div>
                                                        <p className="text-[11px] text-[#E2E8F0]">
                                                            By <span className="font-bold text-[#A78BFA]">{w.author}</span>:
                                                            <span className="opacity-50 mx-1.5">{w.fromValue || 'None'}</span>
                                                            <span className="text-blue-400">→</span>
                                                            <span className="font-semibold text-blue-300 ml-1.5">{w.toValue}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </TabsContent>
                                </div>
                            </Tabs>

                            <div className="flex-none p-5 border-t border-[#2A2A3A] bg-[#0F0F13] space-y-2">
                                {analysisResult ? (
                                    <div className="mb-3 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl p-4 text-xs text-[#C4B5FD] leading-relaxed max-h-[200px] overflow-y-auto custom-scrollbar">
                                        <FormattedText content={analysisResult} />
                                    </div>
                                ) : null}
                                <Button
                                    className="w-full h-10 bg-[#A78BFA] hover:bg-[#C4B5FD] text-[#0F0F13] font-bold gap-2"
                                    onClick={handleAnalyzeIssue}
                                    disabled={isAnalyzing}
                                >
                                    {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                                    {isAnalyzing ? 'Analyzing...' : 'ANALYZE ISSUE'}
                                </Button>
                                <Button
                                    className="w-full h-10 bg-[#1E2A1E] hover:bg-[#2A3A2A] text-[#10B981] border border-[#10B981]/20 font-bold gap-2"
                                    onClick={handleGenerateBugReport}
                                >
                                    <Target className="h-4 w-4" /> GENERATE BUG REPORT
                                </Button>
                                <div className="grid grid-cols-2 gap-2 pt-2">
                                    {selectedTask?.sourceIssueId && selectedTask.ticketUrl && (
                                        <Button
                                            variant="outline"
                                            className="h-10 border-[#2A2A3A] text-[#6B7280] font-bold text-xs gap-2"
                                            onClick={() => api.openUrl(selectedTask.ticketUrl!)}
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" /> OPEN TICKET
                                        </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        className="h-10 border-[#EF4444]/20 text-[#EF4444] font-bold text-xs gap-2"
                                        onClick={() => {
                                            deleteTask(activeProjectId!, selectedTask!.id)
                                            setSelectedTaskId(null)
                                        }}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" /> DELETE
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

function DetailItem({ icon: Icon, label, value }: { icon?: any, label: string, value: string }) {
    return (
        <div className="flex items-start gap-4 h-10 px-3 bg-[#1A1A24]/40 rounded-lg border border-[#2A2A3A]/30">
            <div className="flex items-center h-full w-24 shrink-0 gap-2">
                {Icon && <Icon className="h-3.5 w-3.5 text-[#6B7280]" />}
                <span className="text-[11px] font-bold text-[#6B7280]">{label}</span>
            </div>
            <div className="flex items-center h-full flex-1">
                <span className="text-[11px] font-bold text-[#E2E8F0] truncate">{value}</span>
            </div>
        </div>
    )
}

function SortableTaskCard({ task, isSelected, onClick }: { task: Task, isSelected: boolean, onClick: () => void }) {
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

function TaskCard({ task, isOverlay, isSelected }: { task: Task, isOverlay?: boolean, isSelected?: boolean }) {
    return (
        <div className={cn(
            "bg-[#1A1A24] border border-[#2A2A3A] rounded-xl p-4 shadow-sm hover:border-[#A78BFA]/40 transition-all select-none group space-y-3",
            isSelected && "border-[#A78BFA] ring-1 ring-[#A78BFA]/20",
            isOverlay && "opacity-90 shadow-2xl scale-[1.02] border-[#A78BFA]"
        )}>
            <div className="space-y-1.5 flex-1 pr-1">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-bold text-[#6B7280] tracking-wider">{task.sourceIssueId || 'MANUAL'}</span>
                    <div className={cn(
                        "h-1 w-8 rounded-full mb-3",
                        task.priority === 'critical' ? "bg-red-500" :
                            task.priority === 'high' ? "bg-orange-500" :
                                task.priority === 'medium' ? "bg-yellow-400" :
                                    "bg-gray-500"
                    )} />
                </div>
                <h4 className="text-[13px] font-semibold text-[#E2E8F0] leading-snug line-clamp-2 transition-colors">
                    {task.title}
                </h4>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-[#2A2A3A]/50">
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-[#252535] flex items-center justify-center overflow-hidden border border-[#2A2A3A]">
                        <User className="h-3 w-3 text-[#6B7280]" />
                    </div>
                    <span className="text-[10px] font-bold text-[#6B7280] truncate max-w-[80px]">{task.assignee || 'None'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#6B7280] opacity-60">
                    <Clock className="h-3 w-3" />
                    {new Date(task.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </div>
            </div>
        </div>
    )
}
