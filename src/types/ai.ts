import type { TestCase, TestExecution, TestPlan } from './project'
import type { UserRole } from './user'

export type AiRole = UserRole

/** AI backend selected per-project; injected into every AI IPC call by aiClient.ts. */
export type AiProvider = 'gemini' | 'nim' | 'ollama'

export interface AiContextSelection {
    taskIds?: string[]
    environmentIds?: string[]
    testPlanIds?: string[]
    testDataGroupIds?: string[]
    checklistIds?: string[]
    handoffIds?: string[]
    includeSapCommerce?: boolean
}

export interface AiTaskComment {
    authorName: string
    createdAt: number
    body: string
}

export interface QaAiTask {
    id: string
    title: string
    description: string
    status: string
    priority: string
    issueType?: string
    labels?: string
    assignee?: string
    sourceIssueId?: string
    externalId?: string
    acceptanceCriteria?: string
    reproducibility?: string
    frequency?: string
    affectedEnvironmentNames?: string[]
    components?: string[]
    linkedTestCaseId?: string
    comments?: AiTaskComment[]
}

export interface AiSafeEnvironment {
    id: string
    name: string
    type: string
    isDefault: boolean
    baseUrl?: string
    hacUrl?: string
    backOfficeUrl?: string
    storefrontUrl?: string
    solrAdminUrl?: string
    occBasePath?: string
}

export interface QaAiTestCase {
    id: string
    displayId: string
    title: string
    priority: string
    status: string
    actualResult?: string
    sourceIssueId?: string
    sapModule?: string
}

export interface QaAiTestPlanSummary {
    id: string
    name: string
    source?: string
    testCaseCount: number
    statusCounts: Record<string, number>
}

export interface QaAiTestPlanDetail {
    id: string
    name: string
    source?: string
    testCases: QaAiTestCase[]
}

export interface AiSafeExecution {
    id: string
    testCaseId: string
    testPlanId: string
    result: string
    actualResult?: string
    notes?: string
    environmentId?: string
    environmentName?: string
}

export interface AiSafeLinkedPr {
    repoFullName: string
    prNumber: number
    prUrl?: string
    status?: string
}

export interface DevAiTask {
    id: string
    title: string
    description: string
    status: string
    priority: string
    issueType?: string
    assignee?: string
    labels?: string
    sourceIssueId?: string
    externalId?: string
    acceptanceCriteria?: string
    reproducibility?: string
    frequency?: string
    affectedEnvironmentNames?: string[]
    components?: string[]
    collabState?: string
    activeHandoffId?: string
    linkedTestCaseId?: string
    comments?: AiTaskComment[]
}

export interface DevAiHandoff {
    id: string
    taskId: string
    type: string
    summary: string
    environmentName?: string
    severity?: string
    branchName?: string
    releaseVersion?: string
    linkedPrs: AiSafeLinkedPr[]
    developerResponse?: string
    resolutionSummary?: string
    isComplete?: boolean
}

export interface QaProjectAiContext {
    role: 'qa'
    manualContextSelection?: boolean
    name: string
    description?: string
    geminiModel?: string
    nimModel?: string
    ollamaModel?: string
    aiProvider?: AiProvider
    environments: AiSafeEnvironment[]
    tasks: QaAiTask[]
    testPlans: QaAiTestPlanSummary[]
    testDataGroups: Array<{ id: string; name: string; category: string }>
    checklists: Array<{ id: string; name: string; category: string }>
    sapCommerce: {
        enabled: boolean
        environments: AiSafeEnvironment[]
    }
}

export interface DevProjectAiContext {
    role: 'dev'
    manualContextSelection?: boolean
    name: string
    description?: string
    geminiModel?: string
    nimModel?: string
    ollamaModel?: string
    aiProvider?: AiProvider
    environments: AiSafeEnvironment[]
    tasks: DevAiTask[]
    handoffs: DevAiHandoff[]
}

export type ProjectAiContext = QaProjectAiContext | DevProjectAiContext

export interface AiAnalyzeIssueRequest {
    apiKey: string
    provider?: AiProvider
    task: QaAiTask
    comments?: any[]
    project?: QaProjectAiContext
    modelName?: string
}

export interface AiGenerateCasesRequest {
    apiKey: string
    provider?: AiProvider
    tasks: QaAiTask[]
    sourceName: string
    project?: QaProjectAiContext
    designDoc?: string
    modelName?: string
    comments?: Record<string, any[]>
}

export interface AiAnalyzeProjectRequest {
    apiKey: string
    provider?: AiProvider
    context: string
    project?: QaProjectAiContext
    modelName?: string
}

export interface AiCriticalityRequest {
    apiKey: string
    provider?: AiProvider
    tasks: QaAiTask[]
    testPlans: QaAiTestPlanDetail[]
    executions: AiSafeExecution[]
    project?: QaProjectAiContext
    modelName?: string
}

export interface AiTestRunSuggestionsRequest {
    apiKey: string
    provider?: AiProvider
    testPlans: QaAiTestPlanDetail[]
    executions: AiSafeExecution[]
    project?: QaProjectAiContext
    modelName?: string
}

export interface AiSmokeSubsetRequest {
    apiKey: string
    provider?: AiProvider
    candidates: QaAiTestCase[]
    doneTasks: QaAiTask[]
    project?: QaProjectAiContext
    modelName?: string
}

export interface AiPullRequestFileContext {
    filename: string
    status: string
    additions: number
    deletions: number
    changes: number
    patch?: string
}

export interface AiPullRequestReviewContext {
    user: string
    state: string
    submittedAt?: string
    body?: string
}

export interface AiPullRequestCommentContext {
    user: string
    body: string
    createdAt: string
}

export interface AiAnalyzePullRequestRequest {
    apiKey: string
    provider?: AiProvider
    pr: {
        number: number
        title: string
        description?: string
        baseBranch: string
        headBranch: string
        ciStatus?: string | null
        mergeableState?: string
        files: AiPullRequestFileContext[]
        reviews?: AiPullRequestReviewContext[]
        comments?: AiPullRequestCommentContext[]
    }
    testCases: Array<{ id: string; title: string; sapModule?: string; components?: string[]; tags?: string[] }>
    project?: QaProjectAiContext
    modelName?: string
}

export interface AiPullRequestAnalysisResult {
    summary: string
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
    hotspots: Array<{ file: string; reason: string }>
    affectedAreas: string[]
    qaChecks: string[]
    impactedCaseIds: string[]
    rationale: string
}

export interface AiChatRequest {
    apiKey: string
    provider?: AiProvider
    userMessage: string
    history: Array<{ role: 'user' | 'assistant'; content: string }>
    role: AiRole
    project?: ProjectAiContext
    modelName?: string
}

export type { TestCase, TestExecution, TestPlan }
