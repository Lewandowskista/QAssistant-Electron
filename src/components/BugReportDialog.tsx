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
import { Bug, Clipboard, Globe, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"

interface BugReportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    defaultEnv?: QaEnvironment
}

export function BugReportDialog({ open, onOpenChange, defaultEnv }: BugReportDialogProps) {
    const { projects, activeProjectId, addTask } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const environments = activeProject?.environments || []

    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [selectedEnvId, setSelectedEnvId] = useState<string>(defaultEnv?.id || environments.find(e => e.isDefault)?.id || "")
    const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
    const reporter = "QA Tester" // Could be from settings

    useEffect(() => {
        if (defaultEnv) setSelectedEnvId(defaultEnv.id)
    }, [defaultEnv])

    const selectedEnv = environments.find(e => e.id === selectedEnvId)

    const handleSubmit = async () => {
        if (!activeProjectId || !title) return

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
            priority: priority === 'high' ? 'high' : priority === 'medium' ? 'medium' : 'low'
        })

        // Reset and close
        setTitle("")
        setDescription("")
        onOpenChange(false)
    }

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
                                onChange={e => setTitle(e.target.value)}
                                className="bg-background/50 focus-visible:ring-red-500/40 focus-visible:border-red-500/50 font-semibold"
                            />
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
                                    <ShieldAlert className="h-3 w-3" /> Severity
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

                        <div className="grid gap-2">
                            <Label className="text-xs font-bold uppercase text-muted-foreground px-1 flex items-center gap-2">
                                <Clipboard className="h-3 w-3" /> Steps & Expected vs Actual
                            </Label>
                            <Textarea
                                rows={6}
                                placeholder="1. Go to...\n2. Click...\n3. Observe..."
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                className="bg-background/50 resize-none min-h-[150px] font-mono text-sm leading-relaxed"
                            />
                        </div>
                    </div>

                    <DialogFooter className="pt-4 border-t border-border/50 gap-2">
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
