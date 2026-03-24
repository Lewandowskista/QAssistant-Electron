import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useProjectStore } from './useProjectStore'

// Mock window.electronAPI so store persistence calls are no-ops in tests
const mockElectronAPI = {
    writeProjectsFile: vi.fn().mockResolvedValue(undefined),
    syncPushTaskCollab: vi.fn().mockResolvedValue(undefined),
    syncPushHandoff: vi.fn().mockResolvedValue(undefined),
    syncPushCollabEvent: vi.fn().mockResolvedValue(undefined),
}

// Zustand store is a singleton — we reset between tests via the store's
// internal state reset. We re-initialise the active project fresh each time.
let projectId: string

beforeEach(async () => {
    // Provide a minimal electronAPI stub
    Object.defineProperty(global, 'window', {
        value: { electronAPI: mockElectronAPI },
        writable: true,
        configurable: true,
    })

    // Reset all store state to a clean slate by overwriting projects
    const store = useProjectStore.getState()

    // Create a fresh project
    await store.addProject('Test Project', 'Test project for unit tests')
    const projects = useProjectStore.getState().projects
    projectId = projects[projects.length - 1].id
    useProjectStore.setState({ activeProjectId: projectId })
})

describe('useProjectStore — task operations', () => {
    it('addTask creates a task and prepends it to the project', async () => {
        const store = useProjectStore.getState()
        const taskId = await store.addTask(projectId, { title: 'My first task' })

        const project = useProjectStore.getState().projects.find(p => p.id === projectId)!
        expect(project.tasks).toHaveLength(1)
        expect(project.tasks[0].id).toBe(taskId)
        expect(project.tasks[0].title).toBe('My first task')
        expect(project.tasks[0].collabState).toBe('draft')
        expect(project.tasks[0].status).toBe('todo')
    })

    it('addTask defaults are applied correctly', async () => {
        const store = useProjectStore.getState()
        await store.addTask(projectId, { title: 'Defaults check' })

        const task = useProjectStore.getState().projects.find(p => p.id === projectId)!.tasks[0]
        expect(task.priority).toBe('medium')
        expect(task.source).toBe('manual')
        expect(task.description).toBe('')
    })

    it('updateTask merges updates onto the existing task', async () => {
        const store = useProjectStore.getState()
        const taskId = await store.addTask(projectId, { title: 'Original title' })

        await useProjectStore.getState().updateTask(projectId, taskId, { title: 'Updated title', status: 'done' })

        const task = useProjectStore.getState().projects.find(p => p.id === projectId)!.tasks.find(t => t.id === taskId)!
        expect(task.title).toBe('Updated title')
        expect(task.status).toBe('done')
    })

    it('updateTask does not affect other tasks in the same project', async () => {
        const store = useProjectStore.getState()
        const id1 = await store.addTask(projectId, { title: 'Task A' })
        const id2 = await store.addTask(projectId, { title: 'Task B' })

        await useProjectStore.getState().updateTask(projectId, id1, { title: 'Task A (modified)' })

        const project = useProjectStore.getState().projects.find(p => p.id === projectId)!
        const taskB = project.tasks.find(t => t.id === id2)!
        expect(taskB.title).toBe('Task B')
    })

    it('setTaskCollabState transitions the collabState field', async () => {
        const store = useProjectStore.getState()
        const taskId = await store.addTask(projectId, { title: 'Collab task' })

        await useProjectStore.getState().setTaskCollabState(projectId, taskId, 'ready_for_qa')

        const task = useProjectStore.getState().projects.find(p => p.id === projectId)!.tasks.find(t => t.id === taskId)!
        expect(task.collabState).toBe('ready_for_qa')
    })
})

describe('useProjectStore — handoff operations', () => {
    it('createHandoffPacket creates a packet and links it to the task', async () => {
        const store = useProjectStore.getState()
        const taskId = await store.addTask(projectId, { title: 'Handoff task' })

        const handoffId = await useProjectStore.getState().createHandoffPacket(projectId, taskId, {
            type: 'fix_handoff',
            createdByRole: 'dev',
            summary: 'Fix deployed',
            reproSteps: 'Navigate to the page',
            expectedResult: 'Page loads',
            actualResult: 'Page loads',
            environmentName: 'Staging',
            severity: 'minor',
            linkedExecutionRefs: [{ sessionId: 's1', planExecutionId: 'pe1', caseExecutionId: 'ce1' }],
            linkedNoteIds: [],
            linkedFileIds: [],
            linkedPrs: [],
        })

        const project = useProjectStore.getState().projects.find(p => p.id === projectId)!
        const handoff = project.handoffPackets?.find(h => h.id === handoffId)
        const task = project.tasks.find(t => t.id === taskId)!

        expect(handoff).toBeDefined()
        expect(handoff!.summary).toBe('Fix deployed')
        expect(handoff!.taskId).toBe(taskId)
        expect(task.activeHandoffId).toBe(handoffId)
    })

    it('createHandoffPacket emits a handoff_created collaboration event', async () => {
        const store = useProjectStore.getState()
        const taskId = await store.addTask(projectId, { title: 'Event task' })

        await useProjectStore.getState().createHandoffPacket(projectId, taskId, {
            type: 'fix_handoff',
            createdByRole: 'dev',
            linkedExecutionRefs: [],
            linkedNoteIds: [],
            linkedFileIds: [],
            linkedPrs: [],
        })

        const events = useProjectStore.getState().projects.find(p => p.id === projectId)!.collaborationEvents || []
        expect(events.some(e => e.eventType === 'handoff_created' && e.taskId === taskId)).toBe(true)
    })

    it('acknowledgeHandoff sets acknowledgedAt and transitions task to dev_acknowledged', async () => {
        const store = useProjectStore.getState()
        const taskId = await store.addTask(projectId, { title: 'Ack task' })
        const handoffId = await useProjectStore.getState().createHandoffPacket(projectId, taskId, {
            type: 'fix_handoff',
            createdByRole: 'qa',
            linkedExecutionRefs: [],
            linkedNoteIds: [],
            linkedFileIds: [],
            linkedPrs: [],
        })

        await useProjectStore.getState().acknowledgeHandoff(projectId, handoffId, 'dev')

        const project = useProjectStore.getState().projects.find(p => p.id === projectId)!
        const handoff = (project.handoffPackets ?? []).find(h => h.id === handoffId)!
        const task = project.tasks.find(t => t.id === taskId)!

        expect(handoff.acknowledgedAt).toBeGreaterThan(0)
        expect(task.collabState).toBe('dev_acknowledged')
    })

    it('acknowledgeHandoff emits a handoff_acknowledged event', async () => {
        const store = useProjectStore.getState()
        const taskId = await store.addTask(projectId, { title: 'Event ack task' })
        const handoffId = await useProjectStore.getState().createHandoffPacket(projectId, taskId, {
            type: 'fix_handoff',
            createdByRole: 'qa',
            linkedExecutionRefs: [],
            linkedNoteIds: [],
            linkedFileIds: [],
            linkedPrs: [],
        })

        await useProjectStore.getState().acknowledgeHandoff(projectId, handoffId)

        const events = useProjectStore.getState().projects.find(p => p.id === projectId)!.collaborationEvents || []
        expect(events.some(e => e.eventType === 'handoff_acknowledged' && e.handoffId === handoffId)).toBe(true)
    })
})

describe('useProjectStore — AI Copilot history', () => {
    it('appendAiCopilotHistoryEntry stores the newest exchange first', async () => {
        const store = useProjectStore.getState()

        await store.appendAiCopilotHistoryEntry(projectId, {
            role: 'qa',
            prompt: 'What should I test first?',
            response: 'Start with checkout and order confirmation.',
            contextSummary: '2 tasks | 1 env',
        })

        const project = useProjectStore.getState().projects.find(p => p.id === projectId)!
        expect(project.aiCopilotHistory).toHaveLength(1)
        expect(project.aiCopilotHistory?.[0]).toEqual(expect.objectContaining({
            role: 'qa',
            prompt: 'What should I test first?',
            response: 'Start with checkout and order confirmation.',
            contextSummary: '2 tasks | 1 env',
        }))
    })

    it('clearAiCopilotHistory can remove entries for a single role', async () => {
        const store = useProjectStore.getState()

        await store.appendAiCopilotHistoryEntry(projectId, {
            role: 'qa',
            prompt: 'QA prompt',
            response: 'QA reply',
        })
        await store.appendAiCopilotHistoryEntry(projectId, {
            role: 'dev',
            prompt: 'Dev prompt',
            response: 'Dev reply',
        })

        await store.clearAiCopilotHistory(projectId, 'qa')

        const project = useProjectStore.getState().projects.find(p => p.id === projectId)!
        expect(project.aiCopilotHistory).toHaveLength(1)
        expect(project.aiCopilotHistory?.[0].role).toBe('dev')
    })
})
