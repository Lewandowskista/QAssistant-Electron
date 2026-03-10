import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useProjectStore } from "@/store/useProjectStore"
import { TestCase, TestPlan, TestCaseStatus } from "@/types/project"
import { PlayCircle, Save, Pause, RotateCcw, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import FormattedText from "./FormattedText"

interface SingleTestRunDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    plan: TestPlan | null
    testCase: TestCase | null
}

export default function SingleTestRunDialog({ open, onOpenChange, plan, testCase }: SingleTestRunDialogProps) {
    const { activeProjectId, addTestExecution } = useProjectStore()
    const [status, setStatus] = useState<TestCaseStatus>('passed')
    const [actualResult, setActualResult] = useState("")
    const [notes, setNotes] = useState("")
    
    // Timer state
    const [seconds, setSeconds] = useState(0)
    const [isActive, setIsActive] = useState(false)
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        if (open) {
            setStatus('passed')
            setActualResult("")
            setNotes("")
            setSeconds(0)
            setIsActive(true) // Start timer immediately
        } else {
            setIsActive(false)
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [open])

    useEffect(() => {
        if (isActive) {
            timerRef.current = setInterval(() => {
                setSeconds(s => s + 1)
            }, 1000)
        } else {
            if (timerRef.current) clearInterval(timerRef.current)
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [isActive])

    const formatTime = (totalSeconds: number) => {
        const mins = Math.floor(totalSeconds / 60)
        const secs = totalSeconds % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    const handleRecord = async () => {
        if (!activeProjectId || !plan || !testCase) return

        await addTestExecution(activeProjectId, {
            testCaseId: testCase.id,
            testPlanId: plan.id,
            result: status,
            actualResult,
            notes,
            snapshotTestCaseTitle: testCase.title,
            durationSeconds: seconds
        })

        onOpenChange(false)
    }

    if (!testCase || !plan) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto p-0 border-none shadow-2xl">
                <div className="h-2 bg-indigo-500 w-full" />
                <div className="p-8">
                    <DialogHeader className="mb-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-indigo-500 mb-2">
                                <div className="p-2 bg-indigo-500/10 rounded-lg">
                                    <PlayCircle className="h-6 w-6" />
                                </div>
                                <DialogTitle className="text-2xl font-black tracking-tight">
                                    Execute {testCase.displayId}
                                </DialogTitle>
                            </div>
                            
                            {/* Timer Badge */}
                            <div className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono text-sm font-bold transition-all",
                                isActive ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-500 animate-pulse" : "bg-zinc-500/10 border-zinc-500/30 text-zinc-500"
                            )}>
                                <Clock className="h-4 w-4" />
                                {formatTime(seconds)}
                            </div>
                        </div>
                        <DialogDescription>
                            Performing manual execution for <span className="font-bold text-foreground">{testCase.title}</span> in <span className="font-bold text-foreground">{plan.name}</span>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-8 py-4">
                        {/* Left Side: Test Definition */}
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Pre-Conditions</Label>
                                <div className="text-xs p-3 bg-zinc-500/5 rounded-lg border border-zinc-500/10 min-h-[60px]">
                                    <FormattedText content={testCase.preConditions || "N/A"} compact projectId={activeProjectId || undefined} />
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Test Steps</Label>
                                <div className="text-xs p-3 bg-zinc-500/5 rounded-lg border border-zinc-500/10 min-h-[100px] font-mono leading-relaxed">
                                    <FormattedText content={testCase.steps} compact projectId={activeProjectId || undefined} />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Expected Result</Label>
                                <div className="text-xs p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/10 text-emerald-600 dark:text-emerald-400 min-h-[60px]">
                                    <FormattedText content={testCase.expectedResult} compact projectId={activeProjectId || undefined} />
                                </div>
                            </div>
                        </div>

                        {/* Right Side: Execution Recording */}
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Outcome</Label>
                                <Select value={status} onValueChange={(val: TestCaseStatus) => setStatus(val)}>
                                    <SelectTrigger className="h-11 bg-background font-bold">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="passed">
                                            <span className="text-emerald-500 font-bold">PASSED</span>
                                        </SelectItem>
                                        <SelectItem value="failed">
                                            <span className="text-rose-500 font-bold">FAILED</span>
                                        </SelectItem>
                                        <SelectItem value="blocked">
                                            <span className="text-amber-500 font-bold">BLOCKED</span>
                                        </SelectItem>
                                        <SelectItem value="skipped">
                                            <span className="text-zinc-500 font-bold">SKIPPED</span>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Actual Result</Label>
                                <Textarea
                                    placeholder="What actually happened? Leave empty if it matches expected."
                                    value={actualResult}
                                    onChange={(e) => setActualResult(e.target.value)}
                                    className="h-24 resize-none bg-background text-sm"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Execution Notes / Evidence</Label>
                                <Textarea
                                    placeholder="Add any additional notes, logs, or comments..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="h-24 resize-none bg-background text-sm italic"
                                />
                            </div>
                            
                            {/* Timer Controls */}
                            <div className="flex items-center gap-2 pt-2">
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm" 
                                    className="flex-1 gap-2 font-bold text-[10px]"
                                    onClick={() => setIsActive(!isActive)}
                                >
                                    {isActive ? <Pause className="h-3 w-3" /> : <PlayCircle className="h-3 w-3" />}
                                    {isActive ? "PAUSE TIMER" : "RESUME TIMER"}
                                </Button>
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm" 
                                    className="gap-2 font-bold text-[10px] text-zinc-500"
                                    onClick={() => { setSeconds(0); setIsActive(false); }}
                                >
                                    <RotateCcw className="h-3 w-3" /> RESET
                                </Button>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="mt-8 pt-6 border-t border-border/50 gap-2">
                        <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bold">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleRecord}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-8 shadow-lg shadow-indigo-600/20"
                        >
                            <Save className="h-4 w-4 mr-2" /> Save Execution Result
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
