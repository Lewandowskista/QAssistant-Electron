/**
 * Tests for the Express automation API server.
 *
 * Focuses on:
 *  - Auth middleware (401 on missing/invalid token)
 *  - Rate limiting (429 after exceeding the per-IP limit)
 *  - /health endpoint (always accessible, no auth required)
 *
 * The server module imports `electron` which is not available in the test
 * environment, so we stub it out via vi.mock before importing the module.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// ── Electron stub ─────────────────────────────────────────────────────────────
vi.mock('electron', () => ({
    default: { app: { getVersion: () => '1.0.0-test' } },
    app: { getVersion: () => '1.0.0-test' },
}))

// ── Database stubs (server.ts imports from database) ────────────────────────
vi.mock('./database', () => ({
    getAllProjects: () => [],
    getProjectById: () => null,
    getProjectSummaries: () => [],
    saveAllProjects: () => undefined,
}))

// ── OAuth stub ───────────────────────────────────────────────────────────────
vi.mock('./oauth', () => ({
    getPendingAuth: () => null,
    exchangeCode: async () => ({ userId: 'u1' }),
    generateAuthUrl: () => 'https://example.com/auth',
    revokeTokens: async () => undefined,
    isConnected: async () => false,
}))

// ── Logger stub ───────────────────────────────────────────────────────────────
vi.mock('./logger', () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { startServer, stopServer, getServerPort } from './server'

// Pick a port unlikely to conflict with anything running locally
const TEST_PORT = 19999

describe('Automation API server', () => {
    const token = 'test-secret-token-abc123'

    beforeAll(() => {
        startServer(token, TEST_PORT)
    })

    afterAll(() => {
        stopServer()
    })

    async function req(path: string, opts: RequestInit = {}) {
        return fetch(`http://127.0.0.1:${getServerPort()}${path}`, opts)
    }

    // ── /health ───────────────────────────────────────────────────────────────
    it('GET /health responds 200 without auth', async () => {
        const res = await req('/health')
        expect(res.status).toBe(200)
        const body = await res.json() as any
        expect(body.status).toBe('active')
    })

    // ── Auth middleware ───────────────────────────────────────────────────────
    it('GET /api/projects responds 401 without token', async () => {
        const res = await req('/api/projects')
        expect(res.status).toBe(401)
    })

    it('GET /api/projects responds 401 with wrong token', async () => {
        const res = await req('/api/projects', {
            headers: { Authorization: 'Bearer wrong-token' },
        })
        expect(res.status).toBe(401)
    })

    it('GET /api/projects responds 200 with correct token', async () => {
        const res = await req('/api/projects', {
            headers: { Authorization: `Bearer ${token}` },
        })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual([])
    })

    // ── Rate limiting ─────────────────────────────────────────────────────────
    it('returns 429 after exceeding 100 requests per minute', async () => {
        // Send 101 requests — the 101st should be rate-limited
        // We use /health (no auth needed) to keep the test fast and focused on the limiter
        let lastStatus = 200
        for (let i = 0; i < 101; i++) {
            const r = await req('/health')
            lastStatus = r.status
        }
        // The rate limiter kicks in after 100 requests from the same IP in one window
        expect(lastStatus).toBe(429)
    })
})
