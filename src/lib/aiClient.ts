/**
 * Renderer-side AI client.
 * Reads the active project's aiProvider + stored API key and injects both
 * into every IPC call, so call sites don't have to manage provider selection.
 */
import { useProjectStore } from '@/store/useProjectStore'
import { getApiKey } from '@/lib/credentials'

const api = () => window.electronAPI

async function resolveAiArgs(): Promise<{ apiKey: string; provider: 'gemini' | 'nim'; modelName?: string }> {
    const store = useProjectStore.getState()
    const project = store.projects.find(p => p.id === store.activeProjectId)
    const provider: 'gemini' | 'nim' = project?.aiProvider === 'nim' ? 'nim' : 'gemini'
    const keyName = provider === 'nim' ? 'nim_api_key' : 'gemini_api_key'
    const apiKey = (await getApiKey(api(), keyName, project?.id)) ?? ''
    const modelName = provider === 'nim' ? project?.nimModel : project?.geminiModel
    return { apiKey, provider, modelName: modelName || undefined }
}

export async function aiChat(args: {
    userMessage: string
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
    role?: 'qa' | 'dev'
    project?: any
    modelName?: string
}): Promise<string> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiChat({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}

export async function aiGenerateCases(args: {
    tasks: any[]
    sourceName: string
    project?: any
    designDoc?: string
    modelName?: string
    comments?: Record<string, any[]>
}): Promise<any[]> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiGenerateCases({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}

export async function aiAnalyzeIssue(args: {
    task: any
    comments?: any[]
    project?: any
    modelName?: string
}): Promise<string> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiAnalyzeIssue({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}

export async function aiAnalyze(args: {
    context: string
    project?: any
    modelName?: string
}): Promise<string> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiAnalyze({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}

export async function aiCriticality(args: {
    tasks: any[]
    testPlans: any[]
    executions: any[]
    project?: any
    modelName?: string
}): Promise<string> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiCriticality({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}

export async function aiTestRunSuggestions(args: {
    testPlans: any[]
    executions: any[]
    project?: any
    modelName?: string
}): Promise<string> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiTestRunSuggestions({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}

export async function aiSmokeSubset(args: {
    candidates: any[]
    doneTasks: any[]
    project?: any
    modelName?: string
}): Promise<string[]> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiSmokeSubset({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}

export async function aiStandupSummary(args: {
    metrics: Record<string, unknown>
    modelName?: string
}): Promise<string> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiStandupSummary({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}

export async function aiGenerateFlexSearch(args: {
    naturalLanguageQuery: string
    modelName?: string
}): Promise<string> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiGenerateFlexSearch({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}

export async function aiFindDuplicateBugs(args: {
    newBugTitle: string
    newBugDescription: string
    newBugReproSteps?: string
    affectedComponents?: string[]
    existingBugs: Array<{ id: string; title: string; description?: string; components?: string[] }>
    modelName?: string
}): Promise<Array<{ bugId: string; title: string; similarityScore: number; reasoning: string }>> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiFindDuplicateBugs({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}

export async function aiAnalyzePullRequest(args: {
    pr: any
    testCases: any[]
    project?: any
    modelName?: string
}): Promise<any> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiAnalyzePullRequest({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}

export async function aiAccuracyExtractClaims(args: {
    agentResponse: string
    modelName?: string
    expectedAnswer?: string
}): Promise<any[]> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiAccuracyExtractClaims({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}

export async function aiAccuracyVerifyClaims(args: {
    claims: any[]
    refChunks: any[]
    modelName?: string
    expectedAnswer?: string
}): Promise<any[]> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiAccuracyVerifyClaims({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}

export async function aiAccuracyScoreDimensions(args: {
    question: string
    agentResponse: string
    expectedAnswer?: string
    claimVerdicts: any[]
    refChunks: any[]
    modelName?: string
}): Promise<any> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiAccuracyScoreDimensions({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}

export async function aiAccuracyRerankChunks(args: {
    question: string
    agentResponse: string
    chunks: any[]
    topK?: number
    modelName?: string
}): Promise<string[]> {
    const { apiKey, provider, modelName } = await resolveAiArgs()
    return api().aiAccuracyRerankChunks({ apiKey, provider, modelName: args.modelName ?? modelName, ...args })
}
