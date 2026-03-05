import { useState, useMemo, useEffect, useCallback } from "react"
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
    Loader2,
    Globe,
    Image as ImageIcon,
    PlayCircle,
    HelpCircle,
    Command
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
    useDroppable,
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
    const [analysisModalResult, setAnalysisModalResult] = useState<string | null>(null)
    const [comments, setComments] = useState<any[]>([])
    const [history, setHistory] = useState<any[]>([])
    const [worklog, setWorklog] = useState<any[]>([])
    const [isLoadingTab, setIsLoadingTab] = useState(false)
    const [newComment, setNewComment] = useState("")
    const [isPostingComment, setIsPostingComment] = useState(false)
    const [activeTab, setActiveTab] = useState('description')
    const [expandedHistory, setExpandedHistory] = useState<Set<number>>(new Set())
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
    const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false)
    const [rateLimitBanner, setRateLimitBanner] = useState<string | null>(null)

    // Edit states for manual tasks
    const [isEditing, setIsEditing] = useState(false)
    const [editTitle, setEditTitle] = useState("")
    const [editDescription, setEditDescription] = useState("")
    const [editStatus, setEditStatus] = useState<TaskStatus>('todo')
    const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
    const [editAssignee, setEditAssignee] = useState("")
    const [editLabels, setEditLabels] = useState("")


    const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId) || null, [tasks, selectedTaskId])

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const filteredTasks = useMemo(() => {
        return tasks.filter(t => {
            const q = searchQuery.toLowerCase()
            const matchesSearch = t.title.toLowerCase().includes(q) ||
                t.sourceIssueId?.toLowerCase().includes(q) ||
                t.description?.toLowerCase().includes(q)

            if (!matchesSearch) return false

            if (sourceMode === 'manual') return t.source === 'manual' || !t.source
            return t.source === sourceMode
        })
    }, [tasks, searchQuery, sourceMode])

    const tasksByColumn = useMemo(() => {
        return COLUMNS.reduce((acc, col) => {
            acc[col.id] = filteredTasks.filter(t => t.status === col.id)
            return acc
        }, {} as Record<TaskStatus, Task[]>)
    }, [filteredTasks])

    // Sync selected task to edit state
    useEffect(() => {
        if (selectedTask && selectedTask.source === 'manual') {
            setEditTitle(selectedTask.title)
            setEditDescription(selectedTask.description || "")
            setEditStatus(selectedTask.status)
            setEditPriority(selectedTask.priority)
            setEditAssignee(selectedTask.assignee || "")
            setEditLabels(selectedTask.labels || "")
            setIsEditing(false)
        }
    }, [selectedTask])

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === '/') {
                e.preventDefault()
                setIsShortcutModalOpen(prev => !prev)
            }
            if (e.key === 'Escape') {
                if (lightboxUrl) setLightboxUrl(null)
                else if (isShortcutModalOpen) setIsShortcutModalOpen(false)
                else setSelectedTaskId(null)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [lightboxUrl, isShortcutModalOpen])

    // Auto-hide rate limit banner
    useEffect(() => {
        if (rateLimitBanner) {
            const timer = setTimeout(() => setRateLimitBanner(null), 8000)
            return () => clearTimeout(timer)
        }
    }, [rateLimitBanner])

    const loadTabContent = useCallback(async (tab: string) => {
        if (!selectedTask) return
        setActiveTab(tab)
        setIsLoadingTab(true)
        try {
            const connId = selectedTask.connectionId
            const prefix = activeProject ? `project:${activeProject.id}:` : ''
            if (tab === 'comments') {
                if (selectedTask.source === 'linear') {
                    const key = await api.secureStoreGet(connId ? `${prefix}linear_api_key_${connId}` : `${prefix}linear_api_key`) || await api.secureStoreGet(connId ? `linear_api_key_${connId}` : 'linear_api_key')
                    if (key) setComments(await api.getLinearComments({ apiKey: key, issueId: selectedTask.externalId }))
                } else if (selectedTask.source === 'jira') {
                    const conn = activeProject?.jiraConnections?.find(c => c.id === connId)
                    let domain = '', email = '', key = ''
                    if (conn) {
                        domain = conn.domain; email = conn.email;
                        key = await api.secureStoreGet(connId ? `${prefix}jira_api_token_${connId}` : `${prefix}jira_api_key`) || await api.secureStoreGet(connId ? `jira_api_token_${connId}` : 'jira_api_key')
                    } else {
                        domain = await api.secureStoreGet(`${prefix}jira_domain`) || await api.secureStoreGet('jira_domain') || ''
                        email = await api.secureStoreGet(`${prefix}jira_email`) || await api.secureStoreGet('jira_email') || ''
                        key = await api.secureStoreGet(`${prefix}jira_api_key`) || await api.secureStoreGet('jira_api_key') || ''
                    }
                    if (domain && email && key) setComments(await api.getJiraComments({ domain, email, apiKey: key, issueKey: selectedTask.sourceIssueId }))
                }
            } else if (tab === 'worklog') {
                if (selectedTask.source === 'linear') {
                    const key = await api.secureStoreGet(connId ? `${prefix}linear_api_key_${connId}` : `${prefix}linear_api_key`) || await api.secureStoreGet(connId ? `linear_api_key_${connId}` : 'linear_api_key')
                    if (key) setWorklog(await api.getLinearHistory({ apiKey: key, issueId: selectedTask.externalId }))
                } else if (selectedTask.source === 'jira') {
                    const conn = activeProject?.jiraConnections?.find(c => c.id === connId)
                    let domain = '', email = '', key = ''
                    if (conn) {
                        domain = conn.domain; email = conn.email;
                        key = await api.secureStoreGet(connId ? `${prefix}jira_api_token_${connId}` : `${prefix}jira_api_key`) || await api.secureStoreGet(connId ? `jira_api_token_${connId}` : 'jira_api_key')
                    } else {
                        domain = await api.secureStoreGet(`${prefix}jira_domain`) || await api.secureStoreGet('jira_domain') || ''
                        email = await api.secureStoreGet(`${prefix}jira_email`) || await api.secureStoreGet('jira_email') || ''
                        key = await api.secureStoreGet(`${prefix}jira_api_key`) || await api.secureStoreGet('jira_api_key') || ''
                    }
                    if (domain && email && key) setWorklog(await api.getJiraHistory({ domain, email, apiKey: key, issueKey: selectedTask.sourceIssueId }))
                }
            } else if (tab === 'history') {
                setHistory(selectedTask.analysisHistory || [])
            }
        } catch (e) {
            console.error("Failed to load tab content:", e)
        } finally {
            setIsLoadingTab(false)
        }
    }, [selectedTask, activeProject, api])

    // Load tab content when task or tab changes
    useEffect(() => {
        if (selectedTaskId) {
            loadTabContent(activeTab)
        }
    }, [selectedTaskId, activeTab, loadTabContent])

    const handleSaveTaskChanges = async () => {
        if (!activeProject || !selectedTask) return
        try {
            await updateProject(activeProject.id, {
                tasks: activeProject.tasks.map(t =>
                    t.id === selectedTask.id ? {
                        ...t,
                        title: editTitle,
                        description: editDescription,
                        status: editStatus,
                        priority: editPriority,
                        assignee: editAssignee,
                        labels: editLabels,
                        updatedAt: Date.now()
                    } : t
                )
            })
            setIsEditing(false)
            alert("Changes saved!")
        } catch (e: any) {
            alert(`Failed to save changes: ${e.message}`)
        }
    }

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

    const [isCreatingIssue, setIsCreatingIssue] = useState(false)

    const handleCreateExternalIssue = async () => {
        if (!selectedTask || !activeProject) return
        if (selectedTask.externalId || selectedTask.sourceIssueId) {
            alert('This task is already linked to an external issue.')
            return
        }

        const api = window.electronAPI as any
        const prefix = activeProject ? `project:${activeProject.id}:` : ''

        setIsCreatingIssue(true)
        try {
            // Check Linear first
            const linearKey = await api.secureStoreGet(`${prefix}linear_api_key`) || await api.secureStoreGet('linear_api_key')
            if (linearKey && activeProject.linearConnections?.length > 0) {
                const conn = activeProject.linearConnections[0]
                const url = await api.createLinearIssue(linearKey, conn.teamId, selectedTask.title, selectedTask.description || '')
                if (url) {
                    alert('Linear issue created successfully! A sync is required to see it here.')
                    api.openUrl(url)
                }
                return
            }

            // Check Jira
            if (activeProject.jiraConnections?.length > 0) {
                const conn = activeProject.jiraConnections[0]
                const jiraKey = await api.secureStoreGet(`${prefix}jira_api_token_${conn.id}`) || await api.secureStoreGet(`jira_api_token_${conn.id}`) || await api.secureStoreGet('jira_api_key')
                if (jiraKey) {
                    const key = await api.createJiraIssue({
                        domain: conn.domain,
                        email: conn.email,
                        apiKey: jiraKey,
                        projectKey: conn.projectKey,
                        title: selectedTask.title,
                        description: selectedTask.description || ''
                    })
                    if (key) {
                        alert(`Jira issue ${key} created successfully! A sync is required to see it here.`)
                        api.openUrl(`https://${conn.domain}.atlassian.net/browse/${key}`)
                    }
                    return
                }
            }

            alert('No Linear or Jira connections are fully configured to create an issue.')
        } catch (e: any) {
            alert(`Failed to create issue: ${e.message}`)
        } finally {
            setIsCreatingIssue(false)
        }
    }

    const handleAnalyzeIssue = async () => {
        if (!selectedTask || !activeProject) return
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        const apiKey = await api.secureStoreGet(`${prefix}gemini_api_key`) || await api.secureStoreGet('gemini_api_key')
        if (!apiKey) { alert('Please set your Gemini API key in Settings.'); return }

        setIsAnalyzing(true)
        setAnalysisModalResult(null)
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
            const result = await api.aiAnalyzeIssue(apiKey, selectedTask, currentComments, activeProject)
            setAnalysisModalResult(result)

            // Save to history
            const newVersion = (selectedTask.analysisHistory?.length || 0) + 1
            const historyEntry = {
                version: newVersion,
                hash: Math.random().toString(36).substring(2, 8).toUpperCase(),
                timestamp: Date.now(),
                taskStatus: selectedTask.status,
                taskPriority: selectedTask.priority,
                summary: result.split('\n').find((l: string) => l.trim().length > 0)?.substring(0, 150) + "..." || "AI Analysis Report",
                fullResult: result
            }

            const updatedHistory = [historyEntry, ...(selectedTask.analysisHistory || [])]

            // Update store
            const { updateProject, projects } = useProjectStore.getState()
            const p = projects.find(p => p.id === activeProject.id)
            if (p) {
                await updateProject(p.id, {
                    tasks: p.tasks.map(t => t.id === selectedTask.id ? { ...t, analysisHistory: updatedHistory } : t)
                })
            }

            // Update local state for immediate feedback if history tab is open
            setHistory(updatedHistory)

        } catch (e: any) {
            console.error('Analysis failed:', e)
            if (e.message?.includes('429') || e.message?.toLowerCase().includes('rate limit')) {
                setRateLimitBanner("Gemini Rate Limit Exceeded. Please wait a few moments before trying again.")
            } else {
                alert(`Analysis failed: ${e.message}`)
            }
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
                aiAnalysis: analysisModalResult || (selectedTask.analysisHistory && selectedTask.analysisHistory.length > 0 ? selectedTask.analysisHistory[0].fullResult : "")
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



    const handleDeleteAnalysis = async (entry: any) => {
        if (!selectedTask || !activeProjectId) return
        if (!confirm(`Are you sure you want to delete analysis v${entry.version}?`)) return

        const updatedHistory = (selectedTask.analysisHistory || []).filter(h => h.version !== entry.version)
        await updateProject(activeProjectId, {
            tasks: tasks.map(t => t.id === selectedTask.id ? { ...t, analysisHistory: updatedHistory } : t)
        })
        setHistory(updatedHistory)
    }

    const toggleHistoryExpand = (index: number) => {
        const next = new Set(expandedHistory)
        if (next.has(index)) next.delete(index)
        else next.add(index)
        setExpandedHistory(next)
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
                const conn = activeProject?.jiraConnections?.find(c => c.id === connId)
                const prefix = activeProject ? `project:${activeProject.id}:` : ''
                let domain = '', email = '', key = ''
                if (conn) {
                    domain = conn.domain; email = conn.email;
                    key = await api.secureStoreGet(connId ? `${prefix}jira_api_token_${connId}` : `${prefix}jira_api_key`) || await api.secureStoreGet(connId ? `jira_api_token_${connId}` : 'jira_api_key')
                } else {
                    domain = await api.secureStoreGet(`${prefix}jira_domain`) || await api.secureStoreGet('jira_domain') || ''
                    email = await api.secureStoreGet(`${prefix}jira_email`) || await api.secureStoreGet('jira_email') || ''
                    key = await api.secureStoreGet(`${prefix}jira_api_key`) || await api.secureStoreGet('jira_api_key') || ''
                }
                if (domain && email && key) {
                    await api.addJiraComment({ domain, email, apiKey: key, issueKey: selectedTask.sourceIssueId, body: newComment })
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
        if (!activeTaskCandidate) return

        // Are we hovering over a columnar droppable?
        const overColumn = COLUMNS.find(c => c.id === overId)
        if (overColumn) {
            if (activeTaskCandidate.status !== overColumn.id) {
                if (activeProjectId) {
                    moveTask(activeProjectId, activeId.toString(), overColumn.id)
                }
            }
            return
        }

        // Are we hovering over another task?
        const overTask = tasks.find(t => t.id === overId)
        if (overTask && activeTaskCandidate.status !== overTask.status) {
            if (activeProjectId) {
                moveTask(activeProjectId, activeId.toString(), overTask.status as TaskStatus)
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
                if (match) {
                    await api.updateLinearStatus({ apiKey, issueId: task.externalId, stateId: match.id })
                    // Reflect change in local store
                    if (activeProjectId) {
                        moveTask(activeProjectId, task.id, newStatus)
                    }
                }
            } else if (task.source === 'jira') {
                const conn = activeProject?.jiraConnections.find(c => c.id === connId)
                const prefix = activeProject ? `project:${activeProject.id}:` : ''
                const key = await api.secureStoreGet(connId ? `${prefix}jira_api_token_${connId}` : `${prefix}jira_api_key`) || await api.secureStoreGet(connId ? `jira_api_token_${connId}` : 'jira_api_key')
                if (conn && key) {
                    await api.transitionJiraIssue({ domain: conn.domain, email: conn.email, apiKey: key, issueKey: task.sourceIssueId, transitionName: newStatus.replace('-', ' ') })
                    // Reflect change in local store
                    if (activeProjectId) {
                        moveTask(activeProjectId, task.id, newStatus)
                    }
                }
            }
        } catch (e) {
            console.error("Remote status transition failed:", e)
        }
    }

    const onDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (over && activeTask) {
            // Find final status
            const finalTask = tasks.find(t => t.id === active.id)
            if (finalTask && finalTask.externalId) {
                handleRemoteStatusTransition(finalTask, finalTask.status)
            }
        }
        setActiveTask(null)
    }

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
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-400 hover:text-[#A78BFA] hover:bg-[#A78BFA]/10"
                        onClick={() => setIsShortcutModalOpen(true)}
                    >
                        <HelpCircle className="h-4 w-4" />
                    </Button>
                    <div className="h-4 w-[1px] bg-[#2A2A3A] mx-1" />
                    <div className="relative group">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#6B7280] opacity-40 group-focus-within:text-[#A78BFA] transition-all pointer-events-none" />
                        <Input
                            placeholder="Search board..."
                            className="h-9 pl-9 w-64 bg-[#13131A] border-[#2A2A3A] text-xs font-medium focus-visible:ring-[#A78BFA]/30"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    {sourceMode === 'manual' && (
                        <Button onClick={handleAddTask} className="h-9 px-4 bg-[#1A1A24] hover:bg-[#252535] text-[#A78BFA] border border-[#A78BFA]/30 font-bold text-xs gap-2">
                            <Plus className="h-3.5 w-3.5" /> NEW TASK
                        </Button>
                    )}
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
                                <KanbanColumn
                                    key={col.id}
                                    col={col}
                                    tasksInColumn={tasksByColumn[col.id]}
                                    selectedTaskId={selectedTaskId}
                                    setSelectedTaskId={setSelectedTaskId}
                                    sourceMode={sourceMode}
                                    onAddTask={handleAddTask}
                                />
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
                                        COLUMNS.find(c => c.id === selectedTask.status)?.textColor || "text-[#A78BFA]",
                                        "bg-[#1A1A24] border border-[#2A2A3A]"
                                    )}>
                                        {selectedTask.status.replace('-', ' ')}
                                    </div>
                                    <div className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-[#2A2010] text-[#F59E0B] border border-[#F59E0B]/20">
                                        {selectedTask.priority}
                                    </div>
                                </div>
                            </div>

                            <Tabs value={activeTab} onValueChange={loadTabContent} className="flex-1 flex flex-col min-h-0">
                                <TabsList className="flex-none w-full justify-start rounded-none bg-transparent border-b border-[#2A2A3A] h-10 px-2 gap-4">
                                    <TabsTrigger value="description" className="text-xs font-bold data-[state=active]:bg-transparent data-[state=active]:text-[#A78BFA] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#A78BFA] transition-none rounded-none px-2 h-full">Description</TabsTrigger>
                                    <TabsTrigger value="details" className="text-xs font-bold data-[state=active]:bg-transparent data-[state=active]:text-[#A78BFA] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#A78BFA] transition-none rounded-none px-2 h-full">Details</TabsTrigger>
                                    <TabsTrigger value="comments" className="text-xs font-bold data-[state=active]:bg-transparent data-[state=active]:text-[#A78BFA] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#A78BFA] transition-none rounded-none px-2 h-full">Comments</TabsTrigger>
                                    <TabsTrigger value="history" className="text-xs font-bold data-[state=active]:bg-transparent data-[state=active]:text-[#A78BFA] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#A78BFA] transition-none rounded-none px-2 h-full">History</TabsTrigger>
                                    <TabsTrigger value="worklog" className="text-xs font-bold data-[state=active]:bg-transparent data-[state=active]:text-[#A78BFA] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#A78BFA] transition-none rounded-none px-2 h-full">Worklog</TabsTrigger>
                                </TabsList>
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                    <TabsContent value="description" className="m-0 focus-visible:ring-0">
                                        <div className="space-y-4">
                                            {isEditing && selectedTask.source === 'manual' ? (
                                                <div className="grid gap-1.5">
                                                    <label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Description</label>
                                                    <textarea
                                                        value={editDescription}
                                                        onChange={(e) => setEditDescription(e.target.value)}
                                                        className="min-h-[200px] w-full rounded-md bg-[#1A1A24] border border-[#2A2A3A] p-3 text-xs text-[#E2E8F0] focus:ring-1 focus:ring-[#A78BFA]/50 outline-none resize-none"
                                                        placeholder="Task description..."
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="prose-container min-h-[100px]">
                                                        <FormattedText content={selectedTask.description} />
                                                    </div>
                                                    <MediaSection
                                                        rawDescription={selectedTask.rawDescription || selectedTask.description}
                                                        onImageClick={(url) => setLightboxUrl(url)}
                                                    />
                                                </>
                                            )}
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="details" className="m-0 space-y-4">
                                        {selectedTask.source === 'manual' ? (
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-widest">Manual Task Details</h3>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 text-[10px] font-bold text-[#A78BFA] hover:text-[#C4B5FD] hover:bg-[#A78BFA]/10"
                                                        onClick={() => setIsEditing(!isEditing)}
                                                    >
                                                        {isEditing ? 'CANCEL' : 'EDIT'}
                                                    </Button>
                                                </div>

                                                <div className="space-y-3">
                                                    <div className="grid gap-1.5">
                                                        <label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Title</label>
                                                        {isEditing ? (
                                                            <Input
                                                                value={editTitle}
                                                                onChange={(e) => setEditTitle(e.target.value)}
                                                                className="h-9 bg-[#1A1A24] border-[#2A2A3A] text-xs focus-visible:ring-[#A78BFA]/50"
                                                            />
                                                        ) : (
                                                            <div className="px-3 py-2 rounded-lg bg-[#1A1A24]/40 border border-[#2A2A3A]/30 text-xs font-medium text-[#E2E8F0]">
                                                                {selectedTask.title}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="grid gap-1.5">
                                                            <label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Status</label>
                                                            {isEditing ? (
                                                                <select
                                                                    value={editStatus}
                                                                    onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                                                                    className="h-9 w-full rounded-md bg-[#1A1A24] border border-[#2A2A3A] px-3 py-1 text-xs text-[#E2E8F0] focus:ring-1 focus:ring-[#A78BFA]/50 outline-none"
                                                                >
                                                                    {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                                                </select>
                                                            ) : (
                                                                <div className="px-3 py-2 rounded-lg bg-[#1A1A24]/40 border border-[#2A2A3A]/30 text-[10px] font-bold text-[#E2E8F0]">
                                                                    {selectedTask.status.toUpperCase()}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="grid gap-1.5">
                                                            <label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Priority</label>
                                                            {isEditing ? (
                                                                <select
                                                                    value={editPriority}
                                                                    onChange={(e) => setEditPriority(e.target.value as any)}
                                                                    className="h-9 w-full rounded-md bg-[#1A1A24] border border-[#2A2A3A] px-3 py-1 text-xs text-[#E2E8F0] focus:ring-1 focus:ring-[#A78BFA]/50 outline-none"
                                                                >
                                                                    <option value="low">LOW</option>
                                                                    <option value="medium">MEDIUM</option>
                                                                    <option value="high">HIGH</option>
                                                                    <option value="critical">CRITICAL</option>
                                                                </select>
                                                            ) : (
                                                                <div className="px-3 py-2 rounded-lg bg-[#1A1A24]/40 border border-[#2A2A3A]/30 text-xs font-bold text-[#E2E8F0]">
                                                                    {selectedTask.priority.toUpperCase()}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="grid gap-1.5">
                                                            <label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Assignee</label>
                                                            {isEditing ? (
                                                                <Input
                                                                    value={editAssignee}
                                                                    onChange={(e) => setEditAssignee(e.target.value)}
                                                                    className="h-9 bg-[#1A1A24] border-[#2A2A3A] text-xs focus-visible:ring-[#A78BFA]/50"
                                                                />
                                                            ) : (
                                                                <DetailItem icon={User} label="ASSIGNEE" value={selectedTask.assignee || 'Unassigned'} />
                                                            )}
                                                        </div>
                                                        <div className="grid gap-1.5">
                                                            <label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Due Date</label>
                                                            <DetailItem icon={Calendar} label="DUE DATE" value={selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : 'No date'} />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid gap-1.5">
                                                    <label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Labels</label>
                                                    {isEditing ? (
                                                        <Input
                                                            value={editLabels}
                                                            onChange={(e) => setEditLabels(e.target.value)}
                                                            placeholder="bug, feature, etc."
                                                            className="h-9 bg-[#1A1A24] border-[#2A2A3A] text-xs focus-visible:ring-[#A78BFA]/50"
                                                        />
                                                    ) : (
                                                        <DetailItem icon={Tag} label="LABELS" value={selectedTask.labels || 'No labels'} />
                                                    )}
                                                </div>

                                                {isEditing && (
                                                    <Button
                                                        className="w-full h-9 mt-2 bg-[#A78BFA] hover:bg-[#C4B5FD] text-[#0F0F13] font-bold text-[10px]"
                                                        onClick={handleSaveTaskChanges}
                                                    >
                                                        SAVE CHANGES
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="grid gap-2">
                                                <DetailItem icon={User} label="ASSIGNEE" value={selectedTask.assignee || 'Unassigned'} />
                                                <DetailItem icon={Calendar} label="DUE DATE" value={selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : 'No date'} />
                                                <DetailItem icon={Tag} label="LABELS" value={selectedTask.labels || 'No labels'} />
                                                <DetailItem icon={Clock} label="CREATED" value={new Date(selectedTask.createdAt).toLocaleDateString()} />
                                                {selectedTask.source && (
                                                    <div className="flex flex-col gap-2">
                                                        <div className="flex items-center gap-2 px-3 py-2 bg-[#1A1A24]/40 rounded-lg border border-[#2A2A3A]/30">
                                                            <span className="text-[11px] font-bold text-[#6B7280] uppercase">Source:</span>
                                                            <span className="text-[11px] font-bold text-[#A78BFA] uppercase">{selectedTask.source}</span>
                                                        </div>
                                                        {selectedTask.source === 'jira' && selectedTask.issueType && (
                                                            <div className="flex items-center gap-2 px-3 py-2 bg-[#1A1A24]/40 rounded-lg border border-[#2A2A3A]/30">
                                                                <span className="text-[11px] font-bold text-[#6B7280] uppercase">Issue Type:</span>
                                                                <span className="text-[11px] font-bold text-[#A78BFA] uppercase">{selectedTask.issueType}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
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
                                        {(selectedTask.externalId || selectedTask.sourceIssueId) && (
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
                                        {isLoadingTab ? (
                                            <div className="flex-1 flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#A78BFA]" /></div>
                                        ) : history.length === 0 ? (
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
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] text-[#6B7280]">{new Date(h.timestamp).toLocaleString()}</span>
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    className="h-6 w-6 text-[#6B7280] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                                                                    onClick={() => handleDeleteAnalysis(h)}
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        <div className="text-xs text-[#E2E8F0] font-medium leading-relaxed">
                                                            <FormattedText content={h.summary} />
                                                        </div>

                                                        <div className="pt-2 border-t border-[#2A2A3A]/50 mt-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 px-0 text-[10px] font-bold text-[#A78BFA] hover:text-[#C4B5FD] hover:bg-transparent"
                                                                onClick={() => toggleHistoryExpand(i)}
                                                            >
                                                                {expandedHistory.has(i) ? 'COLLAPSE' : 'VIEW FULL ANALYSIS'}
                                                            </Button>
                                                            {expandedHistory.has(i) && (
                                                                <div className="mt-3 p-3 bg-[#0F0F13] rounded-lg border border-[#2A2A3A] animate-in slide-in-from-top-2 duration-200">
                                                                    <FormattedText content={h.fullResult} />
                                                                </div>
                                                            )}
                                                        </div>
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
                                                        <div className="text-[11px] text-[#E2E8F0] flex flex-wrap items-center gap-x-1.5">
                                                            By <span className="font-bold text-[#A78BFA]">{w.author}</span>:
                                                            <div className="flex items-center gap-1.5 bg-[#0F0F13]/50 px-2 py-0.5 rounded-md border border-[#2A2A3A]/50">
                                                                <span className="opacity-50 line-through"><FormattedText content={w.fromValue || 'None'} className="inline prose-p:mb-0" /></span>
                                                                <span className="text-blue-400">→</span>
                                                                <span className="font-semibold text-blue-300"><FormattedText content={w.toValue} className="inline prose-p:mb-0" /></span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </TabsContent>
                                </div>
                            </Tabs>

                            <div className="flex-none p-5 border-t border-[#2A2A3A] bg-[#0F0F13] space-y-2">
                                <Button
                                    className="w-full h-10 bg-[#A78BFA] hover:bg-[#C4B5FD] text-[#0F0F13] font-bold gap-2 animate-in fade-in duration-300"
                                    onClick={handleAnalyzeIssue}
                                    disabled={isAnalyzing}
                                >
                                    {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                                    {isAnalyzing ? 'ANALYZING...' : 'ANALYZE ISSUE'}
                                </Button>
                                <Button
                                    className="w-full h-10 bg-[#1E2A1E] hover:bg-[#2A3A2A] text-[#10B981] border border-[#10B981]/20 font-bold text-[10px] gap-1.5"
                                    onClick={handleGenerateBugReport}
                                >
                                    <Target className="h-3.5 w-3.5" /> GENERATE BUG REPORT
                                </Button>

                                <div className="grid grid-cols-2 gap-2 pt-1">
                                    {selectedTask.source !== 'manual' ? (
                                        <Button
                                            className="h-10 bg-[#1A1A24] hover:bg-[#2A2A3A] text-[#A78BFA] border border-[#A78BFA]/20 font-bold text-[10px] gap-1.5"
                                            onClick={() => {
                                                if (selectedTask.ticketUrl) api.openUrl(selectedTask.ticketUrl)
                                            }}
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            {selectedTask.source === 'linear' ? 'OPEN IN LINEAR' : 'OPEN IN JIRA'}
                                        </Button>
                                    ) : (
                                        <Button
                                            className="h-10 bg-[#A78BFA]/10 hover:bg-[#A78BFA]/20 text-[#A78BFA] border border-[#A78BFA]/20 font-bold text-[10px] gap-1.5"
                                            onClick={() => setIsEditing(!isEditing)}
                                        >
                                            <Plus className="h-3.5 w-3.5 rotate-45" /> {isEditing ? 'CANCEL EDIT' : 'EDIT TASK'}
                                        </Button>
                                    )}

                                    <Button
                                        variant="outline"
                                        className="h-10 border-[#EF4444]/20 text-[#EF4444] hover:bg-[#EF4444]/10 font-bold text-[10px] gap-1.5"
                                        onClick={() => {
                                            if (confirm("Are you sure you want to delete this task?")) {
                                                deleteTask(activeProjectId!, selectedTask.id)
                                                setSelectedTaskId(null)
                                            }
                                        }}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" /> DELETE
                                    </Button>
                                </div>

                                {selectedTask.source !== 'manual' && (
                                    <div className="pt-2">
                                        <Button
                                            variant="ghost"
                                            className="w-full h-8 text-[9px] font-bold text-[#6B7280] hover:text-[#A78BFA] gap-1.5 border border-dashed border-[#2A2A3A]"
                                            onClick={handleCreateExternalIssue}
                                            disabled={isCreatingIssue || !!selectedTask.externalId}
                                        >
                                            <Globe className="h-3 w-3" />
                                            {selectedTask.externalId ? 'ALREADY LINKED' : 'CREATE EXTERNAL ISSUE'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Lightbox Overlay */}
            {lightboxUrl && (
                <div
                    className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-8 animate-in fade-in duration-300 backdrop-blur-md"
                    onClick={() => setLightboxUrl(null)}
                >
                    <div className="relative max-w-7xl max-h-full flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                        <div className="absolute -top-12 right-0 flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:text-[#A78BFA] hover:bg-white/10"
                                onClick={() => api.openUrl(lightboxUrl)}
                            >
                                <ExternalLink className="h-4 w-4 mr-2" /> Open Original
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-white hover:text-red-400 hover:bg-white/10"
                                onClick={() => setLightboxUrl(null)}
                            >
                                <X className="h-6 w-6" />
                            </Button>
                        </div>
                        <img
                            src={lightboxUrl}
                            alt="Lightbox"
                            className="w-full h-full object-contain rounded-lg shadow-2xl border border-white/10"
                        />
                    </div>
                </div>
            )}

            {/* Shortcut Modal */}
            {isShortcutModalOpen && (
                <div
                    className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-300 backdrop-blur-sm"
                    onClick={() => setIsShortcutModalOpen(false)}
                >
                    <div
                        className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-[#2A2A3A] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#A78BFA]/10 rounded-lg">
                                    <Command className="h-5 w-5 text-[#A78BFA]" />
                                </div>
                                <h3 className="text-lg font-bold text-[#E2E8F0]">Keyboard Shortcuts</h3>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-[#6B7280] hover:text-[#E2E8F0]"
                                onClick={() => setIsShortcutModalOpen(false)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="p-6 space-y-4">
                            <ShortcutItem keys={['Esc']} label="Close Panels / Deselect" />
                            <ShortcutItem keys={['Ctrl', 'Enter']} label="Save Manual Task Changes" />
                            <ShortcutItem keys={['Ctrl', '/']} label="Toggle Shortcuts Help" />
                            <ShortcutItem keys={['/']} label="Focus Search" />
                            <ShortcutItem keys={['N']} label="New Manual Task" />
                            <ShortcutItem keys={['R']} label="Refresh / Sync Board" />
                        </div>
                        <div className="p-4 bg-[#0F0F13] border-t border-[#2A2A3A] text-center">
                            <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">QAssistant v1.2.0 · Pro Mode</p>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Analysis Result Modal */}
            {analysisModalResult && (
                <div
                    className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-300 backdrop-blur-md"
                    onClick={() => setAnalysisModalResult(null)}
                >
                    <div
                        className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-[#2A2A3A] flex items-center justify-between bg-[#1A1A24]/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#A78BFA]/10 rounded-lg">
                                    <Activity className="h-5 w-5 text-[#A78BFA]" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-lg font-bold text-[#E2E8F0] truncate">AI Analysis Report</h3>
                                    <p className="text-[10px] text-[#6B7280] font-bold uppercase tracking-wider truncate">{selectedTask?.title}</p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-[#6B7280] hover:text-[#E2E8F0]"
                                onClick={() => setAnalysisModalResult(null)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#0F0F13]/30">
                            <div className="prose prose-invert max-w-none text-sm text-[#E2E8F0] leading-relaxed">
                                <FormattedText content={analysisModalResult} />
                            </div>
                        </div>
                        <div className="p-4 bg-[#0F0F13] border-t border-[#2A2A3A] flex justify-end gap-3">
                            <Button
                                variant="ghost"
                                className="text-xs font-bold text-[#6B7280] hover:text-[#E2E8F0]"
                                onClick={() => setAnalysisModalResult(null)}
                            >
                                CLOSE
                            </Button>
                            <Button
                                className="bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD] font-bold text-xs px-6"
                                onClick={() => setAnalysisModalResult(null)}
                            >
                                GOT IT
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rate Limit Banner */}
            {rateLimitBanner && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-[#3C1414] border border-[#EF4444]/50 rounded-xl px-6 py-3 flex items-center gap-4 shadow-2xl">
                        <div className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
                        <span className="text-sm font-semibold text-[#FCA5A5]">{rateLimitBanner}</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-[#FCA5A5] hover:text-white"
                            onClick={() => setRateLimitBanner(null)}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

function ShortcutItem({ keys, label }: { keys: string[], label: string }) {
    return (
        <div className="flex items-center justify-between group">
            <span className="text-xs font-medium text-[#6B7280] group-hover:text-[#9CA3AF] transition-colors">{label}</span>
            <div className="flex items-center gap-1.5">
                {keys.map((key, i) => (
                    <div key={i} className="flex items-center">
                        <kbd className="min-w-[24px] px-1.5 py-1 rounded bg-[#1A1A24] border border-[#2A2A3A] text-[10px] font-bold text-[#A78BFA] shadow-sm flex items-center justify-center font-mono uppercase">
                            {key}
                        </kbd>
                        {i < keys.length - 1 && <span className="text-[#6B7280] text-[10px]">+</span>}
                    </div>
                ))}
            </div>
        </div>
    )
}

function MediaSection({ rawDescription, onImageClick }: { rawDescription?: string, onImageClick: (url: string) => void }) {
    if (!rawDescription) return null

    const mediaUrls = useMemo(() => {
        const urls: { type: 'image' | 'video', url: string, label?: string }[] = []

        // Match Markdown images: ![alt](url)
        const mdImageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g
        let match
        while ((match = mdImageRegex.exec(rawDescription)) !== null) {
            urls.push({ type: 'image', url: match[1] })
        }

        // Match plain image URLs
        const plainImageRegex = /(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|bmp|svg)(?:\?[^\s"'<>]*)?)/gi
        while ((match = plainImageRegex.exec(rawDescription)) !== null) {
            if (!urls.some(u => u.url === match![1])) {
                urls.push({ type: 'image', url: match[1] })
            }
        }

        // Match Video URLs (YouTube, Loom)
        const videoRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|loom\.com)\/[^\s"'<>)]+)/gi
        while ((match = videoRegex.exec(rawDescription)) !== null) {
            urls.push({ type: 'video', url: match[1] })
        }

        return urls
    }, [rawDescription])

    if (mediaUrls.length === 0) return null

    return (
        <div className="mt-6 pt-6 border-t border-[#2A2A3A] space-y-3">
            <h4 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest flex items-center gap-2">
                <ImageIcon className="h-3 w-3" /> Attached Media ({mediaUrls.length})
            </h4>
            <div className="grid grid-cols-2 gap-3">
                {mediaUrls.map((item, idx) => (
                    <div
                        key={idx}
                        className="group relative aspect-video bg-[#1A1A24] border border-[#2A2A3A] rounded-lg overflow-hidden cursor-pointer hover:border-[#A78BFA]/50 transition-colors"
                        onClick={() => {
                            if (item.type === 'image') {
                                onImageClick(item.url)
                            } else {
                                window.electronAPI.openUrl(item.url)
                            }
                        }}
                    >
                        {item.type === 'image' ? (
                            <img
                                src={item.url}
                                alt="Attachment"
                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#1E1E2A]">
                                <PlayCircle className="h-8 w-8 text-[#A78BFA] opacity-60 group-hover:opacity-100 transition-opacity" />
                                <span className="text-[9px] font-bold text-gray-500 uppercase">Video Link</span>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ExternalLink className="h-5 w-5 text-white" />
                        </div>
                    </div>
                ))}
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

function KanbanColumn({ col, tasksInColumn, selectedTaskId, setSelectedTaskId, sourceMode, onAddTask }: any) {
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
                items={tasksInColumn.map((t: any) => t.id)}
                strategy={verticalListSortingStrategy}
            >
                <div
                    ref={setNodeRef}
                    className="flex-1 overflow-y-auto custom-scrollbar-slim space-y-3 pr-1 min-h-[50px]"
                >
                    {tasksInColumn.map((task: any) => (
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
                {task.labels && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {task.labels.split(',').map((label, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 rounded bg-[#A78BFA]/10 border border-[#A78BFA]/20 text-[9px] font-bold text-[#A78BFA] uppercase truncate max-w-[100px]">
                                {label.trim()}
                            </span>
                        ))}
                    </div>
                )}
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
