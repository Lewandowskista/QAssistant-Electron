import { describe, expect, it } from 'vitest'
import { demoProject } from '../data/demoProject'
import {
    getHandoffMissingFields,
    getReleaseQueue,
    getCollaborationMetrics,
    migrateLegacyExecutionsToSessions,
    enrichHandoffCompleteness,
} from './collaboration'
import type { Project, Task, HandoffPacket, CollaborationEvent } from '../types/project'

// Minimal project factory for unit tests — avoids coupling to demoProject shape
function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        ...demoProject,
        id: 'test-project',
        tasks: [],
        handoffPackets: [],
        collaborationEvents: [],
        ...overrides,
    } as unknown as Project
}

function makeTask(overrides: Partial<Task> = {}): Task {
    return {
        id: 'task-1',
        title: 'Test task',
        description: '',
        status: 'in_progress',
        priority: 'medium',
        source: 'manual',
        collabState: 'draft',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...overrides,
    } as Task
}

function makeHandoff(overrides: Partial<HandoffPacket> = {}): HandoffPacket {
    return {
        id: 'handoff-1',
        taskId: 'task-1',
        type: 'dev_to_qa',
        createdByRole: 'dev',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        summary: 'Fix applied',
        reproSteps: 'Click the button',
        expectedResult: 'Green state',
        actualResult: 'Green state',
        environmentId: 'env-1',
        environmentName: 'Staging',
        severity: 'low',
        linkedExecutionRefs: [{ sessionId: 's1', planExecutionId: 'pe1', caseExecutionId: 'ce1', testCaseTitle: 'Login test', result: 'pass' }],
        linkedNoteIds: [],
        linkedFileIds: [],
        linkedPrs: [],
        isComplete: true,
        missingFields: [],
        ...overrides,
    } as unknown as HandoffPacket
}

describe('collaboration helpers', () => {
    it('flags missing required handoff fields', () => {
        expect(getHandoffMissingFields({
            summary: '',
            reproSteps: '',
            expectedResult: '',
            actualResult: '',
            linkedFileIds: [],
            linkedNoteIds: [],
            linkedExecutionRefs: [],
        })).toEqual(['summary', 'reproSteps', 'expectedResult', 'actualResult', 'environment', 'severity', 'evidence'])
    })

    it('returns no missing fields for a complete handoff', () => {
        const handoff = makeHandoff()
        const missing = getHandoffMissingFields(handoff)
        expect(missing).toHaveLength(0)
    })

    it('flags only missing evidence when other fields are present', () => {
        const handoff = makeHandoff({ linkedExecutionRefs: [], linkedFileIds: [], linkedNoteIds: [] })
        const missing = getHandoffMissingFields(handoff)
        expect(missing).toEqual(['evidence'])
    })

    it('treats a handoff with no environment as missing environment', () => {
        const handoff = makeHandoff({ environmentId: '', environmentName: '' })
        const missing = getHandoffMissingFields(handoff)
        expect(missing).toContain('environment')
    })

    it('builds the release queue from collaboration state', () => {
        const queue = getReleaseQueue(demoProject)
        expect(queue.tasksReadyForQa).toHaveLength(1)
        expect(queue.prsLinkedButNotRetested).toHaveLength(1)
        expect(queue.handoffsMissingEvidence).toHaveLength(0)
    })

    it('getReleaseQueue — empty project returns empty queues', () => {
        const queue = getReleaseQueue(makeProject())
        expect(queue.tasksReadyForQa).toHaveLength(0)
        expect(queue.handoffsMissingEvidence).toHaveLength(0)
        expect(queue.prsLinkedButNotRetested).toHaveLength(0)
        expect(queue.failedVerificationsNeedingDev).toHaveLength(0)
    })

    it('getReleaseQueue — task in ready_for_qa appears in tasksReadyForQa', () => {
        const task = makeTask({ collabState: 'ready_for_qa' })
        const queue = getReleaseQueue(makeProject({ tasks: [task] }))
        expect(queue.tasksReadyForQa).toHaveLength(1)
        expect(queue.tasksReadyForQa[0].task.id).toBe('task-1')
    })

    it('getReleaseQueue — verified task does not appear in prsLinkedButNotRetested', () => {
        const task = makeTask({ collabState: 'verified' })
        const handoff = makeHandoff({ linkedPrs: [{ url: 'https://github.com/x/y/1', title: 'PR #1', status: 'merged' }] })
        const queue = getReleaseQueue(makeProject({ tasks: [task], handoffPackets: [handoff] }))
        expect(queue.prsLinkedButNotRetested).toHaveLength(0)
    })

    it('getReleaseQueue — handoff missing evidence flagged', () => {
        const task = makeTask({ collabState: 'ready_for_qa', activeHandoffId: 'handoff-1' })
        const handoff = makeHandoff({ linkedExecutionRefs: [], linkedFileIds: [], linkedNoteIds: [] })
        const queue = getReleaseQueue(makeProject({ tasks: [task], handoffPackets: [handoff] }))
        expect(queue.handoffsMissingEvidence).toHaveLength(1)
    })

    it('enrichHandoffCompleteness marks complete handoff as isComplete=true', () => {
        const enriched = enrichHandoffCompleteness(makeHandoff())
        expect(enriched.isComplete).toBe(true)
        expect(enriched.missingFields).toHaveLength(0)
    })

    it('getCollaborationMetrics — empty project returns null averages and 0 reopen rate', () => {
        const metrics = getCollaborationMetrics(makeProject())
        expect(metrics.avgDevAcknowledgementHours).toBeNull()
        expect(metrics.avgReadyForQaToVerificationHours).toBeNull()
        expect(metrics.reopenRate).toBe(0)
    })

    it('getCollaborationMetrics — computes reopen rate from verification events', () => {
        const now = Date.now()
        const events: CollaborationEvent[] = [
            { id: 'e1', taskId: 'task-1', handoffId: 'handoff-1', eventType: 'verification_passed', actorRole: 'qa', timestamp: now, title: 'Passed' },
            { id: 'e2', taskId: 'task-1', handoffId: 'handoff-1', eventType: 'verification_failed', actorRole: 'qa', timestamp: now, title: 'Failed' },
            { id: 'e3', taskId: 'task-1', handoffId: 'handoff-1', eventType: 'verification_failed', actorRole: 'qa', timestamp: now, title: 'Failed again' },
        ]
        const metrics = getCollaborationMetrics(makeProject({ collaborationEvents: events }))
        // 2 failed out of 3 total = 67%
        expect(metrics.reopenRate).toBe(67)
    })

    it('getCollaborationMetrics — computes avgDevAcknowledgementHours from handoff timestamps', () => {
        const now = Date.now()
        const twoHoursMs = 2 * 3600 * 1000
        const handoff = makeHandoff({ createdAt: now - twoHoursMs, acknowledgedAt: now })
        const metrics = getCollaborationMetrics(makeProject({ handoffPackets: [handoff] }))
        expect(metrics.avgDevAcknowledgementHours).toBe(2)
    })

    it('migrates legacy executions into a synthetic archived session', () => {
        const sessions = migrateLegacyExecutionsToSessions({
            ...demoProject,
            testRunSessions: [],
        })

        expect(sessions).toHaveLength(1)
        expect(sessions[0].isArchived).toBe(true)
        expect(sessions[0].planExecutions[0].caseExecutions[0].testCaseId).toBe('tc-guest-checkout')
    })

    it('migrateLegacyExecutionsToSessions — returns existing sessions unchanged if present', () => {
        const sessions = migrateLegacyExecutionsToSessions(demoProject)
        // demoProject already has testRunSessions, so migration should return them as-is
        expect(sessions).toEqual(demoProject.testRunSessions)
    })
})
