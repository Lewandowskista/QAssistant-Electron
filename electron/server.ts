// @ts-ignore
import electron from 'electron'
const { app } = electron as any
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'

const server = express()
server.use(cors())
server.use(bodyParser.json())

let authToken = 'qassistant-default-token'
let serverInstance: any = null

export function startServer(apiToken: string, port: number = 3030) {
    authToken = apiToken

    const getDataPath = (): string =>
        path.join(app.getPath('userData'), 'QAssistantData', 'projects.json')

    const readProjects = (): any[] => {
        try {
            if (!fs.existsSync(getDataPath())) return []
            return JSON.parse(fs.readFileSync(getDataPath(), 'utf8'))
        } catch {
            return []
        }
    }

    const writeProjects = (projects: any[]): void => {
        fs.writeFileSync(getDataPath(), JSON.stringify(projects, null, 2))
    }

    // ── Public health endpoint (no auth) ───────────────────────────────────
    server.get('/health', (_req, res) => {
        res.json({
            status: 'active',
            version: app.getVersion(),
            uptime: Math.floor(process.uptime()),
            platform: process.platform,
            dataPath: getDataPath()
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

    // ── GET /projects ── list all projects ─────────────────────────────────
    server.get('/projects', (_req: any, res: any) => {
        try {
            const projects = readProjects()
            res.json(projects.map((p: any) => ({
                id: p.id,
                name: p.name,
                taskCount: p.tasks?.length || 0,
                testPlanCount: p.testPlans?.length || 0,
                testCaseCount: p.testPlans?.flatMap((tp: any) => tp.testCases || []).length || 0
            })))
        } catch (e: any) {
            res.status(500).json({ error: 'Failed to read project data.', detail: e.message })
        }
    })

    // ── GET /projects/:id ── single project detail ──────────────────────────
    server.get('/projects/:id', (req: any, res: any) => {
        try {
            const projects = readProjects()
            const project = projects.find((p: any) => p.id === req.params.id)
            if (!project) return res.status(404).json({ error: 'Project not found.' })
            res.json(project)
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    // ── GET /testcases ── all test cases across all projects ────────────────
    server.get('/testcases', (req: any, res: any) => {
        try {
            const projects = readProjects()
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

    // ── GET /testcases/:displayId ── find by display ID (e.g. TC-001) ───────
    server.get('/testcases/:displayId', (req: any, res: any) => {
        try {
            const projects = readProjects()
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

    // ── POST /results ── submit a single test execution result ────────────
    server.post('/results', (req: any, res: any) => {
        const { displayId, status, actualResult, notes } = req.body

        if (!displayId || !status) {
            return res.status(400).json({ error: 'Required fields: displayId, status' })
        }

        const validStatuses = ['passed', 'failed', 'blocked', 'skipped', 'not-run']
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` })
        }

        try {
            const projects = readProjects()
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

            writeProjects(projects)
            res.json({ success: true, message: `Result recorded for ${displayId}` })
        } catch (e: any) {
            res.status(500).json({ error: 'Failed to record result.', detail: e.message })
        }
    })

    // ── POST /results/batch ── submit multiple results at once ────────────
    server.post('/results/batch', (req: any, res: any) => {
        const results: any[] = req.body?.results

        if (!Array.isArray(results) || results.length === 0) {
            return res.status(400).json({ error: 'Request body must have a "results" array.' })
        }

        try {
            const projects = readProjects()
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

            writeProjects(projects)
            res.json({ success: true, results: summary })
        } catch (e: any) {
            res.status(500).json({ error: 'Batch operation failed.', detail: e.message })
        }
    })

    // ── GET /executions ── list executions with optional filtering ──────────
    server.get('/executions', (req: any, res: any) => {
        try {
            const projects = readProjects()
            const projectId = req.query.projectId as string | undefined
            const limit = parseInt(req.query.limit as string || '100', 10)

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
        serverInstance.close()
        serverInstance = null
    }
}
