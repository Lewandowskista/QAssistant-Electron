export type TaskStatus = string

export type TestCaseStatus = 'passed' | 'failed' | 'blocked' | 'skipped' | 'not-run'

export type TestCasePriority = 'low' | 'medium' | 'major' | 'blocker'

export type SapModule = 'Cart' | 'Checkout' | 'Pricing' | 'Promotions' | 'CatalogSync' | 'B2B' | 'OMS' | 'Personalization' | 'CPQ'

export type TaskSeverity = 'cosmetic' | 'minor' | 'major' | 'critical' | 'blocker'

export type TestType = 'functional' | 'regression' | 'smoke' | 'integration' | 'e2e' | 'api' | 'performance' | 'accessibility' | 'security'

export type Reproducibility = 'always' | 'sometimes' | 'rarely' | 'once' | 'unable'

export type Frequency = 'everytime' | 'often' | 'occasionally' | 'once'

export type TestCase = {
    id: string
    displayId: string // e.g. TC-001
    title: string
    preConditions: string
    steps: string
    testData: string
    expectedResult: string
    actualResult: string
    priority: TestCasePriority
    status: TestCaseStatus
    sapModule?: SapModule
    sourceIssueId?: string
    tags?: string[]           // e.g. ['smoke', 'regression', 'checkout']
    assignedTo?: string       // tester name/handle
    estimatedMinutes?: number // estimated execution duration
    testType?: TestType       // Phase 1.3: functional, regression, smoke, etc.
    linkedDefectIds?: string[] // Phase 1.7: bug task IDs linked to this test
    changeLog?: Array<{       // Phase 2.5: audit trail of changes
        timestamp: number
        field: string
        oldValue: string
        newValue: string
    }>
    updatedAt: number
}

export type TestExecution = {
    id: string
    testCaseId: string
    testPlanId: string
    result: TestCaseStatus
    actualResult: string
    notes: string
    executedAt: number
    snapshotTestCaseTitle: string
    snapshotPreConditions?: string
    snapshotSteps?: string
    snapshotTestData?: string
    snapshotExpectedResult?: string
    snapshotPriority?: TestCasePriority
    durationSeconds?: number
}

export type TestCaseExecution = {
    id: string
    testCaseId: string
    result: TestCaseStatus
    actualResult: string
    notes: string
    snapshotTestCaseTitle: string
    snapshotPreConditions?: string
    snapshotSteps?: string
    snapshotTestData?: string
    snapshotExpectedResult?: string
    snapshotPriority?: TestCasePriority
    durationSeconds?: number
    blockedReason?: string     // Phase 1.6: reason when result is 'blocked'
    environmentId?: string     // Phase 1.4: which environment was test executed on
    environmentName?: string   // Phase 1.4: snapshot of environment name
    attachments?: Attachment[] // Phase 2.6: evidence/screenshots per execution
}

export type TestPlanExecution = {
    id: string
    testPlanId: string
    snapshotTestPlanName: string
    caseExecutions: TestCaseExecution[]
}

export type TestRunSession = {
    id: string
    timestamp: number
    isArchived?: boolean
    planExecutions: TestPlanExecution[]
    environmentId?: string     // Phase 1.4: which environment session used
    environmentName?: string   // Phase 1.4: snapshot of environment name
}

export type TestPlan = {
    id: string
    displayId: string
    name: string
    description: string
    testCases: TestCase[]
    isArchived: boolean
    isRegressionSuite: boolean
    source?: 'manual' | 'linear' | 'jira'
    criticality?: string
    createdAt: number
    updatedAt: number
}

export type AnalysisEntry = {
    version: number
    hash: string
    timestamp: number
    taskStatus: string
    taskPriority: string
    summary: string
    fullResult: string
}

export type Task = {
    id: string
    title: string
    description: string
    status: TaskStatus
    priority: 'low' | 'medium' | 'high' | 'critical'
    severity?: TaskSeverity   // Phase 1.1: technical impact vs business priority
    acceptanceCriteria?: string // Phase 1.2: clear pass/fail criteria
    version?: string           // Phase 1.8: release/version tag
    sourceIssueId?: string
    externalId?: string      // The API-side UUID from Linear/Jira
    ticketUrl?: string       // URL to the issue in Linear/Jira
    issueType?: string       // Bug, Story, Task, etc. from Jira
    rawDescription?: string  // Unprocessed description from the source
    assignee?: string
    labels?: string
    dueDate?: number
    source?: 'manual' | 'linear' | 'jira'
    connectionId?: string
    attachmentUrls?: string[]
    analysisHistory?: AnalysisEntry[]
    linkedTestCaseId?: string // Phase 1.7: back-reference to test case
    linkedDefectIds?: string[] // Phase 1.7: bug IDs linked from tests
    reproducibility?: Reproducibility // Phase 2.1: bug reproducibility
    frequency?: Frequency     // Phase 2.1: bug frequency
    affectedEnvironments?: string[] // Phase 2.1: environment IDs affected by bug
    sprint?: {
        name: string
        isActive: boolean
        startDate?: number
        endDate?: number
    }
    createdAt: number
    updatedAt: number
}

export type Attachment = {
    id: string
    fileName: string
    filePath: string
    mimeType?: string
    fileSizeBytes?: number
}

export type Note = {
    id: string
    title: string
    content: string
    attachments: Attachment[]
    updatedAt: number
}

export type EnvironmentType = 'development' | 'staging' | 'production' | 'custom'

export type QaEnvironment = {
    id: string
    name: string
    type: EnvironmentType
    color: string
    isDefault: boolean
    createdAt: number
    baseUrl: string
    notes: string
    healthCheckUrl: string
    hacUrl: string
    backOfficeUrl: string
    storefrontUrl: string
    solrAdminUrl: string
    occBasePath: string
    ignoreSslErrors: boolean
    username?: string
    password?: string
}

export type TestDataEntry = {
    id: string
    key: string
    value: string
    description: string
    tags: string
    environment: string
}

export type TestDataGroup = {
    id: string
    name: string
    category: string
    entries: TestDataEntry[]
    createdAt: number
}

export type ChecklistItem = {
    id: string
    text: string
    isChecked: boolean
}

export type Checklist = {
    id: string
    name: string
    category: string
    items: ChecklistItem[]
    createdAt: number
    updatedAt: number
}

export type ApiRequest = {
    id: string
    name: string
    category: string
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    url: string
    headers: string
    body: string
    createdAt: number
    updatedAt: number
}

export type RunbookStepStatus = 'pending' | 'in-progress' | 'done' | 'failed' | 'skipped'
export type RunbookCategory = 'deployment' | 'maintenance' | 'testing' | 'other'

export interface RunbookStep {
    id: string
    title: string
    description?: string
    status: RunbookStepStatus
    order: number
    updatedAt: number
}

export interface Runbook {
    id: string
    name: string
    description?: string
    category: RunbookCategory
    steps: RunbookStep[]
    createdAt: number
    updatedAt: number
}

export type LinearConnection = {
    id: string
    label: string
    teamId: string
}

export type JiraConnection = {
    id: string
    label: string
    domain: string
    email: string
    projectKey: string
}

export type QualityGateCriterion = {
    id: string
    type: 'pass_rate' | 'critical_bugs' | 'smoke_tests' | 'coverage' | 'blockers'
    operator: 'gte' | 'lte' | 'eq'
    value: number
    label: string
}

export type QualityGate = {
    id: string
    name: string
    criteria: QualityGateCriterion[]
    isEnabled: boolean
}

export type Project = {
    id: string
    name: string
    color: string
    clientName?: string
    description?: string
    tasks: Task[]
    notes: Note[]
    testPlans: TestPlan[]
    environments: QaEnvironment[]
    testExecutions: TestExecution[] // Legacy mapping
    testRunSessions: TestRunSession[]

    files: Attachment[]
    testDataGroups: TestDataGroup[]
    checklists: Checklist[]
    apiRequests: ApiRequest[]
    runbooks: Runbook[]
    // Multiple named connections (C# model)
    linearConnections: LinearConnection[]
    jiraConnections: JiraConnection[]
    // Legacy single-connection fields (kept for backwards compat)
    linearConnection?: { apiKey: string; teamId: string }
    jiraConnection?: { domain: string; email: string; projectKey: string }

    geminiModel?: string
    columns?: { id: string, title: string, color?: string, textColor?: string, type?: string }[]
    qualityGates?: QualityGate[]

    // Phase 4: Report Builder & Collaboration
    reportTemplates?: any[] // ReportTemplate[] - lazy loaded to avoid circular imports
    reportSchedules?: any[]
    reportHistory?: any[]
    customKpis?: any[]
}
