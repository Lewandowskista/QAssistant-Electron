import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useProjectStore, TestPlan, TestCaseStatus } from "@/store/useProjectStore"
import { PlayCircle, Save } from "lucide-react"

interface TestRunDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    activePlan: TestPlan | null
}

export default function TestRunDialog({ open, onOpenChange, activePlan }: TestRunDialogProps) {
    const { activeProjectId, addTestRunSession } = useProjectStore()
    const [status, setStatus] = useState<TestCaseStatus>('passed')
    const [notes, setNotes] = useState("")

    const cases = activePlan?.testCases || []

    useEffect(() => {
        if (open) {
            setStatus('passed')
            setNotes("")
        }
    }, [open])

    const handleBatchRecord = async () => {
        if (!activeProjectId || !activePlan || cases.length === 0) return

        await addTestRunSession(activeProjectId, {
            planExecutions: [{
                id: crypto.randomUUID(),
                testPlanId: activePlan.id,
                snapshotTestPlanName: activePlan.name,
                caseExecutions: cases.map(tc => ({
                    id: crypto.randomUUID(),
                    testCaseId: tc.id,
                    result: status,
                    actualResult: "Batch Execution",
                    notes: notes,
                    snapshotTestCaseTitle: tc.title,
                    snapshotPreConditions: tc.preConditions,
                    snapshotSteps: tc.steps,
                    snapshotTestData: tc.testData,
                    snapshotExpectedResult: tc.expectedResult,
                    snapshotPriority: tc.priority
                }))
            }]
        })

        onOpenChange(false)
    }

    if (!activePlan) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <PlayCircle className="h-5 w-5 text-[#A78BFA]" />
                        Batch Execute Plan
                    </DialogTitle>
                    <DialogDescription>
                        Set the execution result for all {cases.length} test cases in {activePlan.name}.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Global Result</Label>
                        <Select value={status} onValueChange={(val: TestCaseStatus) => setStatus(val)}>
                            <SelectTrigger className="bg-background">
                                <SelectValue placeholder="Select outcome" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="passed">
                                    <span className="text-green-400 font-bold">Passed</span>
                                </SelectItem>
                                <SelectItem value="failed">
                                    <span className="text-red-400 font-bold">Failed</span>
                                </SelectItem>
                                <SelectItem value="blocked">
                                    <span className="text-amber-400 font-bold">Blocked</span>
                                </SelectItem>
                                <SelectItem value="skipped">
                                    <span className="text-zinc-400 font-bold">Skipped</span>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Execution Comment</Label>
                        <Textarea
                            placeholder="Enter notes to persist on all executions..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="h-32 resize-none bg-background"
                        />
                    </div>
                </div>

                <DialogFooter className="bg-[#13131A] border-t border-[#2A2A3A] -mx-6 -mb-6 px-6 py-4">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        onClick={handleBatchRecord}
                        className="bg-[#A78BFA] hover:bg-[#9271e0] text-[#0F0F13] gap-2 font-bold"
                        disabled={cases.length === 0}
                    >
                        <Save className="h-4 w-4" /> Save {cases.length} Executions
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
