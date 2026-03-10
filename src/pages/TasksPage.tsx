// cspell:ignore youtu
import { useState, useMemo, useEffect, useCallback } from "react"
import { useProjectStore, Project, Task, TaskStatus } from "@/store/useProjectStore"
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

import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { toast } from "sonner"

// Extracted Components
import { TaskCard } from "@/components/tasks/TaskCard"
import { TaskColumn } from "@/components/tasks/TaskColumn"
import { TaskDetailsSidebar } from "@/components/tasks/TaskDetailsSidebar"
import { NewTaskModal } from "@/components/tasks/NewTaskModal"

const DEFAULT_COLUMNS: { id: string; title: string, color: string, textColor: string }[] = [
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
    const projects = useProjectStore((state: any) => state.projects)
    const activeProjectId = useProjectStore((state: any) => state.activeProjectId)
    const addTask = useProjectStore((state: any) => state.addTask)
    const deleteTask = useProjectStore((state: any) => state.deleteTask)
    const moveTask = useProjectStore((state: any) => state.moveTask)
    const updateProject = useProjectStore((state: any) => state.updateProject)
    const loadProjects = useProjectStore((state: any) => state.loadProjects)
    
    const activeProject = useMemo(() => projects.find((p: Project) => p.id === activeProjectId), [projects, activeProjectId])
    const tasks = useMemo(() => activeProject?.tasks || [], [activeProject?.tasks])

    const [activeTask, setActiveTask] = useState<Task | null>(null)
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [sourceMode, setSourceMode] = useState<'manual' | 'linear' | 'jira'>('manual')
    const [isSyncing, setIsSyncing] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false)
    const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false)
    const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)

    const selectedTask = useMemo(() => tasks.find((t: Task) => t.id === selectedTaskId) || null, [tasks, selectedTaskId])

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

    const currentColumns = useMemo(() => {
        if (activeProject?.columns && activeProject.columns.length > 0) {
            return activeProject.columns
        }
        return DEFAULT_COLUMNS
    }, [activeProject?.columns])

    const tasksByColumn = useMemo(() => {
        return currentColumns.reduce((acc: Record<string, Task[]>, col: any) => {
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
                else setSelectedTaskId(null)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isShortcutModalOpen])

    const getLinearApiKey = useCallback(async (connId?: string) => {
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        if (connId) {
            const key = await api.secureStoreGet(`${prefix}linear_api_key_${connId}`) || await api.secureStoreGet(`linear_api_key_${connId}`)
            if (key) return key
        }
        return await api.secureStoreGet(`${prefix}linear_api_key`) || await api.secureStoreGet('linear_api_key')
    }, [activeProject, api])

    const getJiraCredentials = useCallback(async (connId?: string) => {
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        if (connId) {
            const conn = activeProject?.jiraConnections?.find((c: any) => c.id === connId)
            if (conn) {
                const key = await api.secureStoreGet(`${prefix}jira_api_token_${connId}`) || await api.secureStoreGet(`jira_api_token_${connId}`)
                if (key) return { domain: conn.domain, email: conn.email, apiKey: key }
            }
        }
        return null
    }, [activeProject, api])

    const handleSync = async (specificSource?: 'linear' | 'jira') => {
        if (!activeProjectId || !activeProject) return
        const mode = specificSource || sourceMode
        if (mode === 'manual') return

        setIsSyncing(true)
        try {
            const prefix = activeProject ? `project:${activeProject.id}:` : ''
            if (mode === 'linear') {
                const conns = activeProject.linearConnections || []
                let allSyncedTasks: any[] = []
                let allColumns: any[] = []
                
                for (const conn of conns) {
                    const apiKey = await api.secureStoreGet(`${prefix}linear_api_key_${conn.id}`) || await api.secureStoreGet(`linear_api_key_${conn.id}`)
                    if (apiKey) {
                        const syncedTasks = await api.syncLinear({ apiKey, teamKey: conn.teamId, connectionId: conn.id })
                        allSyncedTasks = [...allSyncedTasks, ...syncedTasks]
                        const states = await api.getLinearWorkflowStates({ apiKey })
                        states.forEach((s: any) => {
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
                const otherSourceTasks = existing.filter((t: any) => t.source !== 'linear')
                await updateProject(activeProjectId, { tasks: [...otherSourceTasks, ...allSyncedTasks], columns: allColumns })
                await loadProjects()
            } else if (mode === 'jira') {
                const conns = activeProject.jiraConnections || []
                let allSyncedTasks: any[] = []
                for (const conn of conns) {
                    const apiKey = await api.secureStoreGet(`${prefix}jira_api_token_${conn.id}`) || await api.secureStoreGet(`jira_api_token_${conn.id}`)
                    if (apiKey) {
                        const syncedTasks = await api.syncJira({ domain: conn.domain, email: conn.email, apiKey, projectKey: conn.projectKey, connectionId: conn.id })
                        allSyncedTasks = [...allSyncedTasks, ...syncedTasks]
                    }
                }
                const existing = activeProject.tasks || []
                const otherSourceTasks = existing.filter((t: any) => t.source !== 'jira')
                await updateProject(activeProjectId, { tasks: [...otherSourceTasks, ...allSyncedTasks] })
                await loadProjects()
            }
        } catch (e: any) {
            toast.error(`Sync failed: ${e.message}`)
        } finally {
            setIsSyncing(false)
        }
    }

    const handleConfirmAddTask = async (taskData: any) => {
        if (!activeProjectId || !taskData.title.trim()) return
        try {
            if (taskData.source === 'manual') {
                await addTask(activeProjectId, taskData)
                setIsNewTaskModalOpen(false)
            } else if (taskData.source === 'linear') {
                const apiKey = await getLinearApiKey(taskData.connectionId)
                const conn = activeProject?.linearConnections?.find((c: any) => c.id === taskData.connectionId)
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
                const conn = activeProject?.jiraConnections?.find((c: any) => c.id === taskData.connectionId)
                if (!creds || !conn) throw new Error("Jira credentials missing.")
                const key = await api.createJiraIssue({ ...creds, projectKey: conn.projectKey, title: taskData.title, description: taskData.description })
                if (key) {
                    toast.success(`Jira issue ${key} created!`)
                    setIsNewTaskModalOpen(false)
                    handleSync('jira')
                }
            }
        } catch (e: any) {
            toast.error(`Failed: ${e.message}`)
        }
    }

    const handleAnalyzeIssue = async () => {
        if (!selectedTask || !activeProject) return
        const prefix = `project:${activeProject.id}:`
        const apiKey = await api.secureStoreGet(`${prefix}gemini_api_key`) || await api.secureStoreGet('gemini_api_key')
        if (!apiKey) { toast.error('Please set Gemini API key.'); return }

        setIsAnalyzing(true)
        try {
            const result = await api.aiAnalyzeIssue({ apiKey, task: selectedTask, comments: [], project: activeProject, modelName: activeProject.geminiModel })
            const historyEntry = {
                version: (selectedTask.analysisHistory?.length || 0) + 1,
                hash: "",
                timestamp: Date.now(),
                summary: result.substring(0, 150) + "...",
                fullResult: result,
                taskStatus: selectedTask.status,
                taskPriority: selectedTask.priority
            }
            const updatedHistory = [historyEntry, ...(selectedTask.analysisHistory || [])]
            await updateProject(activeProject.id, {
                tasks: tasks.map((t: Task) => t.id === selectedTask.id ? { ...t, analysisHistory: updatedHistory } : t)
            })
        } catch (e: any) {
            toast.error(`Analysis failed: ${e.message}`)
        } finally {
            setIsAnalyzing(false)
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
        
        const overColumn = currentColumns.find((c: any) => c.id === overId)
        if (overColumn) {
            if (activeTask && activeTask.status !== overColumn.id) {
                moveTask(activeProjectId, activeId, overColumn.id)
            }
        } else {
            const overTask = tasks.find((t: Task) => t.id === overId)
            if (overTask) moveTask(activeProjectId, activeId, overTask.status as TaskStatus, overId)
        }
    }

    const onDragEnd = (event: DragEndEvent) => {
        const { over } = event
        if (over && activeTask) {
            // DnD finished
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
                        <Button onClick={() => handleSync()} disabled={isSyncing} className="h-8 px-3 text-[11px] font-bold bg-[#A78BFA]/10 text-[#A78BFA] gap-1.5 border border-[#A78BFA]/20" variant="ghost">
                            {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Sync {sourceMode.charAt(0).toUpperCase() + sourceMode.slice(1)}
                        </Button>
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
                            {currentColumns.map((col: any) => (
                                <TaskColumn key={col.id} col={col} tasksInColumn={tasksByColumn[col.id] || []} selectedTaskId={selectedTaskId} setSelectedTaskId={setSelectedTaskId} sourceMode={sourceMode} onAddTask={() => setIsNewTaskModalOpen(true)} />
                            ))}
                        </div>
                        <DragOverlay>{activeTask ? <TaskCard task={activeTask} isOverlay /> : null}</DragOverlay>
                    </DndContext>
                </div>

                <TaskDetailsSidebar 
                    selectedTask={selectedTask}
                    activeProject={activeProject}
                    currentColumns={currentColumns}
                    onClose={() => setSelectedTaskId(null)}
                    onUpdateTask={async (updates) => {
                        if (activeProjectId && selectedTask) {
                            await updateProject(activeProjectId, {
                                tasks: tasks.map((t: Task) => t.id === selectedTask.id ? { ...t, ...updates, updatedAt: Date.now() } : t)
                            })
                            toast.success("Updated!")
                        }
                    }}
                    onAnalyze={handleAnalyzeIssue}
                    isAnalyzing={isAnalyzing}
                    onGenerateBugReport={async () => { /* reuse existing logic */ }}
                    onDeleteAnalysis={(h) => { console.log("Delete analysis", h) }}
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
                onOpenChange={open => !open && setTaskToDelete(null)}
                title="Delete Task" description="Permanent action." confirmText="Delete" variant="destructive"
                onConfirm={() => { if (activeProjectId && taskToDelete) deleteTask(activeProjectId, taskToDelete.id) }}
            />
        </div>
    )
}
