import { useState, useEffect, useCallback } from "react"
import { 
    X, 
    User, 
    Calendar, 
    Tag, 
    Clock, 
    Loader2, 
    MessageSquare, 
    Trash2, 
    Send, 
    Target,
    ExternalLink,
    Activity as ActivityIcon
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Project, Task, TaskStatus } from "@/store/useProjectStore"
import { DetailItem, MediaSection } from "./TaskDetailsComponents"
import FormattedText from "@/components/FormattedText"
import { toast } from "sonner"

interface TaskDetailsSidebarProps {
    selectedTask: Task | null
    activeProject: Project | undefined
    currentColumns: any[]
    onClose: () => void
    onUpdateTask: (updates: Partial<Task>) => Promise<void>
    onAnalyze: (task: Task) => Promise<void>
    isAnalyzing: boolean
    onGenerateBugReport: () => Promise<void>
    onDeleteAnalysis: (entry: any) => void
    api: any
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
    api
}: TaskDetailsSidebarProps) {
    const [activeTab, setActiveTab] = useState('description')
    const [isEditing, setIsEditing] = useState(false)
    const [editTitle, setEditTitle] = useState("")
    const [editDescription, setEditDescription] = useState("")
    const [editStatus, setEditStatus] = useState<TaskStatus>('todo')
    const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
    const [editAssignee, setEditAssignee] = useState("")
    const [editLabels, setEditLabels] = useState("")

    const [comments, setComments] = useState<any[]>([])
    const [activity, setActivity] = useState<any[]>([])
    const [, setHistory] = useState<any[]>([])
    const [isLoadingTab, setIsLoadingTab] = useState(false)
    const [newComment, setNewComment] = useState("")
    const [isPostingComment, setIsPostingComment] = useState(false)
    const [expandedHistory, setExpandedHistory] = useState<Set<number>>(new Set())

    useEffect(() => {
        if (selectedTask) {
            setEditTitle(selectedTask.title)
            setEditDescription(selectedTask.description || "")
            setEditStatus(selectedTask.status)
            setEditPriority(selectedTask.priority)
            setEditAssignee(selectedTask.assignee || "")
            setEditLabels(selectedTask.labels || "")
            setIsEditing(false)
            setHistory(selectedTask.analysisHistory || [])
        }
    }, [selectedTask])

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
        const domain = await api.secureStoreGet(`${prefix}jira_domain`) || await api.secureStoreGet('jira_domain')
        const email = await api.secureStoreGet(`${prefix}jira_email`) || await api.secureStoreGet('jira_email')
        const key = await api.secureStoreGet(`${prefix}jira_api_token`) || await api.secureStoreGet('jira_api_token')
        if (domain && email && key) return { domain, email, apiKey: key }
        return null
    }, [activeProject, api])

    const loadTabContent = useCallback(async (tab: string) => {
        if (!selectedTask) return
        setActiveTab(tab)
        setIsLoadingTab(true)

        try {
            if (tab === 'comments') {
                if (selectedTask.source === 'linear') {
                    const key = await getLinearApiKey(selectedTask.connectionId)
                    if (key) setComments(await api.getLinearComments({ apiKey: key, issueId: selectedTask.externalId }))
                    else toast.error("Linear API key not found.")
                } else if (selectedTask.source === 'jira') {
                    const creds = await getJiraCredentials(selectedTask.connectionId)
                    if (creds) setComments(await api.getJiraComments({ ...creds, issueKey: selectedTask.sourceIssueId }))
                    else toast.error("Jira credentials not found.")
                }
            } else if (tab === 'activity') {
                if (selectedTask.source === 'linear') {
                    const key = await getLinearApiKey(selectedTask.connectionId)
                    if (key) setActivity(await api.getLinearHistory({ apiKey: key, issueId: selectedTask.externalId }))
                } else if (selectedTask.source === 'jira') {
                    const creds = await getJiraCredentials(selectedTask.connectionId)
                    if (creds) setActivity(await api.getJiraHistory({ ...creds, issueKey: selectedTask.sourceIssueId }))
                }
            } else if (tab === 'history') {
                setHistory(selectedTask.analysisHistory || [])
            }
        } catch (e: any) {
            toast.error(e.message || "Error loading tab.")
        } finally {
            setIsLoadingTab(false)
        }
    }, [selectedTask, api, getLinearApiKey, getJiraCredentials])

    useEffect(() => {
        if (selectedTask && activeTab !== 'description' && activeTab !== 'details') {
            loadTabContent(activeTab)
        }
    }, [selectedTask?.id, activeTab, loadTabContent])

    const handleSave = async () => {
        await onUpdateTask({
            title: editTitle,
            description: editDescription,
            status: editStatus,
            priority: editPriority,
            assignee: editAssignee,
            labels: editLabels
        })
        setIsEditing(false)
    }

    const handlePostComment = async () => {
        if (!selectedTask || !newComment.trim()) return
        setIsPostingComment(true)
        try {
            if (selectedTask.source === 'linear') {
                const key = await getLinearApiKey(selectedTask.connectionId)
                if (key) {
                    await api.addLinearComment({ apiKey: key, issueId: selectedTask.externalId, body: newComment })
                    setNewComment("")
                    loadTabContent('comments')
                }
            } else if (selectedTask.source === 'jira') {
                const creds = await getJiraCredentials(selectedTask.connectionId)
                if (creds) {
                    await api.addJiraComment({ ...creds, issueKey: selectedTask.sourceIssueId, body: newComment })
                    setNewComment("")
                    loadTabContent('comments')
                }
            }
        } catch (e: any) {
            toast.error(`Comment failed: ${e.message}`)
        } finally {
            setIsPostingComment(false)
        }
    }

    const toggleHistoryExpand = (i: number) => {
        const next = new Set(expandedHistory)
        if (next.has(i)) next.delete(i)
        else next.add(i)
        setExpandedHistory(next)
    }

    if (!selectedTask) return null

    return (
        <div className={cn(
            "bg-[#13131A] border-l border-[#2A2A3A] transition-all duration-300 ease-in-out flex flex-col overflow-hidden shadow-2xl",
            "w-[500px]"
        )}>
            <div className="flex-none p-5 border-b border-[#2A2A3A] space-y-4">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">{selectedTask.sourceIssueId || 'MANUAL TASK'}</p>
                        <h2 className="text-lg font-semibold text-[#E2E8F0] leading-tight">{selectedTask.title}</h2>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B7280] hover:text-[#E2E8F0]" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase",
                        currentColumns.find((c: any) => c.id === selectedTask.status)?.textColor || "text-[#A78BFA]",
                        "bg-[#1A1A24] border border-[#2A2A3A]"
                    )}>
                        {selectedTask.status}
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
                                        className="min-h-[200px] w-full rounded-md bg-[#1A1A24] border border-[#2A2A3A] p-3 text-xs text-[#E2E8F0] focus:ring-1 focus:ring-[#A78BFA]/50 outline-none resize-none app-region-no-drag"
                                        placeholder="Task description..."
                                    />
                                </div>
                            ) : (
                                <>
                                    <div className="prose-container min-h-[100px]">
                                        <FormattedText 
                                            content={selectedTask.description} 
                                            source={selectedTask.source}
                                            connectionId={selectedTask.connectionId}
                                            projectId={activeProject?.id}
                                        />
                                    </div>
                                    <MediaSection
                                        task={selectedTask}
                                        onImageClick={(url) => { if (api.openUrl) api.openUrl(url) }}
                                        projectId={activeProject?.id}
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
                                            <div className="px-3 py-2 rounded-lg bg-[#1A1A24]/40 border border-[#2A2A3A]/30 text-xs font-medium text-[#E2E8F0]">{selectedTask.title}</div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="grid gap-1.5">
                                            <label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Status</label>
                                            {isEditing ? (
                                                <select
                                                    value={editStatus}
                                                    onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                                                    className="h-9 w-full rounded-md bg-[#1A1A24] border border-[#2A2A3A] px-3 py-1 text-xs text-[#E2E8F0] outline-none"
                                                >
                                                    {currentColumns.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
                                                </select>
                                            ) : (
                                                <div className="px-3 py-2 rounded-lg bg-[#1A1A24]/40 border border-[#2A2A3A]/30 text-[10px] font-bold text-[#E2E8F0]">{selectedTask.status.toUpperCase()}</div>
                                            )}
                                        </div>
                                        <div className="grid gap-1.5">
                                            <label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Priority</label>
                                            {isEditing ? (
                                                <select
                                                    value={editPriority}
                                                    onChange={(e) => setEditPriority(e.target.value as any)}
                                                    className="h-9 w-full rounded-md bg-[#1A1A24] border border-[#2A2A3A] px-3 py-1 text-xs text-[#E2E8F0] outline-none"
                                                >
                                                    <option value="low">LOW</option>
                                                    <option value="medium">MEDIUM</option>
                                                    <option value="high">HIGH</option>
                                                    <option value="critical">CRITICAL</option>
                                                </select>
                                            ) : (
                                                <div className="px-3 py-2 rounded-lg bg-[#1A1A24]/40 border border-[#2A2A3A]/30 text-xs font-bold text-[#E2E8F0]">{selectedTask.priority.toUpperCase()}</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="grid gap-1.5">
                                            <label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Assignee</label>
                                            {isEditing ? (
                                                <Input value={editAssignee} onChange={(e) => setEditAssignee(e.target.value)} className="h-9 bg-[#1A1A24] border-[#2A2A3A] text-xs" />
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
                                {isEditing && (
                                    <Button className="w-full h-9 mt-2 bg-[#A78BFA] hover:bg-[#C4B5FD] text-[#0F0F13] font-bold text-[10px]" onClick={handleSave}>SAVE CHANGES</Button>
                                )}
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                <DetailItem icon={User} label="ASSIGNEE" value={selectedTask.assignee || 'Unassigned'} />
                                <DetailItem icon={Calendar} label="DUE DATE" value={selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : 'No date'} />
                                <DetailItem icon={Tag} label="LABELS" value={selectedTask.labels || 'No labels'} />
                                <DetailItem icon={Clock} label="CREATED" value={new Date(selectedTask.createdAt || Date.now()).toLocaleDateString()} />
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
                                        <div className="text-xs text-[#E2E8F0] leading-relaxed">
                                            <FormattedText content={c.body} source={selectedTask.source} connectionId={selectedTask.connectionId} projectId={activeProject?.id} />
                                        </div>
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
                                <Button size="icon" className="bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD]" onClick={handlePostComment} disabled={isPostingComment || !newComment.trim()}>
                                    {isPostingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </Button>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="history" className="m-0 space-y-4">
                        {selectedTask.analysisHistory?.length === 0 ? (
                            <div className="text-center opacity-30 py-10">
                                <p className="text-xs font-bold uppercase tracking-wider">No analysis history</p>
                            </div>
                        ) : (
                            [...(selectedTask.analysisHistory || [])].sort((a, b) => b.version - a.version).map((h, i) => (
                                <div key={i} className="flex flex-col gap-0 group relative">
                                    <div className="ml-[5px] pl-4 pb-4 border-l border-[#2A2A3A] flex flex-col gap-1.5">
                                        <div className="bg-[#1A1A24] border border-[#2A2A3A] rounded-xl p-3 shadow-sm hover:border-[#A78BFA]/30 transition-all space-y-3 mt-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] font-bold text-[#6B7280]">{new Date(h.timestamp).toLocaleString()}</span>
                                                <Button size="icon" variant="ghost" className="h-6 w-6 text-[#6B7280] hover:text-[#EF4444]" onClick={() => onDeleteAnalysis(h)}>
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                            <div className="text-[11px] text-[#E2E8F0] font-medium leading-relaxed">
                                                <FormattedText content={h.summary} source={selectedTask.source} connectionId={selectedTask.connectionId} projectId={activeProject?.id} />
                                            </div>
                                            <Button variant="ghost" size="sm" className="h-6 px-0 text-[10px] font-bold text-[#A78BFA]" onClick={() => toggleHistoryExpand(i)}>
                                                {expandedHistory.has(i) ? 'COLLAPSE' : 'VIEW FULL ANALYSIS'}
                                            </Button>
                                            {expandedHistory.has(i) && (
                                                <div className="mt-3 p-4 bg-[#0F0F13] rounded-lg border border-[#2A2A3A] text-[11px] leading-relaxed">
                                                    <FormattedText content={h.fullResult} source={selectedTask.source} connectionId={selectedTask.connectionId} projectId={activeProject?.id} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </TabsContent>
                    
                    <TabsContent value="activity" className="m-0 space-y-4">
                        {activity.length === 0 ? (
                            <div className="text-center opacity-30 py-10">
                                <p className="text-xs font-bold uppercase tracking-wider">No activity recorded</p>
                            </div>
                        ) : (
                            <div className="space-y-0.5 ml-1">
                                {[...activity].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((w, i) => (
                                    <div key={i} className="relative pl-6 pb-6 border-l border-[#2A2A3A] group">
                                        <div className="absolute -left-[5.5px] top-1 w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
                                        <div className="bg-[#1A1A24]/40 border border-[#2A2A3A] rounded-xl p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-bold text-[#E2E8F0]">{w.author}</span>
                                                <span className="text-[10px] text-[#6B7280]">{new Date(w.timestamp).toLocaleString()}</span>
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap text-[10px]">
                                                {w.fromValue && <span className="line-through opacity-50">{w.fromValue}</span>}
                                                <Send className="h-2 w-2 opacity-50" />
                                                <span className="text-emerald-400 font-bold">{w.toValue}</span>
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
                    className="w-full h-10 bg-[#A78BFA] hover:bg-[#C4B5FD] text-[#0F0F13] font-bold gap-2"
                    onClick={() => onAnalyze(selectedTask)}
                    disabled={isAnalyzing}
                >
                    {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ActivityIcon className="h-4 w-4" />}
                    {isAnalyzing ? 'ANALYZING...' : 'ANALYZE ISSUE'}
                </Button>
                <Button className="w-full h-10 bg-[#1E2A1E] text-[#10B981] border border-[#10B981]/20 font-bold text-[10px] gap-1.5" onClick={onGenerateBugReport}>
                    <Target className="h-3.5 w-3.5" /> GENERATE BUG REPORT
                </Button>

                {selectedTask.source !== 'manual' && (
                    <Button
                        className="w-full h-10 bg-[#1A1A24] text-[#A78BFA] border border-[#A78BFA]/20 font-bold text-[10px] gap-1.5"
                        onClick={() => { if (selectedTask.ticketUrl) api.openUrl(selectedTask.ticketUrl) }}
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {selectedTask.source === 'linear' ? 'OPEN IN LINEAR' : 'OPEN IN JIRA'}
                    </Button>
                )}
            </div>
        </div>
    )
}
