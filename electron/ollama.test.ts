import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OllamaService, OLLAMA_DEFAULT_BASE_URL, OLLAMA_DEFAULT_MODEL } from './ollama'
import { NIM_TEXT_MODEL_ALLOWLIST } from './nim'
import { SAP_COMMERCE_CONTEXT_BLOCK } from './sapCommerceContext'
import { coerceMultilineText, coerceSingleLineText } from './aiFieldCoercion'

// Loosely typed so tests can reach the protected transport hooks for white-box assertions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function svc(baseUrl?: string): any {
    return new OllamaService(baseUrl)
}

/** Build a minimal OpenAI-compatible chat response. */
function chatResponse(content: string, extra: Record<string, unknown> = {}) {
    return {
        ok: true,
        json: async () => ({
            choices: [{ message: { content, ...extra } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
    }
}

describe('OllamaService configuration', () => {
    it('defaults to the local daemon when no host is given', () => {
        expect(svc().chatCompletionsUrl()).toBe(`${OLLAMA_DEFAULT_BASE_URL}/v1/chat/completions`)
        expect(svc('').chatCompletionsUrl()).toBe(`${OLLAMA_DEFAULT_BASE_URL}/v1/chat/completions`)
        expect(svc('   ').chatCompletionsUrl()).toBe(`${OLLAMA_DEFAULT_BASE_URL}/v1/chat/completions`)
    })

    it('honours a custom host and strips trailing slashes', () => {
        expect(svc('http://192.168.1.9:11434/').chatCompletionsUrl())
            .toBe('http://192.168.1.9:11434/v1/chat/completions')
        expect(svc('http://ollama.internal:11434///').chatCompletionsUrl())
            .toBe('http://ollama.internal:11434/v1/chat/completions')
    })

    it('sends no Authorization header, because local inference is unauthenticated', () => {
        const headers = svc().requestHeaders()
        expect(headers).toEqual({ 'Content-Type': 'application/json' })
        expect(Object.keys(headers).map(k => k.toLowerCase())).not.toContain('authorization')
    })

    it('never falls back to the NVIDIA cloud allowlist', () => {
        const sequence: string[] = svc().buildModelSequence()
        expect(sequence).toContain(OLLAMA_DEFAULT_MODEL)
        for (const hosted of NIM_TEXT_MODEL_ALLOWLIST) {
            expect(sequence).not.toContain(hosted)
        }
    })

    it('puts an explicit model override first', () => {
        expect(svc().buildModelSequence('granite4.2:8b')[0]).toBe('granite4.2:8b')
    })
})

describe('OllamaService reasoning effort', () => {
    // Without this, gpt-oss can spend its whole output budget on chain-of-thought and return
    // empty content — measured at 1 run in 3 on the real test-generation prompt.
    it('always sets reasoning_effort', () => {
        const body: Record<string, any> = {}
        svc().decorateRequestBody(body, 'unspecified')
        expect(body.reasoning_effort).toBeDefined()
    })

    it('uses medium for generative features and low for latency-sensitive ones', () => {
        const gen: Record<string, any> = {}
        svc().decorateRequestBody(gen, 'test_generation')
        expect(gen.reasoning_effort).toBe('medium')

        const chat: Record<string, any> = {}
        svc().decorateRequestBody(chat, 'chat')
        expect(chat.reasoning_effort).toBe('low')
    })

    it('allows minutes-long deadlines for local generation, unlike a hosted API', () => {
        const s = svc()
        expect(s.requestTimeoutMs('test_generation')).toBeGreaterThanOrEqual(600_000)
        expect(s.requestTimeoutMs('chat')).toBeGreaterThanOrEqual(120_000)
        // Unknown features must still get a generous default, not the NIM 120s.
        expect(s.requestTimeoutMs('something_new')).toBeGreaterThan(120_000)
    })
})

describe('OllamaService response extraction', () => {
    it('returns assistant content', () => {
        expect(svc().extractResponseContent({ choices: [{ message: { content: '{"ok":true}' } }] }))
            .toBe('{"ok":true}')
    })

    it('reports empty when the model produced only reasoning', () => {
        // Must NOT substitute reasoning for the answer: it is chain-of-thought, not output.
        const reasoning = 'We need to produce test cases. First consider...'
        const out = svc().extractResponseContent({ choices: [{ message: { content: '', reasoning } }] })
        expect(out).toBe('')
        expect(out).not.toContain('We need to produce')
    })

    it('strips a leaked <think> block rather than passing it to the JSON parser', () => {
        const raw = '<think>internal musing</think>{"testCases":[]}'
        expect(svc().extractResponseContent({ choices: [{ message: { content: raw } }] }))
            .toBe('{"testCases":[]}')
    })

    it('tolerates a missing message entirely', () => {
        expect(svc().extractResponseContent({})).toBe('')
        expect(svc().extractResponseContent({ choices: [] })).toBe('')
    })
})

describe('OllamaService SAP prefix hoisting', () => {
    // These spy on NimService.prototype, which is shared state — restore or later suites
    // inherit the stub.
    afterEach(() => { vi.restoreAllMocks() })

    it('moves the static SAP block to the head of the system prompt for KV cache reuse', async () => {
        const s = svc()
        let seenSystem = ''
        let seenUser = ''
        // Intercept at the base class so we observe exactly what would be dispatched.
        const proto = Object.getPrototypeOf(Object.getPrototypeOf(s))
        vi.spyOn(proto, 'executeWithFallback').mockImplementation(async (...args: unknown[]) => {
            seenSystem = args[0] as string
            seenUser = args[1] as string
            return 'ok'
        })

        const userPrompt = `project_issues[\n {id:X}\n]\n${SAP_COMMERCE_CONTEXT_BLOCK}\ntrailing_context{a:1}`
        await s.executeWithFallback('@role:sr_qa_engineer', userPrompt, undefined, 0.4, 100, true, 'test_generation')

        expect(seenSystem.startsWith(SAP_COMMERCE_CONTEXT_BLOCK)).toBe(true)
        expect(seenSystem).toContain('@role:sr_qa_engineer')
        // The block must be gone from the user turn, but the surrounding context preserved.
        expect(seenUser).not.toContain(SAP_COMMERCE_CONTEXT_BLOCK)
        expect(seenUser).toContain('project_issues[')
        expect(seenUser).toContain('trailing_context{a:1}')
    })

    it('leaves prompts without a SAP block untouched', async () => {
        const s = svc()
        let seenSystem = ''
        let seenUser = ''
        const proto = Object.getPrototypeOf(Object.getPrototypeOf(s))
        vi.spyOn(proto, 'executeWithFallback').mockImplementation(async (...args: unknown[]) => {
            seenSystem = args[0] as string
            seenUser = args[1] as string
            return 'ok'
        })

        await s.executeWithFallback('SYS', 'USER', undefined, 0.4, 100, false, 'chat')
        expect(seenSystem).toBe('SYS')
        expect(seenUser).toBe('USER')
    })
})

describe('OllamaService model discovery', () => {
    const realFetch = globalThis.fetch

    afterEach(() => { globalThis.fetch = realFetch })

    function mockTags(models: Array<Record<string, unknown>>) {
        globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ models }) })) as any
    }

    it('ranks the recommended model first and filters out non-chat models', async () => {
        mockTags([
            { name: 'nomic-embed-text:latest', size: 3e8 },
            { name: 'granite4.2:8b', size: 5e9 },
            { name: 'gpt-oss:20b', size: 1.3e10 },
        ])
        const names = await svc().listAvailableModels()
        expect(names[0]).toBe('gpt-oss:20b')
        expect(names).toContain('granite4.2:8b')
        expect(names).not.toContain('nomic-embed-text:latest')
    })

    it('surfaces size and quantisation detail for the picker', async () => {
        mockTags([{
            name: 'gpt-oss:20b',
            size: 13_000_000_000,
            details: { parameter_size: '20.9B', quantization_level: 'MXFP4', family: 'gptoss' },
        }])
        const [info] = await svc().listInstalledModels()
        expect(info).toMatchObject({
            name: 'gpt-oss:20b',
            sizeBytes: 13_000_000_000,
            parameterSize: '20.9B',
            quantization: 'MXFP4',
        })
    })

    it('reports unreachable rather than throwing when the daemon is down', async () => {
        globalThis.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') }) as any
        await expect(svc().isReachable()).resolves.toBe(false)
        await expect(svc().listAvailableModels()).resolves.toEqual([])
    })
})

describe('empty-response handling in the shared base', () => {
    const realFetch = globalThis.fetch
    afterEach(() => { globalThis.fetch = realFetch })

    it('treats an empty completion as a failed attempt instead of returning ""', async () => {
        // A reasoning model that burns its budget on chain-of-thought must not surface "" as a
        // successful answer — callers would then fail on unparseable JSON.
        globalThis.fetch = vi.fn(async () => chatResponse('', { reasoning: 'thinking...' })) as any
        const s = svc()
        await expect(
            s.executeWithFallback('SYS', 'USER', 'gpt-oss:20b', 0.4, 64, false, 'chat'),
        ).rejects.toBeDefined()
    })

    it('returns content when the model does answer', async () => {
        globalThis.fetch = vi.fn(async () => chatResponse('the answer')) as any
        const s = svc()
        await expect(
            s.executeWithFallback('SYS', 'USER', 'gpt-oss:20b', 0.4, 64, false, 'chat'),
        ).resolves.toBe('the answer')
    })
})

describe('field coercion across providers', () => {
    it('joins array testSteps with newlines instead of commas', () => {
        // Gemini returns a "\n"-joined string; gpt-oss returns an array. A bare String(array)
        // would comma-join and corrupt the stored steps.
        expect(coerceMultilineText(['1. Open HAC', '2. Run ImpEx']))
            .toBe('1. Open HAC\n2. Run ImpEx')
        expect(coerceMultilineText(['1. Open HAC', '2. Run ImpEx'])).not.toContain('HAC,2.')
    })

    it('passes strings through unchanged', () => {
        expect(coerceMultilineText('1. a\n2. b')).toBe('1. a\n2. b')
    })

    it('handles null, undefined and blank entries', () => {
        expect(coerceMultilineText(undefined)).toBe('')
        expect(coerceMultilineText(null)).toBe('')
        expect(coerceMultilineText(['a', '', null, 'b'])).toBe('a\nb')
    })

    it('extracts text from object-shaped steps some models emit', () => {
        expect(coerceMultilineText([{ step: 'Open HAC' }, { action: 'Run ImpEx' }]))
            .toBe('Open HAC\nRun ImpEx')
    })

    it('flattens multi-line values for single-line fields like titles', () => {
        expect(coerceSingleLineText(['Verify import', 'persists attribute']))
            .toBe('Verify import persists attribute')
    })
})

describe('OllamaService health probing', () => {
    const realFetch = globalThis.fetch
    beforeEach(() => { vi.restoreAllMocks() })
    afterEach(() => { globalThis.fetch = realFetch })

    it('probes models one at a time, since one host serves one model at a time', async () => {
        let concurrent = 0
        let maxConcurrent = 0
        globalThis.fetch = vi.fn(async () => {
            concurrent += 1
            maxConcurrent = Math.max(maxConcurrent, concurrent)
            await new Promise(r => setTimeout(r, 5))
            concurrent -= 1
            return { ok: true, text: async () => '' } as any
        }) as any

        const map = await svc().probeAllModels(['a:1', 'b:1', 'c:1'])
        expect(Object.keys(map)).toEqual(['a:1', 'b:1', 'c:1'])
        expect(maxConcurrent).toBe(1)
    })

    it('records a down status with the HTTP detail rather than throwing', async () => {
        globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, text: async () => 'model not found' })) as any
        const health = await svc().probeModelHealth('missing:1')
        expect(health.status).toBe('down')
        expect(health.error).toContain('404')
    })
})
