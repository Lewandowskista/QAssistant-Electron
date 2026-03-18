import type {
    AccuracyTestSuite,
    AccuracyEvalRun,
    AccuracyQaPairResult,
    AccuracyDimensionScore,
    AccuracyClaim,
    AccuracyScoreDimension
} from '@/types/project'

// ── Score helpers ────────────────────────────────────────────────────────────

export type ScoreLabel = 'Excellent' | 'Good' | 'Fair' | 'Poor'

export function getScoreLabel(score: number): ScoreLabel {
    if (score >= 90) return 'Excellent'
    if (score >= 70) return 'Good'
    if (score >= 50) return 'Fair'
    return 'Poor'
}

export function getScoreColor(score: number): string {
    if (score >= 90) return '#10B981' // green
    if (score >= 70) return '#3B82F6' // blue
    if (score >= 50) return '#F59E0B' // amber
    return '#EF4444'                  // red
}

export function getScoreBg(score: number): string {
    if (score >= 90) return 'bg-emerald-500/10 text-emerald-400'
    if (score >= 70) return 'bg-blue-500/10 text-blue-400'
    if (score >= 50) return 'bg-amber-500/10 text-amber-400'
    return 'bg-red-500/10 text-red-400'
}

export function getVerdictColor(verdict: string): string {
    switch (verdict) {
        case 'supported': return 'text-emerald-400'
        case 'contradicted': return 'text-red-400'
        case 'partially_supported': return 'text-amber-400'
        case 'unverifiable': return 'text-slate-400'
        default: return 'text-slate-400'
    }
}

export function getVerdictBg(verdict: string): string {
    switch (verdict) {
        case 'supported': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        case 'contradicted': return 'bg-red-500/10 text-red-400 border-red-500/20'
        case 'partially_supported': return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        case 'unverifiable': return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
        default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
}

export function getVerdictLabel(verdict: string): string {
    switch (verdict) {
        case 'supported': return 'Supported'
        case 'contradicted': return 'Contradicted'
        case 'partially_supported': return 'Partial'
        case 'unverifiable': return 'Unverifiable'
        default: return verdict
    }
}

export const DIMENSION_LABELS: Record<AccuracyScoreDimension, string> = {
    factualAccuracy: 'Factual Accuracy',
    completeness: 'Completeness',
    faithfulness: 'Faithfulness',
    relevance: 'Relevance'
}

// Weighted scoring: factual accuracy matters most for knowledge-base chatbots
const DIMENSION_WEIGHTS: Record<AccuracyScoreDimension, number> = {
    factualAccuracy: 0.35,
    faithfulness: 0.25,
    completeness: 0.25,
    relevance: 0.15
}

export function computeOverallScore(dimensionScores: AccuracyDimensionScore[]): number {
    let total = 0
    let weightSum = 0
    for (const ds of dimensionScores) {
        const weight = DIMENSION_WEIGHTS[ds.dimension] ?? 0.25
        total += ds.score * weight
        weightSum += weight
    }
    return weightSum > 0 ? Math.round(total / weightSum) : 0
}

export function computeAggregateScores(pairResults: AccuracyQaPairResult[]): {
    aggregateScore: number
    aggregateDimensions: AccuracyDimensionScore[]
} {
    if (pairResults.length === 0) {
        return { aggregateScore: 0, aggregateDimensions: [] }
    }

    const dimensions: AccuracyScoreDimension[] = ['factualAccuracy', 'completeness', 'faithfulness', 'relevance']
    const aggregateDimensions: AccuracyDimensionScore[] = dimensions.map(dim => {
        const scores = pairResults.flatMap(r => r.dimensionScores.filter(ds => ds.dimension === dim))
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, ds) => s + ds.score, 0) / scores.length) : 0
        const avgConf = scores.length > 0 ? scores.reduce((s, ds) => s + ds.confidence, 0) / scores.length : 0
        return { dimension: dim, score: avgScore, confidence: avgConf, reasoning: '' }
    })

    const aggregateScore = Math.round(pairResults.reduce((s, r) => s + r.overallScore, 0) / pairResults.length)
    return { aggregateScore, aggregateDimensions }
}

// ── CSV import helpers ───────────────────────────────────────────────────────

export const QA_PAIR_CSV_ALIASES: Record<string, string[]> = {
    question: ['question', 'q', 'query', 'input', 'user_input', 'user input', 'prompt'],
    agentResponse: ['response', 'answer', 'agent_response', 'agent response', 'output', 'ai_response', 'ai response', 'chatbot_response', 'chatbot response']
}

export function autoDetectQaPairMappings(headers: string[]): Record<string, string> {
    const mappings: Record<string, string> = {}
    const lowerHeaders = headers.map(h => h.toLowerCase().trim())

    for (const [field, aliases] of Object.entries(QA_PAIR_CSV_ALIASES)) {
        const idx = lowerHeaders.findIndex(h => aliases.includes(h))
        if (idx !== -1) {
            mappings[field] = headers[idx]
        }
    }
    return mappings
}

// ── Evaluation pipeline ──────────────────────────────────────────────────────

export type DocChunkData = {
    id: string
    docId: string
    content: string
    chunkIndex: number
    tokenEstimate: number
}

export type EvalProgressCallback = (completedPairs: number, totalPairs: number, currentQuestion?: string) => void

/**
 * Orchestrates the full accuracy evaluation pipeline for a suite.
 * Calls the Electron IPC handlers sequentially per QA pair.
 */
export async function runAccuracyEvaluation(
    suite: AccuracyTestSuite,
    apiKey: string,
    modelName: string | undefined,
    onProgress: EvalProgressCallback,
    signal?: AbortSignal
): Promise<AccuracyEvalRun> {
    const api = window.electronAPI

    const runId = crypto.randomUUID()
    const totalPairs = suite.qaPairs.length

    // Step 1: Read and chunk all reference documents
    const allChunks: DocChunkData[] = []
    for (const doc of suite.referenceDocuments) {
        if (signal?.aborted) throw new Error('Evaluation cancelled')
        const result = await api.readDocumentText({ filePath: doc.filePath })
        if (!result.success || !result.text) {
            throw new Error(`Failed to read document "${doc.fileName}": ${result.error || 'Unknown error'}`)
        }
        // Chunk the text (client-side, mirroring electron/accuracy.ts logic)
        const chunks = clientChunkDocument(result.text, doc.id)
        allChunks.push(...chunks)
    }

    const pairResults: AccuracyQaPairResult[] = []

    // Step 2: Evaluate each QA pair sequentially
    for (let i = 0; i < suite.qaPairs.length; i++) {
        if (signal?.aborted) throw new Error('Evaluation cancelled')

        const pair = suite.qaPairs[i]
        onProgress(i, totalPairs, pair.question)

        // Find relevant chunks for this pair.
        // verifyClaims needs enough context to look up every claim citation.
        // scoreDimensions needs a representative sample — a smaller window keeps
        // the prompt within the model's safe output-generation range.
        // Both calls receive the same chunk set (top-20 by relevance, ≤20k tokens)
        // so the model never sees a prompt so large that it truncates its output.
        const relevantChunks = findRelevantChunksClient(pair.question, pair.agentResponse, allChunks, 20000, 20)
        const refChunksForApi = relevantChunks.map(c => ({ id: c.id, content: c.content }))

        // LLM Call 1: Extract claims
        const rawClaims = await api.aiAccuracyExtractClaims({
            apiKey,
            agentResponse: pair.agentResponse,
            modelName
        })
        if (rawClaims?.__isError) throw new Error(rawClaims.message ?? 'Claim extraction failed')

        const claimsArray = Array.isArray(rawClaims) ? rawClaims : []

        // LLM Call 2: Verify claims
        const rawVerification = claimsArray.length > 0
            ? await api.aiAccuracyVerifyClaims({ apiKey, claims: claimsArray, refChunks: refChunksForApi, modelName })
            : []
        if (rawVerification?.__isError) throw new Error(rawVerification.message ?? 'Claim verification failed')
        const verificationResults = Array.isArray(rawVerification) ? rawVerification : []

        // Build AccuracyClaim objects
        const extractedClaims: AccuracyClaim[] = claimsArray.map((c, idx) => {
            const verification = verificationResults.find((v: any) => v.claimIndex === idx)
            return {
                id: `${runId}-${pair.id}-claim-${idx}`,
                claimText: c.claimText,
                verdict: verification?.verdict ?? 'unverifiable',
                confidence: verification?.confidence ?? 0,
                sourceChunkIds: verification?.sourceChunkIds ?? [],
                reasoning: verification?.reasoning ?? ''
            }
        })

        // LLM Call 3: Score dimensions
        const claimVerdictsForScoring = extractedClaims.map(c => ({
            claimText: c.claimText,
            verdict: c.verdict,
            reasoning: c.reasoning
        }))

        const dimensionScoresRaw = await api.aiAccuracyScoreDimensions({
            apiKey,
            question: pair.question,
            agentResponse: pair.agentResponse,
            claimVerdicts: claimVerdictsForScoring,
            refChunks: refChunksForApi,
            modelName
        })
        if (dimensionScoresRaw?.__isError) throw new Error(dimensionScoresRaw.message ?? 'Dimension scoring failed')

        const dimensionScores: AccuracyDimensionScore[] = (
            ['factualAccuracy', 'completeness', 'faithfulness', 'relevance'] as AccuracyScoreDimension[]
        ).map(dim => ({
            dimension: dim,
            score: dimensionScoresRaw[dim]?.score ?? 0,
            confidence: dimensionScoresRaw[dim]?.confidence ?? 0,
            reasoning: dimensionScoresRaw[dim]?.reasoning ?? ''
        }))

        const overallScore = computeOverallScore(dimensionScores)

        pairResults.push({
            id: `${runId}-${pair.id}`,
            question: pair.question,
            agentResponse: pair.agentResponse,
            overallScore,
            dimensionScores,
            extractedClaims,
            evaluatedAt: Date.now()
        })

        onProgress(i + 1, totalPairs)
    }

    const { aggregateScore, aggregateDimensions } = computeAggregateScores(pairResults)

    return {
        id: runId,
        name: `Eval Run ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        status: 'completed',
        qaPairResults: pairResults,
        aggregateScore,
        aggregateDimensions,
        totalPairs,
        completedPairs: pairResults.length,
        startedAt: Date.now(),
        completedAt: Date.now()
    }
}

// ── Client-side chunking (mirrors electron/accuracy.ts) ─────────────────────

const CHUNK_TARGET_CHARS = 6000
const CHUNK_OVERLAP_CHARS = 800

function clientChunkDocument(text: string, docId: string): DocChunkData[] {
    const chunks: DocChunkData[] = []
    const paragraphs = text.split(/\n\n+/)
    let current = ''
    let chunkIndex = 0

    for (const para of paragraphs) {
        const trimmed = para.trim()
        if (!trimmed) continue

        if (current.length + trimmed.length + 2 > CHUNK_TARGET_CHARS && current.length > 0) {
            chunks.push({
                id: `${docId}:${chunkIndex}`,
                docId,
                content: current.trim(),
                chunkIndex,
                tokenEstimate: Math.ceil(current.length / 4)
            })
            chunkIndex++
            const overlap = current.length > CHUNK_OVERLAP_CHARS ? current.slice(-CHUNK_OVERLAP_CHARS) : current
            current = overlap + '\n\n' + trimmed
        } else {
            current = current ? current + '\n\n' + trimmed : trimmed
        }
    }

    if (current.trim()) {
        chunks.push({
            id: `${docId}:${chunkIndex}`,
            docId,
            content: current.trim(),
            chunkIndex,
            tokenEstimate: Math.ceil(current.length / 4)
        })
    }

    return chunks
}

const STOPWORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'is',
    'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
    'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
    'we', 'they', 'what', 'which', 'who', 'how', 'when', 'where', 'if',
    'not', 'no', 'can', 'so', 'as', 'than', 'then', 'just', 'also'
])

function tokenize(text: string): Set<string> {
    return new Set(
        text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !STOPWORDS.has(w))
    )
}

function findRelevantChunksClient(
    question: string,
    agentResponse: string,
    allChunks: DocChunkData[],
    maxTokens: number,
    maxChunks = 20
): DocChunkData[] {
    const queryTerms = new Set([...tokenize(question), ...tokenize(agentResponse)])

    const scored = allChunks.map(chunk => {
        const chunkTerms = tokenize(chunk.content)
        let matches = 0
        for (const term of queryTerms) {
            if (chunkTerms.has(term)) matches++
        }
        const score = queryTerms.size > 0 ? matches / queryTerms.size : 0
        return { chunk, score }
    })

    scored.sort((a, b) => b.score - a.score)

    const selected: DocChunkData[] = []
    let tokenCount = 0
    for (const { chunk } of scored) {
        if (selected.length >= maxChunks) break
        if (tokenCount + chunk.tokenEstimate > maxTokens) break
        selected.push(chunk)
        tokenCount += chunk.tokenEstimate
    }

    return selected
}
