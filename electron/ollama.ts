import { log } from './logger'
import { NimService } from './nim'
import type { ModelHealthEntry } from './nim'
import { SAP_COMMERCE_CONTEXT_BLOCK } from './sapCommerceContext'

/**
 * Ollama provider — fully local inference, no data leaves the machine.
 *
 * Ollama exposes an OpenAI-compatible surface at /v1/chat/completions, so this reuses every
 * prompt builder, TOON context assembler and response parser in `NimService` (the shared
 * OpenAI-compatible base) and overrides only the transport hooks:
 *
 *  - endpoint / headers  : localhost, no Authorization header
 *  - timeouts            : minutes, not seconds — local generation runs ~32 tok/s on Apple silicon
 *  - request body        : adds `reasoning_effort`, which is mandatory (see below)
 *  - model sequence      : locally installed models only, never the NIM cloud allowlist
 *
 * ## Why reasoning_effort is not optional
 *
 * gpt-oss is a reasoning model. Left unconstrained it can spend its entire output budget on
 * chain-of-thought and return `content: ""` with the text stranded in `message.reasoning`.
 * Measured on an M1 Pro against the real generateTestCases prompt, 1 run in 3 came back empty
 * and runs took 102-151s. With `reasoning_effort` set, the same prompt returned complete,
 * schema-valid output in 36s ("low") and 85s ("medium"). The base class additionally treats an
 * empty response as a failed attempt so a bad roll falls through to the next candidate model.
 */

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434'

/** Default model. Chosen for this workload: MoE (~3.6B active of 20B) so it generates fast, 128K context, 13GB on disk. */
export const OLLAMA_DEFAULT_MODEL = 'gpt-oss:20b'

/**
 * Preference order when the caller does not pin a model. Only used to rank models that are
 * actually installed — nothing here is ever requested unless `listAvailableModels` saw it.
 */
export const OLLAMA_PREFERRED_MODELS = [
    'gpt-oss:20b',
    'qwen3.6:35b-a3b-coding-nvfp4',
    'qwen3.6:35b-a3b-coding',
    'qwen3.6:27b-nvfp4',
    'qwen3.8:27b-nvfp4',
    'granite4.2:8b',
    'gpt-oss:120b',
]

/** Model-id fragments that identify non-chat models, which must not appear in the picker. */
const OLLAMA_EXCLUDE_KEYWORDS = [
    'embed', 'rerank', 'nomic-embed', 'bge-', 'e5-', 'minilm',
    'moondream', 'llava', 'whisper', 'tts', 'guard',
]

/**
 * Reasoning effort per feature.
 *
 * "low" keeps latency down and is sufficient for short, tightly-specified outputs.
 * "medium" produced measurably richer results on test generation (6 cases vs 3, including the
 * positive/negative variants the prompt's @rules ask for) and is worth the extra ~50s there.
 */
const REASONING_EFFORT: Record<string, 'low' | 'medium' | 'high'> = {
    test_generation: 'medium',
    pr_analysis: 'medium',
    issue_analysis: 'medium',
    project_analysis: 'medium',
    criticality: 'medium',
    chat: 'low',
    suggestions: 'low',
    smoke_subset: 'low',
    claim_extraction: 'low',
    claim_verification: 'low',
    dimension_scoring: 'low',
    standup: 'low',
    duplicate_bugs: 'low',
    rerank: 'low',
}
const DEFAULT_REASONING_EFFORT: 'low' | 'medium' | 'high' = 'low'

/**
 * Per-request deadlines. Local inference is far slower than a hosted API: an 8K-token prompt
 * costs ~18s of prefill cold and generation runs ~32 tok/s, so a large test-generation call is
 * minutes, not seconds. These are abort ceilings, not expected durations.
 */
const TIMEOUT_MS: Record<string, number> = {
    chat: 300_000,
    smoke_subset: 180_000,
    suggestions: 300_000,
    criticality: 600_000,
    issue_analysis: 600_000,
    project_analysis: 600_000,
    pr_analysis: 900_000,
    test_generation: 900_000,
    claim_extraction: 900_000,
    claim_verification: 900_000,
    dimension_scoring: 900_000,
}
const DEFAULT_TIMEOUT_MS = 600_000

/** Latency above which a local model is reported as degraded (ms). Cold model load dominates. */
const DEGRADED_LATENCY_MS = 30_000

export interface OllamaModelInfo {
    name: string
    sizeBytes: number
    parameterSize?: string
    quantization?: string
    family?: string
}

export class OllamaService extends NimService {
    private baseUrl: string

    /**
     * @param baseUrl Ollama host. Empty/undefined falls back to the local default. Ollama needs
     *                no credential, so the provider is configured by URL alone.
     */
    constructor(baseUrl?: string) {
        // The base class stores this as `apiKey`; Ollama has no key, so it stays empty and no
        // Authorization header is ever sent (see requestHeaders).
        super('')
        const trimmed = (baseUrl ?? '').trim().replace(/\/+$/, '')
        this.baseUrl = trimmed || OLLAMA_DEFAULT_BASE_URL
        this.preferredModel = OLLAMA_DEFAULT_MODEL
    }

    // ── Transport hooks ──────────────────────────────────────────────────────

    protected get providerTag(): string { return 'Ollama' }

    protected chatCompletionsUrl(): string { return `${this.baseUrl}/v1/chat/completions` }

    protected requestHeaders(): Record<string, string> {
        // No Authorization: Ollama is unauthenticated and rejects nothing, but sending a bogus
        // bearer token would be misleading in logs and proxies.
        return { 'Content-Type': 'application/json' }
    }

    protected requestTimeoutMs(feature: string): number {
        return TIMEOUT_MS[feature] ?? DEFAULT_TIMEOUT_MS
    }

    protected decorateRequestBody(body: Record<string, any>, feature: string): void {
        body.reasoning_effort = REASONING_EFFORT[feature] ?? DEFAULT_REASONING_EFFORT
    }

    protected extractResponseContent(data: any): string {
        const message = data?.choices?.[0]?.message
        const content = typeof message?.content === 'string' ? message.content : ''
        // Some local builds leak an unterminated <think> block into content instead of routing it
        // to `reasoning`; strip it so the JSON parsers downstream see only the answer.
        const stripped = content.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '')
        const cleaned = (stripped.trim() ? stripped : content).trim()
        if (!cleaned && typeof message?.reasoning === 'string' && message.reasoning.trim()) {
            // Deliberately do NOT substitute reasoning for the answer — it is chain-of-thought,
            // not output. Log it so the cause is visible, and let the base class retry.
            log.warn(`[Ollama] model produced ${message.reasoning.length} chars of reasoning but empty content; treating as failed attempt`)
        }
        return cleaned
    }

    /**
     * Hoist the static SAP Commerce block to the front of the system prompt before dispatch.
     *
     * llama.cpp/Ollama reuse the KV cache only across an identical prompt *prefix*. The shared
     * prompt builders place the 29.5KB (~7,400 token) SAP block inside the user message, behind
     * project-specific content, so every request re-processes it from scratch. Measured on an
     * M1 Pro: 18.5s cold prefill vs 2.3s once the prefix is stable — ~16s saved per call.
     *
     * The block is a static template with no interpolation, so relocating it from the user
     * message to the head of the system prompt is content-preserving. This is done here rather
     * than in the shared builders so Gemini and NIM prompt layout is not disturbed.
     */
    protected async executeWithFallback(
        systemPrompt: string,
        userPrompt: string,
        modelOverride?: string,
        temperature?: number,
        maxOutputTokens?: number,
        jsonMode?: boolean,
        feature?: string,
        telemetry?: Record<string, string | number | boolean | undefined>,
    ): Promise<string> {
        let system = systemPrompt
        let user = userPrompt
        const idx = user.indexOf(SAP_COMMERCE_CONTEXT_BLOCK)
        if (idx >= 0) {
            user = (user.slice(0, idx) + user.slice(idx + SAP_COMMERCE_CONTEXT_BLOCK.length)).replace(/\n{3,}/g, '\n\n')
            system = `${SAP_COMMERCE_CONTEXT_BLOCK}\n${system}`
        }
        return super.executeWithFallback(system, user, modelOverride, temperature, maxOutputTokens, jsonMode, feature, telemetry)
    }

    /**
     * Local models only. The base implementation would append NVIDIA's hosted allowlist, which
     * would make this provider silently attempt hundreds of models that cannot exist locally.
     */
    protected buildModelSequence(modelOverride?: string): string[] {
        return Array.from(new Set([
            modelOverride,
            this.preferredModel,
            OLLAMA_DEFAULT_MODEL,
        ].filter(Boolean) as string[]))
    }

    // ── Local model discovery ────────────────────────────────────────────────

    private static isNonChat(name: string): boolean {
        const lower = name.toLowerCase()
        return OLLAMA_EXCLUDE_KEYWORDS.some(kw => lower.includes(kw))
    }

    /** True when an Ollama daemon answers on the configured host. */
    async isReachable(): Promise<boolean> {
        try {
            const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) })
            return res.ok
        } catch {
            return false
        }
    }

    /** Installed chat models, preferred ones first. Empty array means none are pulled yet. */
    async listAvailableModels(): Promise<string[]> {
        const models = await this.listInstalledModels()
        const names = models.map(m => m.name).filter(n => !OllamaService.isNonChat(n))
        const rank = (n: string): number => {
            const i = OLLAMA_PREFERRED_MODELS.indexOf(n)
            if (i >= 0) return i
            // Match on the family when the exact tag differs (e.g. gpt-oss:20b-q4_K_M).
            const fam = OLLAMA_PREFERRED_MODELS.findIndex(p => n.startsWith(p.split(':')[0]))
            return fam >= 0 ? 100 + fam : 999
        }
        return names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    }

    /** Full metadata for installed models, for the settings picker. */
    async listInstalledModels(): Promise<OllamaModelInfo[]> {
        try {
            const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(15_000) })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json() as any
            const list: any[] = Array.isArray(data?.models) ? data.models : []
            return list.map(m => ({
                name: String(m?.name ?? ''),
                sizeBytes: Number(m?.size) || 0,
                parameterSize: m?.details?.parameter_size ? String(m.details.parameter_size) : undefined,
                quantization: m?.details?.quantization_level ? String(m.details.quantization_level) : undefined,
                family: m?.details?.family ? String(m.details.family) : undefined,
            })).filter(m => m.name)
        } catch (err) {
            log.warn(`[Ollama] could not list models at ${this.baseUrl}: ${String((err as any)?.message ?? err)}`)
            return []
        }
    }

    /**
     * Probe one model. Unlike a hosted API this may have to load several GB from disk, so the
     * first call after a restart is slow by nature — hence the 30s degraded threshold.
     */
    async probeModelHealth(modelName: string): Promise<ModelHealthEntry> {
        const start = performance.now()
        try {
            const res = await fetch(this.chatCompletionsUrl(), {
                method: 'POST',
                headers: this.requestHeaders(),
                body: JSON.stringify({
                    model: modelName,
                    messages: [{ role: 'user', content: 'hi' }],
                    max_tokens: 1,
                    stream: false,
                    reasoning_effort: 'low',
                }),
                signal: AbortSignal.timeout(120_000),
            })
            const latencyMs = Math.round(performance.now() - start)
            if (!res.ok) {
                const body = await res.text().catch(() => '')
                return { status: 'down', latencyMs, error: `HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}` }
            }
            return { status: latencyMs > DEGRADED_LATENCY_MS ? 'degraded' : 'up', latencyMs }
        } catch (err: any) {
            return { status: 'down', latencyMs: Math.round(performance.now() - start), error: String(err?.message ?? err) }
        }
    }

    /**
     * Probe sequentially, not in parallel. One Ollama host serves one model at a time; firing
     * concurrent requests at several multi-gigabyte models thrashes memory and evicts each load.
     */
    async probeAllModels(models: string[]): Promise<Record<string, ModelHealthEntry>> {
        const map: Record<string, ModelHealthEntry> = {}
        for (const m of models) {
            map[m] = await this.probeModelHealth(m).catch(() => ({ status: 'down' as const, latencyMs: 0, error: 'probe failed' }))
        }
        return map
    }
}
