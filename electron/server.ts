// @ts-expect-error — electron default import may not match type declarations
import electron from 'electron'
const { app } = electron as any
import crypto from 'crypto'
import express from 'express'
import type { Request, Response } from 'express'
import bodyParser from 'body-parser'
import * as oauth from './oauth'
import { enrichHandoffCompleteness, getReleaseQueue, PROJECT_SCHEMA_VERSION } from '../src/lib/collaboration'
import { getAllProjects, saveAllProjects } from './database'

const server = express()

// CORS: allow only the Electron renderer (origin is 'null' for file:// / custom
// protocols) and the exact port the server is bound to. The regex below is kept
// as a fallback for browser-based automation clients that set a localhost origin.
server.use((req: any, res: any, next: any) => {
    const origin = req.headers.origin as string | undefined
    // Electron renderer sends no origin or 'null' — always allow
    if (!origin || origin === 'null') {
        res.header('Access-Control-Allow-Origin', 'null')
        res.header('Vary', 'Origin')
    } else {
        // For browser clients, restrict to the exact port this server is running on
        const allowed = new RegExp(`^https?://(localhost|127\\.0\\.0\\.1):${currentPort}$`)
        if (allowed.test(origin)) {
            res.header('Access-Control-Allow-Origin', origin)
            res.header('Vary', 'Origin')
        }
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
})

server.use(bodyParser.json({ limit: '1mb' }))

let authToken = crypto.randomBytes(32).toString('hex')
let serverInstance: any = null
const openSockets = new Set<any>()

// Callback invoked after a successful OAuth exchange so main process can notify the renderer
let oauthCompleteCallback: ((provider: string, userInfo: any) => void) | null = null
export function setOAuthCompleteCallback(cb: (provider: string, userInfo: any) => void): void {
    oauthCompleteCallback = cb
}

let currentPort = 5248
let requestedPort = 5248

export function getServerPort(): number {
    return currentPort
}

export function isServerRunning(): boolean {
    return !!serverInstance
}

export function startServer(apiToken: string, port: number = 3030) {
    // Prevent double-start (e.g. called from both IPC handler and app.whenReady)
    if (serverInstance) {
        console.log('[QAssistant] API server already running, skipping restart.')
        return
    }
    authToken = apiToken
    currentPort = port
    requestedPort = port

    const readProjects = (): any[] => {
        try {
            return getAllProjects().map((project: any) => ({
                ...project,
                schemaVersion: project.schemaVersion || PROJECT_SCHEMA_VERSION,
                handoffPackets: (project.handoffPackets || []).map((packet: any) => enrichHandoffCompleteness(packet)),
            }))
        } catch (e) {
            console.warn('[AutomationAPI] Failed to read projects from SQLite:', e)
            return []
        }
    }

    const writeProjects = (projects: any[]): void => {
        saveAllProjects(projects)
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

    // ── OAuth callback (public — no auth token required) ───────────────────
    server.get('/auth/callback', async (req: any, res: any) => {
        const { code, state, error } = req.query

        if (error) {
            res.status(400).send(`<html><body><h2>Authorization failed</h2><p>${error}</p><script>window.close()</script></body></html>`)
            return
        }

        if (!code || !state) {
            res.status(400).send('<html><body><h2>Invalid callback</h2><script>window.close()</script></body></html>')
            return
        }

        // Resolve provider from in-memory pending auth (GitHub/Linear don't echo it back)
        const pending = oauth.getPendingAuth()
        const provider = pending?.provider

        if (!provider) {
            res.status(400).send('<html><body><h2>No pending OAuth session</h2><script>window.close()</script></body></html>')
            return
        }

        try {
            const userInfo = await oauth.exchangeCode(provider as any, code as string, state as string, currentPort)
            if (oauthCompleteCallback) {
                oauthCompleteCallback(provider as string, userInfo)
            }
            res.send('<html><body><h2>Connected successfully!</h2><p>You can close this tab and return to QAssistant.</p><script>window.close()</script></body></html>')
        } catch (e: any) {
            console.error('[OAuth] Callback exchange failed:', e.message)
            res.status(500).send(`<html><body><h2>Connection failed</h2><p>${e.message}</p><script>window.close()</script></body></html>`)
        }
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
            const projects = readProjects()
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
            const projects = readProjects()
            const project = projects.find((p: any) => p.id === req.params.id)
            if (!project) return res.status(404).json({ error: 'Project not found.' })
            res.json(project)
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    server.get('/api/projects/:id/release-readiness', async (req: any, res: any) => {
        try {
            const projects = readProjects()
            const project = projects.find((item: any) => item.id === req.params.id)
            if (!project) return res.status(404).json({ error: 'Project not found.' })

            const queue = getReleaseQueue(project)
            res.json({
                projectId: project.id,
                projectName: project.name,
                readyForQaCount: queue.tasksReadyForQa.length,
                handoffsMissingEvidenceCount: queue.handoffsMissingEvidence.length,
                prsWaitingForRetestCount: queue.prsLinkedButNotRetested.length,
                failedVerificationCount: queue.failedVerificationsNeedingDev.length,
                isReady: queue.tasksReadyForQa.length === 0 && queue.handoffsMissingEvidence.length === 0,
            })
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    server.get('/api/projects/:id/retest-queue', async (req: any, res: any) => {
        try {
            const projects = readProjects()
            const project = projects.find((item: any) => item.id === req.params.id)
            if (!project) return res.status(404).json({ error: 'Project not found.' })

            const queue = getReleaseQueue(project)
            res.json({
                readyForQa: queue.tasksReadyForQa,
                missingEvidence: queue.handoffsMissingEvidence,
                prsWaitingForRetest: queue.prsLinkedButNotRetested,
                failedVerification: queue.failedVerificationsNeedingDev,
            })
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    server.get('/api/projects/:id/traceability', async (req: any, res: any) => {
        try {
            const projects = readProjects()
            const project = projects.find((item: any) => item.id === req.params.id)
            if (!project) return res.status(404).json({ error: 'Project not found.' })

            const tasks = (project.tasks || []).map((task: any) => {
                const linkedTests = (project.testPlans || []).flatMap((plan: any) => plan.testCases || []).filter((testCase: any) =>
                    testCase.sourceIssueId === task.sourceIssueId || testCase.linkedDefectIds?.includes(task.id)
                )
                const handoff = (project.handoffPackets || []).find((packet: any) => packet.taskId === task.id)
                return {
                    taskId: task.id,
                    taskTitle: task.title,
                    collabState: task.collabState || 'draft',
                    linkedTestCount: linkedTests.length,
                    linkedTestIds: linkedTests.map((testCase: any) => testCase.id),
                    handoffId: handoff?.id,
                    handoffComplete: handoff?.isComplete || false,
                }
            })

            res.json({ projectId: project.id, tasks })
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    // ── GET /api/testcases ── all test cases across all projects ─────────────
    server.get('/api/testcases', async (req: any, res: any) => {
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

    // ── GET /api/testcases/:displayId ── find by display ID (e.g. TC-001) ──────
    server.get('/api/testcases/:displayId', async (req: any, res: any) => {
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

    // ── POST /api/results/batch ── submit multiple results at once ───────────
    server.post('/api/results/batch', async (req: any, res: any) => {
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

    // ── GET /api/executions ── list executions with optional filtering ───────
    server.get('/api/executions', async (req: any, res: any) => {
        try {
            const projects = readProjects()
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

    server.post('/api/handoffs', async (req: any, res: any) => {
        try {
            const { projectId, taskId, ...payload } = req.body || {}
            if (!projectId || !taskId) return res.status(400).json({ error: 'Required fields: projectId, taskId' })

            const projects = readProjects()
            const project = projects.find((item: any) => item.id === projectId)
            if (!project) return res.status(404).json({ error: 'Project not found.' })
            const task = (project.tasks || []).find((item: any) => item.id === taskId)
            if (!task) return res.status(404).json({ error: 'Task not found.' })

            const handoff = enrichHandoffCompleteness({
                id: crypto.randomUUID(),
                taskId,
                type: payload.type || 'bug_handoff',
                createdByRole: payload.createdByRole || 'qa',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                summary: payload.summary || task.title,
                reproSteps: payload.reproSteps || task.description || '',
                expectedResult: payload.expectedResult || '',
                actualResult: payload.actualResult || '',
                environmentId: payload.environmentId,
                environmentName: payload.environmentName,
                severity: payload.severity || task.severity,
                linkedTestCaseIds: payload.linkedTestCaseIds || [],
                linkedExecutionRefs: payload.linkedExecutionRefs || [],
                linkedNoteIds: payload.linkedNoteIds || [],
                linkedFileIds: payload.linkedFileIds || [],
                linkedPrs: payload.linkedPrs || [],
                branchName: payload.branchName,
                releaseVersion: payload.releaseVersion,
            })

            project.handoffPackets = [handoff, ...(project.handoffPackets || [])]
            task.activeHandoffId = handoff.id
            task.collabState = 'ready_for_dev'
            task.lastCollabUpdatedAt = Date.now()

            writeProjects(projects)
            res.status(201).json(handoff)
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    server.post('/api/handoffs/:id/acknowledge', async (req: any, res: any) => {
        try {
            const projects = readProjects()
            const target = projects.find((project: any) => (project.handoffPackets || []).some((packet: any) => packet.id === req.params.id))
            if (!target) return res.status(404).json({ error: 'Handoff not found.' })
            const handoff = target.handoffPackets.find((packet: any) => packet.id === req.params.id)
            handoff.acknowledgedAt = Date.now()
            handoff.updatedAt = Date.now()
            const task = (target.tasks || []).find((item: any) => item.id === handoff.taskId)
            if (task) task.collabState = 'dev_acknowledged'
            writeProjects(projects)
            res.json({ success: true })
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    server.post('/api/handoffs/:id/ready-for-qa', async (req: any, res: any) => {
        try {
            const projects = readProjects()
            const target = projects.find((project: any) => (project.handoffPackets || []).some((packet: any) => packet.id === req.params.id))
            if (!target) return res.status(404).json({ error: 'Handoff not found.' })
            const handoff = target.handoffPackets.find((packet: any) => packet.id === req.params.id)
            handoff.updatedAt = Date.now()
            handoff.developerResponse = req.body?.developerResponse || handoff.developerResponse
            handoff.resolutionSummary = req.body?.resolutionSummary || handoff.resolutionSummary
            const task = (target.tasks || []).find((item: any) => item.id === handoff.taskId)
            if (task) task.collabState = 'ready_for_qa'
            writeProjects(projects)
            res.json({ success: true })
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    // ── GET /api/projects/:id/quality-gate ── CI/CD quality gate evaluation ──
    server.get('/api/projects/:id/quality-gate', async (req: any, res: any) => {
        try {
            const projects = readProjects()
            const project = projects.find((item: any) => item.id === req.params.id)
            if (!project) return res.status(404).json({ error: 'Project not found.' })

            const allTestCases: any[] = (project.testPlans || []).flatMap((tp: any) => tp.testCases || [])
            const allTasks: any[] = project.tasks || []
            const activeTasks = allTasks.filter((t: any) => !['done', 'canceled', 'duplicate'].includes(t.status))

            const passedCases = allTestCases.filter((tc: any) => tc.status === 'passed').length
            const passRate = allTestCases.length > 0 ? Math.round((passedCases / allTestCases.length) * 100) : 0
            const criticalBlockers = activeTasks.filter((t: any) => t.priority === 'critical' || t.severity === 'blocker').length
            const tasksWithLinkedTests = activeTasks.filter((t: any) =>
                allTestCases.some((tc: any) => tc.sourceIssueId === t.sourceIssueId || tc.linkedDefectIds?.includes(t.id))
            ).length
            const coveragePercent = activeTasks.length > 0 ? Math.round((tasksWithLinkedTests / activeTasks.length) * 100) : 100

            const enabledGates = (project.qualityGates || []).filter((g: any) => g.isEnabled)

            const gateResults = enabledGates.map((gate: any) => {
                const criteriaResults = (gate.criteria || []).map((criterion: any) => {
                    let actualValue = 0
                    switch (criterion.type) {
                        case 'pass_rate': actualValue = passRate; break
                        case 'critical_bugs': actualValue = criticalBlockers; break
                        case 'smoke_tests': {
                            const smokeCases = allTestCases.filter((tc: any) => tc.testType === 'smoke' || tc.tags?.includes('smoke'))
                            const smokePassed = smokeCases.filter((tc: any) => tc.status === 'passed').length
                            actualValue = smokeCases.length > 0 ? Math.round((smokePassed / smokeCases.length) * 100) : 0
                            break
                        }
                        case 'coverage': actualValue = coveragePercent; break
                        case 'blockers': actualValue = activeTasks.filter((t: any) => t.priority === 'critical').length; break
                    }
                    let passed = false
                    switch (criterion.operator) {
                        case 'gte': passed = actualValue >= criterion.value; break
                        case 'lte': passed = actualValue <= criterion.value; break
                        case 'eq': passed = actualValue === criterion.value; break
                    }
                    return { label: criterion.label, type: criterion.type, operator: criterion.operator, threshold: criterion.value, actualValue, passed }
                })
                return { gateId: gate.id, gateName: gate.name, passed: criteriaResults.every((r: any) => r.passed), criteria: criteriaResults }
            })

            const overallPassed = gateResults.length === 0 || gateResults.every((g: any) => g.passed)
            const status = overallPassed ? 'go' : gateResults.some((g: any) => g.passed) ? 'caution' : 'no-go'

            res.json({
                projectId: project.id,
                projectName: project.name,
                status,
                passed: overallPassed,
                metrics: { passRate, criticalBlockers, coveragePercent, totalTestCases: allTestCases.length, passedTestCases: passedCases },
                gates: gateResults,
            })
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    server.post('/api/handoffs/:id/verify', async (req: any, res: any) => {
        try {
            const passed = !!req.body?.passed
            const notes = req.body?.notes
            if (!notes) return res.status(400).json({ error: 'Required field: notes' })

            const projects = readProjects()
            const target = projects.find((project: any) => (project.handoffPackets || []).some((packet: any) => packet.id === req.params.id))
            if (!target) return res.status(404).json({ error: 'Handoff not found.' })
            const handoff = target.handoffPackets.find((packet: any) => packet.id === req.params.id)
            handoff.qaVerificationNotes = notes
            handoff.completedAt = passed ? Date.now() : undefined
            handoff.updatedAt = Date.now()
            const task = (target.tasks || []).find((item: any) => item.id === handoff.taskId)
            if (task) task.collabState = passed ? 'verified' : 'ready_for_dev'
            writeProjects(projects)
            res.json({ success: true, passed })
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    if (serverInstance) return // already running

    const tryListen = (p: number) => {
        const instance = server.listen(p, () => {
            console.log(`[QAssistant] Automation API running on port ${p}`)
            currentPort = p
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
        currentPort = requestedPort
    }
}
