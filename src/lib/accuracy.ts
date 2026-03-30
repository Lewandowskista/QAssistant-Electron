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
    // Only include successfully evaluated pairs
    const successfulResults = pairResults.filter(r => r.status !== 'failed')
    if (successfulResults.length === 0) {
        return { aggregateScore: 0, aggregateDimensions: [] }
    }

    const dimensions: AccuracyScoreDimension[] = ['factualAccuracy', 'completeness', 'faithfulness', 'relevance']
    const aggregateDimensions: AccuracyDimensionScore[] = dimensions.map(dim => {
        const scores = successfulResults.flatMap(r => r.dimensionScores.filter(ds => ds.dimension === dim))
        // Confidence-weighted average: pairs with higher confidence contribute more to the aggregate
        const totalConfidence = scores.reduce((s, ds) => s + ds.confidence, 0)
        const weightedScore = totalConfidence > 0
            ? scores.reduce((s, ds) => s + ds.score * ds.confidence, 0) / totalConfidence
            : scores.reduce((s, ds) => s + ds.score, 0) / (scores.length || 1)
        const avgConf = scores.length > 0 ? totalConfidence / scores.length : 0
        return { dimension: dim, score: Math.round(weightedScore), confidence: avgConf, reasoning: '' }
    })

    // Confidence-weighted aggregate overall score
    const totalConf = successfulResults.reduce((s, r) => {
        const avgPairConf = r.dimensionScores.length > 0
            ? r.dimensionScores.reduce((a, ds) => a + ds.confidence, 0) / r.dimensionScores.length
            : 0
        return s + avgPairConf
    }, 0)
    const aggregateScore = totalConf > 0
        ? Math.round(successfulResults.reduce((s, r) => {
            const avgPairConf = r.dimensionScores.length > 0
                ? r.dimensionScores.reduce((a, ds) => a + ds.confidence, 0) / r.dimensionScores.length
                : 0
            return s + r.overallScore * avgPairConf
        }, 0) / totalConf)
        : Math.round(successfulResults.reduce((s, r) => s + r.overallScore, 0) / successfulResults.length)

    return { aggregateScore, aggregateDimensions }
}

/**
 * Deterministically computes faithfulness from claim verdicts.
 * Unverifiable claims are treated as hallucinations and penalise the score.
 * Returns 100 if there are no claims (nothing to penalise).
 */
export function computeFaithfulnessFromClaims(claims: import('@/types/project').AccuracyClaim[]): number {
    if (claims.length === 0) return 100
    const unverifiableCount = claims.filter(c => c.verdict === 'unverifiable').length
    return Math.round(100 * (1 - unverifiableCount / claims.length))
}

/**
 * Deterministically computes factual accuracy from claim verdicts.
 * Supported claims count fully; partially_supported count as half.
 * Returns 100 if there are no claims.
 */
export function computeFactualAccuracyFromClaims(claims: import('@/types/project').AccuracyClaim[]): number {
    if (claims.length === 0) return 100
    const supported = claims.filter(c => c.verdict === 'supported').length
    const partial = claims.filter(c => c.verdict === 'partially_supported').length
    return Math.round(100 * (supported + 0.5 * partial) / claims.length)
}

// ── CSV import helpers ───────────────────────────────────────────────────────

export const QA_PAIR_CSV_ALIASES: Record<string, string[]> = {
    question: ['question', 'q', 'query', 'input', 'user_input', 'user input', 'prompt'],
    agentResponse: ['response', 'answer', 'agent_response', 'agent response', 'output', 'ai_response', 'ai response', 'chatbot_response', 'chatbot response'],
    expectedAnswer: ['expected', 'expected_answer', 'expected answer', 'correct', 'correct_answer', 'correct answer', 'ground_truth', 'ground truth', 'human_answer', 'human answer', 'ideal', 'ideal_answer', 'ideal answer']
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

type VerificationResult = { claimIndex: number; verdict: string; confidence: number; sourceChunkIds: string[]; reasoning: string }

/**
 * Merges two sets of claim verification results for self-consistency (3B).
 * When both passes agree, confidence is the max of the two.
 * When they disagree, the more conservative verdict wins and confidence is halved.
 * Conservative precedence: contradicted > partially_supported > unverifiable > supported
 */
function mergeVerificationResults(
    pass1: VerificationResult[],
    pass2: VerificationResult[]
): VerificationResult[] {
    const PRECEDENCE: Record<string, number> = { contradicted: 4, partially_supported: 3, unverifiable: 2, supported: 1 }
    return pass1.map((a, i) => {
        const b = pass2.find(r => r.claimIndex === a.claimIndex) ?? pass2[i]
        if (!b) return a
        if (a.verdict === b.verdict) {
            return { ...a, confidence: Math.max(a.confidence, b.confidence) }
        }
        // Disagreement: take the more conservative verdict at halved confidence
        const aPrec = PRECEDENCE[a.verdict] ?? 1
        const bPrec = PRECEDENCE[b.verdict] ?? 1
        const conservative = aPrec >= bPrec ? a : b
        return {
            ...conservative,
            confidence: 0.5 * ((a.confidence + b.confidence) / 2),
            reasoning: `[Dual-pass disagreement: ${a.verdict} vs ${b.verdict}] ${conservative.reasoning}`
        }
    })
}

export type DocChunkData = {
    id: string
    docId: string
    content: string
    chunkIndex: number
    tokenEstimate: number
}

export type EvalProgressCallback = (completedPairs: number, totalPairs: number, currentQuestion?: string) => void

// Maximum number of QA pairs evaluated concurrently.
// 3 is safe given the 3s per-channel rate limit and keeps API pressure low.
const EVAL_CONCURRENCY = 3

/**
 * Evaluates a single QA pair through the 3-step pipeline.
 * Returns an AccuracyQaPairResult or throws on unrecoverable error.
 */
async function evaluatePair(
    pair: AccuracyTestSuite['qaPairs'][number],
    allChunks: DocChunkData[],
    preTokenizedChunks: Map<string, Set<string>>,
    documentFrequency: Map<string, number>,
    runId: string,
    apiKey: string,
    modelName: string | undefined,
    highAccuracyMode = false
): Promise<AccuracyQaPairResult> {
    const api = window.electronAPI

    // 2A: TF-IDF retrieval — fetch top 30 candidates (wider net for re-ranker)
    const candidateCount = highAccuracyMode ? 30 : 20
    const candidateChunks = findRelevantChunksClient(pair.question, pair.agentResponse, allChunks, 40000, candidateCount, preTokenizedChunks, documentFrequency)

    // 4B: LLM re-ranking — semantically re-orders candidates and trims to final top 20
    let relevantChunks = candidateChunks
    if (highAccuracyMode && candidateChunks.length > 0) {
        const candidatesForApi = candidateChunks.map(c => ({ id: c.id, content: c.content }))
        const rankedIds = await api.aiAccuracyRerankChunks({
            apiKey,
            question: pair.question,
            agentResponse: pair.agentResponse,
            chunks: candidatesForApi,
            topK: 20,
            modelName
        })
        // Re-order candidateChunks to match LLM ranking, then trim to 20
        const idToChunk = new Map(candidateChunks.map(c => [c.id, c]))
        relevantChunks = (Array.isArray(rankedIds) ? rankedIds as string[] : [])
            .map(id => idToChunk.get(id))
            .filter((c): c is DocChunkData => c !== undefined)
            .slice(0, 20)
        // Fallback: if re-ranking returned nothing, use TF-IDF top 20
        if (relevantChunks.length === 0) relevantChunks = candidateChunks.slice(0, 20)
    }

    const refChunksForApi = relevantChunks.map(c => ({ id: c.id, content: c.content }))

    // LLM Call 1: Extract claims (2B: pass expectedAnswer so the model can prioritise diagnostic claims)
    let rawClaims = await api.aiAccuracyExtractClaims({
        apiKey,
        agentResponse: pair.agentResponse,
        modelName,
        expectedAnswer: pair.expectedAnswer
    })
    let claimExtractionRetried = false

    // 1A: Validate claim extraction output — strip malformed entries
    const VALID_CLAIM_TYPES = new Set(['factual', 'procedural', 'definitional', 'numerical'])
    let claimsArray: Array<{ claimText: string; claimType: string }> = Array.isArray(rawClaims)
        ? rawClaims.filter((c: any) => typeof c?.claimText === 'string' && c.claimText.trim() !== '')
              .map((c: any) => ({
                  claimText: c.claimText.trim(),
                  claimType: VALID_CLAIM_TYPES.has(c.claimType) ? c.claimType : 'factual'
              }))
        : []

    // If count is out of range (< 3 or > 15), retry once
    if (claimsArray.length < 3 || claimsArray.length > 15) {
        claimExtractionRetried = true
        rawClaims = await api.aiAccuracyExtractClaims({
            apiKey,
            agentResponse: pair.agentResponse,
            modelName
        })
        const retriedClaims: Array<{ claimText: string; claimType: string }> = Array.isArray(rawClaims)
            ? rawClaims.filter((c: any) => typeof c?.claimText === 'string' && c.claimText.trim() !== '')
                  .map((c: any) => ({
                      claimText: c.claimText.trim(),
                      claimType: VALID_CLAIM_TYPES.has(c.claimType) ? c.claimType : 'factual'
                  }))
            : []
        // If retry is better, use it; otherwise keep original (clamped to first 15)
        if (retriedClaims.length >= 3 && retriedClaims.length <= 15) {
            claimsArray = retriedClaims
        } else {
            // Clamp to first 15 if too many; keep what we have if too few
            claimsArray = (retriedClaims.length > claimsArray.length ? retriedClaims : claimsArray).slice(0, 15)
        }
    }

    // LLM Call 2: Verify claims (2B: pass expectedAnswer; 3B: dual-pass when highAccuracyMode)
    const verifyArgs = { apiKey, claims: claimsArray, refChunks: refChunksForApi, modelName, expectedAnswer: pair.expectedAnswer }
    let verificationResults: VerificationResult[] = []
    if (claimsArray.length > 0) {
        const pass1Raw = await api.aiAccuracyVerifyClaims(verifyArgs)
        const pass1: VerificationResult[] = Array.isArray(pass1Raw) ? pass1Raw as VerificationResult[] : []
        if (highAccuracyMode) {
            const pass2Raw = await api.aiAccuracyVerifyClaims(verifyArgs)
            const pass2: VerificationResult[] = Array.isArray(pass2Raw) ? pass2Raw as VerificationResult[] : []
            verificationResults = mergeVerificationResults(pass1, pass2)
        } else {
            verificationResults = pass1
        }
    }

    // Build AccuracyClaim objects
    const extractedClaims: AccuracyClaim[] = claimsArray.map((c: any, idx: number) => {
        const verification = verificationResults.find((v: any) => v.claimIndex === idx)
        return {
            id: `${runId}-${pair.id}-claim-${idx}`,
            claimText: c.claimText,
            verdict: (verification?.verdict ?? 'unverifiable') as import('@/types/project').ClaimVerdict,
            confidence: verification?.confidence ?? 0,
            sourceChunkIds: verification?.sourceChunkIds ?? [],
            reasoning: verification?.reasoning ?? ''
        }
    })

    // 1D / 4A: Pre-compute faithfulness and factual accuracy deterministically
    const deterministicFaithfulness = computeFaithfulnessFromClaims(extractedClaims)
    const deterministicFactualAccuracy = computeFactualAccuracyFromClaims(extractedClaims)

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
        expectedAnswer: pair.expectedAnswer,
        claimVerdicts: claimVerdictsForScoring,
        refChunks: refChunksForApi,
        modelName
    })
    const dimensionScores: AccuracyDimensionScore[] = (
        ['factualAccuracy', 'completeness', 'faithfulness', 'relevance'] as AccuracyScoreDimension[]
    ).map(dim => {
        const raw = dimensionScoresRaw[dim]
        // 1D: Override faithfulness deterministically; keep LLM reasoning
        if (dim === 'faithfulness') {
            return {
                dimension: dim,
                score: deterministicFaithfulness,
                confidence: extractedClaims.length > 0 ? 1.0 : (raw?.confidence ?? 0),
                reasoning: raw?.reasoning ?? ''
            }
        }
        // 4A: Override factualAccuracy deterministically; keep LLM reasoning
        if (dim === 'factualAccuracy') {
            return {
                dimension: dim,
                score: deterministicFactualAccuracy,
                confidence: extractedClaims.length > 0 ? 1.0 : (raw?.confidence ?? 0),
                reasoning: raw?.reasoning ?? ''
            }
        }
        return {
            dimension: dim,
            score: raw?.score ?? 0,
            confidence: raw?.confidence ?? 0,
            reasoning: raw?.reasoning ?? ''
        }
    })

    return {
        id: `${runId}-${pair.id}`,
        question: pair.question,
        agentResponse: pair.agentResponse,
        overallScore: computeOverallScore(dimensionScores),
        dimensionScores,
        extractedClaims,
        evaluatedAt: Date.now(),
        status: 'success',
        claimExtractionRetried
    }
}

/**
 * Orchestrates the full accuracy evaluation pipeline for a suite.
 * Evaluates QA pairs with bounded concurrency (EVAL_CONCURRENCY at a time)
 * to reduce wall-clock time while respecting per-channel rate limits.
 */
export async function runAccuracyEvaluation(
    suite: AccuracyTestSuite,
    apiKey: string,
    modelName: string | undefined,
    onProgress: EvalProgressCallback,
    signal?: AbortSignal
): Promise<AccuracyEvalRun> {
    const runId = crypto.randomUUID()
    const totalPairs = suite.qaPairs.length
    const startedAt = Date.now()

    // Step 1: Read and chunk all reference documents
    const allChunks: DocChunkData[] = []
    for (const doc of suite.referenceDocuments) {
        if (signal?.aborted) throw new Error('Evaluation cancelled')
        const result = await window.electronAPI.readDocumentText({ filePath: doc.filePath })
        if (!result.success || !result.text) {
            throw new Error(`Failed to read document "${doc.fileName}": ${result.error || 'Unknown error'}`)
        }
        const chunks = clientChunkDocument(result.text, doc.id)
        allChunks.push(...chunks)
    }

    // Pre-tokenize all chunks once; build DF map for TF-IDF scoring (2A)
    const preTokenizedChunks = new Map<string, Set<string>>()
    for (const chunk of allChunks) {
        preTokenizedChunks.set(chunk.id, tokenizeText(chunk.content))
    }
    const documentFrequency = buildDocumentFrequency(preTokenizedChunks)

    // Step 2: Evaluate pairs with bounded concurrency
    const pairResults: AccuracyQaPairResult[] = new Array(totalPairs)
    let completedCount = 0

    // Semaphore-style pool: keep at most EVAL_CONCURRENCY in-flight
    const queue = suite.qaPairs.map((pair, index) => ({ pair, index }))
    const inFlight = new Set<Promise<void>>()

    async function runOne(pair: typeof queue[number]['pair'], index: number): Promise<void> {
        if (signal?.aborted) throw new Error('Evaluation cancelled')
        onProgress(completedCount, totalPairs, pair.question)
        try {
            const result = await evaluatePair(pair, allChunks, preTokenizedChunks, documentFrequency, runId, apiKey, modelName, suite.highAccuracyMode ?? false)
            pairResults[index] = result
        } catch (err) {
            // 1B: Isolate pair failures — produce a sentinel result so other pairs still complete
            pairResults[index] = {
                id: `${runId}-${pair.id}`,
                question: pair.question,
                agentResponse: pair.agentResponse,
                overallScore: 0,
                dimensionScores: [],
                extractedClaims: [],
                evaluatedAt: Date.now(),
                status: 'failed',
                error: err instanceof Error ? err.message : String(err)
            }
        }
        completedCount++
        onProgress(completedCount, totalPairs)
    }

    for (const { pair, index } of queue) {
        if (signal?.aborted) throw new Error('Evaluation cancelled')

        // Wait until a slot is free
        while (inFlight.size >= EVAL_CONCURRENCY) {
            await Promise.race(inFlight)
        }

        let taskRef: Promise<void>
        // eslint-disable-next-line prefer-const
        taskRef = runOne(pair, index).finally(() => inFlight.delete(taskRef))
        inFlight.add(taskRef)
    }

    // Wait for remaining in-flight tasks
    await Promise.all(inFlight)

    const allPairResults = pairResults.filter(Boolean)
    const { aggregateScore, aggregateDimensions } = computeAggregateScores(allPairResults)
    const successCount = allPairResults.filter(r => r.status !== 'failed').length

    return {
        id: runId,
        name: `Eval Run ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        status: 'completed',
        qaPairResults: allPairResults,
        aggregateScore,
        aggregateDimensions,
        totalPairs,
        completedPairs: successCount,
        startedAt,
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

// Exported so callers can pre-compute tokens once and pass the cache in (Fix 4)
export function tokenizeText(text: string): Set<string> {
    return new Set(
        text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !STOPWORDS.has(w))
    )
}

/**
 * Builds a document-frequency map: term → number of chunks containing that term.
 * Call once after pre-tokenizing all chunks, then pass the result to findRelevantChunksClient.
 */
export function buildDocumentFrequency(preTokenized: Map<string, Set<string>>): Map<string, number> {
    const df = new Map<string, number>()
    for (const terms of preTokenized.values()) {
        for (const term of terms) {
            df.set(term, (df.get(term) ?? 0) + 1)
        }
    }
    return df
}

/**
 * Selects the most relevant chunks for a QA pair using TF-IDF cosine similarity.
 * Rare, discriminative terms are weighted higher than common ones, so synonym-heavy
 * documents rank better than pure keyword overlap would achieve.
 *
 * @param preTokenized  Pre-tokenized terms per chunk (built once per evaluation run)
 * @param df            Document-frequency map (built once per evaluation run)
 */
function findRelevantChunksClient(
    question: string,
    agentResponse: string,
    allChunks: DocChunkData[],
    maxTokens: number,
    maxChunks = 20,
    preTokenized?: Map<string, Set<string>>,
    df?: Map<string, number>
): DocChunkData[] {
    const N = allChunks.length || 1
    const queryTerms = [...new Set([...tokenizeText(question), ...tokenizeText(agentResponse)])]

    // IDF weight for a term: log((N + 1) / (df + 1)) — smoothed to avoid division by zero
    const idf = (term: string): number => Math.log((N + 1) / ((df?.get(term) ?? 0) + 1))

    // Build sparse query TF-IDF vector (each query term appears once → tf = 1)
    const queryVec = new Map<string, number>()
    for (const term of queryTerms) {
        queryVec.set(term, idf(term))
    }
    const queryNorm = Math.sqrt([...queryVec.values()].reduce((s, v) => s + v * v, 0)) || 1

    const scored = allChunks.map(chunk => {
        const chunkTerms = preTokenized?.get(chunk.id) ?? tokenizeText(chunk.content)
        const chunkSize = chunkTerms.size || 1

        // Dot product of query vector and chunk TF-IDF vector (only over shared terms)
        let dot = 0
        let chunkNormSq = 0
        for (const term of chunkTerms) {
            const termIdf = idf(term)
            const chunkTf = 1 / chunkSize   // normalised TF
            const chunkTfIdf = chunkTf * termIdf
            chunkNormSq += chunkTfIdf * chunkTfIdf
            if (queryVec.has(term)) {
                dot += queryVec.get(term)! * chunkTfIdf
            }
        }
        const chunkNorm = Math.sqrt(chunkNormSq) || 1
        const cosine = dot / (queryNorm * chunkNorm)
        return { chunk, score: cosine }
    })

    // Secondary sort by chunk id ensures identical ordering for equal scores across runs
    scored.sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))

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
