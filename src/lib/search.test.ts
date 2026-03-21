import { describe, expect, it } from 'vitest'
import { searchProjects } from './search'
import type { Project } from '@/store/useProjectStore'

// Minimal project factory — only fields search.ts touches
function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        id: 'proj-1',
        name: 'Project Alpha',
        description: '',
        tasks: [],
        notes: [],
        testPlans: [],
        testExecutions: [],
        testRunSessions: [],
        handoffPackets: [],
        collaborationEvents: [],
        environments: [],
        checklists: [],
        apiRequests: [],
        runbooks: [],
        testDataGroups: [],
        reportTemplates: [],
        accuracyTestSuites: [],
        exploratorySessions: [],
        ...overrides,
    } as unknown as Project
}

const task = (id: string, title: string, description = '') => ({
    id,
    title,
    description,
    status: 'open',
    priority: 'medium',
    collabState: 'draft',
    sourceIssueId: undefined,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
})

const note = (id: string, title: string, content = '') => ({
    id,
    title,
    content,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
})

const testPlan = (id: string, name: string, testCases: any[] = []) => ({
    id,
    name,
    description: '',
    testCases,
    createdAt: 0,
    updatedAt: 0,
})

const testCase = (id: string, title: string, displayId = 'TC-001') => ({
    id,
    title,
    displayId,
    status: 'not-run',
    priority: 'medium',
    steps: '',
    tags: [],
    createdAt: 0,
    updatedAt: 0,
})

describe('searchProjects', () => {
    it('returns empty array for queries shorter than 2 chars', () => {
        const p = makeProject({ tasks: [task('t1', 'Login page') as any] })
        expect(searchProjects([p], '')).toEqual([])
        expect(searchProjects([p], 'a')).toEqual([])
    })

    it('matches task by title', () => {
        const p = makeProject({ tasks: [task('t1', 'Login page') as any] })
        const results = searchProjects([p], 'login')
        expect(results).toHaveLength(1)
        expect(results[0].id).toBe('t1')
        expect(results[0].type).toBe('task')
    })

    it('matches task by description', () => {
        const p = makeProject({ tasks: [task('t1', 'Auth', 'Reset password flow') as any] })
        const results = searchProjects([p], 'password')
        expect(results[0].id).toBe('t1')
    })

    it('matches note by title and content', () => {
        const p = makeProject({ notes: [note('n1', 'Sprint notes', 'deploy to staging') as any] })
        expect(searchProjects([p], 'sprint')[0].type).toBe('note')
        expect(searchProjects([p], 'staging')[0].type).toBe('note')
    })

    it('matches test plan by name', () => {
        const p = makeProject({ testPlans: [testPlan('tp1', 'Smoke Suite') as any] })
        const results = searchProjects([p], 'smoke')
        expect(results[0].type).toBe('testplan')
    })

    it('matches test case by title and displayId', () => {
        const tc = testCase('tc1', 'Checkout flow', 'TC-042')
        const p = makeProject({ testPlans: [testPlan('tp1', 'Regression', [tc]) as any] })
        expect(searchProjects([p], 'checkout')[0].type).toBe('testcase')
        expect(searchProjects([p], 'tc-042')[0].type).toBe('testcase')
    })

    it('is case-insensitive', () => {
        const p = makeProject({ tasks: [task('t1', 'LOGIN PAGE') as any] })
        expect(searchProjects([p], 'login')).toHaveLength(1)
        expect(searchProjects([p], 'Login')).toHaveLength(1)
    })

    it('respects maxResults and terminates early', () => {
        const tasks = Array.from({ length: 100 }, (_, i) =>
            task(`t${i}`, `Feature ${i}`) as any
        )
        const p = makeProject({ tasks })
        const results = searchProjects([p], 'feature', 10)
        expect(results).toHaveLength(10)
    })

    it('returns at most 50 results by default', () => {
        const tasks = Array.from({ length: 200 }, (_, i) =>
            task(`t${i}`, `Feature ${i}`) as any
        )
        const p = makeProject({ tasks })
        const results = searchProjects([p], 'feature')
        expect(results.length).toBeLessThanOrEqual(50)
    })

    it('searches across multiple projects', () => {
        const p1 = makeProject({ id: 'p1', name: 'Proj 1', tasks: [task('t1', 'alpha task') as any] })
        const p2 = makeProject({ id: 'p2', name: 'Proj 2', tasks: [task('t2', 'alpha task') as any] })
        const results = searchProjects([p1, p2], 'alpha')
        expect(results).toHaveLength(2)
        const projectIds = results.map(r => r.projectId)
        expect(projectIds).toContain('p1')
        expect(projectIds).toContain('p2')
    })

    it('returns empty array when no matches', () => {
        const p = makeProject({ tasks: [task('t1', 'Login page') as any] })
        expect(searchProjects([p], 'zzznotfound')).toEqual([])
    })

    it('searches checklists by name', () => {
        const cl = { id: 'cl1', name: 'Release checklist', category: 'qa', items: [], createdAt: 0, updatedAt: 0 }
        const p = makeProject({ checklists: [cl] as any })
        const results = searchProjects([p], 'release')
        expect(results[0].type).toBe('checklist')
    })

    it('searches API requests by name and URL', () => {
        const api = { id: 'a1', name: 'Get users', url: '/api/users', method: 'GET', category: 'users' }
        const p = makeProject({ apiRequests: [api] as any })
        expect(searchProjects([p], 'get user')[0].type).toBe('api')
        expect(searchProjects([p], '/api/users')[0].type).toBe('api')
    })
})
