import { log } from './logger'
import { normalizePullRequestAnalysisResult } from './prAnalysis'
import type { PullRequestAnalysisResult } from './prAnalysis'
import { sanitizeToonList, sanitizeToonScalar, ToonWriter } from './toon'
import { SAP_COMMERCE_CONTEXT_BLOCK } from './sapCommerceContext'
import { coerceMultilineText, coerceSingleLineText } from './aiFieldCoercion'

const NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1'

// Keywords in model IDs that identify non-chat model types to exclude.
// The NIM /v1/models endpoint returns all model types with no type field,
// so we filter by name patterns.
const NIM_EXCLUDE_KEYWORDS = [
    'embed', 'rerank', 'tts', 'asr', 'whisper', 'stable-diffusion', 'sdxl',
    'nv-embed', 'e5-', 'arctic-embed', 'llama-guard', 'guardrail',
    'retrieval', 'clip', 'kosmos', 'imagen', 'vlm', 'vision-language',
]

// Known chat/text-generation models on NVIDIA NIM (build.nvidia.com/models).
// Used as the fallback list when the API key has no access or the API is unreachable,
// and as a known-good reference for sorting. The live /v1/models response takes precedence.
export const NIM_TEXT_MODEL_ALLOWLIST = [
    // Meta Llama
    'meta/llama-3.1-405b-instruct',
    'meta/llama-3.1-70b-instruct',
    'meta/llama-3.1-8b-instruct',
    'meta/llama-3.2-3b-instruct',
    'meta/llama-3.2-1b-instruct',
    'meta/llama-3.3-70b-instruct',
    'meta/llama-3-70b-instruct',
    'meta/llama-3-8b-instruct',
    'meta/llama-2-70b-chat',
    'meta/llama-2-13b-chat',
    'meta/llama-2-7b-chat',
    'meta/codellama-70b-instruct',
    'meta/codellama-34b-instruct',
    'meta/codellama-13b-instruct',
    // Mistral
    'mistralai/magistral-small-2506',
    'mistralai/mistral-large-2-instruct',
    'mistralai/mistral-small-24b-instruct-2501',
    'mistralai/mistral-nemo-12b-instruct',
    'mistralai/mistral-nemo-minitron-8b-8k-instruct',
    'mistralai/mistral-nemotron',
    'mistralai/mistral-7b-instruct-v0.3',
    'mistralai/mixtral-8x22b-instruct-v0.1',
    'mistralai/mixtral-8x7b-instruct-v0.1',
    // DeepSeek
    'deepseek-ai/deepseek-r1',
    'deepseek-ai/deepseek-r1-distill-llama-70b',
    'deepseek-ai/deepseek-r1-distill-llama-8b',
    'deepseek-ai/deepseek-r1-distill-qwen-32b',
    'deepseek-ai/deepseek-r1-distill-qwen-14b',
    'deepseek-ai/deepseek-r1-distill-qwen-7b',
    'deepseek-ai/deepseek-v3',
    'deepseek-ai/deepseek-v4-flash',
    'deepseek-ai/deepseek-v4-pro',
    // Google Gemma
    'google/gemma-4-31b-it',
    'google/gemma-3-12b-it',
    'google/gemma-3-4b-it',
    'google/gemma-2-27b-it',
    'google/gemma-2-9b-it',
    'google/gemma-2-2b-it',
    'google/gemma-2b',
    'google/codegemma-1.1-7b',
    'google/codegemma-7b',
    // NVIDIA Nemotron
    'nvidia/llama-3.3-nemotron-super-49b-v1',
    'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    'nvidia/llama-3.1-nemotron-70b-instruct',
    'nvidia/llama-3.1-nemotron-nano-8b-v1',
    'nvidia/nemotron-4-340b-instruct',
    'nvidia/nemotron-mini-4b-instruct',
    'nvidia/nvidia-nemotron-nano-9b-v2',
    'nvidia/nemotron-3-super-120b-a12b',
    'nvidia/nemotron-3-nano-30b-a3b',
    // Qwen
    'qwen/qwen3-coder-480b-a35b-instruct',
    'qwen/qwen3-5-122b-a10b',
    'qwen/qwen3-next-80b-a3b-thinking',
    'qwen/qwen3-next-80b-a3b-instruct',
    'qwen/qwq-32b',
    'qwen/qwen2.5-coder-32b-instruct',
    'qwen/qwen2.5-72b-instruct',
    'qwen/qwen2.5-7b-instruct',
    // Microsoft Phi
    'microsoft/phi-4-mini-flash-reasoning',
    'microsoft/phi-4-mini-instruct',
    'microsoft/phi-3-medium-4k-instruct',
    'microsoft/phi-3-mini-4k-instruct',
    // Moonshot Kimi
    'moonshotai/kimi-k2-instruct',
    'moonshotai/kimi-k2-thinking',
    // IBM Granite
    'ibm/granite-3.3-8b-instruct',
    'ibm/granite-3.0-8b-instruct',
    'ibm/granite-3.0-3b-a800m-instruct',
    // Databricks / AI21
    'databricks/dbrx-instruct',
    'ai21labs/jamba-1.5-large-instruct',
    // Code models
    'bigcode/starcoder2-7b',
    'phind/phind-codellama-34b-v2-instruct',
    // Other instruction models
    'abacusai/dracarys-llama-3.1-70b-instruct',
    'upstage/solar-10.7b-instruct',
    'sarvamai/sarvam-m',
    'stepfun-ai/step-3-5-flash',
    'minimaxai/minimax-m2.5',
    'minimaxai/minimax-m2.7',
    'z-ai/glm4.7',
    'z-ai/glm5.1',
    'bytedance/seed-oss-36b-instruct',
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
]

// QA-use-case benchmark scores per model (0-100 scale).
// instruction: follows complex multi-step instructions reliably
// reasoning: logical/analytical reasoning (test case design, risk analysis)
// coding: code comprehension for PR analysis
// speed: subjective tier (higher = faster time-to-first-token)
// context: max context window in thousands of tokens (capped display at 200)
export interface NimModelMeta {
    instruction: number
    reasoning: number
    coding: number
    speed: number
    contextK: number   // context window in K tokens
    notes?: string     // short human-readable note
}

export const NIM_MODEL_META: Record<string, NimModelMeta> = {
    // ── NVIDIA Nemotron ──────────────────────────────────────────────────────
    'nvidia/llama-3.1-nemotron-ultra-253b-v1':    { instruction: 97, reasoning: 96, coding: 92, speed: 30, contextK: 128, notes: 'NVIDIA flagship, top reasoning' },
    'nvidia/llama-3.3-nemotron-super-49b-v1.5':   { instruction: 93, reasoning: 91, coding: 88, speed: 55, contextK: 128, notes: 'Super v1.5, balanced perf' },
    'nvidia/llama-3.3-nemotron-super-49b-v1':     { instruction: 92, reasoning: 90, coding: 87, speed: 55, contextK: 128 },
    'nvidia/llama-3.1-nemotron-70b-instruct':     { instruction: 90, reasoning: 88, coding: 85, speed: 58, contextK: 128 },
    'nvidia/llama-3.1-nemotron-nano-8b-v1':       { instruction: 74, reasoning: 70, coding: 72, speed: 88, contextK: 128, notes: 'Fast, light' },
    'nvidia/nvidia-nemotron-nano-9b-v2':          { instruction: 75, reasoning: 72, coding: 73, speed: 87, contextK: 128 },
    'nvidia/nemotron-4-340b-instruct':            { instruction: 91, reasoning: 89, coding: 86, speed: 28, contextK: 4, notes: 'Large, slow' },
    'nvidia/nemotron-mini-4b-instruct':           { instruction: 65, reasoning: 60, coding: 62, speed: 92, contextK: 4 },
    'nvidia/nemotron-3-super-120b-a12b':          { instruction: 87, reasoning: 85, coding: 82, speed: 48, contextK: 128 },
    'nvidia/nemotron-3-nano-30b-a3b':             { instruction: 78, reasoning: 75, coding: 74, speed: 78, contextK: 128 },
    // ── Meta Llama ───────────────────────────────────────────────────────────
    'meta/llama-3.1-405b-instruct':               { instruction: 94, reasoning: 93, coding: 90, speed: 28, contextK: 128, notes: 'Largest Llama, deep reasoning' },
    'meta/llama-3.3-70b-instruct':                { instruction: 91, reasoning: 90, coding: 87, speed: 60, contextK: 128, notes: 'Best Llama 3.3 balance' },
    'meta/llama-3.1-70b-instruct':                { instruction: 89, reasoning: 88, coding: 86, speed: 62, contextK: 128 },
    'meta/llama-3-70b-instruct':                  { instruction: 87, reasoning: 85, coding: 83, speed: 63, contextK: 8 },
    'meta/llama-3.1-8b-instruct':                 { instruction: 76, reasoning: 73, coding: 74, speed: 90, contextK: 128 },
    'meta/llama-3.2-3b-instruct':                 { instruction: 68, reasoning: 64, coding: 65, speed: 95, contextK: 128 },
    'meta/llama-3.2-1b-instruct':                 { instruction: 58, reasoning: 52, coding: 55, speed: 97, contextK: 128 },
    'meta/llama-3-8b-instruct':                   { instruction: 74, reasoning: 71, coding: 72, speed: 89, contextK: 8 },
    'meta/llama-2-70b-chat':                      { instruction: 78, reasoning: 76, coding: 72, speed: 60, contextK: 4 },
    'meta/llama-2-13b-chat':                      { instruction: 68, reasoning: 64, coding: 60, speed: 78, contextK: 4 },
    'meta/llama-2-7b-chat':                       { instruction: 60, reasoning: 56, coding: 55, speed: 88, contextK: 4 },
    'meta/codellama-70b-instruct':                { instruction: 80, reasoning: 78, coding: 91, speed: 55, contextK: 16, notes: 'Code-focused' },
    'meta/codellama-34b-instruct':                { instruction: 74, reasoning: 72, coding: 86, speed: 68, contextK: 16 },
    'meta/codellama-13b-instruct':                { instruction: 66, reasoning: 63, coding: 80, speed: 80, contextK: 16 },
    // ── Mistral ──────────────────────────────────────────────────────────────
    'mistralai/magistral-small-2506':             { instruction: 85, reasoning: 87, coding: 83, speed: 70, contextK: 32, notes: 'Reasoning-tuned' },
    'mistralai/mistral-large-2-instruct':         { instruction: 91, reasoning: 90, coding: 88, speed: 52, contextK: 128, notes: 'Best Mistral quality' },
    'mistralai/mistral-small-24b-instruct-2501':  { instruction: 84, reasoning: 83, coding: 82, speed: 68, contextK: 32 },
    'mistralai/mistral-nemo-12b-instruct':        { instruction: 80, reasoning: 78, coding: 77, speed: 78, contextK: 128 },
    'mistralai/mistral-nemo-minitron-8b-8k-instruct': { instruction: 74, reasoning: 72, coding: 73, speed: 85, contextK: 8 },
    'mistralai/mistral-nemotron':                 { instruction: 88, reasoning: 87, coding: 85, speed: 58, contextK: 128 },
    'mistralai/mistral-7b-instruct-v0.3':         { instruction: 72, reasoning: 70, coding: 70, speed: 86, contextK: 32 },
    'mistralai/mixtral-8x22b-instruct-v0.1':      { instruction: 87, reasoning: 85, coding: 84, speed: 48, contextK: 64 },
    'mistralai/mixtral-8x7b-instruct-v0.1':       { instruction: 80, reasoning: 78, coding: 78, speed: 65, contextK: 32 },
    // ── DeepSeek ─────────────────────────────────────────────────────────────
    'deepseek-ai/deepseek-r1':                    { instruction: 95, reasoning: 97, coding: 93, speed: 32, contextK: 128, notes: 'Top reasoner' },
    'deepseek-ai/deepseek-r1-distill-llama-70b':  { instruction: 88, reasoning: 91, coding: 88, speed: 55, contextK: 128 },
    'deepseek-ai/deepseek-r1-distill-qwen-32b':   { instruction: 86, reasoning: 89, coding: 86, speed: 60, contextK: 128 },
    'deepseek-ai/deepseek-r1-distill-llama-8b':   { instruction: 76, reasoning: 79, coding: 76, speed: 84, contextK: 128 },
    'deepseek-ai/deepseek-r1-distill-qwen-14b':   { instruction: 82, reasoning: 85, coding: 82, speed: 72, contextK: 128 },
    'deepseek-ai/deepseek-r1-distill-qwen-7b':    { instruction: 74, reasoning: 77, coding: 73, speed: 86, contextK: 128 },
    'deepseek-ai/deepseek-v3':                    { instruction: 93, reasoning: 92, coding: 91, speed: 42, contextK: 128, notes: 'Versatile, excellent instruction' },
    'deepseek-ai/deepseek-v4-flash':              { instruction: 88, reasoning: 87, coding: 88, speed: 70, contextK: 128 },
    'deepseek-ai/deepseek-v4-pro':                { instruction: 94, reasoning: 95, coding: 93, speed: 35, contextK: 128 },
    // ── Google Gemma ─────────────────────────────────────────────────────────
    'google/gemma-4-31b-it':                      { instruction: 86, reasoning: 85, coding: 84, speed: 62, contextK: 128 },
    'google/gemma-3-12b-it':                      { instruction: 80, reasoning: 78, coding: 77, speed: 76, contextK: 128 },
    'google/gemma-3-4b-it':                       { instruction: 72, reasoning: 70, coding: 69, speed: 88, contextK: 128 },
    'google/gemma-2-27b-it':                      { instruction: 82, reasoning: 80, coding: 79, speed: 65, contextK: 8 },
    'google/gemma-2-9b-it':                       { instruction: 74, reasoning: 72, coding: 71, speed: 84, contextK: 8 },
    'google/gemma-2-2b-it':                       { instruction: 60, reasoning: 56, coding: 58, speed: 94, contextK: 8 },
    'google/gemma-2b':                            { instruction: 52, reasoning: 48, coding: 50, speed: 96, contextK: 8 },
    'google/codegemma-1.1-7b':                    { instruction: 68, reasoning: 65, coding: 83, speed: 86, contextK: 8 },
    'google/codegemma-7b':                        { instruction: 65, reasoning: 62, coding: 80, speed: 86, contextK: 8 },
    // ── Qwen ─────────────────────────────────────────────────────────────────
    'qwen/qwen3-coder-480b-a35b-instruct':        { instruction: 88, reasoning: 88, coding: 96, speed: 38, contextK: 256, notes: 'Best coding model' },
    'qwen/qwen3-5-122b-a10b':                     { instruction: 90, reasoning: 91, coding: 88, speed: 50, contextK: 128 },
    'qwen/qwen3-next-80b-a3b-thinking':           { instruction: 89, reasoning: 93, coding: 86, speed: 52, contextK: 128, notes: 'Thinking mode' },
    'qwen/qwen3-next-80b-a3b-instruct':           { instruction: 88, reasoning: 88, coding: 85, speed: 60, contextK: 128 },
    'qwen/qwq-32b':                               { instruction: 85, reasoning: 91, coding: 83, speed: 58, contextK: 128, notes: 'QwQ reasoning model' },
    'qwen/qwen2.5-coder-32b-instruct':            { instruction: 82, reasoning: 82, coding: 93, speed: 60, contextK: 128, notes: 'Strong coder' },
    'qwen/qwen2.5-72b-instruct':                  { instruction: 88, reasoning: 87, coding: 85, speed: 55, contextK: 128 },
    'qwen/qwen2.5-7b-instruct':                   { instruction: 75, reasoning: 74, coding: 75, speed: 88, contextK: 128 },
    // ── Microsoft Phi ────────────────────────────────────────────────────────
    'microsoft/phi-4-mini-flash-reasoning':       { instruction: 78, reasoning: 82, coding: 76, speed: 86, contextK: 128, notes: 'Compact reasoner' },
    'microsoft/phi-4-mini-instruct':              { instruction: 76, reasoning: 74, coding: 75, speed: 89, contextK: 16 },
    'microsoft/phi-3-medium-4k-instruct':         { instruction: 74, reasoning: 73, coding: 73, speed: 82, contextK: 4 },
    'microsoft/phi-3-mini-4k-instruct':           { instruction: 65, reasoning: 62, coding: 65, speed: 90, contextK: 4 },
    // ── Moonshot Kimi ────────────────────────────────────────────────────────
    'moonshotai/kimi-k2-instruct':                { instruction: 92, reasoning: 93, coding: 92, speed: 42, contextK: 128, notes: 'Strong all-round' },
    'moonshotai/kimi-k2-thinking':                { instruction: 91, reasoning: 95, coding: 91, speed: 38, contextK: 128, notes: 'Thinking mode' },
    // ── IBM Granite ──────────────────────────────────────────────────────────
    'ibm/granite-3.3-8b-instruct':               { instruction: 76, reasoning: 74, coding: 73, speed: 87, contextK: 128 },
    'ibm/granite-3.0-8b-instruct':               { instruction: 73, reasoning: 71, coding: 71, speed: 87, contextK: 128 },
    'ibm/granite-3.0-3b-a800m-instruct':         { instruction: 63, reasoning: 58, coding: 62, speed: 93, contextK: 128 },
    // ── Others ───────────────────────────────────────────────────────────────
    'databricks/dbrx-instruct':                   { instruction: 83, reasoning: 81, coding: 82, speed: 50, contextK: 32 },
    'ai21labs/jamba-1.5-large-instruct':          { instruction: 84, reasoning: 82, coding: 80, speed: 52, contextK: 256, notes: '256K context' },
    'bigcode/starcoder2-7b':                      { instruction: 60, reasoning: 58, coding: 82, speed: 86, contextK: 16 },
    'phind/phind-codellama-34b-v2-instruct':      { instruction: 74, reasoning: 72, coding: 88, speed: 65, contextK: 16, notes: 'Code-focused' },
    'abacusai/dracarys-llama-3.1-70b-instruct':  { instruction: 87, reasoning: 86, coding: 85, speed: 58, contextK: 128 },
    'upstage/solar-10.7b-instruct':               { instruction: 76, reasoning: 74, coding: 72, speed: 82, contextK: 4 },
    'sarvamai/sarvam-m':                          { instruction: 70, reasoning: 68, coding: 65, speed: 84, contextK: 32 },
    'stepfun-ai/step-3-5-flash':                  { instruction: 82, reasoning: 83, coding: 80, speed: 72, contextK: 128 },
    'minimaxai/minimax-m2.5':                     { instruction: 83, reasoning: 82, coding: 80, speed: 62, contextK: 128 },
    'minimaxai/minimax-m2.7':                     { instruction: 85, reasoning: 84, coding: 82, speed: 58, contextK: 128 },
    'z-ai/glm4.7':                                { instruction: 80, reasoning: 79, coding: 78, speed: 68, contextK: 128 },
    'z-ai/glm5.1':                                { instruction: 82, reasoning: 81, coding: 80, speed: 65, contextK: 128 },
    'bytedance/seed-oss-36b-instruct':            { instruction: 84, reasoning: 83, coding: 82, speed: 62, contextK: 128 },
    'openai/gpt-oss-20b':                         { instruction: 82, reasoning: 81, coding: 81, speed: 70, contextK: 128 },
    'openai/gpt-oss-120b':                        { instruction: 90, reasoning: 90, coding: 89, speed: 45, contextK: 128 },
}

// Compute a QA composite score for ranking/suggestion purposes.
// Weights tuned for a QA assistant workload (test gen, issue analysis, PR review).
export function nimQaScore(meta: NimModelMeta): number {
    return Math.round(meta.instruction * 0.40 + meta.reasoning * 0.35 + meta.coding * 0.25)
}

// Per-feature output token limits
const MAX_TOKENS: Record<string, number> = {
    chat: 4096,
    issue_analysis: 4096,
    test_generation: 8192,
    criticality: 2048,
    suggestions: 2048,
    smoke_subset: 1024,
    project_analysis: 4096,
    pr_analysis: 3072,
    claim_extraction: 8192,
    claim_verification: 16384,
    dimension_scoring: 8192,
}

// Latency threshold above which a model is considered degraded (ms)
const DEGRADED_LATENCY_MS = 5000

export interface ModelHealthEntry {
    status: 'up' | 'degraded' | 'down'
    latencyMs: number
    error?: string
}

type PromptTelemetry = Record<string, string | number | boolean | undefined>

type QaContextProfile = {
    includeTrackedIssues?: boolean
    trackedIssuesMax?: number
    includeTestCoverage?: boolean
    includeChecklistAreas?: boolean
    includeTestDataDomains?: boolean
    includeSapContext?: boolean
    includeEnvironments?: boolean
}

type DevContextProfile = {
    includeTrackedWork?: boolean
    trackedWorkMax?: number
    includeHandoffs?: boolean
    handoffMax?: number
    includeEnvironments?: boolean
}

type NimUsage = {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
}

/**
 * NVIDIA NIM provider, and the shared base for any OpenAI-compatible chat backend.
 *
 * All prompt construction, TOON context assembly and response parsing live here and are
 * provider-neutral. Everything provider-specific is isolated behind the `protected` transport
 * hooks below (endpoint, headers, timeout, request-body shaping, content extraction, model
 * sequence), so a subclass only overrides those. `OllamaService` in ./ollama.ts does exactly
 * that — see that file before adding a third backend.
 */
export class NimService {
    protected apiKey: string
    protected preferredModel: string

    constructor(apiKey: string) {
        this.apiKey = apiKey
        this.preferredModel = NIM_TEXT_MODEL_ALLOWLIST[0]
    }

    // ── Transport hooks (override per provider) ──────────────────────────────

    /** Short tag used in log lines, e.g. "NIM" / "Ollama". */
    protected get providerTag(): string { return 'NIM' }

    /** Full URL of the OpenAI-compatible chat-completions endpoint. */
    protected chatCompletionsUrl(): string { return `${NIM_BASE_URL}/chat/completions` }

    /** Headers sent with every chat request. */
    protected requestHeaders(): Record<string, string> {
        return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }
    }

    /** Per-request abort deadline. Local backends need far longer than a hosted API. */
    protected requestTimeoutMs(_feature: string): number { return 120_000 }

    /** Last chance to add provider-specific fields to the request body. */
    protected decorateRequestBody(_body: Record<string, any>, _feature: string): void { /* no-op for NIM */ }

    /**
     * Pull the assistant text out of a chat-completions response.
     * Reasoning models put their chain-of-thought in a side channel and may leave `content`
     * empty; subclasses that enable reasoning must handle that.
     */
    protected extractResponseContent(data: any): string {
        return data?.choices?.[0]?.message?.content ?? ''
    }

    /** Returns true if a model ID looks like a non-chat model (embedding, reranking, etc.) */
    private static isNonChatModel(id: string): boolean {
        const lower = id.toLowerCase()
        return NIM_EXCLUDE_KEYWORDS.some(kw => lower.includes(kw))
    }

    /** List all chat/text-generation models available to this API key.
     *  Uses the live /v1/models response filtered by name patterns.
     *  Falls back to the full allowlist if the API is unreachable. */
    async listAvailableModels(): Promise<string[]> {
        try {
            const response = await fetch(`${NIM_BASE_URL}/models`, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(30_000),
            })
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }
            const data = await response.json() as any
            const models: any[] = data.data || []
            const liveIds = models
                .map((m: any) => String(m.id))
                .filter(id => !NimService.isNonChatModel(id))

            if (liveIds.length === 0) {
                return NIM_TEXT_MODEL_ALLOWLIST
            }

            // Sort: known allowlist models first (in allowlist order), then any new ones alphabetically
            const allowlistSet = new Set(NIM_TEXT_MODEL_ALLOWLIST)
            const known = NIM_TEXT_MODEL_ALLOWLIST.filter(id => liveIds.includes(id))
            const unknown = liveIds.filter(id => !allowlistSet.has(id)).sort()
            return [...known, ...unknown]
        } catch (err) {
            console.error('[NimService] Failed to list models, returning built-in list:', err)
            return NIM_TEXT_MODEL_ALLOWLIST
        }
    }

    /** Probe a single model with a 1-token completion to measure availability and latency */
    async probeModelHealth(modelName: string): Promise<ModelHealthEntry> {
        const start = performance.now()
        try {
            const response = await fetch(`${NIM_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [{ role: 'user', content: 'hi' }],
                    max_tokens: 1,
                    stream: false,
                }),
                signal: AbortSignal.timeout(15_000),
            })
            const latencyMs = Math.round(performance.now() - start)
            if (!response.ok) {
                return { status: 'down', latencyMs, error: `HTTP ${response.status}` }
            }
            if (latencyMs > DEGRADED_LATENCY_MS) {
                return { status: 'degraded', latencyMs }
            }
            return { status: 'up', latencyMs }
        } catch (err: any) {
            const latencyMs = Math.round(performance.now() - start)
            return { status: 'down', latencyMs, error: String(err?.message ?? err) }
        }
    }

    /** Probe all provided models in parallel */
    async probeAllModels(models: string[]): Promise<Record<string, ModelHealthEntry>> {
        const results = await Promise.allSettled(models.map(m => this.probeModelHealth(m)))
        const map: Record<string, ModelHealthEntry> = {}
        models.forEach((m, i) => {
            const r = results[i]
            map[m] = r.status === 'fulfilled' ? r.value : { status: 'down', latencyMs: 0, error: 'probe failed' }
        })
        return map
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    protected buildModelSequence(modelOverride?: string): string[] {
        return Array.from(new Set([
            modelOverride,
            this.preferredModel,
            ...NIM_TEXT_MODEL_ALLOWLIST,
        ].filter(Boolean) as string[]))
    }

    protected classifyError(status: number, msg: string): { isRateLimit: boolean; isUnavailable: boolean } {
        const s = `${status} ${msg}`.toLowerCase()
        return {
            isRateLimit: status === 429 || s.includes('rate_limit') || s.includes('rate limit') || s.includes('too many requests'),
            isUnavailable: status === 404 || status === 400 || s.includes('model not found') || s.includes('model_not_found') || s.includes('does not exist'),
        }
    }

    protected buildFinalErrorMessage(lastError: any): string {
        try {
            const msg = typeof lastError?.message === 'string' ? lastError.message : String(lastError ?? 'Unknown error')
            return msg.replace(/https?:\/\/[^\s]*/gi, '[url]').replace(/\n\s+at\s+.*/g, '')
        } catch {
            return 'Crash parsing NIM error'
        }
    }

    protected static logUsage(modelName: string, usage: NimUsage | undefined, feature: string, telemetry?: PromptTelemetry, tag = 'NIM'): void {
        const parts = Object.entries(telemetry || {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}=${v}`)
        const telStr = parts.length > 0 ? `${feature} | ${parts.join(' | ')}` : feature
        if (usage) {
            log.info(`[${tag}] ${modelName} | ${telStr} | prompt: ${usage.prompt_tokens ?? '?'} tokens, output: ${usage.completion_tokens ?? '?'} tokens, total: ${usage.total_tokens ?? '?'} tokens`)
        } else {
            log.info(`[${tag}] ${modelName} | ${telStr}`)
        }
    }

    protected async executeWithFallback(
        systemPrompt: string,
        userPrompt: string,
        modelOverride?: string,
        temperature = 0.7,
        maxOutputTokens = 8192,
        jsonMode = false,
        feature = 'unspecified',
        telemetry?: PromptTelemetry,
    ): Promise<string> {
        const models = this.buildModelSequence(modelOverride)
        let lastError: any

        for (const modelName of models) {
            try {
                const body: any = {
                    model: modelName,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    max_tokens: maxOutputTokens,
                    temperature,
                    top_p: temperature === 0 ? 1.0 : 0.9,
                    stream: false,
                }
                if (jsonMode) {
                    body.response_format = { type: 'json_object' }
                }
                this.decorateRequestBody(body, feature)

                const response = await fetch(this.chatCompletionsUrl(), {
                    method: 'POST',
                    headers: this.requestHeaders(),
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(this.requestTimeoutMs(feature)),
                })

                if (!response.ok) {
                    const errText = await response.text().catch(() => '')
                    const { isRateLimit, isUnavailable } = this.classifyError(response.status, errText)
                    if (isRateLimit || isUnavailable) {
                        console.warn(`[${this.providerTag}] model ${modelName} ${isRateLimit ? 'rate limited' : 'unavailable'}. Trying next fallback...`)
                        lastError = new Error(`HTTP ${response.status}: ${errText}`)
                        continue
                    }
                    lastError = new Error(`HTTP ${response.status}: ${errText}`)
                    continue
                }

                const data = await response.json() as any
                const content = this.extractResponseContent(data)

                // A model that returns no text is a failed attempt, not a success. Reasoning models
                // can burn the whole output budget on chain-of-thought and leave content empty;
                // treating that as a valid answer surfaces an unparseable "" to the caller.
                if (!content.trim()) {
                    console.warn(`[${this.providerTag}] model ${modelName} returned empty content for ${feature}. Trying next fallback...`)
                    lastError = new Error(`Model ${modelName} returned an empty response for ${feature}`)
                    continue
                }

                if (modelName !== this.preferredModel) {
                    log.info(`[${this.providerTag}] switching preferred model to ${modelName} after successful response`)
                    this.preferredModel = modelName
                }

                NimService.logUsage(modelName, data.usage, feature, telemetry, this.providerTag)
                return content
            } catch (err: any) {
                lastError = err
                const msg = String(err?.message ?? err)
                const { isRateLimit, isUnavailable } = this.classifyError(0, msg)
                if (isRateLimit || isUnavailable) {
                    console.warn(`[${this.providerTag}] model ${modelName} error: ${msg}. Trying next fallback...`)
                    continue
                }
                console.error(`[${this.providerTag}] model ${modelName} failed:`, msg)
                continue
            }
        }

        throw `${this.providerTag} API Error: ${this.buildFinalErrorMessage(lastError)}`
    }

    // ── Context helpers (shared with GeminiService via same TOON system) ──────

    private static sanitizeToonValue(value: string | null | undefined, maxLength = 500): string {
        return sanitizeToonScalar(value, maxLength)
    }


    private static pushCommentList(writer: ToonWriter, name: string, comments: any[], maxComments = 5): number {
        const visible = comments.slice(0, maxComments)
        if (visible.length === 0) return 0
        writer.list(name, visible, (list, comment) => {
            list.itemObject([
                { key: 'author', value: comment.authorName, maxLength: 80 },
                { key: 'date', value: comment.createdAt ? new Date(comment.createdAt).toISOString().split('T')[0] : '', maxLength: 32 },
                { key: 'body', value: comment.body, maxLength: 240 },
            ])
        })
        return visible.length
    }

    private static resolvePromptWriter(target: ToonWriter | string[]): { writer: ToonWriter; flush: () => void } {
        if (Array.isArray(target)) {
            const writer = new ToonWriter()
            return { writer, flush: () => { const r = writer.toString(); if (r) target.push(r) } }
        }
        return { writer: target, flush: () => undefined }
    }

    private static appendQaContext(target: ToonWriter | string[], project: any, profile: QaContextProfile | boolean = {}): PromptTelemetry {
        if (!project) return {}
        const normalizedProfile: QaContextProfile = typeof profile === 'boolean' ? { includeTrackedIssues: !profile } : profile
        const settings: Required<QaContextProfile> = {
            includeTrackedIssues: normalizedProfile.includeTrackedIssues ?? true,
            trackedIssuesMax: normalizedProfile.trackedIssuesMax ?? 25,
            includeTestCoverage: normalizedProfile.includeTestCoverage ?? true,
            includeChecklistAreas: normalizedProfile.includeChecklistAreas ?? true,
            includeTestDataDomains: normalizedProfile.includeTestDataDomains ?? true,
            includeSapContext: normalizedProfile.includeSapContext ?? true,
            includeEnvironments: normalizedProfile.includeEnvironments ?? true,
        }
        const telemetry: PromptTelemetry = {}
        const { writer, flush } = NimService.resolvePromptWriter(target)

        writer.object('qa_context', (context) => {
            context.field('project', project.name, { maxLength: 200 })
            context.field('project_desc', project.description, { maxLength: 300 })

            const activeEnv = project.environments?.find((e: any) => e.isDefault) ?? project.environments?.[0]
            if (activeEnv) {
                context.field('active_env', activeEnv.name, { maxLength: 100 })
                context.field('env_type', activeEnv.type, { maxLength: 40 })
                if (settings.includeEnvironments) context.field('env_url', activeEnv.baseUrl, { maxLength: 200 })
            }

            if (settings.includeEnvironments && project.environments?.length > 0) {
                context.field('environments', sanitizeToonList(
                    project.environments.map((e: any) => `${sanitizeToonScalar(e.name, 60)}(${sanitizeToonScalar(e.type, 30)})`), 90, 8
                ), { style: 'literal' })
                telemetry.environments = Math.min(project.environments.length, 8)
            }

            if (settings.includeTestCoverage) {
                const planSummaries = project.testPlans || []
                const totalCaseCount = planSummaries.reduce((sum: number, plan: any) => sum + (plan.testCaseCount || plan.testCases?.length || 0), 0)
                if (totalCaseCount > 0) {
                    const agg = planSummaries.reduce((acc: Record<string, number>, plan: any) => {
                        if (plan.statusCounts && typeof plan.statusCounts === 'object') {
                            for (const [s, c] of Object.entries(plan.statusCounts)) acc[s] = (acc[s] || 0) + Number(c || 0)
                            return acc
                        }
                        for (const tc of plan.testCases || []) { const s = tc?.status || 'not-run'; acc[s] = (acc[s] || 0) + 1 }
                        return acc
                    }, {})
                    context.field('test_coverage', `total=${totalCaseCount},passed=${agg.passed || 0},failed=${agg.failed || 0},blocked=${agg.blocked || 0},not_run=${agg['not-run'] || 0}`, { style: 'literal' })
                    telemetry.coverage_cases = totalCaseCount
                }
            }

            if (settings.includeChecklistAreas && project.checklists?.length > 0) {
                const cats = [...new Set(project.checklists.map((c: any) => c.category).filter(Boolean))] as string[]
                if (cats.length > 0) { context.field('checklist_areas', sanitizeToonList(cats, 50, 8), { style: 'literal' }); telemetry.checklist_areas = Math.min(cats.length, 8) }
            }

            if (settings.includeTestDataDomains && project.testDataGroups?.length > 0) {
                const domains = [...new Set(project.testDataGroups.map((g: any) => g.category).filter(Boolean))] as string[]
                if (domains.length > 0) { context.field('test_data_domains', sanitizeToonList(domains, 50, 8), { style: 'literal' }); telemetry.test_data_domains = Math.min(domains.length, 8) }
            }

            if (settings.includeTrackedIssues) {
                const doneStatuses = new Set(['done', 'closed', 'resolved', 'cancelled', 'canceled', "won't fix", 'wont fix', 'duplicate'])
                const allTasks: any[] = project.tasks || []
                const activeTasks = project.manualContextSelection
                    ? allTasks
                    : allTasks.filter((t: any) => t.source !== 'manual' && !doneStatuses.has(String(t.status || '').toLowerCase().trim()))

                if (activeTasks.length > 0) {
                    const visible = activeTasks.slice(0, settings.trackedIssuesMax)
                    context.field('tasks_summary', `total=${allTasks.length},active=${activeTasks.length},shown=${visible.length},blocker=${activeTasks.filter((t: any) => t.priority === 'critical').length},high=${activeTasks.filter((t: any) => t.priority === 'high').length},medium=${activeTasks.filter((t: any) => t.priority === 'medium').length},low=${activeTasks.filter((t: any) => t.priority === 'low').length}`, { style: 'literal' })
                    context.list('tracked_issues', visible, (list, task: any) => {
                        const id = task.sourceIssueId || task.externalId || task.id
                        list.itemObject([
                            { key: 'id', value: id, maxLength: 60 },
                            { key: 't', value: task.title, maxLength: 150 },
                            { key: 'status', value: task.status || 'unknown', maxLength: 40 },
                            { key: 'priority', value: task.priority || 'medium', maxLength: 20 },
                            { key: 'assignee', value: task.assignee, maxLength: 80 },
                            { key: 'labels', value: task.labels, maxLength: 100 },
                            { key: 'type', value: task.issueType, maxLength: 60 },
                            { key: 'repro', value: task.reproducibility, maxLength: 40 },
                            { key: 'freq', value: task.frequency, maxLength: 40 },
                            { key: 'components', value: sanitizeToonList(task.components || [], 24, 8), style: 'literal' },
                            { key: 'envs', value: sanitizeToonList(task.affectedEnvironmentNames || [], 24, 6), style: 'literal' },
                            { key: 'ac', value: task.acceptanceCriteria, maxLength: 200 },
                            { key: 'desc', value: task.description, maxLength: 300 },
                        ])
                        if (task.comments?.length > 0) NimService.pushCommentList(list, `comments_for_${sanitizeToonScalar(id, 40)}`, task.comments, 5)
                    })
                    telemetry.tracked_issues = visible.length
                }
            }
        })

        writer.separator()

        if (settings.includeSapContext && project.sapCommerce?.enabled) {
            const sapEnvs = (project.sapCommerce.environments || []).slice(0, 5)
            if (sapEnvs.length > 0) {
                const summary = sapEnvs.map((e: any) => {
                    const tags = [e.type, e.isDefault ? 'default' : '', e.hacUrl ? 'hac' : '', e.backOfficeUrl ? 'backoffice' : ''].filter(Boolean).join('+')
                    return `${sanitizeToonScalar(e.name, 60)}(${sanitizeToonScalar(tags, 120)})`
                }).join(',')
                writer.field('sap_commerce_envs', summary, { style: 'literal' })
            }
            writer.raw(SAP_COMMERCE_CONTEXT_BLOCK)
            writer.separator()
            telemetry.sap_environments = sapEnvs.length
        }

        flush()
        return telemetry
    }

    private static appendDevContext(target: ToonWriter | string[], project: any, profile: DevContextProfile = {}): PromptTelemetry {
        if (!project) return {}
        const settings: Required<DevContextProfile> = {
            includeTrackedWork: profile.includeTrackedWork ?? true,
            trackedWorkMax: profile.trackedWorkMax ?? 40,
            includeHandoffs: profile.includeHandoffs ?? true,
            handoffMax: profile.handoffMax ?? 25,
            includeEnvironments: profile.includeEnvironments ?? true,
        }
        const telemetry: PromptTelemetry = {}
        const { writer, flush } = NimService.resolvePromptWriter(target)

        writer.object('dev_context', (context) => {
            context.field('project', project.name, { maxLength: 200 })
            context.field('project_desc', project.description, { maxLength: 300 })

            const activeEnv = project.environments?.find((e: any) => e.isDefault) ?? project.environments?.[0]
            if (activeEnv) {
                context.field('active_env', activeEnv.name, { maxLength: 100 })
                context.field('env_type', activeEnv.type, { maxLength: 40 })
                if (settings.includeEnvironments) context.field('env_url', activeEnv.baseUrl, { maxLength: 200 })
            }

            if (settings.includeEnvironments && project.environments?.length > 0) {
                context.field('environments', sanitizeToonList(
                    project.environments.map((e: any) => `${sanitizeToonScalar(e.name, 60)}(${sanitizeToonScalar(e.type, 30)})`), 90, 8
                ), { style: 'literal' })
                telemetry.environments = Math.min(project.environments.length, 8)
            }

            if (settings.includeTrackedWork && project.tasks?.length > 0) {
                const visible = project.tasks.slice(0, settings.trackedWorkMax)
                context.field('work_summary', `tasks=${project.tasks.length}`, { style: 'literal' })
                context.list('tracked_work', visible, (list, task: any) => {
                    const id = task.sourceIssueId || task.externalId || task.id
                    list.itemObject([
                        { key: 'id', value: id, maxLength: 60 },
                        { key: 't', value: task.title, maxLength: 150 },
                        { key: 'status', value: task.status, maxLength: 40 },
                        { key: 'priority', value: task.priority, maxLength: 20 },
                        { key: 'desc', value: task.description, maxLength: 300 },
                        { key: 'type', value: task.issueType, maxLength: 60 },
                        { key: 'assignee', value: task.assignee, maxLength: 80 },
                        { key: 'collab', value: task.collabState, maxLength: 40 },
                        { key: 'handoff', value: task.activeHandoffId, maxLength: 80 },
                        { key: 'labels', value: task.labels, maxLength: 120 },
                        { key: 'repro', value: task.reproducibility, maxLength: 40 },
                        { key: 'freq', value: task.frequency, maxLength: 40 },
                        { key: 'components', value: sanitizeToonList(task.components || [], 24, 8), style: 'literal' },
                        { key: 'envs', value: sanitizeToonList(task.affectedEnvironmentNames || [], 24, 6), style: 'literal' },
                        { key: 'ac', value: task.acceptanceCriteria, maxLength: 200 },
                    ])
                    if (task.comments?.length > 0) NimService.pushCommentList(list, `comments_for_${sanitizeToonScalar(id, 40)}`, task.comments, 5)
                })
                telemetry.tracked_work = visible.length
            }

            if (settings.includeHandoffs && project.handoffs?.length > 0) {
                const visible = project.handoffs.slice(0, settings.handoffMax)
                context.field('handoff_summary', `total=${project.handoffs.length}`, { style: 'literal' })
                context.list('handoffs', visible, (list, handoff: any) => {
                    list.itemObject([
                        { key: 'id', value: handoff.id, maxLength: 80 },
                        { key: 'task', value: handoff.taskId, maxLength: 80 },
                        { key: 'type', value: handoff.type, maxLength: 40 },
                        { key: 'summary', value: handoff.summary, maxLength: 240 },
                        { key: 'env', value: handoff.environmentName, maxLength: 80 },
                        { key: 'severity', value: handoff.severity, maxLength: 40 },
                        { key: 'branch', value: handoff.branchName, maxLength: 120 },
                        { key: 'release', value: handoff.releaseVersion, maxLength: 80 },
                        { key: 'complete', value: handoff.isComplete === undefined ? undefined : (handoff.isComplete ? 'yes' : 'no'), maxLength: 4 },
                    ])
                    if (handoff.linkedPrs?.length > 0) {
                        list.list(`linked_prs_for_${sanitizeToonScalar(handoff.id, 40)}`, handoff.linkedPrs.slice(0, 10), (prList, pr: any) => {
                            prList.itemObject([
                                { key: 'repo', value: pr.repoFullName, maxLength: 120 },
                                { key: 'pr', value: pr.prNumber },
                                { key: 'status', value: pr.status, maxLength: 40 },
                            ])
                        })
                    }
                })
                telemetry.handoffs = visible.length
            }
        })

        writer.separator()
        flush()
        return telemetry
    }

    // ── JSON helpers ─────────────────────────────────────────────────────────

    private static extractFirstJsonArray(text: string): string | null {
        let json = text.trim()
        if (json.startsWith('```')) {
            const start = json.indexOf('\n')
            if (start >= 0) {
                const end = json.lastIndexOf('```')
                if (end > start) json = json.substring(start + 1, end).trim()
            }
        }
        const start = json.indexOf('[')
        if (start < 0) return null
        let depth = 0, inString = false, escape = false
        for (let i = start; i < json.length; i++) {
            const c = json[i]
            if (escape) { escape = false; continue }
            if (c === '\\') { escape = true; continue }
            if (c === '"') { inString = !inString; continue }
            if (inString) continue
            if (c === '[') depth++
            else if (c === ']') { depth--; if (depth === 0) return json.substring(start, i + 1) }
        }
        return null
    }

    private static parseJsonResponse(raw: string): any {
        let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
        try { return JSON.parse(s) } catch { /* fall through */ }
        const match = s.match(/(\[[\s\S]*|\{[\s\S]*)/)
        if (match) s = match[1]
        s = NimService.repairTruncatedJson(s)
        try { return JSON.parse(s) } catch (e: any) { throw new Error(`Failed to parse NIM JSON response: ${e.message}`) }
    }

    private static repairTruncatedJson(s: string): string {
        s = s.replace(/,\s*$/, '').replace(/:\s*$/, ': null')
        const quoteCount = (s.match(/(?<!\\)"/g) || []).length
        if (quoteCount % 2 !== 0) s = s + '"'
        const stack: string[] = []
        let inString = false
        for (let i = 0; i < s.length; i++) {
            const ch = s[i]; const prev = i > 0 ? s[i - 1] : ''
            if (ch === '"' && prev !== '\\') { inString = !inString }
            else if (!inString) {
                if (ch === '[' || ch === '{') stack.push(ch)
                else if (ch === ']' || ch === '}') stack.pop()
            }
        }
        for (let i = stack.length - 1; i >= 0; i--) s += stack[i] === '[' ? ']' : '}'
        return s
    }

    private static selectRelevantTextSections(source: string, hints: string[], maxChars: number, maxSections = 8): { text: string; sectionCount: number } {
        if (!source.trim()) return { text: '', sectionCount: 0 }
        const sections = source.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
        if (sections.length === 0) return { text: '', sectionCount: 0 }
        const tokenize = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(tok => tok.length > 2)
        const hintTokens = new Set(hints.flatMap(h => tokenize(h)))
        const scored = sections.map((section, index) => {
            const tokens = tokenize(section)
            return { section, index, score: tokens.reduce((sum, t) => sum + (hintTokens.has(t) ? 1 : 0), 0), length: section.length }
        })
        scored.sort((a, b) => b.score - a.score || a.index - b.index)
        const selected: string[] = []; let usedChars = 0
        for (const candidate of scored.slice(0, Math.max(maxSections * 2, maxSections))) {
            if (selected.length >= maxSections || usedChars >= maxChars) break
            const remaining = maxChars - usedChars
            const snippet = candidate.section.length > remaining ? `${candidate.section.slice(0, Math.max(0, remaining - 3))}...` : candidate.section
            if (!snippet.trim()) continue
            selected.push(snippet); usedChars += snippet.length + 2
        }
        if (selected.length === 0) { const fb = source.slice(0, maxChars); return { text: fb, sectionCount: fb.trim() ? 1 : 0 } }
        return { text: selected.join('\n\n'), sectionCount: selected.length }
    }

    private static buildExcerptWindow(source: string, hints: string[], maxChars = 1800): string {
        const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
        if (!normalized || normalized.length <= maxChars) return normalized
        const tokenize = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(tok => tok.length >= 4)
        const terms = Array.from(new Set(hints.flatMap(h => tokenize(h)))).sort((a, b) => b.length - a.length)
        const lower = normalized.toLowerCase()
        let matchIndex = -1
        for (const term of terms) { const i = lower.indexOf(term); if (i >= 0) { matchIndex = i; break } }
        if (matchIndex < 0) return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`
        const halfWindow = Math.floor(maxChars / 2)
        let start = Math.max(0, matchIndex - halfWindow)
        const end = Math.min(normalized.length, start + maxChars)
        if (end - start < maxChars) start = Math.max(0, end - maxChars)
        return `${start > 0 ? '...' : ''}${normalized.slice(start, end).trim()}${end < normalized.length ? '...' : ''}`
    }

    // ── Public AI API ────────────────────────────────────────────────────────

    async analyzeIssue(task: any, comments: any[] = [], project?: any, _attachedImageCount = 0, modelName?: string): Promise<string> {
        const sysLines: string[] = [
            '@role:sr_qa_engineer',
            '@task:deep_issue_analysis',
            '@perspective:qa_engineer—focus on testability,reproducibility,regression_risk,environment_impact',
            '@out_fmt:md_sections[## Root Cause Analysis,## Impact Assessment,## Suggested Fix,## Prevention Recommendations]',
            '@rules:all_sections_required|multi_sentence|specific_actionable|infer_if_brief|no_skip|no_merge|consider_env_context|reference_project_functionality|use_tables_for_structured_data|bold_key_findings',
            '@priority_mapping:task_priorities(critical=Blocker,high=Major,medium=Medium,low=Low)|tc_priorities(Blocker,Major,Medium,Low)',
        ]
        const user = new ToonWriter()
        const telemetry: PromptTelemetry = {
            ...NimService.appendQaContext(user, project, { includeTrackedIssues: true, trackedIssuesMax: 12, includeTestCoverage: false, includeChecklistAreas: false, includeTestDataDomains: false }),
        }
        user.object('issue', (issue) => {
            issue.field('t', task.title, { maxLength: 300 })
            issue.field('id', task.sourceIssueId, { maxLength: 100 })
            issue.field('status', task.status, { maxLength: 40 })
            issue.field('priority', task.priority, { maxLength: 20 })
            issue.field('assignee', task.assignee, { maxLength: 200 })
            issue.field('labels', task.labels, { maxLength: 200 })
            issue.field('due', task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '', { maxLength: 32 })
            issue.field('desc', task.description || '(none; infer from title+metadata)', { maxLength: 500 })
        })
        if (comments.length > 0) telemetry.issue_comments = NimService.pushCommentList(user, 'comments', comments, 8)
        return await this.executeWithFallback(sysLines.join('\n'), user.toString(), modelName, 0.3, MAX_TOKENS.issue_analysis, false, 'issue_analysis', telemetry)
    }

    async generateTestCases(tasks: any[] = [], sourceName: string, project?: any, designDoc?: string, modelName?: string, comments?: Record<string, any[]>): Promise<any[]> {
        const sysLines: string[] = [
            '@role:sr_qa_engineer',
            '@task:generate_test_cases',
            '@perspective:qa_engineer—generate functional and integration tests specifically covering the provided issues',
            `@source:${sourceName}`,
            '@out_fmt:json_array[{testCaseId,title,preConditions,testSteps,testData,expectedResult,priority,sourceIssueId}]',
            '@rules:comprehensive|all_fields_required|specific_actionable|realistic_test_data|cover_positive_negative_edge|no_generic|env_aware|use_known_test_data_when_applicable|focus_only_on_provided_issues|exclude_general_regression_or_smoke_tests',
            '@priority_mapping:task_priorities(critical=Blocker,high=Major,medium=Medium,low=Low)|output_priority_must_be_one_of(Blocker,Major,Medium,Low)',
        ]
        if (designDoc) sysLines.push('@extra_context:design_document_provided—use it to improve accuracy,coverage,and specificity of generated test cases')
        sysLines.push('field_spec{')
        sysLines.push(' testCaseId:sequential(TC-001,TC-002,...)')
        sysLines.push(' title:clear_descriptive')
        sysLines.push(' preConditions:state_before_execution')
        sysLines.push(' testSteps:numbered_step_by_step')
        sysLines.push(' testData:specific_values')
        sysLines.push(' expectedResult:pass_criteria')
        sysLines.push(' priority:one_of(Blocker,Major,Medium,Low)_based_on_issue_severity_and_impact')
        sysLines.push(' sourceIssueId:exact_id_of_the_source_issue_this_test_case_covers(IssueIdentifier_field_value)')
        sysLines.push('}')

        const user = new ToonWriter()
        const telemetry: PromptTelemetry = {
            ...NimService.appendQaContext(user, project, { includeTrackedIssues: false, includeTestCoverage: false, includeChecklistAreas: false, includeTestDataDomains: false }),
            source: sourceName,
            issue_count: Math.min(tasks.length, 50),
        }

        if (designDoc) {
            const hints = tasks.flatMap(t => [t.title, t.description, t.labels, t.issueType].filter(Boolean))
            const selected = NimService.selectRelevantTextSections(designDoc, hints, 12_000, 8)
            user.object('design_document', (doc) => {
                doc.field('selected_sections', selected.sectionCount)
                doc.field('content', selected.text, { style: 'block', maxLength: 12_000 })
            })
            user.separator()
            telemetry.design_doc_sections = selected.sectionCount
        }

        user.list('project_issues', tasks.slice(0, 50), (list, task) => {
            const issueId = task.sourceIssueId || task.externalId || task.id
            list.itemObject([
                { key: 'id', value: issueId, maxLength: 100 },
                { key: 'title', value: task.title, maxLength: 300 },
                { key: 'status', value: task.status || 'todo', maxLength: 40 },
                { key: 'priority', value: task.priority || 'medium', maxLength: 20 },
                { key: 'desc', value: task.description, maxLength: 1200 },
                { key: 'type', value: task.issueType, maxLength: 100 },
                { key: 'labels', value: task.labels, maxLength: 200 },
                { key: 'has_images', value: task.attachmentUrls?.length ? `${task.attachmentUrls.length}` : undefined, maxLength: 10 },
            ])
            const issueComments = comments?.[issueId]?.slice(0, 5) || []
            if (issueComments.length > 0) {
                list.list(`issue_comments_for_${sanitizeToonScalar(issueId, 30)}`, issueComments, (commentList, comment) => {
                    commentList.itemObject([{ key: 'author', value: comment.authorName, maxLength: 100 }, { key: 'body', value: comment.body, maxLength: 500 }])
                })
            }
        })

        const text = await this.executeWithFallback(sysLines.join('\n'), user.toString(), modelName, 0.4, MAX_TOKENS.test_generation, true, 'test_generation', telemetry)
        let parsed: any[]
        try {
            const raw = JSON.parse(text)
            parsed = Array.isArray(raw) ? raw : (Array.isArray(raw?.testCases) ? raw.testCases : null)
            if (!parsed) throw new Error('not_array')
        } catch {
            const extracted = NimService.extractFirstJsonArray(text)
            if (!extracted) throw `Could not parse JSON array from model response. Raw Response: \n${text.substring(0, 500)}`
            try { parsed = JSON.parse(extracted) } catch { throw 'Model returned invalid JSON for test cases' }
        }
        if (!Array.isArray(parsed)) throw 'Model returned unexpected structure for test cases (expected array)'
        const PRIORITY_MAP: Record<string, string> = { blocker: 'critical', major: 'high', medium: 'medium', low: 'low', critical: 'critical', high: 'high' }
        return parsed.map((item: any, i: number) => {
            if (typeof item !== 'object' || item === null) throw `Invalid test case at index ${i}`
            const priority = PRIORITY_MAP[String(item.priority || 'medium').toLowerCase()] || 'medium'
            return {
                testCaseId: String(item.testCaseId || `TC-${String(i + 1).padStart(3, '0')}`).substring(0, 50),
                title: coerceSingleLineText(item.title || `Test Case ${i + 1}`).substring(0, 300),
                preConditions: coerceMultilineText(item.preConditions).substring(0, 2000),
                steps: coerceMultilineText(item.testSteps ?? item.steps).substring(0, 5000),
                testData: coerceMultilineText(item.testData).substring(0, 2000),
                expectedResult: coerceMultilineText(item.expectedResult).substring(0, 2000),
                priority: priority as any,
                sourceIssueId: String(item.sourceIssueId || '').substring(0, 100),
                sapModule: item.sapModule ? String(item.sapModule).substring(0, 100) : undefined,
            }
        })
    }

    async assessCriticality(tasks: any[], testPlans: any[], executions: any[], project?: any, modelName?: string): Promise<string> {
        const allCases = testPlans.flatMap(tp => tp.testCases || [])
        const sysLines: string[] = [
            '@role:sr_qa_engineer',
            '@task:criticality_assessment',
            '@perspective:qa_engineer—assess release risk from QA standpoint considering environment health,test coverage gaps,checklist completion,blocker density',
            '@out_fmt:md_sections[## Failure Summary by Priority,## Overall Risk Level,## Key Areas of Concern,## Recommended Actions,## Release Readiness]',
            '@rules:concise|actionable|data_driven|risk_focused|all_sections_required|include_counts_per_priority(Blocker,Major,Medium,Low)|risk_level_one_of(Critical,High,Moderate,Low)|actions_ordered_by_severity|no_skip|no_merge|factor_env_coverage|factor_checklist_gaps',
            '@priority_mapping:task_priorities(critical=Blocker,high=Major,medium=Medium,low=Low)|tc_priorities(blocker,major,medium,low)',
        ]
        const userLines: string[] = []
        NimService.appendQaContext(userLines, project, { includeTrackedIssues: false, includeTestCoverage: false, includeChecklistAreas: true, includeTestDataDomains: false })
        const failed = allCases.filter((tc: any) => tc.status === 'failed')
        userLines.push('failure_summary{')
        userLines.push(` total_test_cases:${allCases.length}`)
        userLines.push(` total_failed:${failed.length}`)
        userLines.push(` blocker_failed:${failed.filter((tc: any) => tc.priority === 'blocker').length}`)
        userLines.push(` major_failed:${failed.filter((tc: any) => tc.priority === 'major').length}`)
        userLines.push(` medium_failed:${failed.filter((tc: any) => tc.priority === 'medium').length}`)
        userLines.push(` low_failed:${failed.filter((tc: any) => tc.priority === 'low').length}`)
        userLines.push(` total_executions:${executions.length}`)
        userLines.push(` total_test_plans:${testPlans.length}`)
        userLines.push('}')
        userLines.push('---')
        if (testPlans.length > 0) {
            userLines.push('test_plans[')
            for (const plan of testPlans.slice(0, 20)) {
                const planCases = plan.testCases || []
                userLines.push(` {name:${NimService.sanitizeToonValue(plan.name, 200)},total:${planCases.length},failed:${planCases.filter((tc: any) => tc.status === 'failed').length},source:${NimService.sanitizeToonValue(plan.source, 60)}}`)
            }
            userLines.push(']')
            userLines.push('---')
        }
        if (tasks.length > 0) {
            userLines.push('project_tasks[')
            for (const task of tasks.slice(0, 50)) {
                let entry = ` {id:${NimService.sanitizeToonValue(task.sourceIssueId || task.externalId, 100)},title:${NimService.sanitizeToonValue(task.title, 300)},status:${task.status},priority:${task.priority}`
                if (task.issueType) entry += `,type:${NimService.sanitizeToonValue(task.issueType, 100)}`
                entry += '}'
                userLines.push(entry)
            }
            userLines.push(']')
        }
        if (failed.length > 0) {
            userLines.push('failed_test_cases[')
            for (const tc of failed.slice(0, 50)) {
                let entry = ` {id:${NimService.sanitizeToonValue(tc.displayId, 100)},title:${NimService.sanitizeToonValue(tc.title, 300)},priority:${tc.priority},source:${tc.source || 'Manual'}`
                if (tc.actualResult) entry += `,actual_result:${NimService.sanitizeToonValue(tc.actualResult, 200)}`
                entry += '}'
                userLines.push(entry)
            }
            userLines.push(']')
        }
        if (executions?.length > 0) {
            const groups = executions.reduce((acc: any, e: any) => { acc[e.result] = (acc[e.result] || 0) + 1; return acc }, {})
            userLines.push(`exec_results{${Object.entries(groups).map(([k, v]) => `${k}:${v}`).join(',')}}`)
        }
        return await this.executeWithFallback(sysLines.join('\n'), userLines.join('\n'), modelName, 0.3, MAX_TOKENS.criticality, false, 'criticality', {
            issue_count: Math.min(tasks.length, 50), test_plan_count: Math.min(testPlans.length, 20), execution_count: executions.length,
        })
    }

    async getTestRunSuggestions(testPlans: any[], executions: any[], project?: any, modelName?: string): Promise<string> {
        const allCases = testPlans.flatMap(tp => tp.testCases || [])
        const total = allCases.length
        const passed = allCases.filter((tc: any) => tc.status === 'passed').length
        const failed = allCases.filter((tc: any) => tc.status === 'failed').length
        const blocked = allCases.filter((tc: any) => tc.status === 'blocked').length
        const skipped = allCases.filter((tc: any) => tc.status === 'skipped').length
        const notRun = allCases.filter((tc: any) => tc.status === 'not-run').length
        const passRate = total > 0 ? (passed / total * 100).toFixed(1) : '0.0'
        const sysLines: string[] = [
            '@role:sr_qa_engineer',
            '@task:test_run_suggestions',
            '@perspective:qa_engineer—give specific,actionable QA gate and deployment suggestions based on test run results,pass rates per plan,and failed test case impact',
            '@out_fmt:md_sections[## Overall Status,## Deployment Readiness,## Key Risks,## Suggestions]',
            '@rules:concise|specific|data_driven|bold_decisions|deployment_verdict_prominent|reference_failing_areas|no_generic_advice|all_sections_required|suggestions_imperative_sentences_referencing_actual_data',
            '@priority_mapping:tc_priorities(blocker,major,medium,low)',
        ]
        const userLines: string[] = []
        NimService.appendQaContext(userLines, project, { includeTrackedIssues: false, includeTestCoverage: false, includeChecklistAreas: false, includeTestDataDomains: false })
        userLines.push(`overall_stats{total_cases:${total},passed:${passed},failed:${failed},blocked:${blocked},skipped:${skipped},not_run:${notRun},pass_rate:${passRate}%,total_executions:${executions.length}}`)
        if (testPlans.length > 0) {
            userLines.push('plan_results[')
            for (const plan of testPlans.slice(0, 20)) {
                const pc = plan.testCases || []
                const pt = pc.length, pp = pc.filter((tc: any) => tc.status === 'passed').length, pf = pc.filter((tc: any) => tc.status === 'failed').length, pb = pc.filter((tc: any) => tc.status === 'blocked').length
                userLines.push(` {name:${NimService.sanitizeToonValue(plan.name, 200)},total:${pt},passed:${pp},failed:${pf},blocked:${pb},pass_rate:${pt > 0 ? (pp / pt * 100).toFixed(1) : '0.0'}%,source:${plan.source || 'Manual'}}`)
            }
            userLines.push(']')
        }
        const failedCases = allCases.filter((tc: any) => tc.status === 'failed')
        if (failedCases.length > 0) {
            userLines.push('failed_cases[')
            for (const tc of failedCases.slice(0, 50)) {
                let entry = ` {id:${NimService.sanitizeToonValue(tc.displayId, 100)},title:${NimService.sanitizeToonValue(tc.title, 300)},priority:${tc.priority}`
                if (tc.sapModule) entry += `,module:${tc.sapModule}`
                if (tc.actualResult) entry += `,actual:${NimService.sanitizeToonValue(tc.actualResult, 200)}`
                if (tc.sourceIssueId) entry += `,issue:${NimService.sanitizeToonValue(tc.sourceIssueId, 60)}`
                entry += '}'
                userLines.push(entry)
            }
            userLines.push(']')
        }
        return await this.executeWithFallback(sysLines.join('\n'), userLines.join('\n'), modelName, 0.3, MAX_TOKENS.suggestions, false, 'test_run_suggestions', {
            test_plan_count: Math.min(testPlans.length, 20), execution_count: executions.length,
        })
    }

    async selectSmokeSubset(candidates: any[], doneTasks: any[], project?: any, modelName?: string): Promise<string[]> {
        const sysLines: string[] = [
            '@role:sr_qa_engineer',
            '@task:smoke_subset_selection',
            '@goal:minimal_tc_set_max_regression_coverage',
            '@out_fmt:json_array_of_strings',
            '@out_rules:raw_json_only|no_wrap|ids_only|max_30',
            '@sel_rules:prefer(B>MAJ>MED>L)|cover_distinct_areas|no_dupes|exact_ids',
            '@schema:t=title|p=priority(B=Blocker,MAJ=Major,MED=Medium,L=Low)|s=status(F=Failed,P=Passed,BL=Blocked,SK=Skipped)|iss=source_issue_id',
        ]
        const userLines: string[] = []
        NimService.appendQaContext(userLines, project, { includeTrackedIssues: false, includeTestCoverage: false, includeChecklistAreas: false, includeTestDataDomains: false })
        if (doneTasks.length > 0) {
            userLines.push('done[')
            for (const task of doneTasks.slice(0, 50)) {
                const p = task.priority === 'critical' ? 'B' : task.priority === 'high' ? 'MAJ' : task.priority === 'medium' ? 'MED' : 'L'
                userLines.push(` {id:${NimService.sanitizeToonValue(task.sourceIssueId, 60)},t:${NimService.sanitizeToonValue(task.title, 120)},p:${p}}`)
            }
            userLines.push(']')
        }
        userLines.push('tc[')
        for (const tc of candidates.slice(0, 200)) {
            const p = tc.priority === 'blocker' ? 'B' : tc.priority === 'major' ? 'MAJ' : tc.priority === 'medium' ? 'MED' : 'L'
            const sMap: Record<string, string> = { failed: 'F', passed: 'P', blocked: 'BL', skipped: 'SK' }
            let entry = ` {id:${NimService.sanitizeToonValue(tc.displayId, 50)},t:${NimService.sanitizeToonValue(tc.title, 100)},p:${p}`
            if (tc.status !== 'not-run' && sMap[tc.status]) entry += `,s:${sMap[tc.status]}`
            if (tc.sourceIssueId) entry += `,iss:${NimService.sanitizeToonValue(tc.sourceIssueId, 60)}`
            entry += '}'
            userLines.push(entry)
        }
        userLines.push(']')
        const text = await this.executeWithFallback(sysLines.join('\n'), userLines.join('\n'), modelName, 0.3, MAX_TOKENS.smoke_subset, true, 'smoke_subset', {
            candidate_count: Math.min(candidates.length, 200), done_task_count: Math.min(doneTasks.length, 50),
        })
        let parsed: any[]
        try { parsed = JSON.parse(text) } catch {
            const extracted = NimService.extractFirstJsonArray(text)
            if (!extracted) return []
            try { parsed = JSON.parse(extracted) } catch { return [] }
        }
        if (!Array.isArray(parsed)) return []
        return parsed.filter((v: any) => typeof v === 'string').map((v: string) => v.substring(0, 100))
    }

    async analyzeProject(projectContext: string, project?: any, modelName?: string): Promise<string> {
        const sysLines: string[] = [
            '@role:sr_qa_engineer',
            '@task:project_strategic_analysis',
            '@perspective:qa_engineer—strategic,holistic view of project health and risk',
            '@out_fmt:md_sections[## Strategic Gaps,## Coverage Optimization,## Risk Assessment]',
            '@rules:strategic|actionable|data_driven|bold_decisions|no_generic_advice|all_sections_required|use_tables_for_structured_data|bold_key_findings',
        ]
        const user = new ToonWriter()
        const telemetry: PromptTelemetry = {
            ...NimService.appendQaContext(user, project, { includeTrackedIssues: false }),
            context_chars: Math.min(projectContext.length, 5000),
        }
        user.object('analysis_context_and_data', (a) => { a.field('context', projectContext, { style: 'block', maxLength: 5000 }) })
        return await this.executeWithFallback(sysLines.join('\n'), user.toString(), modelName, 0.4, MAX_TOKENS.project_analysis, false, 'project_analysis', telemetry)
    }

    async chat(
        userMessage: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
        role: 'qa' | 'dev' = 'qa',
        project?: any,
        modelName?: string
    ): Promise<string> {
        const sysLines: string[] = []
        const user = new ToonWriter()
        const telemetry: PromptTelemetry = { role }
        const hasSapContext = project?.sapCommerce?.enabled === true

        if (role === 'dev') {
            sysLines.push('@role:sr_software_engineer')
            sysLines.push('@task:freeform_dev_assistant_chat')
            sysLines.push('@perspective:software_engineer—helpful,concise,context-aware developer focused on implementation,risk,release_readiness,and code review coordination')
            sysLines.push('@rules:conversational|specific|implementation_focused|reference_handoff_and_pr_context_when_relevant|use_markdown_formatting|keep_answers_concise_unless_detail_asked|no_hallucination|acknowledge_if_insufficient_context')
            if (project) Object.assign(telemetry, NimService.appendDevContext(user, project, { trackedWorkMax: 20, handoffMax: 12 }))
        } else {
            sysLines.push('@role:sr_qa_engineer')
            sysLines.push('@task:freeform_qa_assistant_chat')
            sysLines.push(hasSapContext
                ? '@perspective:qa_engineer—helpful,concise,context-aware QA expert with SAP Commerce knowledge when project context indicates it'
                : '@perspective:qa_engineer—helpful,concise,context-aware QA expert; do_not_assume_SAP_Commerce_without_explicit_context')
            sysLines.push('@rules:conversational|helpful|specific|reference_project_data_when_relevant|use_markdown_formatting|keep_answers_concise_unless_detail_asked|no_hallucination|acknowledge_if_insufficient_context|assume_domain_only_from_provided_context')
            if (project) Object.assign(telemetry, NimService.appendQaContext(user, project, { trackedIssuesMax: 15 }))
        }

        user.object('user_request', (r) => { r.field('message', userMessage, { style: 'block', maxLength: 3000 }) })

        // Build history in OpenAI-compat format, budget 12k tokens across history turns
        const HISTORY_CHAR_BUDGET = 12000 * 4
        const recentTurns = history.filter(t => ['user', 'assistant'].includes(t.role)).slice(-12)
        let budget = HISTORY_CHAR_BUDGET
        const budgetedTurns: typeof recentTurns = []
        for (let i = recentTurns.length - 1; i >= 0; i--) {
            if (budget <= 0) break
            budgetedTurns.unshift(recentTurns[i])
            budget -= recentTurns[i].content.length
        }
        telemetry.history_turns = budgetedTurns.length

        // Build messages array including history
        const messages: Array<{ role: string; content: string }> = [
            { role: 'system', content: sysLines.join('\n') },
        ]
        for (const turn of budgetedTurns) {
            messages.push({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.content })
        }
        messages.push({ role: 'user', content: user.toString() })

        // Chat needs a multi-turn messages array, so it cannot reuse executeWithFallback's
        // single system+user shape — but it must still go through the same transport hooks
        // (endpoint, headers, timeout, body decoration, content extraction) or a subclass
        // provider would silently fall back to NVIDIA's host. See dispatchChatMessages.
        return this.dispatchChatMessages(messages, modelName, MAX_TOKENS.chat, 'chat', telemetry)
    }

    /**
     * Send a prepared multi-turn messages array, walking the model fallback sequence.
     * Shares every transport hook with executeWithFallback so provider overrides apply.
     */
    protected async dispatchChatMessages(
        messages: Array<{ role: string; content: string }>,
        modelOverride: string | undefined,
        maxOutputTokens: number,
        feature: string,
        telemetry?: PromptTelemetry,
    ): Promise<string> {
        const models = this.buildModelSequence(modelOverride)
        let lastError: any
        for (const currentModelName of models) {
            try {
                const body: any = {
                    model: currentModelName,
                    messages,
                    max_tokens: maxOutputTokens,
                    temperature: 0.7,
                    top_p: 0.9,
                    stream: false,
                }
                this.decorateRequestBody(body, feature)

                const response = await fetch(this.chatCompletionsUrl(), {
                    method: 'POST',
                    headers: this.requestHeaders(),
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(this.requestTimeoutMs(feature)),
                })
                if (!response.ok) {
                    const errText = await response.text().catch(() => '')
                    const { isRateLimit, isUnavailable } = this.classifyError(response.status, errText)
                    lastError = new Error(`HTTP ${response.status}`)
                    if (isRateLimit || isUnavailable) { console.warn(`[${this.providerTag}] chat model ${currentModelName} ${isRateLimit ? 'rate limited' : 'unavailable'}. Trying next...`); continue }
                    continue
                }
                const data = await response.json() as any
                const content = this.extractResponseContent(data)
                if (!content.trim()) {
                    console.warn(`[${this.providerTag}] chat model ${currentModelName} returned empty content. Trying next...`)
                    lastError = new Error(`Model ${currentModelName} returned an empty response`)
                    continue
                }
                if (currentModelName !== this.preferredModel) { log.info(`[${this.providerTag}] switching preferred model to ${currentModelName}`); this.preferredModel = currentModelName }
                NimService.logUsage(currentModelName, data.usage, feature, telemetry, this.providerTag)
                return content
            } catch (err: any) {
                lastError = err
                const msg = String(err?.message ?? err)
                const { isRateLimit, isUnavailable } = this.classifyError(0, msg)
                if (isRateLimit || isUnavailable) { console.warn(`[${this.providerTag}] chat model ${currentModelName} error: ${msg}. Trying next...`); continue }
                console.error(`[${this.providerTag}] chat model ${currentModelName} failed:`, msg)
                continue
            }
        }
        throw `${this.providerTag} Chat API Error: ${this.buildFinalErrorMessage(lastError)}`
    }

    async extractClaims(agentResponse: string, modelOverride?: string, expectedAnswer?: string): Promise<Array<{ claimText: string; claimType: string }>> {
        const sysLines: string[] = [
            '@role:claim_extractor',
            '@task:extract_atomic_verifiable_claims',
            '@rules:atomic_self_contained|no_pronouns|skip_filler_hedging_greetings_meta|3_to_15_claims|claimType_one_of(factual,procedural,definitional,numerical)',
            '@out_fmt:json_array[{claimText:string,claimType:string}]',
        ]
        if (expectedAnswer?.trim()) sysLines.push('@expected_answer_guidance:if_expected_answer_present_prioritise_claims_that_differ_from_or_contradict_it_as_these_are_most_diagnostically_valuable')
        const user = new ToonWriter()
        user.object('agent_response', (r) => { r.field('text', agentResponse, { style: 'opaque', maxLength: 8000 }) })
        if (expectedAnswer?.trim()) user.object('expected_answer', (e) => { e.field('text', expectedAnswer, { style: 'opaque', maxLength: 3000 }) })
        const raw = await this.executeWithFallback(sysLines.join('\n'), user.toString(), modelOverride, 0, MAX_TOKENS.claim_extraction, true, 'claim_extraction', {
            expected_answer: Boolean(expectedAnswer?.trim()), agent_chars: Math.min(agentResponse.length, 8000),
        })
        const parsed = NimService.parseJsonResponse(raw)
        return Array.isArray(parsed) ? parsed : []
    }

    async verifyClaims(
        claims: Array<{ claimText: string; claimType: string }>,
        refChunks: Array<{ id: string; content: string }>,
        modelOverride?: string,
        expectedAnswer?: string
    ): Promise<Array<{ claimIndex: number; verdict: string; confidence: number; sourceChunkIds: string[]; reasoning: string }>> {
        const sysLines: string[] = [
            '@role:evidence_verifier',
            '@task:verify_claims_strictly_against_reference_docs_only',
            expectedAnswer?.trim() ? '@ground_truth:ref_docs_and_expected_answer_are_sources_of_truth|expected_answer_takes_precedence_over_ref_docs_when_both_present|no_outside_knowledge|no_assumptions' : '@ground_truth:ref_docs_are_sole_source_of_truth|no_outside_knowledge|no_assumptions',
            '@verdicts:supported(claim_concept_or_meaning_confirmed_by_docs_or_expected_answer)|contradicted(claim_conflicts_with_docs_or_expected_answer)|partially_supported(sources_confirm_part_but_not_all)|unverifiable(concept_absent_from_all_sources_treat_as_hallucination)',
            '@rules:one_verdict_per_claim|default_to_unverifiable_when_in_doubt|confidence_float_0_to_1|confidence_max_0.5_for_unverifiable|cite_chunk_ids_when_applicable|reasoning_1_to_2_sentences|index_matches_input_order',
            '@out_fmt:json_array[{claimIndex:number,verdict:string,confidence:number,sourceChunkIds:string[],reasoning:string}]',
        ]
        const user = new ToonWriter()
        if (expectedAnswer?.trim()) { user.object('expected_answer', (e) => { e.field('text', expectedAnswer, { style: 'opaque', maxLength: 3000 }) }); user.separator() }
        const excerptHints = [...claims.map(c => c.claimText), expectedAnswer || '']
        user.list('ref_docs', refChunks, (list, chunk) => {
            list.itemObject([{ key: 'id', value: chunk.id, maxLength: 100 }, { key: 'content', value: NimService.buildExcerptWindow(chunk.content, excerptHints, 1800), style: 'opaque', maxLength: 1800 }])
        })
        user.separator()
        user.list('claims', claims, (list, claim, index) => {
            list.itemObject([{ key: 'idx', value: index }, { key: 'text', value: claim.claimText, maxLength: 500 }, { key: 'type', value: claim.claimType, maxLength: 40 }])
        })
        const raw = await this.executeWithFallback(sysLines.join('\n'), user.toString(), modelOverride, 0, MAX_TOKENS.claim_verification, true, 'claim_verification', { claim_count: claims.length, ref_chunk_count: refChunks.length })
        const parsed = NimService.parseJsonResponse(raw)
        if (!Array.isArray(parsed)) return []
        const validChunkIds = new Set(refChunks.map(c => c.id))
        return parsed.map((item: any) => ({ ...item, sourceChunkIds: Array.isArray(item.sourceChunkIds) ? item.sourceChunkIds.filter((id: any) => typeof id === 'string' && validChunkIds.has(id)) : [] }))
    }

    async scoreDimensions(
        question: string,
        agentResponse: string,
        claimVerdicts: Array<{ claimText: string; verdict: string; reasoning: string }>,
        refChunks: Array<{ id: string; content: string }>,
        modelOverride?: string,
        expectedAnswer?: string
    ): Promise<{ factualAccuracy: { score: number; confidence: number; reasoning: string }; completeness: { score: number; confidence: number; reasoning: string }; faithfulness: { score: number; confidence: number; reasoning: string }; relevance: { score: number; confidence: number; reasoning: string } }> {
        const sysLines: string[] = [
            '@role:accuracy_scorer',
            '@task:multi_dimension_scoring_of_ai_response_against_reference_docs',
            '@ground_truth:ref_doc_excerpts_are_sole_source_of_truth|no_outside_knowledge|semantic_equivalence_is_sufficient_exact_wording_not_required',
            '@dimensions:factualAccuracy(score_is_precomputed_provide_reasoning_only_do_not_override_score)|completeness(0-100,how_much_key_info_from_docs_relevant_to_question_is_covered)|faithfulness(score_is_precomputed_provide_reasoning_only_do_not_override_score)|relevance(0-100,response_directly_addresses_the_question)',
            '@rules:score_each_dimension_independently|score_int_0_to_100|confidence_float_0_to_1|reasoning_2_to_3_sentences_cite_specific_evidence|all_four_dimensions_required',
            '@out_fmt:json_object{factualAccuracy:{score:int,confidence:float,reasoning:string},completeness:{score:int,confidence:float,reasoning:string},faithfulness:{score:int,confidence:float,reasoning:string},relevance:{score:int,confidence:float,reasoning:string}}',
        ]
        const user = new ToonWriter()
        user.object('eval_context', (ctx) => {
            ctx.field('question', question, { maxLength: 1000 })
            ctx.field('agent_response', agentResponse, { style: 'opaque', maxLength: 8000 })
            if (expectedAnswer?.trim()) ctx.field('expected_answer', expectedAnswer, { style: 'opaque', maxLength: 3000 })
        })
        user.separator()
        user.list('claim_verdicts', claimVerdicts, (list, v) => {
            list.itemObject([{ key: 'claim', value: v.claimText, maxLength: 400 }, { key: 'verdict', value: v.verdict, maxLength: 40 }, { key: 'reasoning', value: v.reasoning, maxLength: 200 }])
        })
        user.separator()
        const scoreHints = [question, agentResponse, expectedAnswer || '', ...claimVerdicts.map(c => c.claimText)]
        user.list('ref_doc_excerpts', refChunks, (list, chunk) => {
            list.itemObject([{ key: 'id', value: chunk.id, maxLength: 100 }, { key: 'content', value: NimService.buildExcerptWindow(chunk.content, scoreHints, 1800), style: 'opaque', maxLength: 1800 }])
        })
        const raw = await this.executeWithFallback(sysLines.join('\n'), user.toString(), modelOverride, 0, MAX_TOKENS.dimension_scoring, true, 'dimension_scoring', { claim_count: claimVerdicts.length, ref_chunk_count: refChunks.length })
        const parsed = NimService.parseJsonResponse(raw)
        const defaultDim = { score: 0, confidence: 0, reasoning: '' }
        return {
            factualAccuracy: parsed.factualAccuracy ?? defaultDim,
            completeness: parsed.completeness ?? defaultDim,
            faithfulness: parsed.faithfulness ?? defaultDim,
            relevance: parsed.relevance ?? defaultDim,
        }
    }

    async rerankChunks(question: string, agentResponse: string, chunks: Array<{ id: string; content: string }>, topK: number, modelOverride?: string): Promise<string[]> {
        const sysLines: string[] = [
            '@role:relevance_ranker',
            '@task:rank_document_chunks_by_semantic_relevance_to_question_and_response',
            `@rules:rank_by_semantic_meaning_not_keyword_overlap|consider_paraphrases_synonyms_and_implied_concepts|return_only_chunk_ids_in_order_most_relevant_first|omit_chunks_with_zero_relevance|limit_to_top_${topK}`,
            `@out_fmt:json_array[string]  // ordered chunk IDs, most relevant first, max ${topK} items`,
        ]
        const user = new ToonWriter()
        user.object('eval_query', (q) => { q.field('question', question, { maxLength: 1000 }); q.field('agent_response', agentResponse, { style: 'opaque', maxLength: 3000 }) })
        user.separator()
        user.list('candidate_chunks', chunks, (list, chunk) => {
            list.itemObject([{ key: 'id', value: chunk.id, maxLength: 100 }, { key: 'content', value: NimService.buildExcerptWindow(chunk.content, [question, agentResponse], 1600), style: 'opaque', maxLength: 1600 }])
        })
        const raw = await this.executeWithFallback(sysLines.join('\n'), user.toString(), modelOverride, 0, 512, true, 'chunk_rerank', { chunk_count: chunks.length, top_k: topK })
        const parsed = NimService.parseJsonResponse(raw)
        if (!Array.isArray(parsed)) return chunks.slice(0, topK).map(c => c.id)
        const validIds = new Set(chunks.map(c => c.id))
        const ranked = (parsed as any[]).filter((id): id is string => typeof id === 'string' && validIds.has(id))
        const unranked = chunks.map(c => c.id).filter(id => !ranked.includes(id))
        return [...ranked, ...unranked].slice(0, topK)
    }

    async generateStandupSummary(metrics: {
        projectName: string; date: string; readyForQa: number; blocked: number; failedTests: number; overdueTasks: number;
        recentRuns: Array<{ planName: string; passed: number; total: number }>; recentlyVerified: string[]; highPriorityOpen: string[]
    }, modelName?: string): Promise<string> {
        const sysLines: string[] = [
            '@role:sr_qa_engineer', '@task:daily_standup_summary',
            '@output_format:plain_text_markdown—concise—structured—no_filler',
            '@rules:3_sections_only:Yesterday_Today_Blockers|bullet_points|max_150_words_total|be_specific_not_generic|omit_sections_with_no_items',
        ]
        const user = new ToonWriter()
        user.object('standup_data', (s) => {
            s.field('project', metrics.projectName, { maxLength: 100 })
            s.field('date', metrics.date, { maxLength: 40 })
            s.field('ready_for_qa_count', metrics.readyForQa)
            s.field('blocked_tasks', metrics.blocked)
            s.field('failed_test_cases', metrics.failedTests)
            s.field('overdue_tasks', metrics.overdueTasks)
        })
        user.separator()
        user.list('recent_runs', metrics.recentRuns.slice(0, 8), (list, run) => {
            list.itemObject([{ key: 'plan', value: run.planName, maxLength: 120 }, { key: 'passed', value: run.passed }, { key: 'total', value: run.total }])
        })
        user.separator()
        user.list('recently_verified', metrics.recentlyVerified.slice(0, 10), (list, item) => { list.itemObject([{ key: 'item', value: item, maxLength: 120 }]) })
        user.separator()
        user.list('high_priority_open', metrics.highPriorityOpen.slice(0, 10), (list, item) => { list.itemObject([{ key: 'item', value: item, maxLength: 120 }]) })
        user.line('produce_standup_summary_for_a_qa_engineer_sharing_status_with_their_team')
        return await this.executeWithFallback(sysLines.join('\n'), user.toString(), modelName, 0.6, 1024, false, 'standup_summary', {
            recent_runs: Math.min(metrics.recentRuns.length, 8), recently_verified: Math.min(metrics.recentlyVerified.length, 10), high_priority_open: Math.min(metrics.highPriorityOpen.length, 10),
        })
    }

    async findDuplicateBugs(
        newBugTitle: string, newBugDescription: string, newBugReproSteps: string,
        affectedComponents: string[], existingBugs: Array<{ id: string; title: string; description: string; components?: string[] }>,
        modelName?: string
    ): Promise<Array<{ bugId: string; title: string; similarityScore: number; reasoning: string }>> {
        if (existingBugs.length === 0) return []
        const sysLines: string[] = [
            '@role:qa_duplicate_detector', '@task:find_duplicate_bugs',
            '@out_fmt:json_array[{bugId,title,similarityScore,reasoning}]',
            '@rules:compare_semantically_not_just_keywords|consider_repro_steps_and_components|similarityScore_0_to_100|only_return_bugs_with_score_above_40|max_5_results|order_by_score_desc|reasoning_max_80_chars|return_empty_array_if_no_duplicates',
        ]
        const user = new ToonWriter()
        user.object('new_bug', (bug) => {
            bug.field('title', newBugTitle, { maxLength: 200 })
            bug.field('description', newBugDescription, { maxLength: 400 })
            bug.field('repro_steps', newBugReproSteps, { maxLength: 400 })
            bug.field('components', sanitizeToonList(affectedComponents, 24, 8), { style: 'literal' })
        })
        user.separator()
        user.list('existing_open_bugs', existingBugs.slice(0, 40), (list, bug) => {
            list.itemObject([
                { key: 'bugId', value: bug.id, maxLength: 50 },
                { key: 'title', value: bug.title, maxLength: 200 },
                { key: 'description', value: bug.description, maxLength: 200 },
                { key: 'components', value: sanitizeToonList(bug.components || [], 24, 8), style: 'literal' },
            ])
        })
        const raw = await this.executeWithFallback(sysLines.join('\n'), user.toString(), modelName, 0.2, 1024, true, 'duplicate_bug_detection', { existing_bug_count: Math.min(existingBugs.length, 40), component_count: Math.min(affectedComponents.length, 8) })
        const parsed = NimService.parseJsonResponse(raw)
        if (!Array.isArray(parsed)) return []
        return (parsed as any[]).filter(d => d && typeof d.bugId === 'string').map(d => ({
            bugId: String(d.bugId), title: String(d.title || ''), similarityScore: Number(d.similarityScore) || 0, reasoning: String(d.reasoning || ''),
        })).slice(0, 5)
    }

    async analyzePullRequest(
        pr: {
            number: number; title: string; description?: string; baseBranch: string; headBranch: string; ciStatus?: string | null; mergeableState?: string;
            files: Array<{ filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string }>;
            reviews?: Array<{ user: string; state: string; submittedAt?: string; body?: string }>;
            comments?: Array<{ user: string; body: string; createdAt: string }>;
        },
        testCases: Array<{ id: string; title: string; sapModule?: string; components?: string[]; tags?: string[] }>,
        project?: any,
        modelName?: string
    ): Promise<PullRequestAnalysisResult> {
        const sysLines: string[] = [
            '@role:sr_qa_engineer', '@task:pull_request_analysis',
            '@out_fmt:json{summary:string,riskLevel:low|medium|high|critical,hotspots:{file:string,reason:string}[],affectedAreas:string[],qaChecks:string[],impactedCaseIds:string[],rationale:string}',
            '@rules:analyze_pr_intent_and_changed_code|identify_review_hotspots_and_regression_risk|qaChecks_must_be_actionable_and_specific|hotspots_max_6|affectedAreas_max_8|qaChecks_max_8|summary_max_120_words|rationale_max_240_chars|impactedCaseIds_must_only_reference_ids_from_test_cases|return_empty_impactedCaseIds_if_no_confident_match|still_return_summary_and_qaChecks_when_test_cases_are_empty|be_concise_and_concrete',
        ]
        const user = new ToonWriter()
        const telemetry: PromptTelemetry = {
            ...NimService.appendQaContext(user, project, { includeTrackedIssues: false, includeTestCoverage: false, includeChecklistAreas: false, includeTestDataDomains: false }),
        }
        const visibleFiles = (pr.files || []).slice(0, 24)
        const patchEligibleFiles = new Set([...visibleFiles].sort((a, b) => (Number(b.changes) || 0) - (Number(a.changes) || 0) || a.filename.localeCompare(b.filename)).slice(0, 8).map(f => f.filename))
        user.object('pr_context', (ctx) => {
            ctx.field('number', pr.number); ctx.field('title', pr.title, { maxLength: 200 })
            ctx.field('description', pr.description || '', { style: 'block', maxLength: 1500 })
            ctx.field('base_branch', pr.baseBranch, { maxLength: 120 }); ctx.field('head_branch', pr.headBranch, { maxLength: 120 })
            ctx.field('ci_status', pr.ciStatus || 'unknown', { maxLength: 60 }); ctx.field('mergeable_state', pr.mergeableState || 'unknown', { maxLength: 60 })
        })
        user.separator()
        user.list('changed_files', visibleFiles, (list, file) => {
            list.itemObject([
                { key: 'filename', value: file.filename, maxLength: 240 }, { key: 'status', value: file.status, maxLength: 40 },
                { key: 'additions', value: Number(file.additions) || 0 }, { key: 'deletions', value: Number(file.deletions) || 0 }, { key: 'changes', value: Number(file.changes) || 0 },
                { key: 'patch', value: patchEligibleFiles.has(file.filename) ? file.patch || '' : undefined, style: 'block', maxLength: 1500 },
            ])
        })
        telemetry.file_count = visibleFiles.length; telemetry.file_patches = patchEligibleFiles.size
        user.separator()
        user.list('reviews', (pr.reviews || []).slice(0, 12), (list, review) => {
            list.itemObject([{ key: 'user', value: review.user, maxLength: 80 }, { key: 'state', value: review.state, maxLength: 60 }, { key: 'submittedAt', value: review.submittedAt || '', maxLength: 80 }, { key: 'body', value: review.body || '', style: 'block', maxLength: 300 }])
        })
        user.separator()
        user.list('comments', (pr.comments || []).slice(-12), (list, comment) => {
            list.itemObject([{ key: 'user', value: comment.user, maxLength: 80 }, { key: 'createdAt', value: comment.createdAt, maxLength: 80 }, { key: 'body', value: comment.body, style: 'block', maxLength: 300 }])
        })
        user.separator()
        user.list('test_cases', testCases.slice(0, 120), (list, tc) => {
            list.itemObject([
                { key: 'id', value: tc.id, maxLength: 50 }, { key: 'title', value: tc.title, maxLength: 200 },
                { key: 'sapModule', value: tc.sapModule, maxLength: 80 },
                { key: 'components', value: sanitizeToonList(tc.components || [], 24, 8), style: 'literal' },
                { key: 'tags', value: sanitizeToonList(tc.tags || [], 24, 8), style: 'literal' },
            ])
        })
        telemetry.test_case_count = Math.min(testCases.length, 120)
        const raw = await this.executeWithFallback(sysLines.join('\n'), user.toString(), modelName, 0.2, MAX_TOKENS.pr_analysis, true, 'pr_analysis', telemetry)
        const parsed = NimService.parseJsonResponse(raw)
        return normalizePullRequestAnalysisResult(parsed)
    }
}
