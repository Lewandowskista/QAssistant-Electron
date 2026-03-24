import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GeminiService } from './gemini'
import { sanitizeToonList } from './toon'

vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: class {
        getGenerativeModel = vi.fn()
    },
}))

const minimalProject = {
    name: 'Demo Project',
    description: 'QA project',
    environments: [],
    tasks: [],
    checklists: [],
    testDataGroups: [],
    sapCommerce: {
        enabled: false,
        environments: [],
    },
}

function createService(): GeminiService & Record<string, any> {
    return new GeminiService('test-key') as GeminiService & Record<string, any>
}

describe('GeminiService TOON prompts', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('does not claim to analyze unseen images in issue analysis prompts', () => {
        const { user } = GeminiService.buildToonPrompt({
            title: 'Checkout throws an error',
            status: 'open',
            priority: 'high',
            attachmentUrls: ['one.png', 'two.png'],
        }, [], {
            ...minimalProject,
            contextTasks: [
                { title: 'Related task', issueType: 'bug', labels: 'checkout', description: 'Existing context' },
            ],
        })

        expect(user).toContain('attachment_image_count:2')
        expect(user).not.toContain('@media:')
        expect(user).not.toContain('analyze following visual content')
    })

    it('serializes standup prompt collections instead of raw JSON blobs', async () => {
        const service = createService()
        const executeWithFallback = vi.fn().mockResolvedValue('ok')
        service.executeWithFallback = executeWithFallback

        await service.generateStandupSummary({
            projectName: 'Demo Project',
            date: '2026-03-24',
            readyForQa: 2,
            blocked: 1,
            failedTests: 3,
            overdueTasks: 1,
            recentRuns: [{ planName: 'Smoke', passed: 8, total: 10 }],
            recentlyVerified: ['Checkout cart fix'],
            highPriorityOpen: ['Pricing regression'],
        })

        const [prompt, , , , , , feature, telemetry] = executeWithFallback.mock.calls[0]
        expect(feature).toBe('standup_summary')
        expect(prompt).toContain('recent_runs[')
        expect(prompt).toContain('recently_verified[')
        expect(prompt).toContain('high_priority_open[')
        expect(prompt).not.toContain('recent_test_runs:')
        expect(telemetry).toEqual(expect.objectContaining({
            recent_runs: 1,
            recently_verified: 1,
            high_priority_open: 1,
        }))
    })

    it('wraps copilot history turns as TOON chat_turn envelopes', async () => {
        const service = createService()
        let capturedHistory: Array<{ parts: Array<{ text: string }> }> = []
        let capturedSystemInstruction = ''
        const sendMessage = vi.fn().mockResolvedValue({
            response: {
                text: () => 'ok',
                usageMetadata: {},
            },
        })

        service.buildModelSequence = () => ['mock-model']
        service.getModel = (_modelName: string, _temperature: number, _maxOutputTokens: number, systemInstruction?: string) => ({
            startChat: ({ history }: { history: Array<{ parts: Array<{ text: string }> }> }) => {
                capturedSystemInstruction = systemInstruction || ''
                capturedHistory = history
                return { sendMessage }
            },
        })

        await service.chat(
            'How do we repro this?',
            [
                { role: 'user', content: 'raw:history|{oops}' },
                { role: 'assistant', content: 'Try checkout.' },
            ],
            'qa',
            minimalProject,
        )

        expect(capturedHistory).toHaveLength(2)
        expect(capturedHistory[0].parts[0].text).toMatch(/^chat_turn\{/)
        expect(capturedHistory[0].parts[0].text).not.toContain('raw:history|{oops}')
        expect(capturedSystemInstruction).not.toContain('deep SAP Commerce knowledge')
        expect(capturedSystemInstruction).toContain('do_not_assume_SAP_Commerce_without_explicit_context')
        expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('user_request{'))
    })

    it('sanitizes duplicate bug component lists through the TOON helper', async () => {
        const service = createService()
        const executeWithFallback = vi.fn().mockResolvedValue('[]')
        service.executeWithFallback = executeWithFallback

        await service.findDuplicateBugs(
            'Broken cart drawer',
            'Drawer crashes on open',
            'Open cart drawer from mini cart',
            ['cart:drawer', 'ui|panel'],
            [
                {
                    id: 'BUG-1',
                    title: 'Mini cart issue',
                    description: 'Cart panel does not render',
                    components: ['cart:drawer', 'ui|panel'],
                },
            ],
        )

        const [prompt, , , , , , feature] = executeWithFallback.mock.calls[0]
        expect(feature).toBe('duplicate_bug_detection')
        expect(prompt).toContain(`components:${sanitizeToonList(['cart:drawer', 'ui|panel'], 24, 8)}`)
    })

    it('limits PR patch payloads to the top eight changed files', async () => {
        const service = createService()
        const executeWithFallback = vi.fn().mockResolvedValue('{}')
        service.executeWithFallback = executeWithFallback

        const files = Array.from({ length: 10 }, (_, index) => ({
            filename: `src/file-${index}.ts`,
            status: 'modified',
            additions: index + 1,
            deletions: index,
            changes: 10 - index,
            patch: `patch ${index}`,
        }))

        await service.analyzePullRequest(
            {
                number: 42,
                title: 'Adjust checkout rules',
                description: 'Touches checkout validation paths.',
                baseBranch: 'main',
                headBranch: 'feature/checkout',
                ciStatus: 'passing',
                mergeableState: 'clean',
                files,
                reviews: [{ user: 'QA', state: 'APPROVED', body: 'Looks good.' }],
                comments: [{ user: 'Dev', body: 'Please retest totals.', createdAt: '2026-03-24T10:00:00Z' }],
            },
            [
                {
                    id: 'TC-1',
                    title: 'Checkout total validation',
                    sapModule: 'cart:drawer',
                    components: ['pricing:engine'],
                    tags: ['regression|checkout'],
                },
            ],
            minimalProject,
        )

        const [prompt, , , , , , feature, telemetry] = executeWithFallback.mock.calls[0]
        expect(feature).toBe('pr_analysis')
        expect((prompt.match(/filename:/g) ?? [])).toHaveLength(10)
        expect((prompt.match(/patch:/g) ?? [])).toHaveLength(8)
        expect(prompt).toContain(`components:${sanitizeToonList(['pricing:engine'], 24, 8)}`)
        expect(prompt).toContain(`tags:${sanitizeToonList(['regression|checkout'], 24, 8)}`)
        expect(telemetry).toEqual(expect.objectContaining({
            file_count: 10,
            file_patches: 8,
            test_case_count: 1,
        }))
    })

    it('uses focused reference excerpts for claim verification payloads', async () => {
        const service = createService()
        const executeWithFallback = vi.fn().mockResolvedValue('[]')
        service.executeWithFallback = executeWithFallback

        const chunkContent = `${'x'.repeat(2400)}needle context${'y'.repeat(2400)}`
        await service.verifyClaims(
            [{ claimText: 'needle context', claimType: 'factual' }],
            [{ id: 'chunk-1', content: chunkContent }],
        )

        const [prompt, , , , , , feature] = executeWithFallback.mock.calls[0]
        expect(feature).toBe('claim_verification')
        expect(prompt).toContain('needle context')
        expect(prompt.length).toBeLessThan(2600)
        expect(prompt).not.toContain('x'.repeat(1900))
    })
})
