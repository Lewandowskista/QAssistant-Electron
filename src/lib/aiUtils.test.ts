import { describe, expect, it } from 'vitest'
import { demoProject } from '../data/demoProject'
import { buildProjectAiContext, sanitizeExecutionsForAi, sanitizeProjectForQaAi, sanitizeTaskForQaAi, sanitizeTestPlansForAi } from './aiUtils'

describe('ai utils', () => {
    it('strips sensitive and internal fields from QA project context', () => {
        const project = {
            ...demoProject,
            environments: demoProject.environments.map((environment) => ({
                ...environment,
                username: 'qa-user',
                password: 'secret-password',
            })),
            tasks: demoProject.tasks.map((task) => ({
                ...task,
                analysisHistory: [{
                    version: 1,
                    hash: 'hash-1',
                    timestamp: Date.now(),
                    taskStatus: task.status,
                    taskPriority: task.priority,
                    summary: 'old analysis',
                    fullResult: 'internal prompt output',
                }],
            })),
        }

        const context = sanitizeProjectForQaAi(project)
        expect(context?.role).toBe('qa')
        expect(context?.environments[0]).not.toHaveProperty('username')
        expect(context?.environments[0]).not.toHaveProperty('password')
        expect(context?.tasks[0]).not.toHaveProperty('analysisHistory')
        expect(context?.tasks[0]).toHaveProperty('acceptanceCriteria')
    })

    it('builds specialized dev context with handoffs and linked PRs', () => {
        const context = buildProjectAiContext(demoProject, 'dev')
        expect(context?.role).toBe('dev')
        if (!context || context.role !== 'dev') throw new Error('expected dev context')

        expect(context.handoffs).toHaveLength(1)
        expect(context.handoffs[0].linkedPrs[0].repoFullName).toBe('acme/storefront')
        expect(context.tasks[0]).not.toHaveProperty('description')
    })

    it('produces minimal per-function QA payloads', () => {
        const task = sanitizeTaskForQaAi(demoProject.tasks[0], demoProject.environments)
        const plans = sanitizeTestPlansForAi(demoProject.testPlans)
        const executions = sanitizeExecutionsForAi(demoProject.testExecutions)

        expect(task.affectedEnvironmentNames).toEqual([])
        expect(plans[0].testCases[0]).toEqual(expect.objectContaining({
            displayId: 'TC-101',
            status: 'failed',
        }))
        expect(executions[0]).toEqual(expect.objectContaining({
            result: 'failed',
            environmentName: 'Staging',
        }))
        expect(executions[0]).not.toHaveProperty('snapshotExpectedResult')
    })
})
