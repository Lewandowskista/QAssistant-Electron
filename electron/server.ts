import electron from 'electron'
const { app } = electron as any
import crypto from 'crypto'
import express from 'express'
import type { Request, Response } from 'express'
import bodyParser from 'body-parser'
import * as oauth from './oauth'
import { log } from './logger'
import { enrichHandoffCompleteness, getReleaseQueue, PROJECT_SCHEMA_VERSION } from '../src/lib/collaboration'
import { getAllProjects, getProjectById, getProjectSummaries, saveAllProjects, runInTransaction } from './database'

// ── In-memory rate limiter — 100 requests per minute per IP ─────────────────
const _rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 100

function makeRateLimiter() {
    return function rateLimiter(req: any, res: any, next: any) {
        const ip: string = req.ip ?? req.socket?.remoteAddress ?? 'unknown'
        const now = Date.now()
        let entry = _rateLimitMap.get(ip)
        if (!entry || now >= entry.resetAt) {
            entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
            _rateLimitMap.set(ip, entry)
        }
        entry.count++
        if (entry.count > RATE_LIMIT_MAX) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
            res.set('Retry-After', String(retryAfter))
            return res.status(429).json({ error: 'Too many requests. Please slow down.' })
        }
        // Lazy eviction: clear stale entries once the map grows large
        if (_rateLimitMap.size > 500) {
            for (const [key, val] of _rateLimitMap) {
                if (now >= val.resetAt) _rateLimitMap.delete(key)
            }
        }
        next()
    }
}

/** Escape characters that have special meaning in HTML. */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

// Callback invoked after a successful OAuth exchange so main process can notify the renderer
let oauthCompleteCallback: ((provider: string, userInfo: any) => void) | null = null
export function setOAuthCompleteCallback(cb: (provider: string, userInfo: any) => void): void {
    oauthCompleteCallback = cb
}

let serverInstance: any = null
const openSockets = new Set<any>()
let currentPort = 5248
let requestedPort = 5248

export function getServerPort(): number {
    return currentPort
}

export function isServerRunning(): boolean {
    return !!serverInstance
}

/**
 * Timing-safe bearer-token check. Compares constant-length HMAC digests so
 * that the execution time does not depend on where the strings diverge.
 */
function isValidBearerToken(header: string | undefined, expected: string): boolean {
    if (!header || !header.startsWith('Bearer ')) return false
    const provided = header.slice('Bearer '.length)
    // Pad/hash both sides to the same fixed length before comparing
    const key = Buffer.from('qassistant-token-check')
    const a = crypto.createHmac('sha256', key).update(provided).digest()
    const b = crypto.createHmac('sha256', key).update(expected).digest()
    try {
        return crypto.timingSafeEqual(a, b)
    } catch {
        return false
    }
}

/** Build and wire up a fresh Express app. Called once per server start. */
function buildApp(apiToken: string, port: number) {
    const app_ = express()

    // ── CORS ────────────────────────────────────────────────────────────────
    // Allow only the Electron renderer (origin is 'null' for file:// / custom
    // protocols) and the exact port this server is bound to.
    app_.use((req: any, res: any, next: any) => {
        const origin = req.headers.origin as string | undefined
        if (!origin || origin === 'null') {
            res.header('Access-Control-Allow-Origin', 'null')
            res.header('Vary', 'Origin')
        } else {
            const allowed = new RegExp(`^https?://(localhost|127\\.0\\.0\\.1):${port}$`)
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

    app_.use(bodyParser.json({ limit: '1mb' }))
    app_.use(makeRateLimiter())

    // ── Helpers ─────────────────────────────────────────────────────────────
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

    const readProject = (projectId: string): any | null => {
        try {
            const project = getProjectById(projectId)
            if (!project) return null
            return {
                ...project,
                schemaVersion: project.schemaVersion || PROJECT_SCHEMA_VERSION,
                handoffPackets: (project.handoffPackets || []).map((packet: any) => enrichHandoffCompleteness(packet)),
            }
        } catch (e) {
            console.warn('[AutomationAPI] Failed to read project from SQLite:', e)
            return null
        }
    }

    const writeProjects = (projects: any[]): void => {
        saveAllProjects(projects)
    }

    /**
     * Atomic read-modify-write: reads all projects, runs `mutate`, and persists —
     * all inside one SQLite transaction so a concurrent renderer write can't be
     * lost between our read and our save. `mutate` returns the value to send back.
     */
    const mutateProjects = <T>(mutate: (projects: any[]) => T): T =>
        runInTransaction(() => {
            const projects = readProjects()
            const result = mutate(projects)
            writeProjects(projects)
            return result
        })

    // ── Public health endpoint (no auth) ─────────────────────────────────────
    app_.get('/health', (_req: Request, res: Response) => {
        res.json({
            status: 'active',
            version: app.getVersion(),
            uptime: Math.floor(process.uptime()),
            platform: process.platform
        })
    })

    // ── OAuth callback (public — no auth token required) ──────────────────────
    app_.get('/auth/callback', async (req: any, res: any) => {
        const { code, state, error } = req.query

        if (error) {
            const safeError = escapeHtml(String(error))
            res.status(400).send(`<html><body><h2>Authorization failed</h2><p>${safeError}</p><script>window.close()</script></body></html>`)
            return
        }

        if (!code || !state) {
            res.status(400).send('<html><body><h2>Invalid callback</h2><script>window.close()</script></body></html>')
            return
        }

        // Resolve the pending session by its state so overlapping auth flows
        // (e.g. GitHub then Linear) each match their own session.
        const pending = oauth.getPendingAuthByState(String(state))
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
            res.status(500).send('<html><body><h2>Connection failed</h2><p>Please close this tab and try again.</p><script>window.close()</script></body></html>')
        }
    })

    // ── Auth middleware for all protected routes ────────────────────────────────
    app_.use((req: any, res: any, next: any) => {
        if (isValidBearerToken(req.headers.authorization, apiToken)) {
            next()
        } else {
            res.status(401).json({ error: 'Unauthorized. Bearer token required.' })
        }
    })

    // ── GET /api/projects ─────────────────────────────────────────────────────
    app_.get('/api/projects', async (_req: any, res: any) => {
        try {
            res.json(getProjectSummaries())
        } catch (e: any) {
            res.status(500).json({ error: 'Failed to read project data.', detail: e.message })
        }
    })

    // ── GET /api/projects/:id ─────────────────────────────────────────────────
    app_.get('/api/projects/:id', async (req: any, res: any) => {
        try {
            const project = readProject(req.params.id)
            if (!project) return res.status(404).json({ error: 'Project not found.' })
            res.json(project)
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    app_.get('/api/projects/:id/release-readiness', async (req: any, res: any) => {
        try {
            const project = readProject(req.params.id)
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

    app_.get('/api/projects/:id/retest-queue', async (req: any, res: any) => {
        try {
            const project = readProject(req.params.id)
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

    app_.get('/api/projects/:id/traceability', async (req: any, res: any) => {
        try {
            const project = readProject(req.params.id)
            if (!project) return res.status(404).json({ error: 'Project not found.' })
            const tasks = (project.tasks || []).map((task: any) => {
                const linkedTests = (project.testPlans || [])
                    .flatMap((plan: any) => plan.testCases || [])
                    .filter((testCase: any) =>
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

    // ── GET /api/testcases ────────────────────────────────────────────────────
    app_.get('/api/testcases', async (req: any, res: any) => {
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
                        results.push({ ...tc, planId: plan.id, planName: plan.name, projectId: project.id, projectName: project.name })
                    }
                }
            }
            res.json(results)
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    // ── GET /api/testcases/:displayId ─────────────────────────────────────────
    app_.get('/api/testcases/:displayId', async (req: any, res: any) => {
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

    // ── POST /api/results ─────────────────────────────────────────────────────
    app_.post('/api/results', async (req: any, res: any) => {
        const { displayId, status, actualResult, notes } = req.body
        if (!displayId || !status) {
            return res.status(400).json({ error: 'Required fields: displayId, status' })
        }
        const validStatuses = ['passed', 'failed', 'blocked', 'skipped', 'not-run']
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` })
        }
        try {
            const found = mutateProjects((projects) => {
                for (const project of projects) {
                    for (const plan of (project.testPlans || [])) {
                        const tc = plan.testCases?.find((t: any) => t.displayId === displayId)
                        if (tc) {
                            tc.status = status
                            if (actualResult) tc.actualResult = actualResult
                            tc.updatedAt = Date.now()
                            project.testExecutions = [{
                                id: crypto.randomUUID(),
                                testCaseId: tc.id,
                                testPlanId: plan.id,
                                result: status,
                                actualResult: actualResult || 'Automated result',
                                notes: notes || 'Submitted via Automation API',
                                executedAt: Date.now(),
                                snapshotTestCaseTitle: tc.title
                            }, ...(project.testExecutions || [])]
                            return true
                        }
                    }
                }
                return false
            })
            if (!found) return res.status(404).json({ error: `Test case '${displayId}' not found.` })
            res.json({ success: true, message: `Result recorded for ${displayId}` })
        } catch (e: any) {
            res.status(500).json({ error: 'Failed to record result.', detail: e.message })
        }
    })

    // ── POST /api/results/batch ───────────────────────────────────────────────
    app_.post('/api/results/batch', async (req: any, res: any) => {
        const results: any[] = req.body?.results
        if (!Array.isArray(results) || results.length === 0) {
            return res.status(400).json({ error: 'Request body must have a "results" array.' })
        }
        try {
            const summary = mutateProjects((projects) => {
                const out: any[] = []
                for (const item of results) {
                    const { displayId, status, actualResult, notes } = item
                    if (!displayId || !status) {
                        out.push({ displayId, success: false, error: 'Missing displayId or status' })
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
                                project.testExecutions = [{
                                    id: crypto.randomUUID(),
                                    testCaseId: tc.id,
                                    testPlanId: plan.id,
                                    result: status,
                                    actualResult: actualResult || 'Automated result',
                                    notes: notes || 'Batch submitted via Automation API',
                                    executedAt: Date.now(),
                                    snapshotTestCaseTitle: tc.title
                                }, ...(project.testExecutions || [])]
                                found = true
                                break
                            }
                        }
                        if (found) break
                    }
                    out.push({ displayId, success: found, error: found ? undefined : 'Not found' })
                }
                return out
            })
            res.json({ success: true, results: summary })
        } catch (e: any) {
            res.status(500).json({ error: 'Batch operation failed.', detail: e.message })
        }
    })

    // ── GET /api/executions ───────────────────────────────────────────────────
    app_.get('/api/executions', async (req: any, res: any) => {
        try {
            const projects = readProjects()
            const projectId = req.query.projectId as string | undefined
            const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 1000)
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

    // ── POST /api/handoffs ────────────────────────────────────────────────────
    app_.post('/api/handoffs', async (req: any, res: any) => {
        try {
            const { projectId, taskId, ...payload } = req.body || {}
            if (!projectId || !taskId) return res.status(400).json({ error: 'Required fields: projectId, taskId' })
            const result = mutateProjects((projects) => {
                const project = projects.find((item: any) => item.id === projectId)
                if (!project) return { status: 404, body: { error: 'Project not found.' } }
                const task = (project.tasks || []).find((item: any) => item.id === taskId)
                if (!task) return { status: 404, body: { error: 'Task not found.' } }
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
                return { status: 201, body: handoff }
            })
            res.status(result.status).json(result.body)
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    app_.post('/api/handoffs/:id/acknowledge', async (req: any, res: any) => {
        try {
            const result = mutateProjects((projects) => {
                const target = projects.find((project: any) => (project.handoffPackets || []).some((packet: any) => packet.id === req.params.id))
                if (!target) return { status: 404, body: { error: 'Handoff not found.' } }
                const handoff = target.handoffPackets.find((packet: any) => packet.id === req.params.id)
                handoff.acknowledgedAt = Date.now()
                handoff.updatedAt = Date.now()
                const task = (target.tasks || []).find((item: any) => item.id === handoff.taskId)
                if (task) task.collabState = 'dev_acknowledged'
                return { status: 200, body: { success: true } }
            })
            res.status(result.status).json(result.body)
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    app_.post('/api/handoffs/:id/ready-for-qa', async (req: any, res: any) => {
        try {
            const result = mutateProjects((projects) => {
                const target = projects.find((project: any) => (project.handoffPackets || []).some((packet: any) => packet.id === req.params.id))
                if (!target) return { status: 404, body: { error: 'Handoff not found.' } }
                const handoff = target.handoffPackets.find((packet: any) => packet.id === req.params.id)
                handoff.updatedAt = Date.now()
                handoff.developerResponse = req.body?.developerResponse || handoff.developerResponse
                handoff.resolutionSummary = req.body?.resolutionSummary || handoff.resolutionSummary
                const task = (target.tasks || []).find((item: any) => item.id === handoff.taskId)
                if (task) task.collabState = 'ready_for_qa'
                return { status: 200, body: { success: true } }
            })
            res.status(result.status).json(result.body)
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    // ── GET /api/projects/:id/quality-gate ────────────────────────────────────
    app_.get('/api/projects/:id/quality-gate', async (req: any, res: any) => {
        try {
            const project = readProject(req.params.id)
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

    app_.post('/api/handoffs/:id/verify', async (req: any, res: any) => {
        try {
            const passed = !!req.body?.passed
            const notes = req.body?.notes
            if (!notes) return res.status(400).json({ error: 'Required field: notes' })
            const result = mutateProjects((projects) => {
                const target = projects.find((project: any) => (project.handoffPackets || []).some((packet: any) => packet.id === req.params.id))
                if (!target) return { status: 404, body: { error: 'Handoff not found.' } }
                const handoff = target.handoffPackets.find((packet: any) => packet.id === req.params.id)
                handoff.qaVerificationNotes = notes
                handoff.completedAt = passed ? Date.now() : undefined
                handoff.updatedAt = Date.now()
                const task = (target.tasks || []).find((item: any) => item.id === handoff.taskId)
                if (task) task.collabState = passed ? 'verified' : 'ready_for_dev'
                return { status: 200, body: { success: true, passed } }
            })
            res.status(result.status).json(result.body)
        } catch (e: any) {
            res.status(500).json({ error: e.message })
        }
    })

    return app_
}

export function startServer(apiToken: string, port: number = 3030): Promise<void> {
    if (serverInstance) {
        log.info('[QAssistant] API server already running, skipping restart.')
        return Promise.resolve()
    }
    requestedPort = port

    const app_ = buildApp(apiToken, port)

    return new Promise<void>((resolve, reject) => {
        const tryListen = (p: number) => {
            // Bind explicitly to localhost — do not expose the automation API on the LAN.
            const instance = app_.listen(p, '127.0.0.1', () => {
                log.info(`[QAssistant] Automation API running on 127.0.0.1:${p}`)
                currentPort = p
                serverInstance = instance

                instance.on('connection', (socket: any) => {
                    openSockets.add(socket)
                    socket.once('close', () => openSockets.delete(socket))
                })

                resolve()
            })

            instance.on('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    console.warn(`[QAssistant] Port ${p} in use, trying ${p + 1}...`)
                    instance.close()
                    tryListen(p + 1)
                } else {
                    console.error('[QAssistant] API server error:', err.message)
                    reject(err)
                }
            })
        }

        tryListen(port)
    })
}

export function stopServer() {
    if (serverInstance) {
        for (const socket of openSockets) {
            try { socket.destroy() } catch { /* ignore */ }
        }
        openSockets.clear()
        serverInstance.close(() => {
            log.info('[QAssistant] Automation API stopped.')
        })
        serverInstance = null
        currentPort = requestedPort
    }
}
