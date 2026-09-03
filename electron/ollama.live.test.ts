/**
 * Live integration test against a running Ollama daemon.
 *
 * Skipped unless OLLAMA_LIVE=1, because it needs the daemon plus a pulled model and takes
 * minutes. Run it after changing prompt construction or the Ollama transport:
 *
 *   OLLAMA_LIVE=1 npx vitest run electron/ollama.live.test.ts
 *
 * Override the model with OLLAMA_LIVE_MODEL (default gpt-oss:20b).
 */
import { describe, expect, it } from 'vitest'
import { OllamaService } from './ollama'

const LIVE = process.env['OLLAMA_LIVE'] === '1'
const MODEL = process.env['OLLAMA_LIVE_MODEL'] || 'gpt-oss:20b'

/** Mirrors the sanitized QaProjectAiContext the renderer sends, with SAP context enabled. */
const sapProject = {
    role: 'qa' as const,
    name: 'SAP Commerce QA',
    description: 'Storefront and OCC regression',
    aiProvider: 'ollama' as const,
    environments: [
        { id: 'e1', name: 'DEV01', type: 'dev', isDefault: false, hacUrl: 'https://dev01/hac', occBasePath: '/occ/v2' },
        { id: 'e2', name: 'STG01', type: 'staging', isDefault: true, hacUrl: 'https://stg01/hac', occBasePath: '/occ/v2' },
    ],
    tasks: [],
    testPlans: [],
    testDataGroups: [],
    checklists: [],
    sapCommerce: {
        enabled: true,
        environments: [
            { id: 'e1', name: 'DEV01', type: 'dev', isDefault: false, hacUrl: 'https://dev01/hac', occBasePath: '/occ/v2' },
        ],
    },
}

const issues = [
    {
        id: 'SAPQA-1187',
        title: 'ImpEx import of ApparelProduct rows fails silently when classification attribute is localized',
        status: 'open',
        priority: 'critical',
        issueType: 'Bug',
        labels: 'impex;classification;hac',
        description: 'ImpEx import via HAC for ApparelProduct with a localized classification attribute reports success but does not persist the attribute. Reproducible on DEV01 and STG01, SAP Commerce 2211.',
        sourceIssueId: 'SAPQA-1187',
    },
    {
        id: 'SAPQA-1221',
        title: 'OCC v2 cart voucher endpoint returns 500 when gift card partial payment is active',
        status: 'open',
        priority: 'critical',
        issueType: 'Bug',
        labels: 'occ;checkout;payment',
        description: 'POST /occ/v2/{baseSiteId}/users/current/carts/{cartId}/vouchers returns 500 when the cart has a partial gift card payment and a percentage voucher is applied.',
        sourceIssueId: 'SAPQA-1221',
    },
]

describe.skipIf(!LIVE)('Ollama live integration', () => {
    it('reaches the daemon and reports the model as installed', async () => {
        const svc = new OllamaService()
        await expect(svc.isReachable()).resolves.toBe(true)
        const models = await svc.listAvailableModels()
        expect(models).toContain(MODEL)
    }, 60_000)

    it('generates schema-valid SAP-aware test cases end to end', async () => {
        const svc = new OllamaService()
        const cases = await svc.generateTestCases(issues, 'Jira', sapProject, undefined, MODEL)

        expect(Array.isArray(cases)).toBe(true)
        expect(cases.length).toBeGreaterThan(0)

        for (const tc of cases) {
            // Every field the store persists must be a real string, never "undefined" or "[object Object]".
            for (const field of ['testCaseId', 'title', 'preConditions', 'steps', 'testData', 'expectedResult'] as const) {
                expect(typeof tc[field]).toBe('string')
                expect(tc[field]).not.toContain('[object Object]')
            }
            expect(tc.title.length).toBeGreaterThan(0)
            expect(tc.steps.length).toBeGreaterThan(0)
            // Priority must be mapped into the app's own scale, not the prompt's Blocker/Major wording.
            expect(['critical', 'high', 'medium', 'low']).toContain(tc.priority)
        }

        // Steps must be newline-separated. gpt-oss returns an array; a bare String() would
        // comma-join it, so this asserts the coercion actually ran.
        const multiStep = cases.find(tc => tc.steps.split(/\n/).length > 1)
        expect(multiStep, 'expected at least one case with multiple newline-separated steps').toBeDefined()

        // The injected SAP context should visibly shape the output.
        const blob = JSON.stringify(cases).toLowerCase()
        const sapTerms = ['impex', 'hac', 'occ', 'classification', 'voucher', 'apparelproduct', 'backoffice', 'catalog']
        expect(sapTerms.filter(t => blob.includes(t)).length).toBeGreaterThanOrEqual(3)

        // Issue traceability must survive.
        const ids = new Set(cases.map(tc => tc.sourceIssueId).filter(Boolean))
        expect([...ids].some(id => id === 'SAPQA-1187' || id === 'SAPQA-1221')).toBe(true)
    }, 900_000)

    it('answers a chat turn without leaking chain-of-thought', async () => {
        const svc = new OllamaService()
        const reply = await svc.chat('In one sentence, what is ImpEx used for in SAP Commerce?', [], 'qa', sapProject, MODEL)
        expect(typeof reply).toBe('string')
        expect(reply.trim().length).toBeGreaterThan(0)
        expect(reply).not.toContain('<think>')
    }, 300_000)
})
