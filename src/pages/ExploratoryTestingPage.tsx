import { useState, useEffect, useRef } from 'react'
import { Plus, Play, Square, Clock, Bug, Eye, HelpCircle, Lightbulb, Trash2, CheckCircle, Timer } from 'lucide-react'
import { useProjectStore } from '@/store/useProjectStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { ExploratoryObservation, ExploratoryObservationType, TaskSeverity } from '@/types/project'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

const OBS_TYPE_CONFIG: Record<ExploratoryObservationType, { label: string; icon: React.ElementType; color: string }> = {
    observation: { label: 'Observation', icon: Eye, color: 'text-blue-400' },
    finding: { label: 'Finding', icon: Lightbulb, color: 'text-yellow-400' },
    bug: { label: 'Bug', icon: Bug, color: 'text-red-400' },
    question: { label: 'Question', icon: HelpCircle, color: 'text-purple-400' },
}

function formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
}

function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function ExploratoryTestingPage() {
    const activeProjectId = useProjectStore(s => s.activeProjectId)
    const projects = useProjectStore(s => s.projects)
    const activeProject = projects.find(p => p.id === activeProjectId)
    const addExploratorySession = useProjectStore(s => s.addExploratorySession)
    const updateExploratorySession = useProjectStore(s => s.updateExploratorySession)
    const addExploratoryObservation = useProjectStore(s => s.addExploratoryObservation)
    const deleteExploratorySession = useProjectStore(s => s.deleteExploratorySession)
    const addTask = useProjectStore(s => s.addTask)

    const sessions = activeProject?.exploratorySessions || []

    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
    const [newSessionOpen, setNewSessionOpen] = useState(false)
    const [charter, setCharter] = useState('')
    const [timebox, setTimebox] = useState('60')
    const [tester, setTester] = useState('')

    // Active session timer
    const [elapsed, setElapsed] = useState(0)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Observation input
    const [obsType, setObsType] = useState<ExploratoryObservationType>('observation')
    const [obsDesc, setObsDesc] = useState('')
    const [obsSeverity, setObsSeverity] = useState<TaskSeverity | ''>('')
    const [addingObs, setAddingObs] = useState(false)

    // Inline bug filing
    const [bugDialogOpen, setBugDialogOpen] = useState(false)
    const [bugTitle, setBugTitle] = useState('')
    const [bugDesc, setBugDesc] = useState('')
    const selectedSession = sessions.find(s => s.id === selectedSessionId) || sessions[0] || null
    const isActive = selectedSession && !selectedSession.completedAt
    const defaultBugStatus = activeProject?.columns?.find((column) => column.type === 'unstarted')?.id
        ?? activeProject?.columns?.[0]?.id
        ?? 'todo'

    // Select first session by default
    useEffect(() => {
        if (!selectedSessionId && sessions.length > 0) {
            setSelectedSessionId(sessions[0].id)
        }
    }, [selectedSessionId, sessions])

    // Timer for active session
    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current)
        if (isActive && selectedSession) {
            const update = () => setElapsed(Date.now() - selectedSession.startedAt)
            update()
            timerRef.current = setInterval(update, 1000)
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current) }
    }, [selectedSession?.id, isActive])

    const handleCreateSession = async () => {
        if (!activeProjectId || !charter.trim()) return
        const t = parseInt(timebox) || 60
        const id = await addExploratorySession(activeProjectId, charter.trim(), t, tester.trim() || 'Tester')
        setSelectedSessionId(id)
        setNewSessionOpen(false)
        setCharter('')
        setTimebox('60')
        setTester('')
        toast.success('Session started')
    }

    const handleCompleteSession = async () => {
        if (!activeProjectId || !selectedSession) return
        await updateExploratorySession(activeProjectId, selectedSession.id, { completedAt: Date.now() })
        toast.success('Session completed')
    }

    const handleAddObservation = async () => {
        if (!activeProjectId || !selectedSession || !obsDesc.trim()) return
        setAddingObs(true)
        try {
            const obs: Omit<ExploratoryObservation, 'id' | 'timestamp'> = {
                type: obsType,
                description: obsDesc.trim(),
                ...(obsSeverity ? { severity: obsSeverity as TaskSeverity } : {}),
            }
            await addExploratoryObservation(activeProjectId, selectedSession.id, obs)
            setObsDesc('')
            setObsSeverity('')
        } finally {
            setAddingObs(false)
        }
    }

    const handleFileBugFromObs = (obs: ExploratoryObservation) => {
        setBugTitle(`[Exploratory] ${obs.description.slice(0, 80)}`)
        setBugDesc(obs.description)
        setBugDialogOpen(true)
    }

    const handleFileBug = async () => {
        if (!activeProjectId || !bugTitle.trim()) return
        const taskId = await addTask(activeProjectId, {
            title: bugTitle.trim(),
            description: bugDesc.trim(),
            status: defaultBugStatus,
            priority: 'high',
        })
        // Link bug to session
        if (selectedSession) {
            const updated = [...(selectedSession.discoveredBugIds || []), taskId]
            await updateExploratorySession(activeProjectId, selectedSession.id, { discoveredBugIds: updated })
        }
        setBugDialogOpen(false)
        setBugTitle('')
        setBugDesc('')
        toast.success('Bug task created and linked to session')
    }

    const handleDeleteSession = async (sessionId: string) => {
        if (!activeProjectId) return
        await deleteExploratorySession(activeProjectId, sessionId)
        if (selectedSessionId === sessionId) {
            const remaining = sessions.filter(s => s.id !== sessionId)
            setSelectedSessionId(remaining[0]?.id || null)
        }
    }

    const handleUpdateNotes = async (notes: string) => {
        if (!activeProjectId || !selectedSession) return
        await updateExploratorySession(activeProjectId, selectedSession.id, { notes })
    }

    const timeboxProgress = isActive && selectedSession
        ? Math.min(100, (elapsed / 1000 / 60 / selectedSession.timebox) * 100)
        : 0

    return (
        <div className="flex h-full">
            {/* Sidebar: session list */}
            <aside className="w-[240px] shrink-0 border-r border-border flex flex-col bg-background">
                <div className="px-3 py-3 border-b border-border flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessions</span>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setNewSessionOpen(true)}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex-1 overflow-y-auto py-1">
                    {sessions.length === 0 && (
                        <p className="text-xs text-muted-foreground px-3 py-6 text-center">No sessions yet</p>
                    )}
                    {sessions.map(s => {
                        const isSelected = s.id === (selectedSession?.id)
                        const isDone = !!s.completedAt
                        return (
                            <button
                                key={s.id}
                                onClick={() => setSelectedSessionId(s.id)}
                                className={cn(
                                    "w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors group",
                                    isSelected && "bg-muted"
                                )}
                            >
                                <div className="flex items-center gap-1.5">
                                    {isDone
                                        ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                                        : <Timer className="h-3 w-3 text-yellow-500 shrink-0 animate-pulse" />
                                    }
                                    <span className="text-xs font-medium truncate flex-1">{s.charter}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 pl-4">
                                    <span className="text-xs text-muted-foreground">{s.tester}</span>
                                    <span className="text-xs text-muted-foreground">· {s.timebox}m</span>
                                    <span className="text-xs text-muted-foreground ml-auto">{s.observations.length} obs</span>
                                </div>
                            </button>
                        )
                    })}
                </div>
                {sessions.length === 0 && (
                    <div className="p-3 border-t border-border">
                        <Button size="sm" className="w-full text-xs" onClick={() => setNewSessionOpen(true)}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> New Session
                        </Button>
                    </div>
                )}
            </aside>

            {/* Main content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {!selectedSession ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                        <FlaskIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
                        <p className="text-sm text-muted-foreground mb-4">No exploratory session selected</p>
                        <Button onClick={() => setNewSessionOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" /> Start New Session
                        </Button>
                    </div>
                ) : (
                    <>
                        {/* Session header */}
                        <div className="border-b border-border px-4 py-3 shrink-0">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h1 className="text-sm font-semibold truncate">{selectedSession.charter}</h1>
                                        {selectedSession.completedAt
                                            ? <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">Completed</Badge>
                                            : <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/30 animate-pulse">Active</Badge>
                                        }
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                        <span>{selectedSession.tester}</span>
                                        <span>Timebox: {selectedSession.timebox}m</span>
                                        <span>{selectedSession.observations.length} observations</span>
                                        <span>{selectedSession.discoveredBugIds.length} bugs filed</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {isActive && (
                                        <div className="flex items-center gap-2">
                                            <div className="text-sm font-mono tabular-nums text-yellow-500">
                                                <Clock className="h-3.5 w-3.5 inline mr-1 mb-0.5" />
                                                {formatDuration(elapsed)}
                                                <span className="text-xs text-muted-foreground ml-1">/ {selectedSession.timebox}m</span>
                                            </div>
                                            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className={cn("h-full rounded-full transition-all", timeboxProgress >= 100 ? "bg-red-500" : "bg-yellow-500")}
                                                    style={{ width: `${timeboxProgress}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {isActive && (
                                        <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleCompleteSession}>
                                            <Square className="h-3 w-3 mr-1" /> Complete
                                        </Button>
                                    )}
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                                        onClick={() => handleDeleteSession(selectedSession.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-1 overflow-hidden">
                            {/* Observation log */}
                            <div className="flex-1 flex flex-col overflow-hidden">
                                {/* Add observation bar */}
                                {isActive && (
                                    <div className="border-b border-border px-4 py-2 shrink-0 bg-muted/20">
                                        <div className="flex gap-2 items-start">
                                            <Select value={obsType} onValueChange={v => setObsType(v as ExploratoryObservationType)}>
                                                <SelectTrigger className="h-8 w-[130px] text-xs shrink-0">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {(Object.entries(OBS_TYPE_CONFIG) as [ExploratoryObservationType, typeof OBS_TYPE_CONFIG[keyof typeof OBS_TYPE_CONFIG]][]).map(([type, cfg]) => (
                                                        <SelectItem key={type} value={type} className="text-xs">
                                                            <span className={cn("font-medium", cfg.color)}>{cfg.label}</span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {obsType === 'bug' && (
                                                <Select value={obsSeverity} onValueChange={v => setObsSeverity(v as TaskSeverity)}>
                                                    <SelectTrigger className="h-8 w-[110px] text-xs shrink-0">
                                                        <SelectValue placeholder="Severity" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {(['cosmetic', 'minor', 'major', 'critical', 'blocker'] as TaskSeverity[]).map(s => (
                                                            <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                            <Input
                                                className="h-8 text-xs flex-1"
                                                placeholder="Describe your observation…"
                                                value={obsDesc}
                                                onChange={e => setObsDesc(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddObservation() } }}
                                            />
                                            <Button size="sm" className="h-8 text-xs px-3 shrink-0" onClick={handleAddObservation} disabled={addingObs || !obsDesc.trim()}>
                                                Log
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Observations list */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                    {selectedSession.observations.length === 0 && (
                                        <p className="text-xs text-muted-foreground text-center py-8">
                                            {isActive ? 'Start logging observations above' : 'No observations were recorded'}
                                        </p>
                                    )}
                                    {[...selectedSession.observations].reverse().map(obs => {
                                        const cfg = OBS_TYPE_CONFIG[obs.type]
                                        const Icon = cfg.icon
                                        return (
                                            <div key={obs.id} className="flex gap-2.5 group">
                                                <div className="shrink-0 mt-0.5">
                                                    <Icon className={cn("h-4 w-4", cfg.color)} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={cn("text-xs font-medium", cfg.color)}>{cfg.label}</span>
                                                        {obs.severity && (
                                                            <Badge variant="outline" className="text-xs px-1 py-0 h-4 capitalize">{obs.severity}</Badge>
                                                        )}
                                                        <span className="text-xs text-muted-foreground">{formatTimestamp(obs.timestamp)}</span>
                                                        {obs.type === 'bug' && isActive && (
                                                            <button
                                                                onClick={() => handleFileBugFromObs(obs)}
                                                                className="text-xs text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                                                            >
                                                                <Bug className="h-3 w-3 inline mr-0.5" /> File Bug
                                                            </button>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-foreground mt-0.5 leading-relaxed">{obs.description}</p>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Right panel: session notes + summary */}
                            <div className="w-[260px] shrink-0 border-l border-border flex flex-col">
                                <div className="px-3 py-2 border-b border-border">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Session Notes</span>
                                </div>
                                <Textarea
                                    className="flex-1 resize-none rounded-none border-0 text-xs focus-visible:ring-0 bg-transparent"
                                    placeholder="Capture overall notes, context, test ideas…"
                                    value={selectedSession.notes}
                                    onChange={e => handleUpdateNotes(e.target.value)}
                                    readOnly={!isActive}
                                />
                                {selectedSession.discoveredBugIds.length > 0 && (
                                    <div className="border-t border-border px-3 py-2">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Bugs Filed</p>
                                        <p className="text-xs text-foreground">{selectedSession.discoveredBugIds.length} bug task{selectedSession.discoveredBugIds.length !== 1 ? 's' : ''} linked</p>
                                    </div>
                                )}
                                <div className="border-t border-border px-3 py-2">
                                    <div className="grid grid-cols-2 gap-1 text-xs">
                                        {(Object.entries(OBS_TYPE_CONFIG) as [ExploratoryObservationType, typeof OBS_TYPE_CONFIG[keyof typeof OBS_TYPE_CONFIG]][]).map(([type, cfg]) => {
                                            const count = selectedSession.observations.filter(o => o.type === type).length
                                            const Icon = cfg.icon
                                            return (
                                                <div key={type} className="flex items-center gap-1">
                                                    <Icon className={cn("h-3 w-3", cfg.color)} />
                                                    <span className="text-muted-foreground">{cfg.label}</span>
                                                    <span className="ml-auto font-medium">{count}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* New session dialog */}
            <Dialog open={newSessionOpen} onOpenChange={setNewSessionOpen}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>Start Exploratory Session</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Charter *</label>
                            <Textarea
                                className="text-sm resize-none"
                                rows={3}
                                placeholder="e.g. Explore checkout with expired promotions on staging"
                                value={charter}
                                onChange={e => setCharter(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-3">
                            <div className="flex-1 space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Timebox (minutes)</label>
                                <Input
                                    type="number"
                                    min={5}
                                    max={240}
                                    className="text-sm"
                                    value={timebox}
                                    onChange={e => setTimebox(e.target.value)}
                                />
                            </div>
                            <div className="flex-1 space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Tester</label>
                                <Input
                                    className="text-sm"
                                    placeholder="Your name"
                                    value={tester}
                                    onChange={e => setTester(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNewSessionOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateSession} disabled={!charter.trim()}>
                            <Play className="h-4 w-4 mr-2" /> Start Session
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bug filing dialog */}
            <Dialog open={bugDialogOpen} onOpenChange={setBugDialogOpen}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>File Bug from Observation</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Title</label>
                            <Input className="text-sm" value={bugTitle} onChange={e => setBugTitle(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Description</label>
                            <Textarea className="text-sm resize-none" rows={3} value={bugDesc} onChange={e => setBugDesc(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBugDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleFileBug} disabled={!bugTitle.trim()}>
                            <Bug className="h-4 w-4 mr-2" /> File Bug
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

// Simple flask SVG icon placeholder
function FlaskIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 3h6M9 3v7l-4 8a1 1 0 001 1.5h10a1 1 0 001-1.5l-4-8V3" />
        </svg>
    )
}
