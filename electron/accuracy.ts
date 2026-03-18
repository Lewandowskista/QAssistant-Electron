import * as fs from 'node:fs'
import * as path from 'node:path'

export type DocChunk = {
    id: string
    docId: string
    content: string
    chunkIndex: number
    tokenEstimate: number
}

const CHUNK_TARGET_CHARS = 6000   // ~1500 tokens — larger chunks preserve more context per dense document
const CHUNK_OVERLAP_CHARS = 800   // ~200 tokens

/**
 * Reads and returns the plain text content of a document file.
 * Supports: .txt, .md, .pdf, .docx
 */
export async function readDocumentText(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase()

    if (ext === '.txt' || ext === '.md') {
        return fs.promises.readFile(filePath, 'utf8')
    }

    if (ext === '.pdf') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { PDFParse } = require('pdf-parse')
        const buffer = await fs.promises.readFile(filePath)
        const parser = new PDFParse({ data: buffer })
        const data = await parser.getText()
        return data.text as string
    }

    if (ext === '.docx') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mammoth = require('mammoth')
        const result = await mammoth.extractRawText({ path: filePath })
        return result.value as string
    }

    throw new Error(`Unsupported file type: ${ext}. Supported types: .txt, .md, .pdf, .docx`)
}

/**
 * Splits document text into overlapping chunks.
 * Tries to preserve paragraph boundaries.
 */
export function chunkDocument(text: string, docId: string): DocChunk[] {
    const chunks: DocChunk[] = []
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
            // Keep overlap: take the last CHUNK_OVERLAP_CHARS chars of current
            const overlap = current.length > CHUNK_OVERLAP_CHARS
                ? current.slice(-CHUNK_OVERLAP_CHARS)
                : current
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

/**
 * Selects the most relevant chunks for a QA pair using keyword overlap scoring.
 * Returns top chunks within the token budget.
 */
export function findRelevantChunks(
    question: string,
    agentResponse: string,
    allChunks: DocChunk[],
    maxTokens = 60000
): DocChunk[] {
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

    const selected: DocChunk[] = []
    let tokenCount = 0
    for (const { chunk } of scored) {
        if (tokenCount + chunk.tokenEstimate > maxTokens) break
        selected.push(chunk)
        tokenCount += chunk.tokenEstimate
    }

    return selected
}
