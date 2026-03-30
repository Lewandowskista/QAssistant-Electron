import type {
    HandoffPacket,
    Project,
    Task,
    TestCase,
    TestCaseExecution,
    TestExecution,
    TestPlanExecution,
    TestRunSession,
} from '../types/project'
import { isTaskReadyForQa } from './tasks'

export const PROJECT_SCHEMA_VERSION = 2

export type HandoffMissingField =
    | 'summary'
    | 'reproSteps'
    | 'expectedResult'
    | 'actualResult'
    | 'environment'
    | 'severity'
    | 'evidence'

export type ReleaseQueueItem = {
    task: Task
    handoff?: HandoffPacket
    missingFields: HandoffMissingField[]
}

export type CollaborationMetrics = {
    avgDevAcknowledgementHours: number | null
    avgReadyForQaToVerificationHours: number | null
    reopenRate: number
}

export type WorkflowAttentionLevel = 'info' | 'warning' | 'danger' | 'success'

export type TaskWorkflowSummary = {
    stateLabel: string
    nextAction: string
    ownerLabel: string
    verificationLabel: string
    warnings: string[]
    attentionLevel: WorkflowAttentionLevel
    linkedTestCount: number
    evidenceCount: number
    linkedPrCount: number
    hasCompleteHandoff: boolean
}

export type WorkflowHealthItem = {
    taskId: string
    title: string
    detail: string
}

export type WorkflowHealthSummary = {
    counts: {
        waitingForDevAck: number
        readyForQaWithoutPr: number
        failedVerificationWithoutFollowUp: number
        incompleteActiveHandoffs: number
    }
    items: {
        waitingForDevAck: WorkflowHealthItem[]
        readyForQaWithoutPr: WorkflowHealthItem[]
        failedVerificationWithoutFollowUp: WorkflowHealthItem[]
        incompleteActiveHandoffs: WorkflowHealthItem[]
    }
}

export type SyncStatusSummary = {
    tone: WorkflowAttentionLevel
    headline: string
    detail: string
}

export function getHandoffMissingFields(handoff?: Partial<HandoffPacket> | null): HandoffMissingField[] {
    if (!handoff) {
        return ['summary', 'reproSteps', 'expectedResult', 'actualResult', 'environment', 'severity', 'evidence']
    }

    const missing: HandoffMissingField[] = []
    if (!handoff.summary?.trim()) missing.push('summary')
    if (!handoff.reproSteps?.trim()) missing.push('reproSteps')
    if (!handoff.expectedResult?.trim()) missing.push('expectedResult')
    if (!handoff.actualResult?.trim()) missing.push('actualResult')
    if (!handoff.environmentName?.trim() && !handoff.environmentId?.trim()) missing.push('environment')
    if (!handoff.severity?.trim()) missing.push('severity')

    const hasEvidence = !!(
        handoff.linkedExecutionRefs?.length ||
        handoff.linkedFileIds?.length ||
        handoff.linkedNoteIds?.length
    )
    if (!hasEvidence) missing.push('evidence')

    return missing
}

export function enrichHandoffCompleteness<T extends Partial<HandoffPacket>>(handoff: T): T & { isComplete: boolean; missingFields: HandoffMissingField[] } {
    const missingFields = getHandoffMissingFields(handoff)
    return {
        ...handoff,
        isComplete: missingFields.length === 0,
        missingFields,
    }
}

export function formatCollaborationStateLabel(collabState?: string | null): string {
    if (!collabState) return 'Draft'
    return collabState
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

export function migrateLegacyExecutionsToSessions(project: Project): TestRunSession[] {
    const sessions = project.testRunSessions || []
    if (sessions.length > 0 || !project.testExecutions?.length) return sessions

    const groupedByPlan = new Map<string, TestExecution[]>()
    for (const execution of project.testExecutions) {
        const list = groupedByPlan.get(execution.testPlanId) || []
        list.push(execution)
        groupedByPlan.set(execution.testPlanId, list)
    }

    const planExecutions: TestPlanExecution[] = Array.from(groupedByPlan.entries()).map(([planId, executions]) => {
    const snapshotTestPlanName = project.testPlans.find((plan: Project['testPlans'][number]) => plan.id === planId)?.name || 'Legacy Imported Plan'
        const caseExecutions: TestCaseExecution[] = executions.map((execution) => ({
            id: execution.id,
            testCaseId: execution.testCaseId,
            result: execution.result,
            actualResult: execution.actualResult,
            notes: execution.notes,
            snapshotTestCaseTitle: execution.snapshotTestCaseTitle,
            snapshotPreConditions: execution.snapshotPreConditions,
            snapshotSteps: execution.snapshotSteps,
            snapshotTestData: execution.snapshotTestData,
            snapshotExpectedResult: execution.snapshotExpectedResult,
            snapshotPriority: execution.snapshotPriority,
            durationSeconds: execution.durationSeconds,
            blockedReason: execution.blockedReason,
            environmentId: execution.environmentId,
            environmentName: execution.environmentName,
            attachments: [],
        }))

        return {
            id: `legacy-plan-${planId}`,
            testPlanId: planId,
            snapshotTestPlanName,
            caseExecutions,
        }
    })

    const latestTimestamp = Math.max(...project.testExecutions.map((execution: TestExecution) => execution.executedAt))
    return [{
        id: 'legacy-import-session',
        timestamp: latestTimestamp,
        isArchived: true,
        environmentName: 'Legacy Import',
        planExecutions,
    }]
}

export function getLinkedTestsForTask(project: Project, task: Task): TestCase[] {
    return project.testPlans
        .flatMap((plan: Project['testPlans'][number]) => plan.testCases || [])
        .filter((testCase: TestCase) =>
            testCase.sourceIssueId === task.sourceIssueId ||
            testCase.linkedDefectIds?.includes(task.id) ||
            intersect(testCase.components, task.components)
        )
}

export function getReleaseQueue(project: Project) {
    const tasks = project.tasks || []
    const handoffs = project.handoffPackets || []
    const collaborationEvents = project.collaborationEvents || []

    const queue: ReleaseQueueItem[] = tasks.map((task: Task) => {
        const handoff = handoffs.find((item) => item.id === task.activeHandoffId) || handoffs.find((item) => item.taskId === task.id)
        const enriched = handoff ? enrichHandoffCompleteness(handoff) : undefined
        return {
            task,
            handoff: enriched,
            missingFields: enriched?.missingFields || ([] as HandoffMissingField[]),
        }
    })

    const tasksReadyForQa = queue.filter((item) => isTaskReadyForQa(item.task))
    const handoffsMissingEvidence = queue.filter((item) => item.handoff && item.missingFields.includes('evidence'))
    const prsLinkedButNotRetested = queue.filter((item) =>
        !!item.handoff?.linkedPrs.length &&
        item.task.collabState !== 'qa_retesting' &&
        item.task.collabState !== 'verified' &&
        item.task.collabState !== 'closed'
    )
    const failedVerificationsNeedingDev = collaborationEvents
        .filter((event) => event.eventType === 'verification_failed')
        .map((event) => queue.find((item) => item.task.id === event.taskId))
        .filter((item): item is ReleaseQueueItem => item !== undefined)

    return {
        tasksReadyForQa,
        handoffsMissingEvidence,
        prsLinkedButNotRetested,
        failedVerificationsNeedingDev,
    }
}

export function getTaskWorkflowSummary(project: Project, task: Task): TaskWorkflowSummary {
    const traceability = getTaskTraceabilitySummary(project, task)
    const activeHandoff = traceability.activeHandoff
    const linkedPrCount = activeHandoff?.linkedPrs?.length ?? 0
    const evidenceCount = (activeHandoff?.linkedExecutionRefs?.length ?? 0)
        + (activeHandoff?.linkedFileIds?.length ?? 0)
        + (activeHandoff?.linkedNoteIds?.length ?? 0)
    const warnings: string[] = []
    const stateLabel = formatCollaborationStateLabel(task.collabState)

    if (!activeHandoff) warnings.push('Create a handoff packet to move this through the QA/dev workflow.')
    if (activeHandoff && !traceability.hasCompleteHandoff) warnings.push(`Complete the handoff: missing ${traceability.missingFields.join(', ')}.`)
    if (activeHandoff && evidenceCount === 0) warnings.push('Attach execution evidence, files, or notes before sending.')
    if ((task.collabState === 'ready_for_qa' || task.collabState === 'qa_retesting') && linkedPrCount === 0) warnings.push('Link the fixing PR so QA can verify the exact change.')
    if (task.collabState === 'ready_for_dev' && !activeHandoff?.acknowledgedAt) warnings.push('Developer acknowledgement is still missing.')

    const verificationLabel = task.collabState === 'verified'
        ? 'Verified by QA'
        : task.collabState === 'qa_retesting'
            ? 'QA retest in progress'
            : task.collabState === 'ready_for_qa'
                ? 'Waiting for QA verification'
                : activeHandoff?.qaVerificationNotes?.trim()
                    ? 'Verification notes present'
                    : 'Verification not started'

    let nextAction = 'Continue collaboration'
    let ownerLabel = 'Shared'
    let attentionLevel: WorkflowAttentionLevel = 'info'

    switch (task.collabState ?? 'draft') {
        case 'draft':
            nextAction = activeHandoff ? 'Finish the handoff and send it to development.' : 'Create the first handoff packet.'
            ownerLabel = 'QA'
            attentionLevel = warnings.length > 0 ? 'warning' : 'info'
            break
        case 'ready_for_dev':
            nextAction = activeHandoff?.acknowledgedAt ? 'Developer can start the fix.' : 'Developer should acknowledge the handoff.'
            ownerLabel = 'Dev'
            attentionLevel = activeHandoff?.acknowledgedAt ? 'info' : 'warning'
            break
        case 'dev_acknowledged':
        case 'in_fix':
            nextAction = linkedPrCount > 0 ? 'Finish the fix and return it to QA.' : 'Link the PR or add a developer response before returning to QA.'
            ownerLabel = 'Dev'
            attentionLevel = linkedPrCount > 0 ? 'info' : 'warning'
            break
        case 'ready_for_qa':
            nextAction = linkedPrCount > 0 ? 'QA should start retest and record verification notes.' : 'Link the PR, then start QA retest.'
            ownerLabel = 'QA'
            attentionLevel = linkedPrCount > 0 ? 'info' : 'warning'
            break
        case 'qa_retesting':
            nextAction = 'QA should verify or reject the fix with notes.'
            ownerLabel = 'QA'
            attentionLevel = 'info'
            break
        case 'verified':
            nextAction = 'Close the workflow or keep it as verified for release tracking.'
            ownerLabel = 'Shared'
            attentionLevel = 'success'
            break
        case 'closed':
            nextAction = 'No action needed.'
            ownerLabel = 'Closed'
            attentionLevel = 'success'
            break
    }

    if (warnings.length > 1 && attentionLevel !== 'success') {
        attentionLevel = 'danger'
    }

    return {
        stateLabel,
        nextAction,
        ownerLabel,
        verificationLabel,
        warnings,
        attentionLevel,
        linkedTestCount: traceability.linkedTests.length,
        evidenceCount,
        linkedPrCount,
        hasCompleteHandoff: traceability.hasCompleteHandoff,
    }
}

export function getWorkflowHealthSummary(project: Project): WorkflowHealthSummary {
    const taskById = new Map((project.tasks || []).map((task) => [task.id, task]))
    const items = {
        waitingForDevAck: [] as WorkflowHealthItem[],
        readyForQaWithoutPr: [] as WorkflowHealthItem[],
        failedVerificationWithoutFollowUp: [] as WorkflowHealthItem[],
        incompleteActiveHandoffs: [] as WorkflowHealthItem[],
    }

    for (const task of project.tasks || []) {
        const traceability = getTaskTraceabilitySummary(project, task)
        const activeHandoff = traceability.activeHandoff
        if (task.collabState === 'ready_for_dev' && !activeHandoff?.acknowledgedAt) {
            items.waitingForDevAck.push({
                taskId: task.id,
                title: task.title,
                detail: 'Sent to development but not yet acknowledged.',
            })
        }
        if (isTaskReadyForQa(task) && (activeHandoff?.linkedPrs?.length ?? 0) === 0) {
            items.readyForQaWithoutPr.push({
                taskId: task.id,
                title: task.title,
                detail: 'Marked ready for QA without a linked PR.',
            })
        }
        if (activeHandoff && !traceability.hasCompleteHandoff) {
            items.incompleteActiveHandoffs.push({
                taskId: task.id,
                title: task.title,
                detail: `Missing ${traceability.missingFields.join(', ')}.`,
            })
        }
    }

    const failedVerificationByTask = new Map<string, number>()
    const followUpByTask = new Map<string, number>()
    for (const event of project.collaborationEvents || []) {
        if (event.eventType === 'verification_failed') failedVerificationByTask.set(event.taskId, event.timestamp)
        if (event.eventType === 'fix_started' || event.eventType === 'handoff_acknowledged' || event.eventType === 'ready_for_qa') {
            followUpByTask.set(event.taskId, Math.max(followUpByTask.get(event.taskId) ?? 0, event.timestamp))
        }
    }
    for (const [taskId, failedAt] of failedVerificationByTask.entries()) {
        const followUpAt = followUpByTask.get(taskId) ?? 0
        if (followUpAt >= failedAt) continue
        const task = taskById.get(taskId)
        if (!task) continue
        items.failedVerificationWithoutFollowUp.push({
            taskId,
            title: task.title,
            detail: 'Verification failed and no developer follow-up has been recorded yet.',
        })
    }

    return {
        counts: {
            waitingForDevAck: items.waitingForDevAck.length,
            readyForQaWithoutPr: items.readyForQaWithoutPr.length,
            failedVerificationWithoutFollowUp: items.failedVerificationWithoutFollowUp.length,
            incompleteActiveHandoffs: items.incompleteActiveHandoffs.length,
        },
        items,
    }
}

export function getSyncStatusSummary(input: {
    status: string
    pendingCount: number
    error?: string | null
    lastSyncedAt?: number | null
    workspaceName?: string | null
}): SyncStatusSummary {
    const workspaceLabel = input.workspaceName ? `${input.workspaceName} ` : ''
    if (input.error) {
        return {
            tone: 'danger',
            headline: 'Sync needs attention',
            detail: `${workspaceLabel}has a sync error. Open Cloud Sync for details and retry after checking your connection.`,
        }
    }
    if (input.status === 'disconnected') {
        return {
            tone: 'info',
            headline: 'Cloud sync is not connected',
            detail: 'Create or join a workspace to share handoffs, traceability, and release state with the team.',
        }
    }
    if (input.pendingCount > 0) {
        return {
            tone: 'warning',
            headline: `${input.pendingCount} sync change${input.pendingCount === 1 ? '' : 's'} pending`,
            detail: `${workspaceLabel}is still uploading local changes. Keep the app open until the queue clears.`,
        }
    }
    if (input.status === 'syncing' || input.status === 'connecting') {
        return {
            tone: 'info',
            headline: 'Sync in progress',
            detail: `${workspaceLabel}is refreshing shared state now.`,
        }
    }
    return {
        tone: 'success',
        headline: 'Cloud sync is healthy',
        detail: input.lastSyncedAt
            ? `${workspaceLabel}last synced at ${new Date(input.lastSyncedAt).toLocaleTimeString()}.`
            : `${workspaceLabel}is connected and ready.`,
    }
}

export function getCollaborationMetrics(project: Project): CollaborationMetrics {
    const events = project.collaborationEvents || []
    const handoffs = project.handoffPackets || []

    const ackDurations = handoffs
        .filter((handoff: HandoffPacket) => handoff.acknowledgedAt)
        .map((handoff: HandoffPacket) => handoff.acknowledgedAt! - handoff.createdAt)

    const readyForQaDurations = handoffs.map((handoff) => {
        const readyForQa = events.find((event) => event.handoffId === handoff.id && event.eventType === 'ready_for_qa')
        const verification = events.find((event) => event.handoffId === handoff.id && event.eventType === 'verification_passed')
        if (!readyForQa || !verification || verification.timestamp < readyForQa.timestamp) return null
        return verification.timestamp - readyForQa.timestamp
    }).filter((value): value is number => value !== null)

    const passedAfterReady = events.filter((event) => event.eventType === 'verification_passed').length
    const failedAfterReady = events.filter((event) => event.eventType === 'verification_failed').length
    const reopenRate = passedAfterReady + failedAfterReady === 0 ? 0 : Math.round((failedAfterReady / (passedAfterReady + failedAfterReady)) * 100)

    return {
        avgDevAcknowledgementHours: averageHours(ackDurations),
        avgReadyForQaToVerificationHours: averageHours(readyForQaDurations),
        reopenRate,
    }
}

function getTaskTraceabilitySummary(project: Project, task: Task) {
    const linkedTests = getLinkedTestsForTask(project, task)
    const handoffs = (project.handoffPackets || []).filter((item) => item.taskId === task.id)
    const activeHandoff = handoffs.find((item) => item.id === task.activeHandoffId) || handoffs[0]
    const missingFields = getHandoffMissingFields(activeHandoff)
    return {
        linkedTests,
        handoffs,
        activeHandoff,
        missingFields,
        hasCompleteHandoff: !!activeHandoff && missingFields.length === 0,
    }
}

function averageHours(values: number[]): number | null {
    if (values.length === 0) return null
    const total = values.reduce((sum, value) => sum + value, 0)
    return Math.round((total / values.length / 3_600_000) * 10) / 10
}

function intersect(left?: string[], right?: string[]): boolean {
    if (!left?.length || !right?.length) return false
    const rightSet = new Set(right.map(normalizeTag))
    return left.some((item) => rightSet.has(normalizeTag(item)))
}

function normalizeTag(value: string) {
    return value.trim().toLowerCase()
}
