import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useProjectStore, TestPlan, TestCaseStatus } from "@/store/useProjectStore"
import {
    CheckCircle2,
    XCircle,
    MinusCircle,
    ArrowRightCircle,
    Info,
    ArrowLeft,
    ArrowRight,
    PlayCircle,
    RotateCcw
} from "lucide-react"

interface TestRunDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    activePlan: TestPlan | null
}

export default function TestRunDialog({ open, onOpenChange, activePlan }: TestRunDialogProps) {
    const { activeProjectId, addTestExecution } = useProjectStore()
    const [currentIndex, setCurrentIndex] = useState(0)
    const [actualResult, setActualResult] = useState("")
    const [notes, setNotes] = useState("")

    const cases = activePlan?.testCases || []
    const currentCase = cases[currentIndex]

    useEffect(() => {
        if (open) {
            setCurrentIndex(0)
            setActualResult("")
            setNotes("")
        }
    }, [open])

    useEffect(() => {
        if (currentCase) {
            setActualResult(currentCase.actualResult || "")
            setNotes("")
        }
    }, [currentIndex, currentCase])

    const handleRecordResult = async (status: TestCaseStatus) => {
        if (!activeProjectId || !activePlan || !currentCase) return

        await addTestExecution(activeProjectId, {
            testCaseId: currentCase.id,
            testPlanId: activePlan.id,
            result: status,
            actualResult: actualResult,
            notes: notes,
            snapshotTestCaseTitle: currentCase.title
        })

        if (currentIndex < cases.length - 1) {
            setCurrentIndex(currentIndex + 1)
        } else {
            alert("Test execution session complete!")
            onOpenChange(false)
        }
    }

    if (!currentCase) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[800px] h-[90vh] flex flex-col p-0 border-none shadow-2xl overflow-hidden">
                <div className="h-2 bg-indigo-500 w-full shrink-0" />

                <div className="p-8 flex-1 flex flex-col min-h-0 overflow-y-auto">
                    <DialogHeader className="mb-6 shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-indigo-500">
                                <div className="p-2 bg-indigo-500/10 rounded-lg">
                                    <PlayCircle className="h-6 w-6" />
                                </div>
                                <div>
                                    <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-2">
                                        Test Session: {activePlan?.name}
                                    </DialogTitle>
                                    <DialogDescription className="font-medium text-muted-foreground uppercase text-[10px] tracking-widest mt-1">
                                        Case {currentIndex + 1} of {cases.length} — {currentCase.displayId}
                                    </DialogDescription>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] font-bold text-muted-foreground">PROGRESS</span>
                                <div className="h-1.5 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-full mt-1 overflow-hidden">
                                    <div
                                        className="h-full bg-indigo-500 transition-all duration-500"
                                        style={{ width: `${((currentIndex + 1) / cases.length) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="space-y-8 flex-1">
                        <div className="p-6 bg-indigo-50/10 border border-indigo-500/10 rounded-2xl shadow-sm relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                                <Info className="h-24 w-24" />
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-indigo-900 dark:text-indigo-100">{currentCase.title}</h3>
                            {currentCase.preConditions && (
                                <div className="mt-4">
                                    <Label className="text-[10px] font-bold text-indigo-500/70 uppercase">Pre-conditions</Label>
                                    <p className="text-sm text-muted-foreground mt-1 bg-background/40 p-3 rounded-lg border border-indigo-500/5">{currentCase.preConditions}</p>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-8 h-full min-h-0">
                            <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
                                        <Info className="h-3.5 w-3.5" /> Scenario Telemetry
                                    </div>
                                    <div className="grid gap-4">
                                        <div>
                                            <Label className="text-[10px] font-black uppercase text-muted-foreground opacity-60">Execution Steps</Label>
                                            <div className="mt-1.5 p-4 bg-background/50 border rounded-xl font-mono text-sm leading-relaxed whitespace-pre-wrap">
                                                {currentCase.steps}
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] font-black uppercase text-muted-foreground opacity-60">Expected Result</Label>
                                            <div className="mt-1.5 p-4 bg-green-500/5 border border-green-500/20 rounded-xl text-green-700 dark:text-green-400 font-semibold text-sm">
                                                {currentCase.expectedResult}
                                            </div>
                                        </div>
                                        {currentCase.testData && (
                                            <div>
                                                <Label className="text-[10px] font-black uppercase text-muted-foreground opacity-60">Test Data</Label>
                                                <div className="mt-1.5 p-4 bg-muted/40 border rounded-xl font-mono text-xs italic">
                                                    {currentCase.testData}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6 flex flex-col">
                                <div className="space-y-4 flex-1 flex flex-col min-h-0">
                                    <div className="flex-1 shrink-0">
                                        <Label htmlFor="actual-result" className="text-[10px] font-black uppercase text-muted-foreground/60 mb-2 block">Actual Result Details</Label>
                                        <Textarea
                                            id="actual-result"
                                            value={actualResult}
                                            onChange={(e) => setActualResult(e.target.value)}
                                            placeholder="What happened? Compare against expected..."
                                            className="bg-background focus-visible:ring-indigo-500/20 h-[100px] resize-none"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <Label htmlFor="notes" className="text-[10px] font-black uppercase text-muted-foreground/60 mb-2 block">Internal Notes / Bugs</Label>
                                        <Textarea
                                            id="notes"
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            placeholder="Internal commentary, Jira links, or blockers..."
                                            className="bg-background focus-visible:ring-indigo-500/20 h-[100px] resize-none"
                                        />
                                    </div>

                                    <div className="bg-muted/30 p-4 rounded-2xl space-y-3 shrink-0">
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                variant="outline"
                                                className="bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-600 hover:text-white transition-all font-bold h-12 text-sm"
                                                onClick={() => handleRecordResult('passed')}
                                            >
                                                <CheckCircle2 className="mr-2 h-5 w-5" /> PASS CASE
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-600 hover:text-white transition-all font-bold h-12 text-sm"
                                                onClick={() => handleRecordResult('failed')}
                                            >
                                                <XCircle className="mr-2 h-5 w-5" /> FAIL CASE
                                            </Button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                variant="outline"
                                                className="bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-600 hover:text-white transition-all font-bold h-10 text-xs"
                                                onClick={() => handleRecordResult('blocked')}
                                            >
                                                <MinusCircle className="mr-2 h-4 w-4" /> BLOCK CASE
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="bg-zinc-500/10 text-zinc-600 border-zinc-500/20 hover:bg-zinc-600 hover:text-white transition-all font-bold h-10 text-xs"
                                                onClick={() => handleRecordResult('skipped')}
                                            >
                                                <ArrowRightCircle className="mr-2 h-4 w-4" /> SKIP / NEXT
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="p-6 bg-zinc-50 dark:bg-zinc-900 border-t border-border/50 shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={currentIndex === 0}
                            onClick={() => setCurrentIndex(currentIndex - 1)}
                            className="text-xs font-bold"
                        >
                            <ArrowLeft className="mr-2 h-3.5 w-3.5" /> PREVIOUS
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={currentIndex === cases.length - 1}
                            onClick={() => setCurrentIndex(currentIndex + 1)}
                            className="text-xs font-bold"
                        >
                            NEXT <ArrowRight className="ml-2 h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs font-bold opacity-60">ABANDON SESSION</Button>
                        <Button variant="outline" size="sm" onClick={() => setCurrentIndex(0)} className="text-xs font-bold"><RotateCcw className="mr-2 h-3 w-3" /> RESET</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
