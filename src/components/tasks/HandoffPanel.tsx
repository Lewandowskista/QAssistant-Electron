import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Project, Task, HandoffPacket, CollabState } from '@/types/project'
import { useProjectStore } from '@/store/useProjectStore'
import { useUserStore } from '@/store/useUserStore'
import { HandoffPacketDialog } from './HandoffPacketDialog'
import { getHandoffMissingFields } from '@/lib/collaboration'
import { MentionTextarea } from '@/components/sync/MentionTextarea'

interface HandoffPanelProps {
    activeProject: Project
    task: Task
}

const collabStateLabel: Record<CollabState, string> = {
    draft: 'Draft',
    ready_for_dev: 'Ready for Dev',
    dev_acknowledged: 'Dev Acknowledged',
    in_fix: 'In Fix',
    ready_for_qa: 'Ready for QA',
    qa_retesting: 'QA Retesting',
    verified: 'Verified',
    closed: 'Closed'
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
            <div className="rounded-xl border border-[#2A2A3A] bg-[#1A1A24] p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[#6B7280] font-bold">Collaboration State</p>
                        <div className="text-sm font-semibold text-[#E2E8F0]">{collabStateLabel[task.collabState || 'draft']}</div>
                    </div>
                    <Button variant="outline" className="border-[#A78BFA]/20 text-[#A78BFA]" onClick={() => setDialogOpen(true)}>
                        {activeHandoff ? 'Edit Handoff' : 'Create Handoff'}
                    </Button>
                </div>
                {activeHandoff ? (
                    <div className="space-y-2 text-xs text-[#9CA3AF]">
                        <div><span className="text-[#E2E8F0] font-semibold">Summary:</span> {activeHandoff.summary || 'Missing'}</div>
                        <div><span className="text-[#E2E8F0] font-semibold">Environment:</span> {activeHandoff.environmentName || 'Missing'}</div>
                        <div><span className="text-[#E2E8F0] font-semibold">Severity:</span> {activeHandoff.severity || 'Missing'}</div>
                        <div><span className="text-[#E2E8F0] font-semibold">Evidence:</span> {hasEvidence ? 'Attached' : 'Missing'}</div>
                        {activeHandoff.branchName && (
                            <div><span className="text-[#E2E8F0] font-semibold">Branch:</span> {activeHandoff.branchName}</div>
                        )}
                        {activeHandoff.releaseVersion && (
                            <div><span className="text-[#E2E8F0] font-semibold">Release:</span> {activeHandoff.releaseVersion}</div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {missingFields.length === 0 ? (
                                <span className="px-2 py-1 rounded-md bg-[#10B981]/10 border border-[#10B981]/20 text-[10px] text-[#10B981] font-bold">SEND-READY</span>
                            ) : missingFields.map((field) => (
                                <span key={field} className="px-2 py-1 rounded-md bg-[#EF4444]/10 border border-[#EF4444]/20 text-[10px] text-[#EF4444] font-bold">
                                    Missing {field}
                                </span>
                            ))}
                        </div>
                        {activeHandoff.linkedPrs.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {activeHandoff.linkedPrs.map((pr) => (
                                    <span key={`${pr.repoFullName}#${pr.prNumber}`} className="px-2 py-1 rounded-md bg-[#0F0F13] border border-[#2A2A3A] text-[10px] text-[#38BDF8]">
                                        {pr.repoFullName}#{pr.prNumber}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-xs text-[#6B7280]">No handoff packet yet.</p>
                )}
            </div>

            {role === 'qa' && (
                <div className="space-y-3">
                    <Button className="w-full bg-[#A78BFA] hover:bg-[#C4B5FD] text-[#0F0F13]" onClick={handleSendToDeveloper}>
                        Send to Developer
                    </Button>
                    <Button variant="outline" className="w-full border-[#2A2A3A] text-[#E2E8F0]" onClick={handleStartRetest} disabled={(task.collabState || 'draft') !== 'ready_for_qa'}>
                        Start Retest
                    </Button>
                    <MentionTextarea value={qaNotes} onChange={setQaNotes} placeholder="QA verification notes... (@ to mention)" rows={3} />
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="border-[#10B981]/20 text-[#10B981]" onClick={() => handleVerify(true)}>Verify Fix</Button>
                        <Button variant="outline" className="border-[#EF4444]/20 text-[#EF4444]" onClick={() => handleVerify(false)}>Fail Verification</Button>
                    </div>
                </div>
            )}

            {role === 'dev' && activeHandoff && (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="border-[#F59E0B]/20 text-[#F59E0B]" onClick={handleAcknowledge}>Acknowledge</Button>
                        <Button variant="outline" className="border-[#38BDF8]/20 text-[#38BDF8]" onClick={handleStartFix}>Start Fix</Button>
                    </div>
                    <MentionTextarea value={devResponse} onChange={setDevResponse} placeholder="Developer response or resolution summary... (@ to mention)" rows={3} />
                    <Button className="w-full bg-[#10B981] hover:bg-[#34D399] text-[#0F0F13]" onClick={handleReturnToQa}>
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
