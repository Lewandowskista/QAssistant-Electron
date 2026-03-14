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

    const tasksReadyForQa = queue.filter((item) => item.task.collabState === 'ready_for_qa')
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
