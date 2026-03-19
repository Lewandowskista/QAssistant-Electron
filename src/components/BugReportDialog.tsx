import { useState, useEffect } from "react"
import { useProjectStore, QaEnvironment } from "@/store/useProjectStore"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Bug, Clipboard, Globe, ShieldAlert, Sparkles, Loader2, AlertTriangle, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { getApiKey } from "@/lib/credentials"
import { toast } from "sonner"

interface BugReportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    defaultEnv?: QaEnvironment
    prefillData?: {
        title?: string
        description?: string
        testCaseId?: string
        linkedTestCaseTitle?: string
        expectedResult?: string
        actualResult?: string
    }
}

type DuplicateCandidate = { bugId: string; title: string; similarityScore: number; reasoning: string }

export function BugReportDialog({ open, onOpenChange, defaultEnv, prefillData }: BugReportDialogProps) {
    const { projects, activeProjectId, addTask } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const environments = activeProject?.environments || []
    const api = window.electronAPI

    const [title, setTitle] = useState("")
    const [titleError, setTitleError] = useState("")
    const [description, setDescription] = useState("")
    const [selectedEnvId, setSelectedEnvId] = useState<string>(defaultEnv?.id || environments.find(e => e.isDefault)?.id || "")
    const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
    const [severity, setSeverity] = useState<'minor' | 'major' | 'critical' | 'blocker'>('major')
    const [reproducibility, setReproducibility] = useState<'always' | 'sometimes' | 'rarely' | 'once' | 'unable'>('sometimes')
    const reporter = "QA Tester"

    const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([])
    const [checkingDuplicates, setCheckingDuplicates] = useState(false)
    const [duplicatesChecked, setDuplicatesChecked] = useState(false)

    useEffect(() => {
        if (!open) {
            setDuplicates([])
            setDuplicatesChecked(false)
        }
    }, [open])

    useEffect(() => {
        if (defaultEnv) setSelectedEnvId(defaultEnv.id)
        if (prefillData?.title) setTitle(prefillData.title)
        if (prefillData?.description) setDescription(prefillData.description)
    }, [defaultEnv, prefillData, open])

    const selectedEnv = environments.find(e => e.id === selectedEnvId)

    const handleCheckDuplicates = async () => {
        if (!title.trim()) { setTitleError("Enter a summary first."); return }
        if (!activeProject) return
        const apiKey = await getApiKey(api, 'gemini_api_key', activeProject.id)
        if (!apiKey) { toast.error('Configure a Gemini API key in Settings to use duplicate detection.'); return }

        const openBugs = activeProject.tasks
            .filter(t => t.status !== 'done' && t.status !== 'closed' && (t.issueType?.toLowerCase().includes('bug') || t.title.startsWith('[BUG]')))
            .map(t => ({ id: t.id, title: t.title, description: t.description || '', components: t.components || [] }))

        if (openBugs.length === 0) {
            toast.info('No open bugs to compare against.')
            setDuplicatesChecked(true)
            setDuplicates([])
            return
        }

        setCheckingDuplicates(true)
        try {
            const result = await api.aiFindDuplicateBugs({
                apiKey,
                newBugTitle: title,
                newBugDescription: description,
                newBugReproSteps: description,
                affectedComponents: [],
                existingBugs: openBugs,
                modelName: activeProject.geminiModel,
            })
            setDuplicates(Array.isArray(result) ? result : [])
            setDuplicatesChecked(true)
        } catch (err: any) {
            toast.error('Duplicate check failed: ' + err.message)
        } finally {
            setCheckingDuplicates(false)
        }
    }

    const handleSubmit = async () => {
        if (!activeProjectId) return
        if (!title.trim()) {
            setTitleError("Summary is required.")
            return
        }
        setTitleError("")

        const fullDescription = `
**[BUG REPORT]**
---
**ENVIRONMENT:** ${selectedEnv?.name || 'N/A'}
**BASE URL:** ${selectedEnv?.baseUrl || 'N/A'}
**REPORTER:** ${reporter}
**PRIORITY:** ${priority.toUpperCase()}

**STEPS TO REPRODUCE:**
${description}

---
*Reported via QAssistant Bug Tool*
`.trim()

        await addTask(activeProjectId, {
            title: `[BUG] ${title}`,
            description: fullDescription,
            priority: priority === 'high' ? 'high' : priority === 'medium' ? 'medium' : 'low',
            severity,
            reproducibility,
            linkedTestCaseId: prefillData?.testCaseId
        })

        setTitle("")
        setTitleError("")
        setDescription("")
        setSeverity('major')
        setReproducibility('sometimes')
        setDuplicates([])
        setDuplicatesChecked(false)
        onOpenChange(false)
    }

    const getScoreColor = (score: number) =>
        score >= 80 ? 'text-[#EF4444]' : score >= 60 ? 'text-[#F59E0B]' : 'text-[#A78BFA]'

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl bg-card border shadow-2xl overflow-hidden p-0">
                <div className="h-2 bg-red-500 w-full" />
                <div className="p-8 space-y-6">
                    <DialogHeader>
                        <div className="flex items-center gap-3 text-red-500 mb-2">
                            <div className="p-2 bg-red-500/10 rounded-lg">
                                <Bug className="h-6 w-6" />
                            </div>
                            <DialogTitle className="text-2xl font-black tracking-tight">Rapid Bug Report</DialogTitle>
                        </div>
                        <DialogDescription className="text-muted-foreground">
                            Instantly capture and route bugs to your board with pre-populated environment telemetry.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="bug-title" className="text-xs font-bold uppercase text-muted-foreground px-1 flex items-center gap-2">
                                <Bug className="h-3 w-3" /> Summary
                            </Label>
                            <Input
                                id="bug-title"
                                placeholder="Short, descriptive title of the issue"
                                value={title}
                                onChange={e => { setTitle(e.target.value); if (e.target.value.trim()) setTitleError(""); setDuplicatesChecked(false); setDuplicates([]) }}
                                className={cn("bg-background/50 focus-visible:ring-red-500/40 focus-visible:border-red-500/50 font-semibold", titleError && "border-red-500/70")}
                            />
                            {titleError && <p className="text-xs text-red-400 px-1">{titleError}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label className="text-xs font-bold uppercase text-muted-foreground px-1 flex items-center gap-2">
                                    <Globe className="h-3 w-3" /> Target Environment
                                </Label>
                                <Select value={selectedEnvId} onValueChange={setSelectedEnvId}>
                                    <SelectTrigger className="bg-background/50 border-red-500/20">
                                        <SelectValue placeholder="Select env" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {environments.map(env => (
                                            <SelectItem key={env.id} value={env.id}>
                                                <div className="flex items-center gap-2">
                                                    <div className={cn("w-1.5 h-1.5 rounded-full", env.color)} />
                                                    {env.name}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-xs font-bold uppercase text-muted-foreground px-1 flex items-center gap-2">
                                    <ShieldAlert className="h-3 w-3" /> Impact/Priority
                                </Label>
                                <Select value={priority} onValueChange={(val: any) => setPriority(val)}>
                                    <SelectTrigger className="bg-background/50">
                                        <SelectValue placeholder="Priority" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">Low - Minor UI</SelectItem>
                                        <SelectItem value="medium">Medium - Functional</SelectItem>
                                        <SelectItem value="high">High - Blocker</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label className="text-xs font-bold uppercase text-muted-foreground px-1">Technical Severity</Label>
                                <Select value={severity} onValueChange={(val: any) => setSeverity(val)}>
                                    <SelectTrigger className="bg-background/50">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="minor">Minor</SelectItem>
                                        <SelectItem value="major">Major</SelectItem>
                                        <SelectItem value="critical">Critical</SelectItem>
                                        <SelectItem value="blocker">Blocker</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-xs font-bold uppercase text-muted-foreground px-1">Reproducibility</Label>
                                <Select value={reproducibility} onValueChange={(val: any) => setReproducibility(val)}>
                                    <SelectTrigger className="bg-background/50">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="always">Always</SelectItem>
                                        <SelectItem value="sometimes">Sometimes</SelectItem>
                                        <SelectItem value="rarely">Rarely</SelectItem>
                                        <SelectItem value="once">Once</SelectItem>
                                        <SelectItem value="unable">Unable to Reproduce</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label className="text-xs font-bold uppercase text-muted-foreground px-1 flex items-center gap-2">
                                <Clipboard className="h-3 w-3" /> Steps & Expected vs Actual
                            </Label>
                            <Textarea
                                rows={6}
                                placeholder="1. Go to...\n2. Click...\n3. Observe..."
                                value={description}
                                onChange={e => { setDescription(e.target.value); setDuplicatesChecked(false); setDuplicates([]) }}
                                className="bg-background/50 resize-none min-h-[150px] font-mono text-sm leading-relaxed"
                            />
                        </div>

                        {/* Duplicate Detection */}
                        <div className="rounded-xl border border-[#2A2A3A] bg-[#0F0F13] overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 border-b border-[#2A2A3A]">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="h-3.5 w-3.5 text-[#A78BFA]" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">AI Duplicate Check</span>
                                    {duplicatesChecked && duplicates.length === 0 && (
                                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#10B981]/10 text-[#10B981]">No duplicates found</span>
                                    )}
                                    {duplicates.length > 0 && (
                                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#F59E0B]/10 text-[#F59E0B]">{duplicates.length} possible duplicate{duplicates.length !== 1 ? 's' : ''}</span>
                                    )}
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCheckDuplicates}
                                    disabled={checkingDuplicates || !title.trim()}
                                    className="h-7 text-[10px] font-bold text-[#A78BFA] hover:bg-[#A78BFA]/10 gap-1.5"
                                >
                                    {checkingDuplicates ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                    {checkingDuplicates ? 'Checking...' : 'Check'}
                                </Button>
                            </div>
                            {duplicates.length > 0 && (
                                <div className="p-2 space-y-1.5">
                                    {duplicates.map(d => (
                                        <div key={d.bugId} className="flex items-start gap-2 p-2 rounded-lg bg-[#1A1A24] border border-[#2A2A3A]">
                                            <AlertTriangle className="h-3.5 w-3.5 text-[#F59E0B] shrink-0 mt-0.5" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn("text-[10px] font-black", getScoreColor(d.similarityScore))}>{d.similarityScore}%</span>
                                                    <span className="text-xs font-semibold text-[#E2E8F0] truncate">{d.title}</span>
                                                </div>
                                                <p className="text-[10px] text-[#9CA3AF] mt-0.5">{d.reasoning}</p>
                                            </div>
                                            <ExternalLink className="h-3 w-3 text-[#6B7280] shrink-0 mt-0.5" />
                                        </div>
                                    ))}
                                    <p className="text-[10px] text-[#6B7280] px-1 pb-1">Review the above before filing. You can still proceed if this is a new issue.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="pt-4 border-t border-[#2A2A3A] gap-2 bg-[#13131A]">
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button onClick={handleSubmit} className="bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-600/20 px-8">
                            Report Bug
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
