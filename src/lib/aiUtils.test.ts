import { beforeEach, describe, expect, it } from 'vitest'
import { demoProject } from '../data/demoProject'
import { attachTaskCommentsToProjectAiContext, buildProjectAiContext, sanitizeExecutionsForAi, sanitizeProjectForQaAi, sanitizeTaskForQaAi, sanitizeTestPlansForAi } from './aiUtils'
import { useSettingsStore } from '@/store/useSettingsStore'

describe('ai utils', () => {
    beforeEach(() => {
        useSettingsStore.setState((state) => ({
            ...state,
            settings: {
                ...state.settings,
                sapCommerceContext: false,
            },
        }))
    })

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

        expect(context.handoffs.length).toBeGreaterThanOrEqual(1)
        const handoffWithPr = context.handoffs.find((handoff) => handoff.linkedPrs.length > 0)
        expect(handoffWithPr?.linkedPrs[0].repoFullName).toBe('acme/storefront')
        expect(context.tasks[0]).toHaveProperty('description')
        expect(context.tasks[0]).toHaveProperty('issueType')
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

    it('supports empty manual context selection', () => {
        const context = buildProjectAiContext(demoProject, 'qa', {
            taskIds: [],
            testPlanIds: [],
            environmentIds: [],
            testDataGroupIds: [],
            checklistIds: [],
            handoffIds: [],
            includeSapCommerce: false,
        })

        expect(context?.role).toBe('qa')
        if (!context || context.role !== 'qa') throw new Error('expected qa context')
        expect(context.tasks).toHaveLength(0)
        expect(context.testPlans).toHaveLength(0)
        expect(context.environments).toHaveLength(0)
        expect(context.sapCommerce.enabled).toBe(false)
    })

    it('does not include SAP commerce context by default when the Settings toggle is off', () => {
        const context = sanitizeProjectForQaAi(demoProject)

        expect(context?.role).toBe('qa')
        if (!context || context.role !== 'qa') throw new Error('expected qa context')
        expect(context.sapCommerce.enabled).toBe(false)
        expect(context.sapCommerce.environments).toEqual([])
    })

    it('does not include SAP commerce context when the Settings toggle is off', () => {
        const sapEnvironment = demoProject.environments.find((environment) =>
            environment.hacUrl || environment.backOfficeUrl || environment.storefrontUrl || environment.solrAdminUrl || environment.occBasePath
        )
        if (!sapEnvironment) throw new Error('expected demo project to include a SAP-capable environment')

        const context = buildProjectAiContext(demoProject, 'qa', {
            taskIds: [],
            testPlanIds: [],
            environmentIds: [sapEnvironment.id],
            testDataGroupIds: [],
            checklistIds: [],
            handoffIds: [],
            includeSapCommerce: true,
        })

        expect(context?.role).toBe('qa')
        if (!context || context.role !== 'qa') throw new Error('expected qa context')
        expect(context.sapCommerce.enabled).toBe(false)
        expect(context.sapCommerce.environments).toEqual([])
    })

    it('does not inject SAP commerce context when the selector disables it', () => {
        useSettingsStore.setState((state) => ({
            ...state,
            settings: {
                ...state.settings,
                sapCommerceContext: true,
            },
        }))

        const context = buildProjectAiContext(demoProject, 'qa', {
            taskIds: [],
            testPlanIds: [],
            environmentIds: [],
            testDataGroupIds: [],
            checklistIds: [],
            handoffIds: [],
            includeSapCommerce: false,
        })

        expect(context?.role).toBe('qa')
        if (!context || context.role !== 'qa') throw new Error('expected qa context')
        expect(context.sapCommerce.enabled).toBe(false)
        expect(context.sapCommerce.environments).toEqual([])
    })

    it('includes selected SAP-capable environments when the Settings toggle is on', () => {
        useSettingsStore.setState((state) => ({
            ...state,
            settings: {
                ...state.settings,
                sapCommerceContext: true,
            },
        }))

        const sapEnvironment = demoProject.environments.find((environment) =>
            environment.hacUrl || environment.backOfficeUrl || environment.storefrontUrl || environment.solrAdminUrl || environment.occBasePath
        )
        if (!sapEnvironment) throw new Error('expected demo project to include a SAP-capable environment')

        const context = buildProjectAiContext(demoProject, 'qa', {
            taskIds: [],
            testPlanIds: [],
            environmentIds: [sapEnvironment.id],
            testDataGroupIds: [],
            checklistIds: [],
            handoffIds: [],
            includeSapCommerce: true,
        })

        expect(context?.role).toBe('qa')
        if (!context || context.role !== 'qa') throw new Error('expected qa context')
        expect(context.sapCommerce.enabled).toBe(true)
        expect(context.sapCommerce.environments).toEqual([
            expect.objectContaining({ id: sapEnvironment.id, name: sapEnvironment.name }),
        ])
    })

    it('attaches selected task comments to copilot context', () => {
        const baseContext = buildProjectAiContext(demoProject, 'qa', {
            taskIds: [demoProject.tasks[0].id],
            environmentIds: [],
            testPlanIds: [],
            testDataGroupIds: [],
            checklistIds: [],
            handoffIds: [],
            includeSapCommerce: false,
        })
        const context = attachTaskCommentsToProjectAiContext(baseContext, {
            [demoProject.tasks[0].id]: [
                { authorName: 'Stefan', createdAt: 1_710_000_000_000, body: 'Recent upstream comment' },
            ],
        })

        expect(context?.role).toBe('qa')
        if (!context || context.role !== 'qa') throw new Error('expected qa context')
        expect(context.tasks[0].comments).toEqual([
            { authorName: 'Stefan', createdAt: 1_710_000_000_000, body: 'Recent upstream comment' },
        ])
    })
})
