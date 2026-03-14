import { describe, expect, it } from 'vitest'
import { demoProject } from '../data/demoProject'
import { getHandoffMissingFields, getReleaseQueue, migrateLegacyExecutionsToSessions } from './collaboration'

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

    it('builds the release queue from collaboration state', () => {
        const queue = getReleaseQueue(demoProject)
        expect(queue.tasksReadyForQa).toHaveLength(1)
        expect(queue.prsLinkedButNotRetested).toHaveLength(1)
        expect(queue.handoffsMissingEvidence).toHaveLength(0)
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
})
