import type { TestCase, TestExecution, TestPlan } from './project'
import type { UserRole } from './user'

export type AiRole = UserRole

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
    environments: AiSafeEnvironment[]
    tasks: DevAiTask[]
    handoffs: DevAiHandoff[]
}

export type ProjectAiContext = QaProjectAiContext | DevProjectAiContext

export interface AiAnalyzeIssueRequest {
    apiKey: string
    task: QaAiTask
    comments?: any[]
    project?: QaProjectAiContext
    modelName?: string
}

export interface AiGenerateCasesRequest {
    apiKey: string
    tasks: QaAiTask[]
    sourceName: string
    project?: QaProjectAiContext
    designDoc?: string
    modelName?: string
    comments?: Record<string, any[]>
}

export interface AiAnalyzeProjectRequest {
    apiKey: string
    context: string
    project?: QaProjectAiContext
    modelName?: string
}

export interface AiCriticalityRequest {
    apiKey: string
    tasks: QaAiTask[]
    testPlans: QaAiTestPlanDetail[]
    executions: AiSafeExecution[]
    project?: QaProjectAiContext
    modelName?: string
}

export interface AiTestRunSuggestionsRequest {
    apiKey: string
    testPlans: QaAiTestPlanDetail[]
    executions: AiSafeExecution[]
    project?: QaProjectAiContext
    modelName?: string
}

export interface AiSmokeSubsetRequest {
    apiKey: string
    candidates: QaAiTestCase[]
    doneTasks: QaAiTask[]
    project?: QaProjectAiContext
    modelName?: string
}

export interface AiChatRequest {
    apiKey: string
    userMessage: string
    history: Array<{ role: 'user' | 'assistant'; content: string }>
    role: AiRole
    project?: ProjectAiContext
    modelName?: string
}

export type { TestCase, TestExecution, TestPlan }
