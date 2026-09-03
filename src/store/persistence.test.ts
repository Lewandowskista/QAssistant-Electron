/**
 * Tests for the store's persistence contract.
 *
 * These cover the data-loss paths, not features. Each one describes a sequence
 * that previously destroyed a user's projects:
 *
 *  - a transient read failure, followed by any save, pruned the database
 *  - a full write deleted every project it was not handed, so a stale in-memory
 *    cache silently removed work written by the automation API or cloud sync
 *  - the debounced save persisted a snapshot captured 300ms earlier, discarding
 *    any granular write that landed inside the window
 *  - a write that failed reported success, so nothing warned the user
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('sonner', () => ({
    toast: { error: toastError, success: toastSuccess, info: vi.fn(), warning: vi.fn(), message: vi.fn() },
}))
vi.mock('@/lib/perf', () => ({
    measureAsync: async (_label: string, fn: () => unknown) => await fn(),
    measure: (_label: string, fn: () => unknown) => fn(),
}))

/** Minimal project shaped the way the store expects. */
function project(id: string, name = id) {
    return {
        id, name, color: '#6366f1',
        tasks: [], notes: [], testPlans: [], environments: [], testExecutions: [],
        testRunSessions: [], files: [], testDataGroups: [], checklists: [],
        apiRequests: [], runbooks: [], linearConnections: [], jiraConnections: [],
    }
}

type Api = Record<string, ReturnType<typeof vi.fn>>

/** A stub main process that records what the renderer asked it to do. */
function stubApi(overrides: Partial<Api> = {}) {
    const api: Api = {
        readProjectsFile: vi.fn(async () => ({ ok: true, projects: [] })),
        writeProjectsFile: vi.fn(async () => ({ ok: true })),
        deleteProject: vi.fn(async () => ({ ok: true, deleted: true })),
        upsertProjectTask: vi.fn(async () => ({ ok: true })),
        upsertProjectNote: vi.fn(async () => ({ ok: true })),
        upsertProjectEnvironment: vi.fn(async () => ({ ok: true })),
        ...(overrides as Api),
    }
    ;(globalThis as unknown as { window: unknown }).window = { electronAPI: api }
    return api
}

async function freshStore() {
    vi.resetModules()
    const mod = await import('./useProjectStore')
    return mod.useProjectStore
}

beforeEach(() => {
    toastError.mockClear()
    toastSuccess.mockClear()
})

afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window
})

describe('a failed project read', () => {
    it('does not look like an empty workspace', async () => {
        const api = stubApi({ readProjectsFile: vi.fn(async () => ({ ok: false, error: 'disk I/O error' })) })
        const store = await freshStore()

        await store.getState().loadProjects()

        expect(store.getState().projects).toEqual([])
        expect(store.getState().initialized).toBe(true)
        expect(toastError).toHaveBeenCalled()
        // The user must be told saving is off, not just that a read failed.
        expect(String(toastError.mock.calls[0][0])).toMatch(/nothing has been deleted/i)
        expect(api.writeProjectsFile).not.toHaveBeenCalled()
    })

    it('blocks every later write, so the empty state is never persisted', async () => {
        const api = stubApi({ readProjectsFile: vi.fn(async () => ({ ok: false, error: 'disk I/O error' })) })
        const store = await freshStore()
        await store.getState().loadProjects()

        // This is the exact sequence that used to destroy the database: read
        // fails, store holds nothing, user clicks something, everything is gone.
        await store.getState().addProject('New project', '#fff')

        expect(api.writeProjectsFile).not.toHaveBeenCalled()
    })

    it('lifts the block once a read succeeds', async () => {
        const readProjectsFile = vi.fn()
            .mockResolvedValueOnce({ ok: false, error: 'transient' })
            .mockResolvedValueOnce({ ok: true, projects: [project('p1')] })
        const api = stubApi({ readProjectsFile })
        const store = await freshStore()

        await store.getState().loadProjects()
        await store.getState().loadProjects()

        expect(store.getState().projects).toHaveLength(1)
        await store.getState().addProject('Another', '#fff')
        expect(api.writeProjectsFile).toHaveBeenCalled()
    })

    it('still tolerates a main process that returns a bare array', async () => {
        // Older builds resolved with Project[] rather than a result envelope.
        const api = stubApi({ readProjectsFile: vi.fn(async () => [project('p1')]) })
        const store = await freshStore()

        await store.getState().loadProjects()

        expect(store.getState().projects).toHaveLength(1)
        expect(api.writeProjectsFile).not.toHaveBeenCalled()
    })
})

describe('a write that fails', () => {
    it('is reported instead of being treated as success', async () => {
        const api = stubApi({ writeProjectsFile: vi.fn(async () => ({ ok: false, error: 'NOT NULL constraint failed' })) })
        const store = await freshStore()
        await store.getState().loadProjects()

        await store.getState().addProject('Doomed', '#fff')

        expect(api.writeProjectsFile).toHaveBeenCalled()
        expect(toastError).toHaveBeenCalled()
        expect(String(toastError.mock.calls[toastError.mock.calls.length - 1]?.[0])).toMatch(/not written to disk/i)
    })

    it('is reported when the call rejects outright', async () => {
        const api = stubApi({ writeProjectsFile: vi.fn(async () => { throw new Error('IPC channel closed') }) })
        const store = await freshStore()
        await store.getState().loadProjects()

        await store.getState().addProject('Doomed', '#fff')
        // Persistence is deliberately fire-and-forget so the UI never blocks on a
        // write, so let the rejection handler run.
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(api.writeProjectsFile).toHaveBeenCalled()
        expect(toastError).toHaveBeenCalled()
    })
})

describe('deleting a project', () => {
    it('goes through the explicit delete path, not by omission from a full write', async () => {
        const api = stubApi({ readProjectsFile: vi.fn(async () => ({ ok: true, projects: [project('p1'), project('p2')] })) })
        const store = await freshStore()
        await store.getState().loadProjects()

        await store.getState().deleteProject('p1')

        expect(api.deleteProject).toHaveBeenCalledWith('p1')
        expect(store.getState().projects.map(p => p.id)).toEqual(['p2'])
    })

    it('keeps the project on screen when the delete fails', async () => {
        const api = stubApi({
            readProjectsFile: vi.fn(async () => ({ ok: true, projects: [project('p1')] })),
            deleteProject: vi.fn(async () => ({ ok: false, error: 'database is locked' })),
        })
        const store = await freshStore()
        await store.getState().loadProjects()

        await store.getState().deleteProject('p1')

        // Removing it from the UI while it still exists on disk would be a lie.
        expect(store.getState().projects.map(p => p.id)).toEqual(['p1'])
        expect(toastError).toHaveBeenCalled()
        expect(api.writeProjectsFile).not.toHaveBeenCalled()
    })

    it('moves the active selection off a deleted project', async () => {
        stubApi({ readProjectsFile: vi.fn(async () => ({ ok: true, projects: [project('p1'), project('p2')] })) })
        const store = await freshStore()
        await store.getState().loadProjects()
        store.setState({ activeProjectId: 'p1' })

        await store.getState().deleteProject('p1')

        expect(store.getState().activeProjectId).toBe('p2')
    })
})

describe('purging all data', () => {
    it('deletes each project explicitly and clears the store', async () => {
        const api = stubApi({ readProjectsFile: vi.fn(async () => ({ ok: true, projects: [project('p1'), project('p2')] })) })
        const store = await freshStore()
        await store.getState().loadProjects()

        const result = await store.getState().purgeAllProjects()

        expect(result).toEqual({ ok: true, deleted: 2 })
        expect(api.deleteProject).toHaveBeenCalledTimes(2)
        // The old implementation left every project in memory, so the UI kept
        // showing data the user had just purged.
        expect(store.getState().projects).toEqual([])
        expect(store.getState().activeProjectId).toBeNull()
    })

    it('reloads rather than lying when a delete fails', async () => {
        const readProjectsFile = vi.fn(async () => ({ ok: true, projects: [project('p1'), project('p2')] }))
        const api = stubApi({
            readProjectsFile,
            deleteProject: vi.fn()
                .mockResolvedValueOnce({ ok: true, deleted: true })
                .mockResolvedValueOnce({ ok: false, error: 'database is locked' }),
        })
        const store = await freshStore()
        await store.getState().loadProjects()

        const result = await store.getState().purgeAllProjects()

        expect(result.ok).toBe(false)
        expect(api.readProjectsFile).toHaveBeenCalledTimes(2)
    })
})

describe('the debounced save', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('persists the state at fire time, not the snapshot from when it was scheduled', async () => {
        const api = stubApi({ readProjectsFile: vi.fn(async () => ({ ok: true, projects: [project('p1')] })) })
        const store = await freshStore()
        await store.getState().loadProjects()

        // Schedule a debounced write, then change state inside the window. The
        // old implementation captured `projects` at call time and wrote it back,
        // reverting anything that happened in between.
        await store.getState().addTestDataGroup('p1', 'Group A', 'Users')
        store.setState({ projects: [{ ...project('p1'), name: 'Renamed inside the window' }] })

        await vi.advanceTimersByTimeAsync(400)

        expect(api.writeProjectsFile).toHaveBeenCalled()
        const written = api.writeProjectsFile.mock.calls[api.writeProjectsFile.mock.calls.length - 1][0] as Array<{ name: string }>
        expect(written[0].name).toBe('Renamed inside the window')
    })

    it('coalesces rapid calls into a single write', async () => {
        const api = stubApi({ readProjectsFile: vi.fn(async () => ({ ok: true, projects: [project('p1')] })) })
        const store = await freshStore()
        await store.getState().loadProjects()

        await store.getState().addTestDataGroup('p1', 'A', 'Users')
        await store.getState().addTestDataGroup('p1', 'B', 'Users')
        await store.getState().addTestDataGroup('p1', 'C', 'Users')
        await vi.advanceTimersByTimeAsync(400)

        expect(api.writeProjectsFile).toHaveBeenCalledTimes(1)
    })
})
