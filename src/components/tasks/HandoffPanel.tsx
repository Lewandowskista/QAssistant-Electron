import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Project, Task, HandoffPacket } from '@/types/project'
import { useProjectStore } from '@/store/useProjectStore'
import { useUserStore } from '@/store/useUserStore'
import { HandoffPacketDialog } from './HandoffPacketDialog'
import { getHandoffMissingFields, getTaskWorkflowSummary } from '@/lib/collaboration'
import { MentionTextarea } from '@/components/sync/MentionTextarea'
import { cn } from '@/lib/utils'

interface HandoffPanelProps {
    activeProject: Project
    task: Task
}

export function HandoffPanel({ activeProject, task }: HandoffPanelProps) {
    const {
        createHandoffPacket,
        updateHandoffPacket,
        setTaskCollabState,
        acknowledgeHandoff,
        addCollaborationEvent,
        getTaskTraceability,
        linkArtifact
    } = useProjectStore()
    const role = useUserStore((state) => state.profile?.activeRole ?? 'qa')
    const [dialogOpen, setDialogOpen] = useState(false)
    const [devResponse, setDevResponse] = useState('')
    const [qaNotes, setQaNotes] = useState('')

    const traceability = useMemo(() => getTaskTraceability(activeProject.id, task.id), [activeProject.id, task.id, getTaskTraceability])
    const activeHandoff = traceability.activeHandoff || traceability.handoffs[0]

    const hasEvidence = !!activeHandoff && (
        activeHandoff.linkedExecutionRefs.length > 0 ||
        activeHandoff.linkedFileIds.length > 0 ||
        activeHandoff.linkedNoteIds.length > 0
    )
    const missingFields = getHandoffMissingFields(activeHandoff)
    const workflowSummary = useMemo(() => getTaskWorkflowSummary(activeProject, task), [activeProject, task])

    const savePacket = async (payload: {
        type: HandoffPacket['type']
        summary: string
        reproSteps: string
        expectedResult: string
        actualResult: string
        severity?: Task['severity']
        branchName?: string
        releaseVersion?: string
        environmentId?: string
        environmentName?: string
        linkedTestCaseIds: string[]
        linkedNoteIds: string[]
        linkedFileIds: string[]
    }) => {
        let handoffId = activeHandoff?.id
        if (!handoffId) {
            handoffId = await createHandoffPacket(activeProject.id, task.id, {
                type: payload.type,
                createdByRole: role,
                summary: payload.summary,
                reproSteps: payload.reproSteps,
                expectedResult: payload.expectedResult,
                actualResult: payload.actualResult,
                severity: payload.severity,
                branchName: payload.branchName,
                releaseVersion: payload.releaseVersion,
                environmentId: payload.environmentId,
                environmentName: payload.environmentName,
                linkedTestCaseIds: payload.linkedTestCaseIds,
                linkedNoteIds: payload.linkedNoteIds,
                linkedFileIds: payload.linkedFileIds
            })
        } else {
            await updateHandoffPacket(activeProject.id, handoffId, payload)
        }

        for (const noteId of payload.linkedNoteIds) {
            await linkArtifact(activeProject.id, { sourceType: 'task', sourceId: task.id, targetType: 'note', targetId: noteId, label: 'documents' })
            await linkArtifact(activeProject.id, { sourceType: 'handoff', sourceId: handoffId, targetType: 'note', targetId: noteId, label: 'evidence' })
        }
        for (const fileId of payload.linkedFileIds) {
            await linkArtifact(activeProject.id, { sourceType: 'task', sourceId: task.id, targetType: 'file', targetId: fileId, label: 'documents' })
            await linkArtifact(activeProject.id, { sourceType: 'handoff', sourceId: handoffId, targetType: 'file', targetId: fileId, label: 'evidence' })
        }
        for (const testCaseId of payload.linkedTestCaseIds) {
            await linkArtifact(activeProject.id, { sourceType: 'task', sourceId: task.id, targetType: 'test_case', targetId: testCaseId, label: 'verifies' })
        }
        toast.success('Handoff packet saved.')
    }

    const handleSendToDeveloper = async () => {
        if (!activeHandoff) {
            toast.error('Create a handoff packet first.')
            return
        }
        if (missingFields.length > 0) {
            toast.error(`Complete the handoff before sending: ${missingFields.join(', ')}`)
            return
        }
        await setTaskCollabState(activeProject.id, task.id, 'ready_for_dev')
        await addCollaborationEvent(activeProject.id, {
            taskId: task.id,
            handoffId: activeHandoff.id,
            eventType: 'handoff_sent',
            actorRole: role,
            title: 'Sent to developer',
            details: activeHandoff.summary
        })
        toast.success('Handoff sent to developer.')
    }

    const handleAcknowledge = async () => {
        if (!activeHandoff) return
        await acknowledgeHandoff(activeProject.id, activeHandoff.id, 'dev')
        toast.success('Handoff acknowledged.')
    }

    const handleStartFix = async () => {
        if (!activeHandoff) return
        await setTaskCollabState(activeProject.id, task.id, 'in_fix')
        await addCollaborationEvent(activeProject.id, {
            taskId: task.id,
            handoffId: activeHandoff.id,
            eventType: 'fix_started',
            actorRole: 'dev',
            title: 'Developer started fix'
        })
    }

    const handleReturnToQa = async () => {
        if (!activeHandoff) return
        if (!devResponse.trim() && !activeHandoff.linkedPrs.length && !activeHandoff.resolutionSummary?.trim()) {
            toast.error('Add a developer response, resolution summary, or linked PR before returning to QA.')
            return
        }
        await updateHandoffPacket(activeProject.id, activeHandoff.id, {
            developerResponse: devResponse || activeHandoff.developerResponse,
            resolutionSummary: devResponse || activeHandoff.resolutionSummary
        })
        await setTaskCollabState(activeProject.id, task.id, 'ready_for_qa')
        await addCollaborationEvent(activeProject.id, {
            taskId: task.id,
            handoffId: activeHandoff.id,
            eventType: 'ready_for_qa',
            actorRole: 'dev',
            title: 'Returned to QA',
            details: devResponse || undefined
        })
        toast.success('Task marked ready for QA.')
    }

    const handleStartRetest = async () => {
        if (!activeHandoff) return
        await setTaskCollabState(activeProject.id, task.id, 'qa_retesting')
        await addCollaborationEvent(activeProject.id, {
            taskId: task.id,
            handoffId: activeHandoff.id,
            eventType: 'retest_started',
            actorRole: 'qa',
            title: 'QA started retest'
        })
    }

    const handleVerify = async (passed: boolean) => {
        if (!activeHandoff) return
        if (!qaNotes.trim()) {
            toast.error('Verification notes are required.')
            return
        }
        await updateHandoffPacket(activeProject.id, activeHandoff.id, {
            qaVerificationNotes: qaNotes,
            completedAt: passed ? Date.now() : undefined
        })
        await setTaskCollabState(activeProject.id, task.id, passed ? 'verified' : 'ready_for_dev')
        await addCollaborationEvent(activeProject.id, {
            taskId: task.id,
            handoffId: activeHandoff.id,
            eventType: passed ? 'verification_passed' : 'verification_failed',
            actorRole: 'qa',
            title: passed ? 'QA verified fix' : 'QA rejected fix',
            details: qaNotes
        })
        toast.success(passed ? 'Fix verified.' : 'Returned to developer.')
    }

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-ui bg-panel-muted p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-ui font-bold">Collaboration State</p>
                        <div className="text-sm font-semibold text-foreground">{workflowSummary.stateLabel}</div>
                    </div>
                    <Button variant="outline" className="border-qa-accent/20 text-brand" onClick={() => setDialogOpen(true)}>
                        {activeHandoff ? 'Edit Handoff' : 'Create Handoff'}
                    </Button>
                </div>
                <div className={cn(
                    "rounded-xl border p-3",
                    workflowSummary.attentionLevel === 'danger' && "border-state-danger-border bg-state-danger-soft",
                    workflowSummary.attentionLevel === 'warning' && "border-state-warning-border bg-state-warning-soft",
                    workflowSummary.attentionLevel === 'info' && "border-state-info-border bg-state-info-soft",
                    workflowSummary.attentionLevel === 'success' && "border-state-success-border bg-state-success-soft",
                )}>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-ui font-bold">Next Recommended Action</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{workflowSummary.nextAction}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-soft">
                        <span>Owner: <span className="text-foreground">{workflowSummary.ownerLabel}</span></span>
                        <span>Verification: <span className="text-foreground">{workflowSummary.verificationLabel}</span></span>
                        <span>Linked tests: <span className="text-foreground">{workflowSummary.linkedTestCount}</span></span>
                        <span>Evidence: <span className="text-foreground">{workflowSummary.evidenceCount}</span></span>
                        <span>PRs: <span className="text-foreground">{workflowSummary.linkedPrCount}</span></span>
                    </div>
                    {workflowSummary.warnings.length > 0 && (
                        <div className="mt-3 space-y-1">
                            {workflowSummary.warnings.map((warning) => (
                                <p key={warning} className="text-xs text-state-danger">
                                    {warning}
                                </p>
                            ))}
                        </div>
                    )}
                </div>
                {activeHandoff ? (
                    <div className="space-y-2 text-xs text-soft">
                        <div><span className="text-foreground font-semibold">Summary:</span> {activeHandoff.summary || 'Missing'}</div>
                        <div><span className="text-foreground font-semibold">Environment:</span> {activeHandoff.environmentName || 'Missing'}</div>
                        <div><span className="text-foreground font-semibold">Severity:</span> {activeHandoff.severity || 'Missing'}</div>
                        <div><span className="text-foreground font-semibold">Evidence:</span> {hasEvidence ? 'Attached' : 'Missing'}</div>
                        {activeHandoff.branchName && (
                            <div><span className="text-foreground font-semibold">Branch:</span> {activeHandoff.branchName}</div>
                        )}
                        {activeHandoff.releaseVersion && (
                            <div><span className="text-foreground font-semibold">Release:</span> {activeHandoff.releaseVersion}</div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {missingFields.length === 0 ? (
                                <span className="px-2 py-1 rounded-md bg-state-success-soft border border-state-success-border text-[10px] text-state-success font-bold">SEND-READY</span>
                            ) : missingFields.map((field) => (
                                <span key={field} className="px-2 py-1 rounded-md bg-state-danger-soft border border-state-danger-border text-[10px] text-state-danger font-bold">
                                    Missing {field}
                                </span>
                            ))}
                        </div>
                        {activeHandoff.linkedPrs.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {activeHandoff.linkedPrs.map((pr) => (
                                    <span key={`${pr.repoFullName}#${pr.prNumber}`} className="px-2 py-1 rounded-md bg-app border border-ui text-[10px] text-state-info">
                                        {pr.repoFullName}#{pr.prNumber}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-xs text-muted-ui">No handoff packet yet.</p>
                )}
            </div>

            {role === 'qa' && (
                <div className="space-y-3">
                    <Button className="w-full bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground" onClick={handleSendToDeveloper}>
                        Send to Developer
                    </Button>
                    <Button variant="outline" className="w-full border-ui text-foreground" onClick={handleStartRetest} disabled={(task.collabState || 'draft') !== 'ready_for_qa'}>
                        Start Retest
                    </Button>
                    <MentionTextarea value={qaNotes} onChange={setQaNotes} placeholder="QA verification notes… (@ to mention)" rows={3} />
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="border-state-success-border text-state-success" onClick={() => handleVerify(true)}>Verify Fix</Button>
                        <Button variant="outline" className="border-state-danger-border text-state-danger" onClick={() => handleVerify(false)}>Fail Verification</Button>
                    </div>
                </div>
            )}

            {role === 'dev' && activeHandoff && (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="border-state-warning-border text-state-warning" onClick={handleAcknowledge}>Acknowledge</Button>
                        <Button variant="outline" className="border-state-info-border text-state-info" onClick={handleStartFix}>Start Fix</Button>
                    </div>
                    <MentionTextarea value={devResponse} onChange={setDevResponse} placeholder="Developer response or resolution summary… (@ to mention)" rows={3} />
                    <Button className="w-full bg-state-success hover:bg-state-success text-primary-foreground" onClick={handleReturnToQa}>
                        Return to QA
                    </Button>
                </div>
            )}

            <HandoffPacketDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                activeProject={activeProject}
                task={task}
                handoff={activeHandoff}
                onSave={savePacket}
            />
        </div>
    )
}
