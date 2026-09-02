import { useState } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { TestCaseExecution } from "@/types/project"
import { Trash2, Bug, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import FormattedText from "./FormattedText"
import { BugReportDialog } from "./BugReportDialog"

interface TestCaseExecutionCardProps {
    planName: string
    caseExecution: TestCaseExecution
    activeProjectId: string
    sessionId: string
    planExecutionId: string
}

export default function TestCaseExecutionCard({ planName, caseExecution, activeProjectId, sessionId, planExecutionId }: TestCaseExecutionCardProps) {
    const { deleteTestCaseExecution, createTaskFromFailedExecution, projects } = useProjectStore()
    const [bugDialogOpen, setBugDialogOpen] = useState(false)
    const [isCreatingHandoff, setIsCreatingHandoff] = useState(false)
    const activeProject = projects.find((project) => project.id === activeProjectId)
    const linkedHandoff = (activeProject?.handoffPackets || []).find((packet) =>
        packet.linkedExecutionRefs.some((ref) =>
            ref.sessionId === sessionId &&
            ref.planExecutionId === planExecutionId &&
            ref.caseExecutionId === caseExecution.id
        )
    )

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'passed': return 'bg-state-success-soft text-state-success'
            case 'failed': return 'bg-state-danger-soft text-state-danger'
            case 'blocked': return 'bg-state-warning-soft text-state-warning'
            case 'skipped': return 'bg-elevated text-soft'
            case 'not-run':
            default: return 'bg-elevated text-soft'
        }
    }

    return (
        <div className="bg-panel-muted border border-ui rounded-[10px] p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <span className="font-semibold text-[13px] text-foreground line-clamp-1 flex-1 ml-1">{caseExecution.snapshotTestCaseTitle}</span>
                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                    <div className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${getStatusColor(caseExecution.result)}`}>
                        {caseExecution.result || 'not-run'}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-ui hover:text-[hsl(var(--state-danger))] hover:bg-state-danger-soft ml-0.5"
                        onClick={() => deleteTestCaseExecution(activeProjectId, sessionId, planExecutionId, caseExecution.id)}
                        title="Delete test case execution"
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            <div className="font-mono text-[10px] text-muted-ui">
                {caseExecution.snapshotTestCaseTitle} {'->'} {planName}
            </div>
            {linkedHandoff && (
                <div className="flex items-center gap-2 text-[10px]">
                    <span className="px-2 py-1 rounded-md bg-qa-accent/10 text-brand border border-qa-accent/20">Linked Handoff</span>
                    <span className="text-soft truncate">{linkedHandoff.summary}</span>
                </div>
            )}

            <div className="h-[1px] bg-elevated w-full my-1" />

            <div className="flex flex-col gap-4 mt-1">
                {caseExecution.snapshotPreConditions && (
                    <div>
                        <div className="text-[10px] font-bold text-muted-ui uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-state-info/50" /> PRE-CONDITIONS
                        </div>
                        <div className="text-[11px] leading-relaxed text-soft bg-surface/30 p-2.5 rounded-lg border border-line/30">
                            <FormattedText content={caseExecution.snapshotPreConditions} compact projectId={activeProjectId} />
                        </div>
                    </div>
                )}

                {caseExecution.snapshotSteps && (
                    <div>
                        <div className="text-[10px] font-bold text-muted-ui uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-state-success/50" /> TEST STEPS
                        </div>
                        <div className="text-[11px] leading-relaxed text-soft bg-surface/30 p-2.5 rounded-lg border border-line/30">
                            <FormattedText content={caseExecution.snapshotSteps} compact projectId={activeProjectId} />
                        </div>
                    </div>
                )}

                {caseExecution.snapshotExpectedResult && (
                    <div>
                        <div className="text-[10px] font-bold text-muted-ui uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-qa-accent/50" /> EXPECTED RESULT
                        </div>
                        <div className="text-[11px] leading-relaxed text-soft bg-surface/30 p-2.5 rounded-lg border border-line/30">
                            <FormattedText content={caseExecution.snapshotExpectedResult} compact projectId={activeProjectId} />
                        </div>
                    </div>
                )}
            </div>

            <div className="h-[1px] bg-elevated w-full my-1" />

            <div className="flex flex-col gap-3">
                {caseExecution.actualResult && (
                    <div>
                        <div className="text-[10px] font-bold text-state-success uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <div className="w-1 h-3 rounded-full bg-state-success" /> ACTUAL RESULT
                        </div>
                        <div className="text-[11px] text-foreground bg-panel p-3 rounded-lg border border-state-success-border leading-relaxed">
                            <FormattedText content={caseExecution.actualResult} compact projectId={activeProjectId} />
                        </div>
                    </div>
                )}
                {caseExecution.notes && (
                    <div>
                        <div className="text-[10px] font-bold text-brand uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <div className="w-1 h-3 rounded-full bg-primary" /> EXECUTION NOTES
                        </div>
                        <div className="text-[11px] text-foreground bg-panel p-3 rounded-lg border border-qa-accent/20 italic opacity-90">
                            <FormattedText content={caseExecution.notes} compact projectId={activeProjectId} />
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-1 flex items-center justify-between gap-2">
                <div className="bg-panel-muted px-2 py-0.5 rounded text-[10px] font-bold text-brand uppercase tracking-wider border border-line/50">
                    Execution
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 bg-panel-muted text-brand border-ui hover:bg-elevated font-bold text-[11px] gap-1.5 px-3"
                        onClick={async () => {
                            setIsCreatingHandoff(true)
                            try {
                                await createTaskFromFailedExecution(activeProjectId, {
                                    sessionId,
                                    planExecutionId,
                                    caseExecutionId: caseExecution.id,
                                    testCaseId: caseExecution.testCaseId,
                                    title: caseExecution.snapshotTestCaseTitle,
                                    actualResult: caseExecution.actualResult,
                                    expectedResult: caseExecution.snapshotExpectedResult,
                                    steps: caseExecution.snapshotSteps,
                                }, {
                                    title: `[BUG] ${caseExecution.snapshotTestCaseTitle}`,
                                    description: `Expected: ${caseExecution.snapshotExpectedResult || 'N/A'}\n\nActual: ${caseExecution.actualResult || 'N/A'}\n\nSteps: ${caseExecution.snapshotSteps || 'N/A'}`,
                                    priority: 'high',
                                    severity: 'major'
                                })
                            } finally {
                                setIsCreatingHandoff(false)
                            }
                        }}
                        disabled={(caseExecution.result !== 'failed' && caseExecution.result !== 'blocked') || isCreatingHandoff}
                    >
                        <Link2 className="h-3 w-3" /> {isCreatingHandoff ? 'Creating…' : 'Defect Handoff'}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 bg-state-success-soft text-state-success border-state-success-border hover:bg-state-success-soft hover:text-state-success font-bold text-[11px] gap-1.5 px-3"
                        onClick={() => setBugDialogOpen(true)}
                        disabled={caseExecution.result !== 'failed'}
                        title={caseExecution.result === 'failed' ? 'Create bug report from this failure' : 'Only available for failed tests'}
                    >
                        <Bug className="h-3 w-3" /> Bug Report
                    </Button>
                </div>
            </div>

            <BugReportDialog
                open={bugDialogOpen}
                onOpenChange={setBugDialogOpen}
                prefillData={{
                    title: `Failed: ${caseExecution.snapshotTestCaseTitle}`,
                    description: `**Expected:** ${caseExecution.snapshotExpectedResult || 'N/A'}\n\n**Actual:** ${caseExecution.actualResult || 'N/A'}\n\n**Steps:** ${caseExecution.snapshotSteps || 'N/A'}`,
                    testCaseId: caseExecution.testCaseId,
                    linkedTestCaseTitle: caseExecution.snapshotTestCaseTitle,
                    expectedResult: caseExecution.snapshotExpectedResult,
                    actualResult: caseExecution.actualResult
                }}
            />
        </div>
    )
}
