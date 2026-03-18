export type TaskStatus = string
export type CollabState = 'draft' | 'ready_for_dev' | 'dev_acknowledged' | 'in_fix' | 'ready_for_qa' | 'qa_retesting' | 'verified' | 'closed'

export type TestCaseStatus = 'passed' | 'failed' | 'blocked' | 'skipped' | 'not-run'

export type TestCasePriority = 'low' | 'medium' | 'major' | 'blocker'

export type SapModule = 'Cart' | 'Checkout' | 'Pricing' | 'Promotions' | 'CatalogSync' | 'B2B' | 'OMS' | 'Personalization' | 'CPQ'

export type TaskSeverity = 'cosmetic' | 'minor' | 'major' | 'critical' | 'blocker'

export type TestType = 'functional' | 'regression' | 'smoke' | 'integration' | 'e2e' | 'api' | 'performance' | 'accessibility' | 'security'

export type Reproducibility = 'always' | 'sometimes' | 'rarely' | 'once' | 'unable'

export type Frequency = 'everytime' | 'often' | 'occasionally' | 'once'
export type ArtifactType = 'task' | 'test_case' | 'test_execution' | 'note' | 'file' | 'handoff' | 'pr'
export type ArtifactLinkLabel = 'evidence' | 'caused_by' | 'verifies' | 'documents' | 'fixes' | 'retest_for'
export type CollaborationActorRole = 'qa' | 'dev'
export type HandoffType = 'bug_handoff' | 'fix_handoff' | 'retest_request'
export type CollaborationEventType =
    | 'handoff_created'
    | 'handoff_sent'
    | 'handoff_acknowledged'
    | 'fix_started'
    | 'pr_linked'
    | 'ready_for_qa'
    | 'retest_started'
    | 'verification_passed'
    | 'verification_failed'
    | 'evidence_added'
    | 'note_linked'
    | 'execution_linked'

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
    components?: string[]
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
    blockedReason?: string
    environmentId?: string
    environmentName?: string
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
    components?: string[]
    dueDate?: number
    source?: 'manual' | 'linear' | 'jira'
    connectionId?: string
    attachmentUrls?: string[]
    analysisHistory?: AnalysisEntry[]
    linkedTestCaseId?: string // Phase 1.7: back-reference to test case
    linkedDefectIds?: string[] // Phase 1.7: bug IDs linked from tests
    collabState?: CollabState
    activeHandoffId?: string
    lastCollabUpdatedAt?: number
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

export type HandoffExecutionRef = {
    sessionId: string
    planExecutionId: string
    caseExecutionId: string
}

export type LinkedPrRef = {
    repoFullName: string
    prNumber: number
    prUrl: string
    status?: string
}

export type HandoffPacket = {
    id: string
    taskId: string
    type: HandoffType
    createdByRole: CollaborationActorRole
    createdAt: number
    updatedAt: number
    summary: string
    reproSteps: string
    expectedResult: string
    actualResult: string
    environmentId?: string
    environmentName?: string
    severity?: TaskSeverity
    branchName?: string
    releaseVersion?: string
    reproducibility?: Reproducibility
    frequency?: Frequency
    linkedTestCaseIds: string[]
    linkedExecutionRefs: HandoffExecutionRef[]
    linkedNoteIds: string[]
    linkedFileIds: string[]
    linkedPrs: LinkedPrRef[]
    developerResponse?: string
    qaVerificationNotes?: string
    resolutionSummary?: string
    acknowledgedAt?: number
    completedAt?: number
    isComplete?: boolean
    missingFields?: string[]
}

export type ArtifactLink = {
    id: string
    sourceType: ArtifactType
    sourceId: string
    targetType: ArtifactType
    targetId: string
    label: ArtifactLinkLabel
    createdAt: number
}

export type CollaborationEvent = {
    id: string
    taskId: string
    handoffId?: string
    eventType: CollaborationEventType
    actorRole: CollaborationActorRole
    timestamp: number
    title: string
    details?: string
    metadata?: Record<string, string | number | boolean | null | undefined>
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
    schemaVersion?: number
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
    sourceColumns?: Partial<Record<'manual' | 'linear' | 'jira', { id: string, title: string, color?: string, textColor?: string, type?: string }[]>>
    qualityGates?: QualityGate[]

    // Phase 4: Report Builder & Collaboration
    reportTemplates?: any[] // ReportTemplate[] - lazy loaded to avoid circular imports
    reportSchedules?: any[]
    reportHistory?: any[]
    customKpis?: any[]
    handoffPackets?: HandoffPacket[]
    artifactLinks?: ArtifactLink[]
    collaborationEvents?: CollaborationEvent[]

    // AI Accuracy Testing
    accuracyTestSuites?: AccuracyTestSuite[]
}

// ── AI Accuracy Testing ──────────────────────────────────────────────

export type AccuracyScoreDimension = 'factualAccuracy' | 'completeness' | 'faithfulness' | 'relevance'

export type ClaimVerdict = 'supported' | 'contradicted' | 'unverifiable' | 'partially_supported'

export type AccuracyClaim = {
    id: string
    claimText: string
    verdict: ClaimVerdict
    confidence: number           // 0.0 - 1.0
    sourceChunkIds: string[]     // which doc chunks support/contradict this claim
    reasoning: string
}

export type AccuracyDimensionScore = {
    dimension: AccuracyScoreDimension
    score: number                // 0 - 100
    confidence: number           // 0.0 - 1.0
    reasoning: string
}

export type AccuracyQaPairResult = {
    id: string
    question: string
    agentResponse: string
    overallScore: number         // 0 - 100 weighted aggregate
    dimensionScores: AccuracyDimensionScore[]
    extractedClaims: AccuracyClaim[]
    evaluatedAt: number
}

export type AccuracyEvalStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type AccuracyEvalRun = {
    id: string
    name: string
    status: AccuracyEvalStatus
    qaPairResults: AccuracyQaPairResult[]
    aggregateScore: number       // 0 - 100 mean of all pair overallScores
    aggregateDimensions: AccuracyDimensionScore[] // averaged across all pairs
    totalPairs: number
    completedPairs: number
    startedAt: number
    completedAt?: number
    error?: string
}

export type ReferenceDocument = {
    id: string
    fileName: string
    filePath: string             // path in attachments dir
    mimeType: string
    fileSizeBytes: number
    uploadedAt: number
    chunkCount: number
}

export type AccuracyQaPair = {
    id: string
    question: string
    agentResponse: string
    addedAt: number
    sourceLabel?: string         // e.g. "imported from CSV" or "manual"
}

export type AccuracyTestSuite = {
    id: string
    name: string
    referenceDocuments: ReferenceDocument[]
    qaPairs: AccuracyQaPair[]
    evalRuns: AccuracyEvalRun[]
    createdAt: number
    updatedAt: number
}
