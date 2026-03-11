// cspell:ignore youtu
import { useState, useMemo, useEffect, useCallback } from "react"
import { useProjectStore, Project, Task, TaskStatus } from "@/store/useProjectStore"
import type { AnalysisEntry } from "@/types/project"
import { getApiKey, getConnectionApiKey } from "@/lib/credentials"
import { useLinearAutoSync } from "@/hooks/useLinearAutoSync"
import {
    Plus,
    Search,
    RefreshCw,
    Loader2,
    HelpCircle,
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
    DragEndEvent,
} from "@dnd-kit/core"
import {
    sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"

import { ConfirmDialog } from "@/components/ConfirmDialog"
import { toast } from "sonner"

// Extracted Components
import { TaskCard } from "@/components/tasks/TaskCard"
import { TaskColumn } from "@/components/tasks/TaskColumn"
import { TaskDetailsSidebar } from "@/components/tasks/TaskDetailsSidebar"
import { NewTaskModal } from "@/components/tasks/NewTaskModal"
import AnalysisResultDialog from "@/components/tasks/AnalysisResultDialog"

type Column = { id: string; title: string; color: string; textColor: string; type?: string }

const DEFAULT_COLUMNS: Column[] = [
    { id: 'backlog', title: 'BACKLOG', color: 'bg-[#9CA3AF]', textColor: 'text-[#9CA3AF]' },
    { id: 'todo', title: 'TODO', color: 'bg-[#6B7280]', textColor: 'text-[#6B7280]' },
    { id: 'in-progress', title: 'IN PROGRESS', color: 'bg-[#3B82F6]', textColor: 'text-[#3B82F6]' },
    { id: 'in-review', title: 'IN REVIEW', color: 'bg-[#A78BFA]', textColor: 'text-[#A78BFA]' },
    { id: 'done', title: 'DONE', color: 'bg-[#10B981]', textColor: 'text-[#10B981]' },
    { id: 'canceled', title: 'CANCELED', color: 'bg-[#EF4444]', textColor: 'text-[#EF4444]' },
    { id: 'duplicate', title: 'DUPLICATE', color: 'bg-[#F59E0B]', textColor: 'text-[#F59E0B]' },
]

export default function TasksPage() {
    const api = window.electronAPI
    const projects = useProjectStore((state) => state.projects)
    const activeProjectId = useProjectStore((state) => state.activeProjectId)
    const addTask = useProjectStore((state) => state.addTask)
    const deleteTask = useProjectStore((state) => state.deleteTask)
    const moveTask = useProjectStore((state) => state.moveTask)
    const updateProject = useProjectStore((state) => state.updateProject)
    const loadProjects = useProjectStore((state) => state.loadProjects)

    const activeProject = useMemo(() => projects.find((p: Project) => p.id === activeProjectId), [projects, activeProjectId])
    const tasks = useMemo(() => activeProject?.tasks || [], [activeProject?.tasks])

    const [activeTask, setActiveTask] = useState<Task | null>(null)
    const [detailsId, setDetailsId] = useState<string | null>(null)
    const [isAnalysisDialogOpen, setIsAnalysisDialogOpen] = useState(false)
    const [currentAnalysisResult, setCurrentAnalysisResult] = useState<string | null>(null)
    const [taskBeingAnalyzed, setTaskBeingAnalyzed] = useState<Task | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [sourceMode, setSourceMode] = useState<'manual' | 'linear' | 'jira'>('manual')
    const [isSyncing, setIsSyncing] = useState(false)
    const [isLoading, setIsLoading] = useState(false) // Renamed from isAnalyzing
    const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false)
    const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false)
    const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)
    const [syncTimestamp, setSyncTimestamp] = useState<number | null>(null)

    const selectedTask = useMemo(() => tasks.find((t: Task) => t.id === detailsId) || null, [tasks, detailsId])

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const filteredTasks = useMemo(() => {
        return tasks.filter((t: Task) => {
            const q = searchQuery.toLowerCase()
            const matchesSearch = t.title.toLowerCase().includes(q) ||
                t.sourceIssueId?.toLowerCase().includes(q) ||
                t.description?.toLowerCase().includes(q)

            if (!matchesSearch) return false

            if (sourceMode === 'manual') return t.source === 'manual' || !t.source
            return t.source === sourceMode
        })
    }, [tasks, searchQuery, sourceMode])

    const currentColumns = useMemo((): Column[] => {
        if (activeProject?.columns && activeProject.columns.length > 0) {
            return activeProject.columns as Column[]
        }
        return DEFAULT_COLUMNS
    }, [activeProject?.columns])

    const tasksByColumn = useMemo(() => {
        return currentColumns.reduce((acc: Record<string, Task[]>, col: Column) => {
            acc[col.id] = filteredTasks.filter((t: Task) => t.status === col.id)
            return acc
        }, {} as Record<string, Task[]>)
    }, [filteredTasks, currentColumns])

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === '/') {
                e.preventDefault()
                setIsShortcutModalOpen(prev => !prev)
            }
            if (e.key === 'Escape') {
                if (isShortcutModalOpen) setIsShortcutModalOpen(false)
                else setDetailsId(null)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isShortcutModalOpen])

    const getLinearApiKey = useCallback(async (connId?: string) => {
        return getConnectionApiKey(api, 'linear_api_key', connId, activeProject?.id)
    }, [activeProject, api])

    const getJiraCredentials = useCallback(async (connId?: string) => {
        const keyPrefix = activeProject ? `project:${activeProject.id}:` : ''
        if (connId) {
            const conn = activeProject?.jiraConnections?.find((c) => c.id === connId)
            if (conn) {
                const key = await api.secureStoreGet(`${keyPrefix}jira_api_token_${connId}`) || await api.secureStoreGet(`jira_api_token_${connId}`)
                if (key) return { domain: conn.domain, email: conn.email, apiKey: key }
            }
        }
        return null
    }, [activeProject, api])

    const syncLinearTasks = useCallback(async (allSyncedTasks: Task[]) => {
        if (!activeProjectId || !activeProject) return

        const allColumns: Column[] = []
        const conns = activeProject.linearConnections || []

        for (const conn of conns) {
            const apiKey = await getConnectionApiKey(api, 'linear_api_key', conn.id, activeProject?.id)
            if (apiKey) {
                const states = await api.getLinearWorkflowStates({ apiKey, teamId: conn.teamId })
                states.forEach((s: { name: string; color?: string; type?: string }) => {
                    if (!allColumns.find(c => c.id === s.name)) {
                        allColumns.push({
                            id: s.name,
                            title: s.name.toUpperCase(),
                            color: s.color ? `bg-[${s.color}]` : 'bg-[#3B82F6]',
                            textColor: s.color ? `text-[${s.color}]` : 'text-[#3B82F6]',
                            type: s.type
                        })
                    }
                })
            }
        }

        const existing = activeProject.tasks || []
        const otherSourceTasks = existing.filter((t: Task) => t.source !== 'linear')
        await updateProject(activeProjectId, { tasks: [...otherSourceTasks, ...allSyncedTasks], columns: allColumns })
        await loadProjects()
        setSyncTimestamp(Date.now())
    }, [activeProjectId, activeProject, api, updateProject, loadProjects])

    // Format relative time for display
    const formatRelativeTime = (timestamp: number): string => {
        const now = Date.now()
        const diffMs = now - timestamp
        const diffS = Math.floor(diffMs / 1000)
        const diffM = Math.floor(diffS / 60)
        const diffH = Math.floor(diffM / 60)

        if (diffS < 60) return 'just now'
        if (diffM < 60) return `${diffM}m ago`
        if (diffH < 24) return `${diffH}h ago`
        return `${Math.floor(diffH / 24)}d ago`
    }

    // Update sync timestamp display every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => setSyncTimestamp(prev => prev ? prev : null), 30000)
        return () => clearInterval(interval)
    }, [])

    // Auto-sync hook for Linear
    const { lastSyncedAt } = useLinearAutoSync({
        activeProject: activeProject || null,
        sourceMode,
        api,
        onSyncComplete: syncLinearTasks,
        intervalMs: 45_000
    })

    // Use auto-sync timestamp when available, fall back to manual timestamp
    const displaySyncTime = lastSyncedAt || syncTimestamp

    const handleSync = async (specificSource?: 'linear' | 'jira') => {
        if (!activeProjectId || !activeProject) return
        const mode = specificSource || sourceMode
        if (mode === 'manual') return

        setIsSyncing(true)
        try {
            if (mode === 'linear') {
                const conns = activeProject.linearConnections || []
                let allSyncedTasks: Task[] = []

                for (const conn of conns) {
                    const apiKey = await getConnectionApiKey(api, 'linear_api_key', conn.id, activeProject?.id)
                    if (apiKey) {
                        const syncedTasks = await api.syncLinear({ apiKey, teamKey: conn.teamId, connectionId: conn.id })
                        allSyncedTasks = [...allSyncedTasks, ...syncedTasks]
                    }
                }

                await syncLinearTasks(allSyncedTasks)
            } else if (mode === 'jira') {
                const conns = activeProject.jiraConnections || []
                let allSyncedTasks: Task[] = []
                for (const conn of conns) {
                    const apiKey = await getConnectionApiKey(api, 'jira_api_token', conn.id, activeProject?.id)
                    if (apiKey) {
                        const syncedTasks = await api.syncJira({ domain: conn.domain, email: conn.email, apiKey, projectKey: conn.projectKey, connectionId: conn.id })
                        allSyncedTasks = [...allSyncedTasks, ...syncedTasks]
                    }
                }
                const existing = activeProject.tasks || []
                const otherSourceTasks = existing.filter((t: Task) => t.source !== 'jira')
                await updateProject(activeProjectId, { tasks: [...otherSourceTasks, ...allSyncedTasks] })
                await loadProjects()
            }
        } catch (e) {
            toast.error(`Sync failed: ${e instanceof Error ? e.message : String(e)}`)
        } finally {
            setIsSyncing(false)
        }
    }

    const handleConfirmAddTask = async (taskData: Partial<Task> & { title: string; source?: string; connectionId?: string; priority?: string }) => {
        if (!activeProjectId || !taskData.title.trim()) return
        try {
            if (taskData.source === 'manual') {
                await addTask(activeProjectId, taskData)
                setIsNewTaskModalOpen(false)
            } else if (taskData.source === 'linear') {
                const apiKey = await getLinearApiKey(taskData.connectionId)
                const conn = activeProject?.linearConnections?.find((c) => c.id === taskData.connectionId)
                if (!apiKey || !conn) throw new Error("Linear credentials missing.")
                const url = await api.createLinearIssue({
                    apiKey,
                    teamId: conn.teamId,
                    title: taskData.title,
                    description: taskData.description,
                    priority: taskData.priority === 'critical' ? 1 : taskData.priority === 'high' ? 2 : taskData.priority === 'medium' ? 3 : 4
                })
                if (url) {
                    toast.success("Linear issue created!")
                    setIsNewTaskModalOpen(false)
                    handleSync('linear')
                }
            } else if (taskData.source === 'jira') {
                const creds = await getJiraCredentials(taskData.connectionId)
                const conn = activeProject?.jiraConnections?.find((c) => c.id === taskData.connectionId)
                if (!creds || !conn) throw new Error("Jira credentials missing.")
                const key = await api.createJiraIssue({ ...creds, projectKey: conn.projectKey, title: taskData.title, description: taskData.description })
                if (key) {
                    toast.success(`Jira issue ${key} created!`)
                    setIsNewTaskModalOpen(false)
                    handleSync('jira')
                }
            }
        } catch (e) {
            toast.error(`Failed: ${e instanceof Error ? e.message : String(e)}`)
        }
    }

    const handleAnalyzeIssue = async (task: Task) => {
        if (!api) return

        const apiKey = await getApiKey(api, 'gemini_api_key', activeProjectId)
        if (!apiKey) {
            toast.error('Please set your Gemini API key in Settings.')
            return
        }

        setIsLoading(true)
        setTaskBeingAnalyzed(task)
        try {
            // Fetch comments if applicable to enrich analysis
            let comments: unknown[] = []
            if (task.source === 'linear' && task.sourceIssueId) {
                try {
                    const linearKey = await getLinearApiKey(task.connectionId)
                    if (linearKey) comments = await api.getLinearComments({ apiKey: linearKey, issueId: task.sourceIssueId })
                } catch (e) {
                    console.error('Failed to fetch Linear comments:', e)
                }
            } else if (task.source === 'jira' && task.externalId) {
                try {
                    const creds = await getJiraCredentials(task.connectionId)
                    if (creds) comments = await api.getJiraComments({ ...creds, issueKey: task.externalId })
                } catch (e) {
                    console.error('Failed to fetch Jira comments:', e)
                }
            }

            const result = await api.aiAnalyzeIssue({
                apiKey,
                task,
                comments: comments || [],
                project: activeProject ? { name: activeProject.name, description: activeProject.description } : null,
                modelName: activeProject?.geminiModel
            })

            const historyEntry: AnalysisEntry = {
                version: (task.analysisHistory?.length || 0) + 1,
                hash: crypto.randomUUID(),
                timestamp: Date.now(),
                summary: result.split('\n')[0].substring(0, 100),
                fullResult: result,
                taskStatus: task.status,
                taskPriority: task.priority
            }

            const updatedTasks = activeProject!.tasks.map((t: Task) =>
                t.id === task.id
                    ? { ...t, analysisHistory: [historyEntry, ...(t.analysisHistory || [])] }
                    : t
            )

            await updateProject(activeProjectId!, { tasks: updatedTasks })

            // Show the emergent window
            setCurrentAnalysisResult(result)
            setIsAnalysisDialogOpen(true)

            toast.success('Analysis complete')
        } catch (error) {
            toast.error(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
            setIsLoading(false)
        }
    }

    const onDragStart = (event: DragStartEvent) => {
        const task = tasks.find((t: Task) => t.id === event.active.id)
        if (task) setActiveTask(task)
    }

    const onDragOver = (event: DragOverEvent) => {
        const { active, over } = event
        if (!over || !activeProjectId) return
        const activeId = active.id.toString()
        const overId = over.id.toString()

        const overColumn = currentColumns.find((c: Column) => c.id === overId)
        if (overColumn) {
            if (activeTask && activeTask.status !== overColumn.id) {
                moveTask(activeProjectId, activeId, overColumn.id)
            }
        } else {
            const overTask = tasks.find((t: Task) => t.id === overId)
            if (overTask) moveTask(activeProjectId, activeId, overTask.status as TaskStatus, overId)
        }
    }

    const onDragEnd = async (event: DragEndEvent) => {
        const { over } = event
        if (over && activeTask) {
            // Sync status change back to source if external task
            try {
                const overColumnId = over.id?.toString()
                const overColumn = currentColumns.find((c: Column) => c.id === overColumnId)
                // If dropped on a task card (not a column), resolve the target column from that task
                const overTask = !overColumn ? tasks.find((t: Task) => t.id === overColumnId) : null
                const newStatus = overColumn?.id ?? overTask?.status

                if (newStatus && activeTask.status !== newStatus) {
                    if (activeTask.source === 'linear' && activeTask.externalId) {
                        const apiKey = await getLinearApiKey(activeTask.connectionId)
                        if (apiKey) {
                            const conn = activeProject?.linearConnections?.find((c) => c.id === activeTask.connectionId)
                            const states: Array<{id: string; name: string; type?: string; color?: string}> = await api.getLinearWorkflowStates({ apiKey, teamId: conn?.teamId })
                            const targetState = states.find((s) => s.name === newStatus)
                            if (targetState?.id) {
                                await api.updateLinearStatus({ apiKey, issueId: activeTask.externalId, stateId: targetState.id })
                            } else {
                                toast.error(`Could not find Linear state: ${newStatus}`)
                            }
                        }
                    } else if (activeTask.source === 'jira' && activeTask.externalId) {
                        const creds = await getJiraCredentials(activeTask.connectionId)
                        if (creds) {
                            await api.transitionJiraIssue({ ...creds, issueKey: activeTask.externalId, transitionName: newStatus })
                        }
                    }
                }
            } catch (e) {
                toast.error(`Failed to sync status: ${e instanceof Error ? e.message : String(e)}`)
                console.error('Failed to sync drag status change:', e)
            }
        }
        setActiveTask(null)
    }

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-500 overflow-hidden text-[#E2E8F0]">
            <header className="flex-none bg-[#0F0F13] border-b border-[#2A2A3A] px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="flex bg-[#1A1A24] p-1 rounded-lg border border-[#2A2A3A]">
                        {(['manual', 'linear', 'jira'] as const).map(mode => (
                            <Button
                                key={mode}
                                variant="ghost" size="sm"
                                onClick={() => setSourceMode(mode)}
                                className={cn("h-8 px-3 text-[11px] font-bold transition-all", sourceMode === mode ? "bg-[#2A2A3A]/80 text-[#A78BFA]" : "text-[#6B7280] hover:text-[#E2E8F0]")}
                            >
                                {mode.charAt(0).toUpperCase() + mode.slice(1)}
                            </Button>
                        ))}
                    </div>
                    {sourceMode !== 'manual' && (
                        <div className="flex items-center gap-2">
                            <Button onClick={() => handleSync()} disabled={isSyncing} className="h-8 px-3 text-[11px] font-bold bg-[#A78BFA]/10 text-[#A78BFA] gap-1.5 border border-[#A78BFA]/20" variant="ghost">
                                {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                Sync {sourceMode.charAt(0).toUpperCase() + sourceMode.slice(1)}
                            </Button>
                            {displaySyncTime && (
                                <span className="text-[10px] text-[#6B7280]">
                                    Last synced: {formatRelativeTime(displaySyncTime)}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400" onClick={() => setIsShortcutModalOpen(true)}><HelpCircle className="h-4 w-4" /></Button>
                    <div className="relative group">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#6B7280] opacity-40" />
                        <Input placeholder="Search board..." className="h-9 pl-9 w-64 bg-[#13131A] border-[#2A2A3A] text-xs" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    </div>
                    {sourceMode === 'manual' && (
                        <Button onClick={() => setIsNewTaskModalOpen(true)} disabled={!activeProjectId} className="h-9 px-4 font-bold text-xs gap-2 bg-[#1A1A24] text-[#A78BFA] border border-[#A78BFA]/30"><Plus className="h-3.5 w-3.5" /> NEW TASK</Button>
                    )}
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#0F0F13]">
                    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
                        <div className="flex h-full min-w-max p-4 gap-4">
                            {currentColumns.map((col: Column) => (
                                <TaskColumn key={col.id} col={col} tasksInColumn={tasksByColumn[col.id] || []} selectedTaskId={detailsId} setSelectedTaskId={setDetailsId} sourceMode={sourceMode} onAddTask={() => setIsNewTaskModalOpen(true)} />
                            ))}
                        </div>
                        <DragOverlay>{activeTask ? <TaskCard task={activeTask} isOverlay /> : null}</DragOverlay>
                    </DndContext>
                </div>

                <TaskDetailsSidebar
                    selectedTask={selectedTask}
                    activeProject={activeProject}
                    currentColumns={currentColumns}
                    onClose={() => setDetailsId(null)}
                    onUpdateTask={async (updates) => {
                        if (activeProjectId && selectedTask) {
                            // Sync status changes back to the source (Linear/Jira)
                            if (updates.status && selectedTask.status !== updates.status) {
                                try {
                                    if (selectedTask.source === 'linear' && selectedTask.externalId) {
                                        const apiKey = await getLinearApiKey(selectedTask.connectionId)
                                        if (apiKey) {
                                            // Get workflow states and find the ID for the new status
                                            const conn = activeProject?.linearConnections?.find((c) => c.id === selectedTask.connectionId)
                                            const states: Array<{id: string; name: string; type?: string; color?: string}> = await api.getLinearWorkflowStates({ apiKey, teamId: conn?.teamId })
                                            const targetState = states.find((s) => s.name === updates.status)
                                            if (targetState?.id) {
                                                await api.updateLinearStatus({ apiKey, issueId: selectedTask.externalId, stateId: targetState.id })
                                            }
                                        }
                                    } else if (selectedTask.source === 'jira' && selectedTask.externalId) {
                                        const creds = await getJiraCredentials(selectedTask.connectionId)
                                        if (creds) {
                                            await api.transitionJiraIssue({ ...creds, issueKey: selectedTask.externalId, transitionName: updates.status })
                                        }
                                    }
                                } catch (e) {
                                    console.error('Failed to sync status to source:', e)
                                    toast.error(`Failed to update status on ${selectedTask.source === 'linear' ? 'Linear' : 'Jira'}`)
                                }
                            }

                            await updateProject(activeProjectId, {
                                tasks: tasks.map((t: Task) => t.id === selectedTask.id ? { ...t, ...updates, updatedAt: Date.now() } : t)
                            })
                            toast.success("Updated!")
                        }
                    }}
                    onAnalyze={handleAnalyzeIssue}
                    isAnalyzing={isLoading}
                    onGenerateBugReport={async () => {
                        if (activeProject && selectedTask) {
                            try {
                                const env = activeProject.environments.find((e) => e.isDefault) || activeProject.environments[0]
                                const res = await api.generateBugReportTask({
                                    task: selectedTask,
                                    environment: env,
                                    reporter: "QA Assistant",
                                    aiAnalysis: selectedTask.analysisHistory?.[0]?.fullResult
                                })
                                if (res.success) {
                                    toast.success("Bug report generated and saved to attachments!")
                                    if (res.attachment?.filePath) {
                                        await api.openFile({ filePath: res.attachment.filePath })
                                    }
                                } else {
                                    toast.error(`Report generation failed: ${res.error}`)
                                }
                            } catch (e) {
                                toast.error(`Error: ${e instanceof Error ? e.message : String(e)}`)
                            }
                        }
                    }}
                    onDelete={() => setTaskToDelete(selectedTask)}
                    onDeleteAnalysis={async (entry) => {
                        if (activeProjectId && selectedTask) {
                            const updatedHistory = (selectedTask.analysisHistory || []).filter(
                                (h: AnalysisEntry) => h.timestamp !== entry.timestamp
                            )
                            await updateProject(activeProjectId, {
                                tasks: tasks.map((t: Task) =>
                                    t.id === selectedTask.id ? { ...t, analysisHistory: updatedHistory } : t
                                )
                            })
                            toast.success("Analysis deleted!")
                        }
                    }}
                    api={api}
                />
            </div>

            <NewTaskModal
                isOpen={isNewTaskModalOpen}
                onOpenChange={setIsNewTaskModalOpen}
                activeProject={activeProject}
                currentColumns={currentColumns}
                onConfirm={handleConfirmAddTask}
            />

            <ConfirmDialog
                open={!!taskToDelete}
                onCancel={() => setTaskToDelete(null)}
                title="Delete Task" description="Permanent action." confirmLabel="Delete" destructive
                onConfirm={() => { if (activeProjectId && taskToDelete) deleteTask(activeProjectId, taskToDelete.id) }}
            />

            <AnalysisResultDialog
                open={isAnalysisDialogOpen}
                onOpenChange={setIsAnalysisDialogOpen}
                result={currentAnalysisResult}
                taskTitle={taskBeingAnalyzed?.title || "Issue Analysis"}
                projectId={activeProjectId || undefined}
            />

            {/* Keyboard Shortcut Modal */}
            <>
                <div
                    className={cn("fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm transition-opacity duration-200", isShortcutModalOpen ? "opacity-100" : "opacity-0 pointer-events-none")}
                    onClick={() => setIsShortcutModalOpen(false)}
                />
                <div className={cn("fixed left-1/2 top-1/2 z-[201] -translate-x-1/2 -translate-y-1/2 transition-all duration-200", isShortcutModalOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none")}>
                    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl shadow-2xl w-[380px] p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-sm font-bold text-[#E2E8F0] uppercase tracking-widest">Keyboard Shortcuts</h3>
                            <button onClick={() => setIsShortcutModalOpen(false)} className="p-1 rounded-md text-[#6B7280] hover:text-[#E2E8F0] hover:bg-[#252535] transition-colors">
                                <HelpCircle className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="space-y-3">
                            {[
                                { keys: ['Ctrl', '/'], description: 'Toggle shortcut help' },
                                { keys: ['Esc'], description: 'Close task details / close modal' },
                            ].map(({ keys, description }) => (
                                <div key={description} className="flex items-center justify-between py-2 border-b border-[#2A2A3A]/60 last:border-0">
                                    <span className="text-xs text-[#9CA3AF]">{description}</span>
                                    <div className="flex items-center gap-1">
                                        {keys.map((k) => (
                                            <kbd key={k} className="px-2 py-0.5 rounded bg-[#1A1A24] border border-[#2A2A3A] text-[10px] font-bold text-[#A78BFA] font-mono">{k}</kbd>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </>
        </div>
    )
}
