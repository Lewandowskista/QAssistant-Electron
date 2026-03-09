// cspell:ignore youtu
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
    Command,
    AlertCircle,
    ChevronUp,
    ChevronDown,
    Minus,
    Clock3
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
    // Use selectors to prevent re-renders when other parts of the store change
    const projects = useProjectStore(state => state.projects)
    const activeProjectId = useProjectStore(state => state.activeProjectId)
    const addTask = useProjectStore(state => state.addTask)
    const deleteTask = useProjectStore(state => state.deleteTask)
    const moveTask = useProjectStore(state => state.moveTask)
    const updateProject = useProjectStore(state => state.updateProject)
    const loadProjects = useProjectStore(state => state.loadProjects)
    
    const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId), [projects, activeProjectId])
    const tasks = useMemo(() => activeProject?.tasks || [], [activeProject?.tasks])

    const [activeTask, setActiveTask] = useState<Task | null>(null)
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [sourceMode, setSourceMode] = useState<'manual' | 'linear' | 'jira'>('manual')
    const [isSyncing, setIsSyncing] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analysisModalResult, setAnalysisModalResult] = useState<string | null>(null)
    const [comments, setComments] = useState<any[]>([])
    const [history, setHistory] = useState<any[]>([])
    const [activity, setActivity] = useState<any[]>([])
    const [isLoadingTab, setIsLoadingTab] = useState(false)
    const [tabError, setTabError] = useState<string | null>(null)
    const [newComment, setNewComment] = useState("")
    const [isPostingComment, setIsPostingComment] = useState(false)
    const [activeTab, setActiveTab] = useState('description')
    const [expandedHistory, setExpandedHistory] = useState<Set<number>>(new Set())
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
    const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false)
    const [rateLimitBanner, setRateLimitBanner] = useState<string | null>(null)
    const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false)
    const [newTaskTitle, setNewTaskTitle] = useState("")
    const [newTaskDescription, setNewTaskDescription] = useState("")
    const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('todo')
    const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
    const [newTaskSource, setNewTaskSource] = useState<'manual' | 'linear' | 'jira'>('manual')
    const [newTaskLabels, setNewTaskLabels] = useState("")
    const [newTaskConnectionId, setNewTaskConnectionId] = useState("")

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

    const getLinearApiKey = useCallback(async (connId?: string) => {
        const prefix = activeProject ? `project:${activeProject.id}:` : ''

        // 1. Try connection-specific key
        if (connId) {
            const key = await api.secureStoreGet(`${prefix}linear_api_key_${connId}`) || await api.secureStoreGet(`linear_api_key_${connId}`)
            if (key) return key
        }

        // 2. Try project-specific or global legacy key
        const legacyKey = await api.secureStoreGet(`${prefix}linear_api_key`) || await api.secureStoreGet('linear_api_key')
        if (legacyKey) return legacyKey

        // 3. Fallback to the first available connection key for this project
        if (activeProject?.linearConnections && activeProject.linearConnections.length > 0) {
            const firstId = activeProject.linearConnections[0].id
            const firstKey = await api.secureStoreGet(`${prefix}linear_api_key_${firstId}`) || await api.secureStoreGet(`linear_api_key_${firstId}`)
            if (firstKey) return firstKey
        }

        return null
    }, [activeProject, api])

    const getJiraCredentials = useCallback(async (connId?: string) => {
        const prefix = activeProject ? `project:${activeProject.id}:` : ''

        // 1. Try connection-specific
        if (connId) {
            const conn = activeProject?.jiraConnections?.find(c => c.id === connId)
            if (conn) {
                const key = await api.secureStoreGet(`${prefix}jira_api_token_${connId}`) || await api.secureStoreGet(`jira_api_token_${connId}`)
                if (key) return { domain: conn.domain, email: conn.email, apiKey: key }
            }
        }

        // 2. Try project-specific or global legacy
        const domain = await api.secureStoreGet(`${prefix}jira_domain`) || await api.secureStoreGet('jira_domain')
        const email = await api.secureStoreGet(`${prefix}jira_email`) || await api.secureStoreGet('jira_email')
        const key = await api.secureStoreGet(`${prefix}jira_api_token`) || await api.secureStoreGet(`${prefix}jira_api_key`) ||
            await api.secureStoreGet('jira_api_token') || await api.secureStoreGet('jira_api_key')

        if (domain && email && key) return { domain, email, apiKey: key }

        // 3. Fallback to first connection
        if (activeProject?.jiraConnections && activeProject.jiraConnections.length > 0) {
            const c = activeProject.jiraConnections[0]
            const ck = await api.secureStoreGet(`${prefix}jira_api_token_${c.id}`) || await api.secureStoreGet(`jira_api_token_${c.id}`)
            if (ck) return { domain: c.domain, email: c.email, apiKey: ck }
        }

        return null
    }, [activeProject, api])

    const loadTabContent = useCallback(async (tab: string) => {
        if (!selectedTask) return
        setActiveTab(tab)
        setIsLoadingTab(true)
        setTabError(null)

        // Clear previous content
        if (tab === 'comments') setComments([])
        else if (tab === 'activity') setActivity([])

        try {
            if (tab === 'comments') {
                if (selectedTask.source === 'linear') {
                    const key = await getLinearApiKey(selectedTask.connectionId)
                    if (key) setComments(await api.getLinearComments({ apiKey: key, issueId: selectedTask.externalId }))
                    else setTabError("Linear API key not found. Please check your settings.")
                } else if (selectedTask.source === 'jira') {
                    const creds = await getJiraCredentials(selectedTask.connectionId)
                    if (creds) setComments(await api.getJiraComments({ ...creds, issueKey: selectedTask.sourceIssueId }))
                    else setTabError("Jira credentials not found. Please check your settings.")
                }
            } else if (tab === 'activity') {
                if (selectedTask.source === 'linear') {
                    const key = await getLinearApiKey(selectedTask.connectionId)
                    if (key) {
                        const res = await api.getLinearHistory({ apiKey: key, issueId: selectedTask.externalId })
                        setActivity(res)
                    } else setTabError("Linear API key not found.")
                } else if (selectedTask.source === 'jira') {
                    const creds = await getJiraCredentials(selectedTask.connectionId)
                    if (creds) {
                        const res = await api.getJiraHistory({ ...creds, issueKey: selectedTask.sourceIssueId })
                        setActivity(res)
                    } else setTabError("Jira credentials not found.")
                }
            } else if (tab === 'history') {
                setHistory(selectedTask.analysisHistory || [])
            }
        } catch (e: any) {
            console.error("Failed to load tab content:", e)
            setTabError(e.message || "An unexpected error occurred.")
        } finally {
            setIsLoadingTab(false)
        }
    }, [selectedTask, api, getLinearApiKey, getJiraCredentials])

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

    const resetNewTaskForm = () => {
        setNewTaskTitle("")
        setNewTaskDescription("")
        setNewTaskStatus('todo')
        setNewTaskPriority('medium')
        setNewTaskSource('manual')
        setNewTaskLabels("")
        setNewTaskConnectionId("")
    }

    const handleAddTask = () => {
        if (!activeProjectId) {
            alert("Please select or create a project first before adding tasks.")
            return
        }
        resetNewTaskForm()
        setIsNewTaskModalOpen(true)
    }

    const handleConfirmAddTask = async () => {
        if (!activeProjectId || !newTaskTitle.trim()) return
        try {
            const taskData: any = {
                title: newTaskTitle.trim(),
                description: newTaskDescription.trim(),
                status: newTaskStatus,
                priority: newTaskPriority,
                labels: newTaskLabels.trim(),
                source: newTaskSource
            }

            if (newTaskSource === 'manual') {
                await addTask(activeProjectId, taskData)
                setIsNewTaskModalOpen(false)
                resetNewTaskForm()
            } else if (newTaskSource === 'linear') {
                const connId = newTaskConnectionId
                if (!connId) throw new Error("Please select a Linear connection.")
                const apiKey = await getLinearApiKey(connId)
                if (!apiKey) throw new Error("Linear API key not found. Please check your settings.")
                
                const conn = activeProject?.linearConnections?.find(c => c.id === connId)
                if (!conn) throw new Error("Linear connection not found.")

                const url = await api.createLinearIssue({ 
                    apiKey, 
                    teamId: conn.teamId, 
                    title: taskData.title, 
                    description: taskData.description, 
                    priority: newTaskPriority === 'critical' ? 1 : newTaskPriority === 'high' ? 2 : newTaskPriority === 'medium' ? 3 : 4
                })
                
                if (url) {
                    alert(`Linear issue created: ${url}`)
                    setIsNewTaskModalOpen(false)
                    resetNewTaskForm()
                    handleSync('linear')
                }
            } else if (newTaskSource === 'jira') {
                const connId = newTaskConnectionId
                if (!connId) throw new Error("Please select a Jira connection.")
                const creds = await getJiraCredentials(connId)
                if (!creds) throw new Error("Jira credentials not found. Please check your settings.")
                
                const conn = activeProject?.jiraConnections?.find(c => c.id === connId)
                if (!conn) throw new Error("Jira connection not found.")

                const key = await api.createJiraIssue({ 
                    ...creds, 
                    projectKey: conn.projectKey,
                    title: taskData.title, 
                    description: taskData.description 
                })
                
                if (key) {
                    alert(`Jira issue ${key} created successfully!`)
                    setIsNewTaskModalOpen(false)
                    resetNewTaskForm()
                    handleSync('jira')
                }
            }
        } catch (e: any) {
            alert(`Failed to create task: ${e.message}`)
        }
    }

    const handleSync = async (specificSource?: 'linear' | 'jira') => {
        if (!activeProjectId || !activeProject) return
        const mode = specificSource || sourceMode
        if (mode === 'manual') return

        setIsSyncing(true)
        try {
            const prefix = activeProject ? `project:${activeProject.id}:` : ''
            if (mode === 'linear') {
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
        setIsCreatingIssue(true)
        try {
            // Check Linear first
            const linearKey = await getLinearApiKey()
            if (linearKey && activeProject.linearConnections && activeProject.linearConnections.length > 0) {
                const conn = activeProject.linearConnections[0]
                const url = await api.createLinearIssue({
                    apiKey: linearKey,
                    teamId: conn.teamId,
                    title: selectedTask.title,
                    description: selectedTask.description || '',
                    priority: selectedTask.priority === 'critical' ? 1 : selectedTask.priority === 'high' ? 2 : selectedTask.priority === 'medium' ? 3 : 4
                })
                if (url) {
                    alert('Linear issue created successfully! A sync is required to see it here.')
                    api.openUrl(url)
                }
                return
            }

            // Check Jira
            const jiraCreds = await getJiraCredentials()
            if (jiraCreds) {
                const conn = activeProject.jiraConnections?.find(c => c.domain === jiraCreds.domain) || activeProject.jiraConnections?.[0]
                const key = await api.createJiraIssue({
                    ...jiraCreds,
                    projectKey: conn?.projectKey || '',
                    title: selectedTask.title,
                    description: selectedTask.description || '',
                    issueTypeName: 'Story' // Default
                })
                if (key) {
                    alert(`Jira issue ${key} created successfully! A sync is required to see it here.`)
                    api.openUrl(`https://${jiraCreds.domain}.atlassian.net/browse/${key}`)
                }
                return
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
            if (selectedTask.externalId && selectedTask.source === 'linear') {
                const key = await getLinearApiKey(selectedTask.connectionId)
                if (key) {
                    try { currentComments = await api.getLinearComments({ apiKey: key, issueId: selectedTask.externalId }) } catch { /* ignore */ }
                }
            } else if (selectedTask.externalId && selectedTask.source === 'jira') {
                const creds = await getJiraCredentials(selectedTask.connectionId)
                if (creds) {
                    try { currentComments = await api.getJiraComments({ ...creds, issueKey: selectedTask.sourceIssueId }) } catch { /* ignore */ }
                }
            }
            const result = await api.aiAnalyzeIssue({ apiKey, task: selectedTask, comments: currentComments, project: activeProject, modelName: activeProject?.geminiModel })
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
                const key = await getLinearApiKey(connId)
                if (key) {
                    await api.addLinearComment({ apiKey: key, issueId: selectedTask.externalId, body: newComment })
                    setNewComment("")
                    loadTabContent('comments')
                }
            } else if (selectedTask.source === 'jira') {
                const creds = await getJiraCredentials(connId)
                if (creds) {
                    await api.addJiraComment({ ...creds, issueKey: selectedTask.sourceIssueId, body: newComment })
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
        if (overTask) {
            if (activeProjectId) {
                moveTask(activeProjectId, activeId.toString(), overTask.status as TaskStatus, overId.toString())
            }
        }
    }

    const handleRemoteStatusTransition = async (task: Task, newStatus: TaskStatus) => {
        try {
            const connId = task.connectionId
            if (task.source === 'linear') {
                const key = await getLinearApiKey(connId)
                if (!key) return
                const states = await api.getLinearWorkflowStates({ apiKey: key })
                // Simple heuristic: match state name to our status
                const match = states.find((s: any) => s.name.toLowerCase().includes(newStatus.toLowerCase()))
                if (match) {
                    await api.updateLinearStatus({ apiKey: key, issueId: task.externalId, stateId: match.id })
                    // Reflect change in local store
                    if (activeProjectId) {
                        moveTask(activeProjectId, task.id, newStatus)
                    }
                }
            } else if (task.source === 'jira') {
                const creds = await getJiraCredentials(connId)
                if (creds) {
                    await api.transitionJiraIssue({ ...creds, issueKey: task.sourceIssueId, transitionName: newStatus.replace('-', ' ') })
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
            if (finalTask && finalTask.externalId && finalTask.status !== activeTask.status) {
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
                            onClick={() => handleSync()}
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
                        <Button 
                            onClick={handleAddTask} 
                            disabled={!activeProjectId}
                            className={cn(
                                "h-9 px-4 font-bold text-xs gap-2 transition-all",
                                !activeProjectId 
                                    ? "bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed" 
                                    : "bg-[#1A1A24] hover:bg-[#252535] text-[#A78BFA] border border-[#A78BFA]/30"
                            )}
                        >
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
                                    <TabsTrigger value="activity" className="text-xs font-bold data-[state=active]:bg-transparent data-[state=active]:text-[#A78BFA] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#A78BFA] transition-none rounded-none px-2 h-full">Activity</TabsTrigger>
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
                                            [...history].sort((a, b) => b.version - a.version).map((h, i) => (
                                                <div key={i} className="flex flex-col gap-0 group relative">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-2.5 h-2.5 rounded-full bg-[#A78BFA] shadow-[0_0_8px_rgba(167,139,250,0.5)] z-10 hover:ring-2 hover:ring-[#A78BFA]/30 transition-all shrink-0" />
                                                        <span className="text-[11px] font-bold text-[#A78BFA] font-mono tracking-tight">v{h.version} · {h.hash || 'GEN'}</span>
                                                    </div>

                                                    <div className="ml-[5px] pl-4 pb-4 border-l border-[#2A2A3A] flex flex-col gap-1.5">
                                                        <div className="bg-[#1A1A24] border border-[#2A2A3A] rounded-xl p-3 shadow-sm hover:border-[#A78BFA]/30 transition-all space-y-3 mt-1">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[9px] font-bold text-[#6B7280]">{new Date(h.timestamp).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    className="h-6 w-6 text-[#6B7280] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                                                                    onClick={() => handleDeleteAnalysis(h)}
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                </Button>
                                                            </div>

                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <div className="px-2 py-0.5 bg-blue-900/30 border border-blue-500/20 rounded-md text-[9px] font-bold text-blue-400 uppercase">
                                                                    {h.taskStatus}
                                                                </div>
                                                                <div className="px-2 py-0.5 bg-amber-900/30 border border-amber-500/20 rounded-md text-[9px] font-bold text-amber-500 uppercase">
                                                                    {h.taskPriority}
                                                                </div>
                                                            </div>

                                                            <div className="text-[11px] text-[#E2E8F0] font-medium leading-relaxed">
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
                                                                    <div className="mt-3 p-4 bg-[#0F0F13] rounded-lg border border-[#2A2A3A] animate-in slide-in-from-top-2 duration-200 overflow-x-auto text-[11px] leading-relaxed prose prose-invert max-w-none">
                                                                        <FormattedText content={h.fullResult} />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </TabsContent>

                                    <TabsContent value="activity" className="m-0 space-y-4">
                                        {isLoadingTab ? (
                                            <div className="flex-1 flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#A78BFA]" /></div>
                                        ) : tabError ? (
                                            <div className="text-center py-10 px-6">
                                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-950/30 text-red-400 mb-4">
                                                    <Activity className="h-6 w-6" />
                                                </div>
                                                <p className="text-sm font-bold text-red-400/80 mb-1">Failed to load Activity</p>
                                                <p className="text-xs text-[#6B7280] leading-relaxed max-w-[240px] mx-auto">{tabError}</p>
                                            </div>
                                        ) : activity.length === 0 ? (
                                            <div className="text-center opacity-30 py-10">
                                                <p className="text-xs font-bold uppercase tracking-wider">
                                                    {selectedTask?.source === 'manual'
                                                        ? 'No external provider active'
                                                        : 'No activity recorded'}
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="space-y-0.5 ml-1">
                                                {[...activity].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((w, i) => (
                                                    <div key={i} className="relative pl-6 pb-6 border-l border-[#2A2A3A] last:border-0 last:pb-2 group">
                                                        {/* Timeline Dot */}
                                                        <div className="absolute -left-[5.5px] top-1 w-2.5 h-2.5 rounded-full bg-[#1A1A24] border-2 border-[#3B82F6] shadow-[0_0_8px_rgba(59,130,246,0.5)] z-10 transition-transform group-hover:scale-110" />

                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-black text-[#A78BFA] uppercase tracking-wider bg-[#A78BFA]/10 px-1.5 py-0.5 rounded">
                                                                    {w.field?.replace(/([A-Z])/g, ' $1').trim() || 'EVENT'}
                                                                </span>
                                                                <span className="text-[10px] text-[#6B7280] font-medium uppercase tracking-tighter">
                                                                    {new Date(w.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>

                                                            <div className="bg-[#1A1A24]/40 border border-[#2A2A3A] rounded-xl p-3 shadow-sm hover:border-[#3B82F6]/20 transition-all">
                                                                <div className="flex items-center gap-1.5 mb-2">
                                                                    <div className="p-1 bg-[#3B82F6]/10 rounded">
                                                                        <User className="h-2.5 w-2.5 text-[#3B82F6]" />
                                                                    </div>
                                                                    <span className="text-[10px] font-bold text-[#E2E8F0] tracking-tight">{w.author}</span>
                                                                </div>

                                                                <div className="flex items-center gap-2 flex-wrap min-h-[24px]">
                                                                    {w.fromValue ? (
                                                                        <>
                                                                            <div className="px-2 py-1 bg-red-500/5 border border-red-500/10 rounded text-red-400 text-[10px] font-medium line-through decoration-red-500/50">
                                                                                <FormattedText content={w.fromValue} className="inline prose-p:mb-0" />
                                                                            </div>
                                                                            <span className="text-[#3F3F46] hover:text-[#52525B] transition-colors">
                                                                                <Send className="h-2.5 w-2.5" />
                                                                            </span>
                                                                        </>
                                                                    ) : (
                                                                        <span className="text-[10px] text-[#6B7280] italic px-1">Initial value</span>
                                                                    )}
                                                                    <div className="px-2 py-1 bg-emerald-500/5 border border-emerald-500/10 rounded text-emerald-400 text-[10px] font-bold">
                                                                        <FormattedText content={w.toValue} className="inline prose-p:mb-0" />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
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
                    className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300 backdrop-blur-md"
                    onClick={() => setAnalysisModalResult(null)}
                >
                    <div
                        className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-[#2A2A3A] flex items-center justify-between bg-[#1A1A24]/50">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-[#A78BFA]/10 rounded-xl border border-[#A78BFA]/20 shadow-[0_0_15px_rgba(167,139,250,0.1)]">
                                    <Activity className="h-6 w-6 text-[#A78BFA]" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-xl font-bold text-[#E2E8F0] tracking-tight">AI Analysis Report</h3>
                                    <p className="text-[11px] text-[#6B7280] font-bold uppercase tracking-widest mt-0.5 opacity-80">{selectedTask?.title}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-4 text-xs font-bold text-[#A78BFA] hover:bg-[#A78BFA]/10 gap-2 border border-[#A78BFA]/20"
                                    onClick={() => {
                                        navigator.clipboard.writeText(analysisModalResult)
                                        alert("Report copied to clipboard!")
                                    }}
                                >
                                    <MessageSquare className="h-4 w-4" /> COPY RAW
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 text-[#6B7280] hover:text-[#E2E8F0] hover:bg-[#1A1A24]"
                                    onClick={() => setAnalysisModalResult(null)}
                                >
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-[#0F0F13]/20">
                            <div className="max-w-3xl mx-auto">
                                <FormattedText content={analysisModalResult} />
                            </div>
                        </div>
                        <div className="p-6 bg-[#13131A] border-t border-[#2A2A3A] flex justify-between items-center bg-gradient-to-t from-[#0F0F13] to-transparent">
                            <p className="text-[10px] font-bold text-[#4B5563] uppercase tracking-[0.2em]">Generated by Gemini 2.0 Flash</p>
                            <div className="flex gap-3">
                                <Button
                                    variant="ghost"
                                    className="text-xs font-bold text-[#6B7280] hover:text-[#E2E8F0] px-6"
                                    onClick={() => setAnalysisModalResult(null)}
                                >
                                    DISMISS
                                </Button>
                                <Button
                                    className="bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD] hover:scale-[1.02] active:scale-[0.98] transition-all font-bold text-xs px-8 h-10 shadow-lg shadow-[#A78BFA]/10"
                                    onClick={() => setAnalysisModalResult(null)}
                                >
                                    ACKNOWLEDGE
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* New Task Modal */}
            <Dialog open={isNewTaskModalOpen} onOpenChange={setIsNewTaskModalOpen}>
                <DialogContent className="bg-[#13131A] border border-[#2A2A3A] sm:max-w-[550px] max-h-[90vh] overflow-y-auto custom-scrollbar">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-[#E2E8F0] flex items-center gap-2">
                            <Plus className="h-5 w-5 text-[#A78BFA]" />
                            Create New Task
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="py-4 space-y-6">
                        {/* Source Selection */}
                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Source</Label>
                            <div className="flex bg-[#1A1A24] p-1 rounded-lg border border-[#2A2A3A]">
                                {(['manual', 'linear', 'jira'] as const).map(source => (
                                    <Button
                                        key={source}
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setNewTaskSource(source)}
                                        className={cn(
                                            "flex-1 h-8 text-[11px] font-bold transition-all",
                                            newTaskSource === source
                                                ? "bg-[#2A2A3A]/80 text-[#A78BFA]"
                                                : "text-[#6B7280] hover:text-[#E2E8F0]"
                                        )}
                                    >
                                        {source.charAt(0).toUpperCase() + source.slice(1)}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Connection Selection (if external) */}
                        {newTaskSource !== 'manual' && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                                    {newTaskSource.charAt(0).toUpperCase() + newTaskSource.slice(1)} Connection
                                </Label>
                                <Select value={newTaskConnectionId} onValueChange={setNewTaskConnectionId}>
                                    <SelectTrigger className="bg-[#1A1A24] border-[#2A2A3A] text-xs h-10 text-[#E2E8F0]">
                                        <SelectValue placeholder={`Select ${newTaskSource} connection...`} />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1A1A24] border-[#2A2A3A]">
                                        {newTaskSource === 'linear' ? (
                                            activeProject?.linearConnections?.map(c => (
                                                <SelectItem key={c.id} value={c.id} className="text-xs text-[#E2E8F0]">
                                                    {c.label || c.teamId}
                                                </SelectItem>
                                            ))
                                        ) : (
                                            activeProject?.jiraConnections?.map(c => (
                                                <SelectItem key={c.id} value={c.id} className="text-xs text-[#E2E8F0]">
                                                    {c.label || `${c.domain} - ${c.projectKey}`}
                                                </SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Title */}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Title</Label>
                            <Input
                                autoFocus
                                value={newTaskTitle}
                                onChange={(e) => setNewTaskTitle(e.target.value)}
                                placeholder="What needs to be done?"
                                className="bg-[#1A1A24] border-[#2A2A3A] text-sm h-10 focus:ring-[#A78BFA]/30"
                            />
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Description</Label>
                            <Textarea
                                value={newTaskDescription}
                                onChange={(e) => setNewTaskDescription(e.target.value)}
                                placeholder="Add more details..."
                                className="bg-[#1A1A24] border-[#2A2A3A] text-sm min-h-[100px] resize-none focus:ring-[#A78BFA]/30"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Status */}
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Status</Label>
                                <Select value={newTaskStatus} onValueChange={(v: any) => setNewTaskStatus(v)}>
                                    <SelectTrigger className="bg-[#1A1A24] border-[#2A2A3A] text-xs h-10 text-[#E2E8F0]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1A1A24] border-[#2A2A3A]">
                                        {COLUMNS.map(col => (
                                            <SelectItem key={col.id} value={col.id} className="text-xs text-[#E2E8F0]">
                                                {col.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Priority */}
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Priority</Label>
                                <Select value={newTaskPriority} onValueChange={(v: any) => setNewTaskPriority(v)}>
                                    <SelectTrigger className="bg-[#1A1A24] border-[#2A2A3A] text-xs h-10 text-[#E2E8F0]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1A1A24] border-[#2A2A3A]">
                                        <SelectItem value="low" className="text-xs text-[#E2E8F0]">Low</SelectItem>
                                        <SelectItem value="medium" className="text-xs text-[#E2E8F0]">Medium</SelectItem>
                                        <SelectItem value="high" className="text-xs text-[#E2E8F0]">High</SelectItem>
                                        <SelectItem value="critical" className="text-xs text-[#E2E8F0]">Critical</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Labels */}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Labels (comma separated)</Label>
                            <Input
                                value={newTaskLabels}
                                onChange={(e) => setNewTaskLabels(e.target.value)}
                                placeholder="bug, ui, feature..."
                                className="bg-[#1A1A24] border-[#2A2A3A] text-sm h-10 focus:ring-[#A78BFA]/30"
                            />
                        </div>
                    </div>

                    <DialogFooter className="pt-4 border-t border-[#2A2A3A] gap-2 bg-[#13131A]">
                        <Button
                            variant="ghost"
                            onClick={() => setIsNewTaskModalOpen(false)}
                            className="text-xs font-bold text-[#6B7280] hover:text-[#E2E8F0]"
                        >
                            CANCEL
                        </Button>
                        <Button
                            onClick={handleConfirmAddTask}
                            disabled={!newTaskTitle.trim() || (newTaskSource !== 'manual' && !newTaskConnectionId)}
                            className="bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD] font-bold text-xs px-8 h-10"
                        >
                            {newTaskSource === 'manual' ? 'CREATE TASK' : `CREATE IN ${newTaskSource.toUpperCase()}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
    const mediaUrls = useMemo(() => {
        if (!rawDescription) return []
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

    if (!rawDescription || mediaUrls.length === 0) return null

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
    const priorityConfig = {
        critical: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", label: "CRITICAL" },
        high: { icon: ChevronUp, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", label: "HIGH" },
        medium: { icon: Minus, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20", label: "MEDIUM" },
        low: { icon: ChevronDown, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "LOW" },
    }

    const config = priorityConfig[task.priority] || priorityConfig.medium
    const PriorityIcon = config.icon

    return (
        <div className={cn(
            "bg-[#1A1A24]/60 backdrop-blur-md border border-[#2A2A3A] rounded-xl p-4 shadow-sm hover:border-[#A78BFA]/50 transition-all select-none group relative overflow-hidden",
            isSelected && "border-[#A78BFA] ring-1 ring-[#A78BFA]/30 bg-[#1A1A24]/90",
            isOverlay && "opacity-90 shadow-2xl scale-[1.02] border-[#A78BFA] z-[100]"
        )}>
            {/* Priority accent border */}
            <div className={cn("absolute left-0 top-0 bottom-0 w-1", config.color.replace('text-', 'bg-'))} />

            <div className="space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {task.source === 'jira' ? (
                            <div className="p-1 px-1.5 rounded bg-blue-500/10 border border-blue-500/20">
                                <span className="text-[9px] font-black text-blue-400">JIRA</span>
                            </div>
                        ) : task.source === 'linear' ? (
                            <div className="p-1 px-1.5 rounded bg-[#5E6AD2]/10 border border-[#5E6AD2]/20">
                                <span className="text-[9px] font-black text-[#5E6AD2]">LINEAR</span>
                            </div>
                        ) : (
                            <div className="p-1 px-1.5 rounded bg-amber-500/10 border border-amber-500/20">
                                <span className="text-[9px] font-black text-amber-400">MANUAL</span>
                            </div>
                        )}
                        <span className="text-[9px] font-bold text-[#6B7280] tracking-tight uppercase">{task.sourceIssueId || 'Draft'}</span>
                    </div>

                    <div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-black", config.bg, config.color, config.border)}>
                        <PriorityIcon className="h-2.5 w-2.5" />
                        {config.label}
                    </div>
                </div>

                {/* Title */}
                <h4 className="text-[13px] font-bold text-[#E2E8F0] leading-snug line-clamp-2 group-hover:text-white transition-colors">
                    {task.title}
                </h4>

                {/* Labels */}
                {task.labels && task.labels.trim() !== "" && (
                    <div className="flex flex-wrap gap-1.5">
                        {task.labels.split(',').map((label, idx) => (
                            <div key={idx} className="px-2 py-0.5 rounded-md bg-[#2A2A3A]/50 border border-[#3A3A4A] text-[9px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                                {label.trim()}
                            </div>
                        ))}
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-[#2A2A3A]/40">
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#A78BFA]/20 to-[#6366F1]/20 flex items-center justify-center overflow-hidden border border-[#A78BFA]/30">
                            {task.assignee ? (
                                <span className="text-[8px] font-bold text-[#A78BFA]">{task.assignee.substring(0, 2).toUpperCase()}</span>
                            ) : (
                                <User className="h-2.5 w-2.5 text-[#6B7280]" />
                            )}
                        </div>
                        <span className="text-[10px] font-bold text-[#8E9196] truncate max-w-[80px]">{task.assignee || 'Unassigned'}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5 text-[9px] font-medium text-[#6B7280]">
                        <Clock3 className="h-3 w-3 opacity-60" />
                        {new Date(task.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </div>
                </div>
            </div>
        </div>
    )
}
