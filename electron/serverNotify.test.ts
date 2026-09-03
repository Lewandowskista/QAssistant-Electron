/**
 * Tests that a write through the automation API tells the renderer to re-read.
 *
 * This is the second half of a data-loss fix. The API writes straight to SQLite,
 * so without a notification the renderer's in-memory copy silently falls behind,
 * and its next full write reverts whatever the API just recorded — a test result
 * submitted from CI would vanish the next time someone changed a setting.
 *
 * Lives in its own file because it needs a database stub that actually holds
 * state, whereas server.test.ts stubs reads to a constant empty list.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
    default: { app: { getVersion: () => '1.0.0-test' } },
    app: { getVersion: () => '1.0.0-test' },
}))

/** One project with a single runnable test case, mutated in place by the API. */
const state = {
    projects: [] as any[],
    writes: 0,
}

function seedProject() {
    state.projects = [{
        id: 'p1',
        name: 'Storefront QA',
        color: '#6366f1',
        schemaVersion: 2,
        tasks: [],
        notes: [],
        environments: [],
        testExecutions: [],
        testRunSessions: [],
        handoffPackets: [],
        artifactLinks: [],
        collaborationEvents: [],
        files: [],
        testDataGroups: [],
        checklists: [],
        apiRequests: [],
        runbooks: [],
        linearConnections: [],
        jiraConnections: [],
        testPlans: [{
            id: 'tp1',
            displayId: 'TP-001',
            name: 'Checkout',
            description: '',
            isArchived: false,
            isRegressionSuite: false,
            createdAt: 1,
            updatedAt: 1,
            testCases: [{
                id: 'tc1',
                displayId: 'TC-101',
                title: 'Guest checkout completes',
                preConditions: '',
                steps: '',
                testData: '',
                expectedResult: '',
                actualResult: '',
                priority: 'major',
                status: 'not-run',
                updatedAt: 1,
            }],
        }],
    }]
    state.writes = 0
}

vi.mock('./database', () => ({
    getAllProjects: () => state.projects,
    getProjectById: (id: string) => state.projects.find(p => p.id === id) ?? null,
    getProjectSummaries: () => state.projects.map(p => ({ id: p.id, name: p.name })),
    saveAllProjects: (projects: any[]) => { state.projects = projects; state.writes += 1 },
    runInTransaction: <T>(fn: () => T): T => fn(),
}))

vi.mock('./oauth', () => ({
    getPendingAuth: () => null,
    getPendingAuthByState: () => null,
    exchangeCode: async () => ({ userId: 'u1' }),
    generateAuthUrl: () => 'https://example.com/auth',
    revokeTokens: async () => undefined,
    isConnected: async () => false,
}))

vi.mock('./logger', () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { startServer, stopServer, getServerPort, setServerWindowSender } from './server'

const TEST_PORT = 19998
const token = 'notify-test-token'
const sent: Array<{ channel: string; args: unknown[] }> = []

describe('automation API writes notify the renderer', () => {
    beforeAll(async () => {
        setServerWindowSender((channel, ...args) => { sent.push({ channel, args }) })
        await startServer(token, TEST_PORT)
    })

    afterAll(() => {
        stopServer()
        setServerWindowSender(() => {})
    })

    beforeEach(() => {
        sent.length = 0
        seedProject()
    })

    async function post(path: string, body: unknown) {
        return fetch(`http://127.0.0.1:${getServerPort()}${path}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
    }

    function changeNotifications() {
        return sent.filter(entry => entry.channel === 'projects-changed')
    }

    it('emits projects-changed after recording a test result', async () => {
        const res = await post('/api/results', { displayId: 'TC-101', status: 'failed', actualResult: '500 on payment step' })

        expect(res.status).toBe(200)
        expect(state.writes).toBe(1)
        expect(changeNotifications()).toHaveLength(1)
        expect(changeNotifications()[0].args[0]).toEqual({ source: 'automation-api' })
    })

    it('names the source so the renderer can log why it reloaded', async () => {
        await post('/api/results', { displayId: 'TC-101', status: 'passed' })

        const info = changeNotifications()[0].args[0] as { source: string }
        expect(info.source).toBe('automation-api')
    })

    it('actually persists the result it notified about', async () => {
        await post('/api/results', { displayId: 'TC-101', status: 'failed', actualResult: 'boom' })

        const testCase = state.projects[0].testPlans[0].testCases[0]
        expect(testCase.status).toBe('failed')
        // The notification is worthless if it fires before the write lands.
        expect(changeNotifications()).toHaveLength(1)
    })

    it('emits once per accepted write, not once per request', async () => {
        await post('/api/results', { displayId: 'TC-101', status: 'passed' })
        await post('/api/results', { displayId: 'TC-101', status: 'failed' })

        expect(changeNotifications()).toHaveLength(2)
    })

    it('does not notify when the request is rejected before any write', async () => {
        const res = await post('/api/results', { status: 'passed' })  // no displayId

        expect(res.status).toBe(400)
        expect(state.writes).toBe(0)
        expect(changeNotifications()).toHaveLength(0)
    })

    it('survives a sender that throws, so a renderer crash cannot fail the write', async () => {
        setServerWindowSender(() => { throw new Error('renderer is gone') })

        const res = await post('/api/results', { displayId: 'TC-101', status: 'passed' })

        expect(res.status).toBe(200)
        expect(state.projects[0].testPlans[0].testCases[0].status).toBe('passed')

        setServerWindowSender((channel, ...args) => { sent.push({ channel, args }) })
    })
})
