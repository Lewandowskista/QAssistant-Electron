// @ts-ignore
import electron from 'electron'
const { app } = electron as any
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import express from 'express'
import type { Request, Response } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { withFileLock } from './file-lock'

const server = express()
server.use(cors({
    origin: [/localhost:\d+$/, /127\.0\.0\.1:\d+$/]
}))
server.use(bodyParser.json())

let authToken = crypto.randomBytes(32).toString('hex')
let serverInstance: any = null
const openSockets = new Set<any>()

export function startServer(apiToken: string, port: number = 3030) {
    // Prevent double-start (e.g. called from both IPC handler and app.whenReady)
    if (serverInstance) {
        console.log('[QAssistant] API server already running, skipping restart.')
        return
    }
    authToken = apiToken

    const getDataPath = (): string =>
        path.join(app.getPath('userData'), 'QAssistantData', 'projects.json')

    const readProjects = async (): Promise<any[]> => {
        try {
            if (!fs.existsSync(getDataPath())) return []
            const content = await fs.promises.readFile(getDataPath(), 'utf8');
            return JSON.parse(content)
        } catch (e) {
            console.warn('[AutomationAPI] Failed to read projects file:', e)
            return []
        }
    }

    const writeProjects = async (projects: any[]): Promise<void> => {
        const filePath = getDataPath()
        await withFileLock(filePath, () =>
            fs.promises.writeFile(filePath, JSON.stringify(projects, null, 2))
        )
    }

    // ── Public health endpoint (no auth) ───────────────────────────────────
    server.get('/health', (_req: Request, res: Response) => {
        res.json({
            status: 'active',
            version: app.getVersion(),
            uptime: Math.floor(process.uptime()),
            platform: process.platform
        })
    })

    // ── Auth middleware for all protected routes ────────────────────────────
    server.use((req: any, res: any, next: any) => {
        const authHeader = req.headers.authorization
        if (authHeader === `Bearer ${authToken}`) {
            next()
        } else {
            res.status(401).json({ error: 'Unauthorized. Bearer token required.' })
        }
    })

    // ── GET /api/projects ── list all projects ──────────────────────────────
    server.get('/api/projects', async (_req: any, res: any) => {
        try {
            const projects = await readProjects()
            res.json(projects.map((p: any) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                testPlanCount: p.testPlans?.length || 0,
                testCaseCount: p.testPlans?.flatMap((tp: any) => tp.testCases || []).length || 0,
                testExecutionCount: p.testExecutions?.length || 0
            })))
        } catch (e: any) {
            res.status(500).json({ error: 'Failed to read project data.', detail: e.message })
        }
    })

    // ── GET /api/projects/:id ── single project detail ───────────────────────
    server.get('/api/projects/:id', async (req: any, res: any) => {
        try {
            const projects = await readProjects()
            const project = projects.find((p: any) => p.id === req.params.id)
            if (!project) return res.status(404).json({ error: 'Project not found.' })
            res.json(project)
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    // ── GET /api/testcases ── all test cases across all projects ─────────────
    server.get('/api/testcases', async (req: any, res: any) => {
        try {
            const projects = await readProjects()
            const projectId = req.query.projectId as string | undefined
            const planId = req.query.planId as string | undefined
            const status = req.query.status as string | undefined

            const results: any[] = []
            for (const project of projects) {
                if (projectId && project.id !== projectId) continue
                for (const plan of (project.testPlans || [])) {
                    if (planId && plan.id !== planId) continue
                    for (const tc of (plan.testCases || [])) {
                        if (status && tc.status !== status) continue
                        results.push({
                            ...tc,
                            planId: plan.id,
                            planName: plan.name,
                            projectId: project.id,
                            projectName: project.name,
                        })
                    }
                }
            }
            res.json(results)
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    // ── GET /api/testcases/:displayId ── find by display ID (e.g. TC-001) ──────
    server.get('/api/testcases/:displayId', async (req: any, res: any) => {
        try {
            const projects = await readProjects()
            const displayId = req.params.displayId

            for (const project of projects) {
                for (const plan of (project.testPlans || [])) {
                    const tc = plan.testCases?.find((t: any) => t.displayId === displayId)
                    if (tc) {
                        return res.json({ ...tc, planId: plan.id, planName: plan.name, projectId: project.id })
                    }
                }
            }
            res.status(404).json({ error: `Test case '${displayId}' not found.` })
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    // ── POST /api/results ── submit a single test execution result ───────────
    server.post('/api/results', async (req: any, res: any) => {
        const { displayId, status, actualResult, notes } = req.body

        if (!displayId || !status) {
            return res.status(400).json({ error: 'Required fields: displayId, status' })
        }

        const validStatuses = ['passed', 'failed', 'blocked', 'skipped', 'not-run']
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` })
        }

        try {
            const projects = await readProjects()
            let found = false

            for (const project of projects) {
                for (const plan of (project.testPlans || [])) {
                    const tc = plan.testCases?.find((t: any) => t.displayId === displayId)
                    if (tc) {
                        tc.status = status
                        if (actualResult) tc.actualResult = actualResult
                        tc.updatedAt = Date.now()

                        const execution = {
                            id: crypto.randomUUID(),
                            testCaseId: tc.id,
                            testPlanId: plan.id,
                            result: status,
                            actualResult: actualResult || 'Automated result',
                            notes: notes || 'Submitted via Automation API',
                            executedAt: Date.now(),
                            snapshotTestCaseTitle: tc.title
                        }

                        project.testExecutions = [execution, ...(project.testExecutions || [])]
                        found = true
                        break
                    }
                }
                if (found) break
            }

            if (!found) return res.status(404).json({ error: `Test case '${displayId}' not found.` })

            await writeProjects(projects)
            res.json({ success: true, message: `Result recorded for ${displayId}` })
        } catch (e: any) {
            res.status(500).json({ error: 'Failed to record result.', detail: e.message })
        }
    })

    // ── POST /api/results/batch ── submit multiple results at once ───────────
    server.post('/api/results/batch', async (req: any, res: any) => {
        const results: any[] = req.body?.results

        if (!Array.isArray(results) || results.length === 0) {
            return res.status(400).json({ error: 'Request body must have a "results" array.' })
        }

        try {
            const projects = await readProjects()
            const summary: any[] = []

            for (const item of results) {
                const { displayId, status, actualResult, notes } = item
                if (!displayId || !status) {
                    summary.push({ displayId, success: false, error: 'Missing displayId or status' })
                    continue
                }

                let found = false
                for (const project of projects) {
                    for (const plan of (project.testPlans || [])) {
                        const tc = plan.testCases?.find((t: any) => t.displayId === displayId)
                        if (tc) {
                            tc.status = status
                            if (actualResult) tc.actualResult = actualResult
                            tc.updatedAt = Date.now()

                            const execution = {
                                id: crypto.randomUUID(),
                                testCaseId: tc.id,
                                testPlanId: plan.id,
                                result: status,
                                actualResult: actualResult || 'Automated result',
                                notes: notes || 'Batch submitted via Automation API',
                                executedAt: Date.now(),
                                snapshotTestCaseTitle: tc.title
                            }
                            project.testExecutions = [execution, ...(project.testExecutions || [])]
                            found = true
                            break
                        }
                    }
                    if (found) break
                }

                summary.push({ displayId, success: found, error: found ? undefined : 'Not found' })
            }

            await writeProjects(projects)
            res.json({ success: true, results: summary })
        } catch (e: any) {
            res.status(500).json({ error: 'Batch operation failed.', detail: e.message })
        }
    })

    // ── GET /api/executions ── list executions with optional filtering ───────
    server.get('/api/executions', async (req: any, res: any) => {
        try {
            const projects = await readProjects()
            const projectId = req.query.projectId as string | undefined
            const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 1000)

            // Collect all matching executions, then sort and slice.
            // Pre-filter by projectId to avoid building a huge intermediate array.
            const all: any[] = []
            for (const project of projects) {
                if (projectId && project.id !== projectId) continue
                for (const ex of (project.testExecutions || [])) {
                    all.push({ ...ex, projectId: project.id, projectName: project.name })
                }
            }

            all.sort((a, b) => b.executedAt - a.executedAt)
            res.json(all.slice(0, limit))
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    if (serverInstance) return // already running

    const tryListen = (p: number) => {
        const instance = server.listen(p, () => {
            console.log(`[QAssistant] Automation API running on port ${p}`)
            serverInstance = instance

            // Track keep-alive sockets so we can destroy them on shutdown
            instance.on('connection', (socket: any) => {
                openSockets.add(socket)
                socket.once('close', () => openSockets.delete(socket))
            })
        })

        instance.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                console.warn(`[QAssistant] Port ${p} in use, trying ${p + 1}...`)
                instance.close()
                tryListen(p + 1)
            } else {
                console.error('[QAssistant] API server error:', err.message)
            }
        })
    }

    tryListen(port)
}

export function stopServer() {
    if (serverInstance) {
        // Destroy all open keep-alive connections immediately so the port is freed
        // synchronously rather than waiting for socket idle timeouts.
        for (const socket of openSockets) {
            try { socket.destroy() } catch { /* ignore */ }
        }
        openSockets.clear()
        serverInstance.close(() => {
            console.log('[QAssistant] Automation API stopped.')
        })
        serverInstance = null
    }
}
