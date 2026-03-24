// cspell:ignore youtu
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragOverEvent,
    DragStartEvent,
    KeyboardSensor,
    PointerSensor,
    closestCorners,
    useSensor,
    useSensors
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { HelpCircle, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getApiKey, getConnectionApiKey } from "@/lib/credentials"
import { sanitizeProjectForQaAi, sanitizeTaskForQaAi } from "@/lib/aiUtils"
import {
    DEFAULT_TASK_FILTERS,
    TaskBoardFilters,
    TaskBoardColumn,
    TaskSortMode,
    applySummaryPreset,
    buildTriageSections,
    deriveTaskViewModels,
    filterTaskViewModels,
    getTaskBoardColumns,
    getTaskFilterOptions,
    getBoardMetrics,
    getSummaryRail,
    sortTaskViewModels
} from "@/lib/tasks"
import { useLinearAutoSync } from "@/hooks/useLinearAutoSync"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { TaskFilterBar } from "@/components/tasks/TaskFilterBar"
import { TaskCard } from "@/components/tasks/TaskCard"
import { TaskColumn } from "@/components/tasks/TaskColumn"
import { Project, Task, useActiveProjectTaskBoardContext, useProjectStore } from "@/store/useProjectStore"
import type { AnalysisEntry } from "@/types/project"
import { useShallow } from "zustand/react/shallow"

const TaskDetailsSidebar = lazy(() => import("@/components/tasks/TaskDetailsSidebar").then((module) => ({ default: module.TaskDetailsSidebar })))
const NewTaskModal = lazy(() => import("@/components/tasks/NewTaskModal").then((module) => ({ default: module.NewTaskModal })))
const TaskTriageView = lazy(() => import("@/components/tasks/TaskTriageView").then((module) => ({ default: module.TaskTriageView })))
const AnalysisResultDialog = lazy(() => import("@/components/tasks/AnalysisResultDialog"))

const FILTER_STORAGE_PREFIX = "qassistant:taskFilters:"
const BOARD_STORAGE_PREFIX = "qassistant:taskBoardMode:"
const SORT_STORAGE_PREFIX = "qassistant:taskSortMode:"
const FILTER_PANEL_STORAGE_PREFIX = "qassistant:taskFilterPanel:"
const FILTER_PRESETS_PREFIX = "qassistant:taskFilterPresets:"

type FilterPreset = { name: string; filters: TaskBoardFilters }

function loadPresets(projectId: string): FilterPreset[] {
    try {
        const raw = window.localStorage.getItem(`${FILTER_PRESETS_PREFIX}${projectId}`)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}

function savePresets(projectId: string, presets: FilterPreset[]) {
    window.localStorage.setItem(`${FILTER_PRESETS_PREFIX}${projectId}`, JSON.stringify(presets))
}

function toLinearColumn(state: { name: string; type?: string }) : TaskBoardColumn {
    const type = String(state.type || "").toLowerCase()
    if (type === "completed") return { id: state.name, title: state.name.toUpperCase(), textColor: "text-[#10B981]", color: "bg-[#10B981]", type: state.type }
    if (type === "canceled") return { id: state.name, title: state.name.toUpperCase(), textColor: "text-[#EF4444]", color: "bg-[#EF4444]", type: state.type }
    if (type === "started") return { id: state.name, title: state.name.toUpperCase(), textColor: "text-[#3B82F6]", color: "bg-[#3B82F6]", type: state.type }
    if (type === "unstarted") return { id: state.name, title: state.name.toUpperCase(), textColor: "text-[#6B7280]", color: "bg-[#6B7280]", type: state.type }
    return { id: state.name, title: state.name.toUpperCase(), textColor: "text-[#A78BFA]", color: "bg-[#A78BFA]", type: state.type }
}

function toJiraColumn(status: { name: string; category?: string }) : TaskBoardColumn {
    const category = String(status.category || "").toLowerCase()
    if (category.includes("done")) return { id: status.name, title: status.name.toUpperCase(), textColor: "text-[#10B981]", color: "bg-[#10B981]", type: "done" }
    if (category.includes("progress") || category.includes("indeterminate")) return { id: status.name, title: status.name.toUpperCase(), textColor: "text-[#3B82F6]", color: "bg-[#3B82F6]", type: "started" }
    return { id: status.name, title: status.name.toUpperCase(), textColor: "text-[#6B7280]", color: "bg-[#6B7280]", type: "unstarted" }
}

function loadJson<T>(key: string, fallback: T): T {
    try {
        const raw = window.localStorage.getItem(key)
        return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
    } catch {
        return fallback
    }
}

export default function TasksPage() {
    const api = window.electronAPI
    const activeProjectContext = useActiveProjectTaskBoardContext()
    const activeProjectId = activeProjectContext.activeProjectId
    const { addTask, deleteTask, moveTask, updateProject } = useProjectStore(useShallow((state) => ({
        addTask: state.addTask,
        deleteTask: state.deleteTask,
        moveTask: state.moveTask,
        updateProject: state.updateProject,
    })))
    const activeProject = useMemo<Project | null>(() => {
        if (!activeProjectContext.projectId) return null
        return {
            id: activeProjectContext.projectId,
            tasks: activeProjectContext.tasks,
            testPlans: activeProjectContext.testPlans,
            handoffPackets: activeProjectContext.handoffPackets,
            notes: activeProjectContext.notes,
            files: activeProjectContext.files,
            artifactLinks: activeProjectContext.artifactLinks,
            collaborationEvents: activeProjectContext.collaborationEvents,
            environments: activeProjectContext.environments,
            linearConnections: activeProjectContext.linearConnections,
            jiraConnections: activeProjectContext.jiraConnections,
            sourceColumns: activeProjectContext.sourceColumns,
            columns: activeProjectContext.columns,
            geminiModel: activeProjectContext.geminiModel,
        } as Project
    }, [activeProjectContext])
    const tasks = activeProjectContext.tasks

    const [activeTask, setActiveTask] = useState<Task | null>(null)
    const [detailsId, setDetailsId] = useState<string | null>(null)
    const [isAnalysisDialogOpen, setIsAnalysisDialogOpen] = useState(false)
    const [currentAnalysisResult, setCurrentAnalysisResult] = useState<string | null>(null)
    const [taskBeingAnalyzed, setTaskBeingAnalyzed] = useState<Task | null>(null)
    const [sourceMode, setSourceMode] = useState<"manual" | "linear" | "jira">("manual")
    const [sortMode, setSortMode] = useState<TaskSortMode>("manual")
    const [boardMode, setBoardMode] = useState<"board" | "triage">("board")
    const [filters, setFiltersState] = useState<TaskBoardFilters>(DEFAULT_TASK_FILTERS)
    const [isFilterPanelCollapsed, setIsFilterPanelCollapsed] = useState(true)
    const [isSyncing, setIsSyncing] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false)
    const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false)
    const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)
    const [syncTimestamp, setSyncTimestamp] = useState<number | null>(null)
    const [newTaskStatus, setNewTaskStatus] = useState<string | null>(null)
    const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([])
    const [presetNameInput, setPresetNameInput] = useState("")
    const [showPresetInput, setShowPresetInput] = useState(false)

    useEffect(() => {
        if (!activeProjectId) return
        setFiltersState(loadJson(`${FILTER_STORAGE_PREFIX}${activeProjectId}`, DEFAULT_TASK_FILTERS))
        setBoardMode(loadJson(`${BOARD_STORAGE_PREFIX}${activeProjectId}`, { value: "board" }).value as "board" | "triage")
        setSortMode(loadJson(`${SORT_STORAGE_PREFIX}${activeProjectId}`, { value: "manual" }).value as TaskSortMode)
        setIsFilterPanelCollapsed(loadJson(`${FILTER_PANEL_STORAGE_PREFIX}${activeProjectId}`, { value: true }).value as boolean)
        setFilterPresets(loadPresets(activeProjectId))
        setShowPresetInput(false)
        setPresetNameInput("")
    }, [activeProjectId])

    const setFilters = useCallback((updater: (current: TaskBoardFilters) => TaskBoardFilters) => {
        setFiltersState((current) => {
            const next = updater(current)
            if (activeProjectId) window.localStorage.setItem(`${FILTER_STORAGE_PREFIX}${activeProjectId}`, JSON.stringify(next))
            return next
        })
    }, [activeProjectId])

    const persistBoardMode = (mode: "board" | "triage") => {
        setBoardMode(mode)
        if (activeProjectId) window.localStorage.setItem(`${BOARD_STORAGE_PREFIX}${activeProjectId}`, JSON.stringify({ value: mode }))
    }

    const persistSortMode = (mode: TaskSortMode) => {
        setSortMode(mode)
        if (activeProjectId) window.localStorage.setItem(`${SORT_STORAGE_PREFIX}${activeProjectId}`, JSON.stringify({ value: mode }))
    }

    const persistFilterPanelCollapsed = (collapsed: boolean) => {
        setIsFilterPanelCollapsed(collapsed)
        if (activeProjectId) window.localStorage.setItem(`${FILTER_PANEL_STORAGE_PREFIX}${activeProjectId}`, JSON.stringify({ value: collapsed }))
    }

    const selectedTask = useMemo(() => tasks.find((task: Task) => task.id === detailsId) || null, [tasks, detailsId])

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "/") {
                event.preventDefault()
                setIsShortcutModalOpen((value) => !value)
            }
            if (event.key === "Escape") {
                if (isShortcutModalOpen) setIsShortcutModalOpen(false)
                else setDetailsId(null)
            }
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [isShortcutModalOpen])

    const effectiveSource = filters.source === "all" ? sourceMode : filters.source
    const taskViewModels = useMemo(() => activeProject ? deriveTaskViewModels(activeProject) : [], [activeProject])
    const sourceTaskViewModels = useMemo(() => taskViewModels.filter((task) => (task.task.source || "manual") === effectiveSource), [taskViewModels, effectiveSource])
    const currentColumns = useMemo(() => activeProject ? getTaskBoardColumns(activeProject, effectiveSource) : [], [activeProject, effectiveSource])
    const filterOptions = useMemo(() => getTaskFilterOptions(sourceTaskViewModels), [sourceTaskViewModels])
    const filteredTaskViews = useMemo(() => filterTaskViewModels(taskViewModels, { ...filters, source: effectiveSource }, null, currentColumns), [filters, effectiveSource, taskViewModels, currentColumns])
    const sortedTaskViews = useMemo(() => sortTaskViewModels(filteredTaskViews, sortMode), [filteredTaskViews, sortMode])
    const tasksByColumn = useMemo(() => currentColumns.reduce((acc, col) => {
        acc[col.id] = sortedTaskViews.filter((task) => task.task.status === col.id)
        return acc
    }, {} as Record<string, typeof sortedTaskViews>), [sortedTaskViews, currentColumns])
    const boardMetrics = useMemo(() => getBoardMetrics(filteredTaskViews, filters.assignee !== "all" ? filters.assignee : null, currentColumns), [filteredTaskViews, filters.assignee, currentColumns])
    const summaryRail = useMemo(() => getSummaryRail(filteredTaskViews), [filteredTaskViews])
    const triageSections = useMemo(() => buildTriageSections(sortedTaskViews), [sortedTaskViews])

    const getLinearApiKey = useCallback(async (connectionId?: string) => getConnectionApiKey(api, "linear_api_key", connectionId, activeProject?.id), [activeProject, api])

    const getJiraCredentials = useCallback(async (connectionId?: string) => {
        if (connectionId) {
            const connection = activeProject?.jiraConnections?.find((item) => item.id === connectionId)
            if (connection) {
                const apiKey = await api.secureStoreGet(`project:${activeProject?.id}:jira_api_token_${connectionId}`) || await api.secureStoreGet(`jira_api_token_${connectionId}`)
                if (apiKey) return { domain: connection.domain, email: connection.email, apiKey }
            }
        }
        return null
    }, [activeProject, api])

    const syncLinearTasks = useCallback(async (allSyncedTasks: Task[]) => {
        if (!activeProjectId || !activeProject) return
        const allColumns: TaskBoardColumn[] = []
        for (const connection of activeProject.linearConnections || []) {
            const apiKey = await getConnectionApiKey(api, "linear_api_key", connection.id, activeProject.id)
            if (!apiKey) continue
            const states = await api.getLinearWorkflowStates({ apiKey, teamId: connection.teamId })
            states.forEach((state: { name: string; type?: string }) => {
                if (allColumns.find((column) => column.id === state.name)) return
                allColumns.push(toLinearColumn(state))
            })
        }
        const otherSourceTasks = (activeProject.tasks || []).filter((task) => task.source !== "linear")
        await updateProject(activeProjectId, {
            tasks: [...otherSourceTasks, ...allSyncedTasks],
            sourceColumns: { ...(activeProject.sourceColumns || {}), linear: allColumns }
        })
        setSyncTimestamp(Date.now())
    }, [activeProjectId, activeProject, api, updateProject])

    const formatRelativeTime = (timestamp: number) => {
        const diffSeconds = Math.floor((Date.now() - timestamp) / 1000)
        if (diffSeconds < 60) return "just now"
        if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`
        if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`
        return `${Math.floor(diffSeconds / 86400)}d ago`
    }

    useEffect(() => {
        const interval = setInterval(() => setSyncTimestamp((value) => value), 30000)
        return () => clearInterval(interval)
    }, [])

    const { lastSyncedAt } = useLinearAutoSync({
        activeProject: activeProject || null,
        sourceMode,
        api,
        onSyncComplete: syncLinearTasks,
        intervalMs: 45_000
    })

    const displaySyncTime = lastSyncedAt || syncTimestamp

    const handleSync = async (specificSource?: "linear" | "jira") => {
        if (!activeProjectId || !activeProject) return
        const mode = specificSource || sourceMode
        if (mode === "manual") return
        setIsSyncing(true)
        try {
            if (mode === "linear") {
                let allSyncedTasks: Task[] = []
                for (const connection of activeProject.linearConnections || []) {
                    const apiKey = await getConnectionApiKey(api, "linear_api_key", connection.id, activeProject.id)
                    if (!apiKey) continue
                    const syncedTasks = await api.syncLinear({ apiKey, teamKey: connection.teamId, connectionId: connection.id })
                    allSyncedTasks = [...allSyncedTasks, ...syncedTasks]
                }
                await syncLinearTasks(allSyncedTasks)
            } else {
                let allSyncedTasks: Task[] = []
                for (const connection of activeProject.jiraConnections || []) {
                    const apiKey = await getConnectionApiKey(api, "jira_api_token", connection.id, activeProject.id)
                    if (!apiKey) continue
                    const syncedTasks = await api.syncJira({ domain: connection.domain, email: connection.email, apiKey, projectKey: connection.projectKey, connectionId: connection.id })
                    allSyncedTasks = [...allSyncedTasks, ...syncedTasks]
                }
                const otherSourceTasks = (activeProject.tasks || []).filter((task) => task.source !== "jira")
                const jiraColumns: TaskBoardColumn[] = []
                for (const connection of activeProject.jiraConnections || []) {
                    const apiKey = await getConnectionApiKey(api, "jira_api_token", connection.id, activeProject.id)
                    if (!apiKey) continue
                    const statuses = await api.getJiraStatuses({ domain: connection.domain, email: connection.email, apiKey, projectKey: connection.projectKey })
                    statuses.forEach((status: { name: string; category?: string }) => {
                        if (jiraColumns.find((column) => column.id === status.name)) return
                        jiraColumns.push(toJiraColumn(status))
                    })
                }
                await updateProject(activeProjectId, {
                    tasks: [...otherSourceTasks, ...allSyncedTasks],
                    sourceColumns: { ...(activeProject.sourceColumns || {}), jira: jiraColumns }
                })
                setSyncTimestamp(Date.now())
            }
        } catch (error) {
            toast.error(`Sync failed: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
            setIsSyncing(false)
        }
    }

    const handleConfirmAddTask = async (taskData: Partial<Task> & { title: string; source?: string; connectionId?: string; priority?: string }) => {
        if (!activeProjectId || !taskData.title.trim()) return
        try {
            if (taskData.source === "manual") {
                await addTask(activeProjectId, taskData)
                setIsNewTaskModalOpen(false)
            } else if (taskData.source === "linear") {
                const apiKey = await getLinearApiKey(taskData.connectionId)
                const connection = activeProject?.linearConnections?.find((item) => item.id === taskData.connectionId)
                if (!apiKey || !connection) throw new Error("Linear credentials missing.")
                const url = await api.createLinearIssue({
                    apiKey,
                    teamId: connection.teamId,
                    title: taskData.title,
                    description: taskData.description,
                    priority: taskData.priority === "critical" ? 1 : taskData.priority === "high" ? 2 : taskData.priority === "medium" ? 3 : 4
                })
                if (url) {
                    toast.success("Linear issue created.")
                    setIsNewTaskModalOpen(false)
                    handleSync("linear")
                }
            } else if (taskData.source === "jira") {
                const credentials = await getJiraCredentials(taskData.connectionId)
                const connection = activeProject?.jiraConnections?.find((item) => item.id === taskData.connectionId)
                if (!credentials || !connection) throw new Error("Jira credentials missing.")
                const key = await api.createJiraIssue({ ...credentials, projectKey: connection.projectKey, title: taskData.title, description: taskData.description })
                if (key) {
                    toast.success(`Jira issue ${key} created.`)
                    setIsNewTaskModalOpen(false)
                    handleSync("jira")
                }
            }
        } catch (error) {
            toast.error(`Failed: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    const handleAnalyzeIssue = async (task: Task) => {
        const apiKey = await getApiKey(api, "gemini_api_key", activeProjectId)
        if (!apiKey) {
            toast.error("Please set your Gemini API key in Settings.")
            return
        }

        setIsLoading(true)
        setTaskBeingAnalyzed(task)
        try {
            let comments: unknown[] = []
            if (task.source === "linear" && task.sourceIssueId) {
                const linearKey = await getLinearApiKey(task.connectionId)
                if (linearKey) comments = await api.getLinearComments({ apiKey: linearKey, issueId: task.sourceIssueId })
            } else if (task.source === "jira" && task.externalId) {
                const credentials = await getJiraCredentials(task.connectionId)
                if (credentials) comments = await api.getJiraComments({ ...credentials, issueKey: task.externalId })
            }

            const result = await api.aiAnalyzeIssue({
                apiKey,
                task: sanitizeTaskForQaAi(task, activeProject?.environments || []),
                comments,
                project: sanitizeProjectForQaAi(activeProject ?? undefined),
                modelName: activeProject?.geminiModel
            })

            const historyEntry: AnalysisEntry = {
                version: (task.analysisHistory?.length || 0) + 1,
                hash: crypto.randomUUID(),
                timestamp: Date.now(),
                summary: result.split("\n")[0].slice(0, 100),
                fullResult: result,
                taskStatus: task.status,
                taskPriority: task.priority
            }

            await updateProject(activeProjectId!, {
                tasks: activeProject!.tasks.map((entry: Task) => entry.id === task.id ? { ...entry, analysisHistory: [historyEntry, ...(entry.analysisHistory || [])] } : entry)
            })

            setCurrentAnalysisResult(result)
            setIsAnalysisDialogOpen(true)
            toast.success("Analysis complete")
        } catch (error) {
            toast.error(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
            setIsLoading(false)
        }
    }

    const onDragStart = (event: DragStartEvent) => {
        if (sortMode !== "manual") return
        const task = tasks.find((entry: Task) => entry.id === event.active.id)
        if (task) setActiveTask(task)
    }

    const onDragOver = (event: DragOverEvent) => {
        if (sortMode !== "manual") return
        const { active, over } = event
        if (!over || !activeProjectId) return
        const activeId = active.id.toString()
        const overId = over.id.toString()

        const overColumn = currentColumns.find((column) => column.id === overId)
        if (overColumn) {
            if (activeTask && activeTask.status !== overColumn.id) moveTask(activeProjectId, activeId, overColumn.id)
            return
        }

        const overTask = tasks.find((entry: Task) => entry.id === overId)
        if (overTask?.status) moveTask(activeProjectId, activeId, overTask.status, overId)
    }

    const onDragEnd = async (event: DragEndEvent) => {
        if (sortMode !== "manual") {
            setActiveTask(null)
            return
        }
        const { over } = event
        if (over && activeTask) {
            try {
                const overColumnId = over.id.toString()
                const overColumn = currentColumns.find((column) => column.id === overColumnId)
                const overTask = !overColumn ? tasks.find((entry: Task) => entry.id === overColumnId) : null
                const newStatus = overColumn?.id ?? overTask?.status

                if (newStatus && activeTask.status !== newStatus) {
                    if (activeTask.source === "linear" && activeTask.externalId) {
                        const apiKey = await getLinearApiKey(activeTask.connectionId)
                        if (apiKey) {
                            const connection = activeProject?.linearConnections?.find((item) => item.id === activeTask.connectionId)
                            if (!connection?.teamId) throw new Error("Linear connection configuration is missing.")
                            const states = await api.getLinearWorkflowStates({ apiKey, teamId: connection.teamId })
                            const targetState = states.find((state: { id: string; name: string }) => state.name === newStatus)
                            if (!targetState?.id) throw new Error(`Could not find Linear state: ${newStatus}`)
                            await api.updateLinearStatus({ apiKey, issueId: activeTask.externalId, stateId: targetState.id })
                        }
                    } else if (activeTask.source === "jira" && activeTask.externalId) {
                        const credentials = await getJiraCredentials(activeTask.connectionId)
                        if (credentials) await api.transitionJiraIssue({ ...credentials, issueKey: activeTask.externalId, transitionName: newStatus })
                    }
                }
            } catch (error) {
                toast.error(`Failed to sync status: ${error instanceof Error ? error.message : String(error)}`)
            }
        }
        setActiveTask(null)
    }

    const handleUpdateTask = async (updates: Partial<Task>) => {
        if (!activeProjectId || !selectedTask) return
        if (updates.status && selectedTask.status !== updates.status) {
            try {
                if (selectedTask.source === "linear" && selectedTask.externalId) {
                    const apiKey = await getLinearApiKey(selectedTask.connectionId)
                    const connection = activeProject?.linearConnections?.find((item) => item.id === selectedTask.connectionId)
                    if (apiKey) {
                        const states = await api.getLinearWorkflowStates({ apiKey, teamId: connection?.teamId })
                        const targetState = states.find((state: { id: string; name: string }) => state.name === updates.status)
                        if (targetState?.id) await api.updateLinearStatus({ apiKey, issueId: selectedTask.externalId, stateId: targetState.id })
                    }
                } else if (selectedTask.source === "jira" && selectedTask.externalId) {
                    const credentials = await getJiraCredentials(selectedTask.connectionId)
                    if (credentials) await api.transitionJiraIssue({ ...credentials, issueKey: selectedTask.externalId, transitionName: updates.status })
                }
            } catch {
                toast.error(`Failed to update status on ${selectedTask.source === "linear" ? "Linear" : "Jira"}`)
            }
        }

        await updateProject(activeProjectId, {
            tasks: tasks.map((task: Task) => task.id === selectedTask.id ? { ...task, ...updates, updatedAt: Date.now() } : task)
        })
        toast.success("Updated")
    }

    const handleCopyReference = useCallback(async (taskId: string) => {
        const task = tasks.find((entry) => entry.id === taskId)
        if (!task) return
        await navigator.clipboard.writeText(task.sourceIssueId || task.externalId || task.title)
        toast.success("Task reference copied")
    }, [tasks])

    const openExternalTask = useCallback((taskId: string) => {
        const task = tasks.find((entry) => entry.id === taskId)
        if (task?.ticketUrl) api.openUrl(task.ticketUrl)
    }, [tasks, api])

    const handleAddTask = useCallback((status?: string) => {
        setNewTaskStatus(status || "todo")
        setIsNewTaskModalOpen(true)
    }, [])

    const handleFilterColumn = useCallback((status: string) => {
        setFilters((current) => ({ ...current, status }))
    }, [])

    const handleAnalyzeTaskById = useCallback((taskId: string) => {
        const task = tasks.find((entry) => entry.id === taskId)
        if (task) handleAnalyzeIssue(task)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasks])

    const clearFilters = () => setFilters(() => ({ ...DEFAULT_TASK_FILTERS, source: sourceMode }))

    const activeFilterCount = useMemo(() => {
        let count = 0
        if (filters.search.trim()) count++
        if (filters.assignee !== "all") count++
        if (filters.priority !== "all") count++
        if (filters.severity !== "all") count++
        if (filters.collabState !== "all") count++
        if (filters.handoffState !== "all") count++
        if (filters.dueState !== "all") count++
        if (filters.coverageState !== "all") count++
        if (filters.component !== "all") count++
        if (filters.label !== "all") count++
        if (filters.sprint !== "all") count++
        if (filters.version) count++
        if (filters.onlyMine) count++
        if (!filters.onlyActive) count++
        if (filters.status !== "all") count++
        return count
    }, [filters])

    const boardStatusText = useMemo(() => {
        const parts = [
            `${boardMetrics.open} open`,
            `${boardMetrics.readyForQa} ready for QA`,
            `${boardMetrics.needsEvidence} need evidence`,
            `${boardMetrics.overdue} overdue`,
        ]
        if (sourceMode !== "manual" && displaySyncTime) {
            parts.push(`last synced ${formatRelativeTime(displaySyncTime)}`)
        }
        return parts.join(" | ")
    }, [boardMetrics.needsEvidence, boardMetrics.open, boardMetrics.overdue, boardMetrics.readyForQa, displaySyncTime, sourceMode])

    const saveFilterPreset = () => {
        if (!activeProjectId || !presetNameInput.trim()) return
        const next = [...filterPresets.filter(p => p.name !== presetNameInput.trim()), { name: presetNameInput.trim(), filters }]
        setFilterPresets(next)
        savePresets(activeProjectId, next)
        setPresetNameInput("")
        setShowPresetInput(false)
    }

    const applyFilterPreset = (preset: FilterPreset) => {
        setFilters(() => preset.filters)
    }

    const deleteFilterPreset = (name: string) => {
        if (!activeProjectId) return
        const next = filterPresets.filter(p => p.name !== name)
        setFilterPresets(next)
        savePresets(activeProjectId, next)
    }

    const noExternalConnections = sourceMode === "linear"
        ? (activeProject?.linearConnections?.length ?? 0) === 0
        : sourceMode === "jira"
            ? (activeProject?.jiraConnections?.length ?? 0) === 0
            : false

    return (
        <div className="flex h-full flex-col overflow-hidden text-[#E2E8F0] animate-in fade-in duration-500">
            <header className="flex-none space-y-3 border-b border-[#2A2A3A] bg-[#0F0F13] px-6 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-[240px]">
                        <h1 className="text-xl font-semibold tracking-tight text-[#E2E8F0]">Tasks</h1>
                        <p className="mt-1 text-xs text-[#8E9196]">{boardStatusText}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex rounded-lg border border-[#2A2A3A] bg-[#111118] p-1">
                            {(["manual", "linear", "jira"] as const).map((mode) => (
                                <Button
                                    key={mode}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setSourceMode(mode)
                                        setFilters((current) => ({ ...current, source: mode }))
                                    }}
                                    className={cn("h-8 px-3 text-[11px] font-medium transition-all", sourceMode === mode ? "bg-[#1A1A24] text-[#E2E8F0]" : "text-[#6B7280] hover:text-[#E2E8F0]")}
                                >
                                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                </Button>
                            ))}
                        </div>
                        <Button onClick={() => { setNewTaskStatus(currentColumns[0]?.id || "todo"); setIsNewTaskModalOpen(true) }} disabled={!activeProjectId} className="h-9 gap-2 border border-[#A78BFA]/20 bg-[#1A1A24] px-4 text-xs font-medium text-[#E2E8F0] hover:bg-[#21212E]">
                            <Plus className="h-3.5 w-3.5" /> New Task
                        </Button>
                    </div>
                </div>

                <TaskFilterBar
                    filters={{ ...filters, source: filters.source === "all" ? sourceMode : filters.source }}
                    setFilters={setFilters}
                    versions={filterOptions.versions}
                    assignees={filterOptions.assignees}
                    components={filterOptions.components}
                    statuses={filterOptions.statuses}
                    labels={filterOptions.labels}
                    sprints={filterOptions.sprints}
                    boardMode={boardMode}
                    onBoardModeChange={persistBoardMode}
                    sortMode={sortMode}
                    onSortModeChange={persistSortMode}
                    onClear={clearFilters}
                    collapsed={isFilterPanelCollapsed}
                    onCollapsedChange={persistFilterPanelCollapsed}
                    activeFilterCount={activeFilterCount}
                    presets={filterPresets}
                    onApplyPreset={(name) => {
                        const preset = filterPresets.find((entry) => entry.name === name)
                        if (preset) applyFilterPreset(preset)
                    }}
                    onDeletePreset={deleteFilterPreset}
                    onShowPresetInput={() => setShowPresetInput(true)}
                    showPresetInput={showPresetInput}
                    presetInput={presetNameInput}
                    onPresetInputChange={setPresetNameInput}
                    onSavePreset={saveFilterPreset}
                    onCancelPreset={() => setShowPresetInput(false)}
                    summaryItems={summaryRail}
                    onSelectSummary={(id) => setFilters((current) => applySummaryPreset(id, current))}
                    onSync={sourceMode !== "manual" ? () => handleSync() : undefined}
                    syncLabel={sourceMode !== "manual" ? `Sync ${sourceMode.charAt(0).toUpperCase() + sourceMode.slice(1)}` : undefined}
                    syncMeta={sourceMode !== "manual" && displaySyncTime ? `Last synced ${formatRelativeTime(displaySyncTime)}` : undefined}
                    syncDisabled={isSyncing}
                    onOpenShortcuts={() => setIsShortcutModalOpen(true)}
                />
            </header>

            <div className="flex min-h-0 flex-1">
                <div className="flex-1 overflow-hidden bg-[#0F0F13]">
                    <div className="flex h-full min-h-0 flex-col p-4">
                        <div className="min-h-0 flex-1">
                            {noExternalConnections ? (
                            <div className="rounded-xl border border-[#2A2A3A] bg-[#13131A] p-8 text-center">
                                <h3 className="text-lg font-semibold text-[#E2E8F0]">No {sourceMode} connection configured</h3>
                                <p className="mt-2 text-sm text-[#9CA3AF]">Connect {sourceMode} in Settings to sync upstream tasks. Local enrichment stays in QAssistant after sync.</p>
                            </div>
                        ) : sortedTaskViews.length === 0 ? (
                            <div className="rounded-xl border border-[#2A2A3A] bg-[#13131A] p-8 text-center">
                                <h3 className="text-lg font-semibold text-[#E2E8F0]">No tasks match the current view</h3>
                                <p className="mt-2 text-sm text-[#9CA3AF]">Try clearing filters, changing source, or creating a new task.</p>
                            </div>
                        ) : boardMode === "triage" ? (
                            <div className="h-full overflow-y-auto custom-scrollbar">
                                <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-[#6B7280]">Loading triage view...</div>}>
                                    <TaskTriageView
                                        sections={triageSections}
                                        selectedTaskId={detailsId}
                                        onSelectTask={setDetailsId}
                                        onAnalyzeTask={handleAnalyzeIssue}
                                    />
                                </Suspense>
                            </div>
                        ) : (
                            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
                                <div className="flex h-full min-h-0 min-w-0">
                                    <div className="flex min-h-0 min-w-0 flex-1 overflow-x-auto pb-2 custom-scrollbar">
                                        <div className="flex min-h-0 w-max min-w-max gap-4 pr-4">
                                        {currentColumns.map((col) => (
                                            <TaskColumn
                                                key={col.id}
                                                col={col}
                                                tasksInColumn={tasksByColumn[col.id] || []}
                                                selectedTaskId={detailsId}
                                                setSelectedTaskId={setDetailsId}
                                                sourceMode={effectiveSource}
                                                onAddTask={handleAddTask}
                                                onAnalyzeTask={handleAnalyzeTaskById}
                                                onOpenExternal={openExternalTask}
                                                onCopyReference={handleCopyReference}
                                                onFilterColumn={handleFilterColumn}
                                                dragDisabled={sortMode !== "manual"}
                                                sortMode={sortMode}
                                            />
                                        ))}
                                        </div>
                                    </div>
                                </div>
                                <DragOverlay>
                                    {activeTask ? <TaskCard task={activeTask} taskView={taskViewModels.find((task) => task.task.id === activeTask.id)} isOverlay /> : null}
                                </DragOverlay>
                            </DndContext>
                        )}
                        </div>
                    </div>
                </div>

                <Suspense fallback={null}>
                    <TaskDetailsSidebar
                        selectedTask={selectedTask}
                        activeProject={activeProject ?? undefined}
                        currentColumns={currentColumns}
                        onClose={() => setDetailsId(null)}
                        onUpdateTask={handleUpdateTask}
                        onAnalyze={handleAnalyzeIssue}
                        isAnalyzing={isLoading}
                        onGenerateBugReport={async () => {
                            if (!activeProject || !selectedTask) return
                            try {
                                const environment = activeProject.environments.find((entry) => entry.isDefault) || activeProject.environments[0]
                                const result = await api.generateBugReportTask({
                                    task: selectedTask,
                                    environment,
                                    reporter: "QA Assistant",
                                    aiAnalysis: selectedTask.analysisHistory?.[0]?.fullResult
                                })
                                if (!result.success) throw new Error(result.error)
                                toast.success("Bug report generated and saved to attachments.")
                                if (result.attachment?.filePath) await api.openFile({ filePath: result.attachment.filePath })
                            } catch (error) {
                                toast.error(error instanceof Error ? error.message : String(error))
                            }
                        }}
                        onViewAnalysis={(entry) => {
                            if (!selectedTask) return
                            setTaskBeingAnalyzed(selectedTask)
                            setCurrentAnalysisResult(entry.fullResult || entry.summary || null)
                            setIsAnalysisDialogOpen(true)
                        }}
                        onDelete={() => setTaskToDelete(selectedTask)}
                        onDeleteAnalysis={async (entry) => {
                            if (!activeProjectId || !selectedTask) return
                            const updatedHistory = (selectedTask.analysisHistory || []).filter((history: AnalysisEntry) => history.timestamp !== entry.timestamp)
                            await updateProject(activeProjectId, {
                                tasks: tasks.map((task: Task) => task.id === selectedTask.id ? { ...task, analysisHistory: updatedHistory } : task)
                            })
                            toast.success("Analysis deleted")
                        }}
                        api={api}
                    />
                </Suspense>
            </div>

            <Suspense fallback={null}>
                <NewTaskModal
                    isOpen={isNewTaskModalOpen}
                    onOpenChange={setIsNewTaskModalOpen}
                    activeProject={activeProject ?? undefined}
                    currentColumns={currentColumns}
                    onConfirm={handleConfirmAddTask}
                    initialStatus={newTaskStatus}
                />
            </Suspense>

            <ConfirmDialog
                open={!!taskToDelete}
                onCancel={() => setTaskToDelete(null)}
                title="Delete Task"
                description="Permanent action."
                confirmLabel="Delete"
                destructive
                onConfirm={() => { if (activeProjectId && taskToDelete) deleteTask(activeProjectId, taskToDelete.id) }}
            />

            <Suspense fallback={null}>
                <AnalysisResultDialog
                    open={isAnalysisDialogOpen}
                    onOpenChange={setIsAnalysisDialogOpen}
                    result={currentAnalysisResult}
                    taskTitle={taskBeingAnalyzed?.title || "Issue Analysis"}
                    projectId={activeProjectId || undefined}
                />
            </Suspense>

            <>
                <div className={cn("fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm transition-opacity duration-200", isShortcutModalOpen ? "opacity-100" : "pointer-events-none opacity-0")} onClick={() => setIsShortcutModalOpen(false)} />
                <div className={cn("fixed left-1/2 top-1/2 z-[201] -translate-x-1/2 -translate-y-1/2 transition-all duration-200", isShortcutModalOpen ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0")}>
                    <div className="w-[380px] rounded-2xl border border-[#2A2A3A] bg-[#13131A] p-6 shadow-2xl">
                        <div className="mb-5 flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-[#E2E8F0]">Keyboard Shortcuts</h3>
                            <button onClick={() => setIsShortcutModalOpen(false)} className="rounded-md p-1 text-[#6B7280] transition-colors hover:bg-[#252535] hover:text-[#E2E8F0]">
                                <HelpCircle className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="space-y-3">
                            {[{ keys: ["Ctrl", "/"], description: "Toggle shortcut help" }, { keys: ["Esc"], description: "Close task details / close modal" }].map(({ keys, description }) => (
                                <div key={description} className="flex items-center justify-between border-b border-[#2A2A3A]/60 py-2 last:border-0">
                                    <span className="text-xs text-[#9CA3AF]">{description}</span>
                                    <div className="flex items-center gap-1">
                                        {keys.map((key) => <kbd key={key} className="rounded border border-[#2A2A3A] bg-[#1A1A24] px-2 py-0.5 font-mono text-[10px] font-bold text-[#A78BFA]">{key}</kbd>)}
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
