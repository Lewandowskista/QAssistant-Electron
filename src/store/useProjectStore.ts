import { create } from 'zustand'

function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}



export type TaskStatus = string

export type TestCaseStatus = 'passed' | 'failed' | 'blocked' | 'skipped' | 'not-run'

export type TestCasePriority = 'low' | 'medium' | 'major' | 'blocker'

export type SapModule = 'Cart' | 'Checkout' | 'Pricing' | 'Promotions' | 'CatalogSync' | 'B2B' | 'OMS' | 'Personalization' | 'CPQ'

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
    name: string
    path: string
    mimeType?: string
    sizeBytes?: number
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
}

interface ProjectState {
    projects: Project[]
    activeProjectId: string | null
    initialized: boolean

    // Project Actions
    loadProjects: () => Promise<void>
    addProject: (name: string, color: string) => Promise<void>
    updateProject: (id: string, updates: Partial<Omit<Project, 'id'>>) => Promise<void>
    deleteProject: (id: string) => Promise<void>
    importProject: (project: Project) => Promise<void>

    // Note Actions
    addNote: (projectId: string, title: string) => Promise<Note>
    updateNote: (projectId: string, noteId: string, updates: Partial<Note>) => Promise<void>
    deleteNote: (projectId: string, noteId: string) => Promise<void>
    addAttachmentToNote: (projectId: string, noteId: string, attachment: Attachment) => Promise<void>
    removeAttachmentFromNote: (projectId: string, noteId: string, attachmentId: string) => Promise<void>
    attachFileToNote: (projectId: string, noteId: string, sourcePath: string) => Promise<Attachment | undefined>

    // Task Actions
    addTask: (projectId: string, data: Partial<Task> & { title: string }) => Promise<string>
    updateTask: (projectId: string, taskId: string, updates: Partial<Task>) => Promise<void>
    deleteTask: (projectId: string, taskId: string) => Promise<void>
    moveTask: (projectId: string, taskId: string, status: TaskStatus, overId?: string) => Promise<void>
    generateTestCaseFromTask: (projectId: string, taskId: string, planId: string) => Promise<void>

    // Test Plan Actions
    addTestPlan: (projectId: string, name: string, description: string, isRegressionSuite?: boolean, source?: 'manual' | 'linear' | 'jira') => Promise<string>
    updateTestPlan: (projectId: string, planId: string, updates: Partial<TestPlan>) => Promise<void>
    deleteTestPlan: (projectId: string, planId: string) => Promise<void>
    archiveTestPlan: (projectId: string, planId: string, archive: boolean) => Promise<void>
    resetTestPlanStatuses: (projectId: string, planId: string) => Promise<void>
    duplicateTestPlan: (projectId: string, planId: string) => Promise<void>
    batchAddTestCasesToPlan: (projectId: string, planId: string, testCases: Omit<TestCase, 'id' | 'displayId' | 'updatedAt'>[]) => Promise<void>

    // Test Case Actions
    addTestCase: (projectId: string, planId: string, data: Partial<TestCase>) => Promise<string>
    updateTestCase: (projectId: string, planId: string, caseId: string, updates: Partial<TestCase>) => Promise<void>
    deleteTestCase: (projectId: string, planId: string, caseId: string) => Promise<void>

    // Test Execution Actions
    addTestExecution: (projectId: string, execution: Omit<TestExecution, 'id' | 'executedAt'>) => Promise<void>
    addTestRunSession: (projectId: string, session: Omit<TestRunSession, 'id' | 'timestamp'>) => Promise<void>
    deleteTestRunSession: (projectId: string, sessionId: string) => Promise<void>
    archiveTestRunSession: (projectId: string, sessionId: string, archive: boolean) => Promise<void>
    deleteTestCaseExecution: (projectId: string, sessionId: string, planExecutionId: string, caseExecutionId: string) => Promise<void>
    deleteLegacyExecution: (projectId: string, executionId: string) => Promise<void>
    clearExecutionHistory: (projectId: string, testCaseId?: string) => Promise<void>

    // Environment Actions
    addEnvironment: (projectId: string, name: string) => Promise<string>
    updateEnvironment: (projectId: string, envId: string, updates: Partial<QaEnvironment>) => Promise<void>
    deleteEnvironment: (projectId: string, envId: string) => Promise<void>
    setEnvironmentDefault: (projectId: string, envId: string) => Promise<void>

    setActiveProject: (id: string) => void

    // --- NEW EXPERIMENTAL ACTIONS ---
    addTestDataGroup: (projectId: string, name: string, category: string) => Promise<string>
    updateTestDataGroup: (projectId: string, groupId: string, updates: Partial<TestDataGroup>) => Promise<void>
    deleteTestDataGroup: (projectId: string, groupId: string) => Promise<void>
    addTestDataEntry: (projectId: string, groupId: string, data: Partial<TestDataEntry>) => Promise<string>
    updateTestDataEntry: (projectId: string, groupId: string, entryId: string, updates: Partial<TestDataEntry>) => Promise<void>
    deleteTestDataEntry: (projectId: string, groupId: string, entryId: string) => Promise<void>

    // File storage actions
    addProjectFile: (projectId: string, file: Attachment) => Promise<void>
    deleteProjectFile: (projectId: string, fileId: string) => Promise<void>

    addChecklist: (projectId: string, name: string, category: string) => Promise<Checklist>
    updateChecklist: (projectId: string, checklistId: string, updates: Partial<Checklist>) => Promise<void>
    deleteChecklist: (projectId: string, checklistId: string) => Promise<void>
    toggleChecklistItem: (projectId: string, checklistId: string, itemId: string) => Promise<void>
    addChecklistItem: (projectId: string, checklistId: string, text: string) => Promise<string>
    deleteChecklistItem: (projectId: string, checklistId: string, itemId: string) => Promise<void>

    addApiRequest: (projectId: string, data: Partial<ApiRequest>) => Promise<string>
    updateApiRequest: (projectId: string, requestId: string, updates: Partial<ApiRequest>) => Promise<void>
    deleteApiRequest: (projectId: string, requestId: string) => Promise<void>

    // Runbooks
    addRunbook: (projectId: string, name: string, category: RunbookCategory) => Promise<Runbook>
    updateRunbook: (projectId: string, runbookId: string, updates: Partial<Runbook>) => Promise<void>
    deleteRunbook: (projectId: string, runbookId: string) => Promise<void>
    addRunbookStep: (projectId: string, runbookId: string, title: string) => Promise<string>
    updateRunbookStep: (projectId: string, runbookId: string, stepId: string, updates: Partial<RunbookStep>) => Promise<void>
    deleteRunbookStep: (projectId: string, runbookId: string, stepId: string) => Promise<void>
}

// Ensure electronAPI is typed
declare global {
    interface Window {
        electronAPI: {
            // Data persistence
            getAppDataPath: () => Promise<string>
            readProjectsFile: () => Promise<Project[]>
            writeProjectsFile: (data: Project[]) => Promise<{ success: boolean; error?: string }>
            readSettingsFile: () => Promise<Record<string, any>>
            writeSettingsFile: (data: Record<string, any>) => Promise<{ success: boolean; error?: string }>
            // Credentials
            secureStoreSet: (key: string, value: string) => Promise<{ success: boolean; error?: string }>
            secureStoreGet: (key: string) => Promise<string | null>
            secureStoreDelete: (key: string) => Promise<{ success: boolean; error?: string }>
            // Window controls
            minimize: () => void
            maximize: () => void
            close: () => void
            onMaximizedStatus: (callback: (status: boolean) => void) => () => void
            // File operations
            selectFile: () => Promise<string | null>
            copyToAttachments: (sourcePath: string) => Promise<{ success: boolean; attachment?: { fileName: string; filePath: string; mimeType: string; fileSizeBytes: number }; error?: string }>
            saveBytesAttachment: (bytes: Uint8Array, fileName: string) => Promise<{ success: boolean; attachment?: { fileName: string; filePath: string; mimeType: string; fileSizeBytes: number }; error?: string }>
            deleteAttachment: (filePath: string) => Promise<{ success: boolean; error?: string }>
            openFile: (filePath: string) => Promise<void>
            openUrl: (url: string) => Promise<{ success: boolean; error?: string }>
            readCsvFile: (args: { filePath: string }) => Promise<{ success: boolean; headers: string[]; rows: any[]; mappings: any[]; error?: string }>
            readJsonFile: (args: { filePath: string }) => Promise<{ success: boolean; data?: any; error?: string }>
            saveFileDialog: (args: { defaultName: string; content: string }) => Promise<{ success: boolean; path?: string; error?: string }>
            // Linear
            syncLinear: (args: { apiKey: string, teamKey: string, connectionId?: string }) => Promise<any>
            getLinearComments: (args: { apiKey: string, issueId: string, connectionId?: string }) => Promise<any[]>
            addLinearComment: (args: { apiKey: string, issueId: string, body: string, connectionId?: string }) => Promise<{ success: boolean }>
            getLinearWorkflowStates: (args: { apiKey: string, connectionId?: string }) => Promise<any[]>
            updateLinearStatus: (args: { apiKey: string, issueId: string, stateId: string, connectionId?: string }) => Promise<{ success: boolean }>
            getLinearHistory: (args: { apiKey: string, issueId: string, connectionId?: string }) => Promise<any[]>
            createLinearIssue: (args: { apiKey: string, teamId: string, title: string, description: string, priority?: number, connectionId?: string }) => Promise<string | null>
            // Jira
            syncJira: (args: { domain: string, email: string, apiKey: string, projectKey: string, connectionId?: string }) => Promise<any>
            getJiraComments: (args: { domain: string, email: string, apiKey: string, issueKey: string, connectionId?: string }) => Promise<any[]>
            addJiraComment: (args: { domain: string, email: string, apiKey: string, issueKey: string, body: string, connectionId?: string }) => Promise<{ success: boolean }>
            transitionJiraIssue: (args: { domain: string, email: string, apiKey: string, issueKey: string, transitionName: string, connectionId?: string }) => Promise<{ success: boolean }>
            getJiraHistory: (args: { domain: string, email: string, apiKey: string, issueKey: string, connectionId?: string }) => Promise<any[]>
            getJiraStatuses: (args: { domain: string, email: string, apiKey: string, projectKey: string, connectionId?: string }) => Promise<any[]>
            createJiraIssue: (args: { domain: string, email: string, apiKey: string, projectKey: string, title: string, description: string, issueTypeName?: string, connectionId?: string }) => Promise<string | null>
            // AI / Gemini
            aiGenerateCases: (args: { apiKey: string, tasks: any[], sourceName?: string, project?: any, designDoc?: any, modelName?: string }) => Promise<any[]>
            aiAnalyzeIssue: (args: { apiKey: string, task: any, comments?: any[], project?: any, modelName?: string }) => Promise<string>
            aiAnalyze: (args: { apiKey: string, context: string, project?: any, modelName?: string }) => Promise<string>
            aiCriticality: (args: { apiKey: string, tasks: any[], testPlans: any[], executions: any[], project?: any, modelName?: string }) => Promise<string>
            aiTestRunSuggestions: (args: { apiKey: string, testPlans: any[], executions: any[], project?: any, modelName?: string }) => Promise<string>
            aiSmokeSubset: (args: { apiKey: string, candidates: any[], doneTasks: any[], project?: any, modelName?: string }) => Promise<string[]>
            // SAP HAC
            sapHacRequest: (opts: { url: string; method: string; headers?: Record<string, string>; body?: string; ignoreSsl?: boolean }) => Promise<{ success: boolean; status?: number; body?: string; error?: string }>
            sapHacLogin: (baseUrl: string, username: string, password: string, ignoreSsl?: boolean) => Promise<{ success: boolean; error?: string }>
            sapHacGetCronJobs: (baseUrl: string) => Promise<{ success: boolean; data?: any; error?: string }>
            sapHacFlexibleSearch: (baseUrl: string, query: string, max?: number) => Promise<{ success: boolean; result?: any; error?: string }>
            sapHacImportImpEx: (baseUrl: string, script: string, enableCodeExecution?: boolean) => Promise<{ success: boolean; result?: any; error?: string }>
            sapHacGetCatalogVersions: (baseUrl: string) => Promise<{ success: boolean; data?: { catalogId: string, version: string }[]; error?: string }>
            sapHacGetCatalogIds: (baseUrl: string) => Promise<{ success: boolean; data?: string[]; error?: string }>
            sapHacGetCatalogSyncDiff: (baseUrl: string, catalogId: string, maxMissing?: number) => Promise<{ success: boolean; data?: { catalogId: string, stagedCount: number, onlineCount: number, missingStagedToOnline: string[], timestamp: string }; error?: string }>
            // Notifications & shortcuts
            showNotification: (title: string, body: string) => void
            onCommandPalette: (callback: () => void) => () => void
            onAddTask: (callback: () => void) => () => void
            // System
            setAlwaysOnTop: (flag: boolean) => void
            getAppVersion: () => Promise<string>
            getSystemInfo: () => Promise<{ platform: string; arch: string; nodeVersion: string; electronVersion: string; appVersion: string }>
            quit: () => void
        }
    }
}

export const useProjectStore = create<ProjectState>((set, get) => ({
    projects: [],
    activeProjectId: null,
    initialized: false,

    loadProjects: async () => {
        if (!window.electronAPI) {
            console.warn("No electronAPI detected, running in browser mode with empty mock data.")
            set({ projects: [], initialized: true })
            return
        }

        try {
            const rawProjects = await window.electronAPI.readProjectsFile()
            // Ensure all projects have the required arrays initialized to prevent crashes with old data
            const projects = (rawProjects || []).map((p: any) => ({
                ...p,
                tasks: p.tasks || [],
                notes: p.notes || [],
                testPlans: p.testPlans || [],
                environments: p.environments || [],
                testExecutions: p.testExecutions || [],
                files: p.files || [],
                testDataGroups: p.testDataGroups || [],
                checklists: p.checklists || [],
                apiRequests: p.apiRequests || [],
                runbooks: p.runbooks || [],
                linearConnections: p.linearConnections || [],
                jiraConnections: p.jiraConnections || [],
                testRunSessions: p.testRunSessions || [],
            }))

            set({
                projects,
                initialized: true,
                activeProjectId: get().activeProjectId || (projects.length > 0 ? projects[0].id : null)
            })
        } catch (e) {
            console.error(e)
            set({ projects: [], initialized: true })
        }
    },

    addProject: async (name: string, color: string) => {
        const newProject: Project = {
            id: generateId(),
            name,
            color,
            tasks: [],
            notes: [],
            testPlans: [],
            environments: [],
            testExecutions: [],
            files: [],
            testDataGroups: [],
            checklists: [],
            apiRequests: [],
            runbooks: [],
            linearConnections: [],
            jiraConnections: [],
            testRunSessions: []
        }

        const updatedProjects = [...get().projects, newProject]
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects, activeProjectId: newProject.id })
    },

    updateProject: async (id: string, updates: Partial<Omit<Project, 'id'>>) => {
        const updatedProjects = get().projects.map(p =>
            p.id === id ? { ...p, ...updates } : p
        )
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    deleteProject: async (id: string) => {
        const updatedProjects = get().projects.filter(p => p.id !== id)
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({
            projects: updatedProjects,
            activeProjectId: get().activeProjectId === id ? (updatedProjects[0]?.id || null) : get().activeProjectId
        })
    },

    importProject: async (project: Project) => {
        // Assign a new UUID to avoid collisions with existing projects
        const newProject: Project = {
            ...project,
            id: generateId(),
            tasks: (project.tasks || []).map(t => ({ ...t, id: generateId() })),
            notes: (project.notes || []).map(n => ({ ...n, id: generateId() })),
            testPlans: (project.testPlans || []).map(tp => ({
                ...tp,
                id: generateId(),
                testCases: (tp.testCases || []).map(tc => ({ ...tc, id: generateId() }))
            })),
            environments: (project.environments || []).map(e => ({ ...e, id: generateId() })),
            testExecutions: (project.testExecutions || []).map(te => ({ ...te, id: generateId() })),
            testDataGroups: (project.testDataGroups || []).map(tdg => ({
                ...tdg,
                id: generateId(),
                entries: (tdg.entries || []).map(e => ({ ...e, id: generateId() }))
            })),
            checklists: (project.checklists || []).map(c => ({
                ...c,
                id: generateId(),
                items: (c.items || []).map(i => ({ ...i, id: generateId() }))
            })),
            apiRequests: (project.apiRequests || []).map(ar => ({ ...ar, id: generateId() })),
            linearConnections: (project.linearConnections || []).map(lc => ({ ...lc, id: generateId() })),
            jiraConnections: (project.jiraConnections || []).map(jc => ({ ...jc, id: generateId() })),
        }

        const updatedProjects = [...get().projects, newProject]
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects, activeProjectId: newProject.id })
    },


    addNote: async (projectId: string, title: string) => {
        const note: Note = {
            id: generateId(),
            title,
            content: "",
            attachments: [],
            updatedAt: Date.now()
        }
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                return { ...p, notes: [note, ...p.notes] }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
        return note
    },

    updateNote: async (projectId: string, noteId: string, updates: Partial<Note>) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const notes = p.notes.map(n =>
                    n.id === noteId ? { ...n, ...updates, updatedAt: Date.now() } : n
                )
                return { ...p, notes }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    deleteNote: async (projectId: string, noteId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const notes = p.notes.filter(n => n.id !== noteId)
                return { ...p, notes }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    // Attachments --------------------------------------------------------
    addAttachmentToNote: async (projectId: string, noteId: string, attachment: Attachment) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const notes = p.notes.map(n =>
                    n.id === noteId ? { ...n, attachments: [...n.attachments, attachment], updatedAt: Date.now() } : n
                )
                return { ...p, notes }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    removeAttachmentFromNote: async (projectId: string, noteId: string, attachmentId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const notes = p.notes.map(n =>
                    n.id === noteId ? { ...n, attachments: n.attachments.filter(a => a.id !== attachmentId), updatedAt: Date.now() } : n
                )
                return { ...p, notes }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    // convenience helper that copies file and attaches to note
    attachFileToNote: async (projectId: string, noteId: string, sourcePath: string) => {
        if (!window.electronAPI) return
        const res = await window.electronAPI.copyToAttachments(sourcePath)
        if (res.success && res.attachment) {
            const attachment: Attachment = {
                id: generateId(),
                name: res.attachment.fileName,
                path: res.attachment.filePath,
                mimeType: res.attachment.mimeType,
                sizeBytes: res.attachment.fileSizeBytes
            }
            await get().addAttachmentToNote(projectId, noteId, attachment)
            return attachment
        }
        throw new Error(res.error || 'Failed to copy attachment')
    },


    addTask: async (projectId: string, data: Partial<Task> & { title: string }) => {
        const task: Task = {
            id: generateId(),
            title: data.title,
            description: data.description || "",
            status: data.status || 'todo',
            priority: data.priority || 'medium',
            source: data.source || 'manual',
            sourceIssueId: data.sourceIssueId,
            externalId: data.externalId,
            ticketUrl: data.ticketUrl,
            issueType: data.issueType,
            assignee: data.assignee,
            labels: data.labels,
            dueDate: data.dueDate,
            connectionId: data.connectionId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        }
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                return { ...p, tasks: [task, ...p.tasks] }
            }
            return p
        })

        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
        return task.id
    },

    updateTask: async (projectId: string, taskId: string, updates: Partial<Task>) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const tasks = p.tasks.map(t =>
                    t.id === taskId ? { ...t, ...updates, updatedAt: Date.now() } : t
                )
                return { ...p, tasks }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    deleteTask: async (projectId: string, taskId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const tasks = p.tasks.filter(t => t.id !== taskId)
                return { ...p, tasks }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    moveTask: async (projectId: string, taskId: string, status: TaskStatus, overId?: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const tasks = [...p.tasks]
                const activeIndex = tasks.findIndex(t => t.id === taskId)
                if (activeIndex === -1) return p

                const oldTask = tasks[activeIndex]
                const newTask = { ...oldTask, status, updatedAt: Date.now() }

                if (overId && overId !== taskId) {
                    const overIndex = tasks.findIndex(t => t.id === overId)
                    if (overIndex !== -1) {
                        // Remove from old position
                        tasks.splice(activeIndex, 1)
                        // Insert at new position
                        tasks.splice(overIndex, 0, newTask)
                    } else {
                        // Fallback: just update status if overId not found
                        tasks[activeIndex] = newTask
                    }
                } else {
                    // Update task in place
                    tasks[activeIndex] = newTask
                }

                return { ...p, tasks }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    generateTestCaseFromTask: async (projectId: string, taskId: string, planId: string) => {
        const activeProject = get().projects.find(p => p.id === projectId)
        if (!activeProject) return
        const task = activeProject.tasks.find(t => t.id === taskId)
        if (!task) return

        // Create the test case using addTestCase logic but here we do it directly to be efficient
        const activePlan = activeProject.testPlans.find(tp => tp.id === planId)
        if (!activePlan) return

        const testCase: TestCase = {
            id: generateId(),
            displayId: `TC-${(activePlan.testCases.length + 1)}`.padStart(6, '0'),
            title: `Verify: ${task.title}`,
            preConditions: "Task context provided from board.",
            steps: task.description || "Refer to task description.",
            testData: "",
            expectedResult: "Feature works as described.",
            actualResult: "",
            priority: task.priority === 'high' ? 'major' : (task.priority === 'medium' ? 'medium' : 'low'),
            status: 'not-run',
            sourceIssueId: task.sourceIssueId,
            updatedAt: Date.now()
        }

        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === planId) {
                        return { ...tp, testCases: [testCase, ...tp.testCases], updatedAt: Date.now() }
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })

        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    addTestPlan: async (projectId: string, name: string, description: string, isRegressionSuite: boolean = false, source: 'manual' | 'linear' | 'jira' = 'manual') => {
        const id = generateId()
        const plan: TestPlan = {
            id,
            displayId: `TP-${(get().projects.find(p => p.id === projectId)?.testPlans.length || 0) + 1}`.padStart(6, '0'),
            name,
            description,
            testCases: [],
            isArchived: false,
            isRegressionSuite,
            source,
            createdAt: Date.now(),
            updatedAt: Date.now()
        }
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                return { ...p, testPlans: [plan, ...p.testPlans] }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
        return id
    },

    updateTestPlan: async (projectId: string, planId: string, updates: Partial<TestPlan>) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp =>
                    tp.id === planId ? { ...tp, ...updates, updatedAt: Date.now() } : tp
                )
                return { ...p, testPlans }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    deleteTestPlan: async (projectId: string, planId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.filter(tp => tp.id !== planId)
                return { ...p, testPlans }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    archiveTestPlan: async (projectId: string, planId: string, archive: boolean) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp =>
                    tp.id === planId ? { ...tp, isArchived: archive, updatedAt: Date.now() } : tp
                )
                return { ...p, testPlans }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    resetTestPlanStatuses: async (projectId: string, planId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === planId) {
                        const testCases = tp.testCases.map(tc => ({
                            ...tc,
                            status: 'not-run' as TestCaseStatus,
                            actualResult: '',
                            updatedAt: Date.now()
                        }))
                        return { ...tp, testCases, updatedAt: Date.now() }
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    duplicateTestPlan: async (projectId: string, planId: string) => {
        const activeProject = get().projects.find(p => p.id === projectId)
        if (!activeProject) return

        const planToDuplicate = activeProject.testPlans.find(tp => tp.id === planId)
        if (!planToDuplicate) return

        const newPlanId = generateId()
        const newPlan: TestPlan = {
            ...planToDuplicate,
            id: newPlanId,
            displayId: `TP-${(activeProject.testPlans.length + 1)}`.padStart(6, '0'),
            name: `${planToDuplicate.name} (Copy)`,
            testCases: planToDuplicate.testCases.map(tc => ({
                ...tc,
                id: generateId(),
                status: 'not-run',
                actualResult: '',
                updatedAt: Date.now()
            })),
            isArchived: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
        }

        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                return { ...p, testPlans: [newPlan, ...p.testPlans] }
            }
            return p
        })

        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    batchAddTestCasesToPlan: async (projectId: string, planId: string, testCases: Omit<TestCase, 'id' | 'displayId' | 'updatedAt'>[]) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === planId) {
                        const newCases: TestCase[] = testCases.map((tc, idx) => ({
                            ...tc,
                            id: generateId(),
                            displayId: `TC-${(tp.testCases.length + idx + 1)}`.padStart(6, '0'),
                            updatedAt: Date.now()
                        }))
                        return { ...tp, testCases: [...newCases, ...tp.testCases], updatedAt: Date.now() }
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })

        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    addTestCase: async (projectId: string, planId: string, data: Partial<TestCase>): Promise<string> => {
        const activeProject = get().projects.find(p => p.id === projectId)
        const activePlan = activeProject?.testPlans.find(tp => tp.id === planId)
        const testCase: TestCase = {
            id: generateId(),
            displayId: `TC-${(activePlan?.testCases.length || 0) + 1}`.padStart(6, '0'),
            title: data.title || "Untitled Case",
            preConditions: data.preConditions || "",
            steps: data.steps || "",
            testData: data.testData || "",
            expectedResult: data.expectedResult || "",
            actualResult: data.actualResult || "",
            priority: data.priority as TestCasePriority || 'medium',
            status: data.status || 'not-run',
            sapModule: data.sapModule,
            sourceIssueId: data.sourceIssueId,
            updatedAt: Date.now()
        }
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === planId) {
                        return { ...tp, testCases: [testCase, ...tp.testCases], updatedAt: Date.now() }
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
        return testCase.id
    },

    updateTestCase: async (projectId: string, planId: string, caseId: string, updates: Partial<TestCase>) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === planId) {
                        const testCases = tp.testCases.map(tc =>
                            tc.id === caseId ? { ...tc, ...updates, updatedAt: Date.now() } : tc
                        )
                        return { ...tp, testCases, updatedAt: Date.now() }
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    deleteTestCase: async (projectId: string, planId: string, caseId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === planId) {
                        const testCases = tp.testCases.filter(tc => tc.id !== caseId)
                        return { ...tp, testCases, updatedAt: Date.now() }
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    addEnvironment: async (projectId: string, name: string): Promise<string> => {
        const env: QaEnvironment = {
            id: generateId(),
            name,
            type: 'custom',
            color: '#A78BFA',
            isDefault: false,
            createdAt: Date.now(),
            baseUrl: "",
            notes: "",
            healthCheckUrl: "",
            hacUrl: "",
            backOfficeUrl: "",
            storefrontUrl: "",
            solrAdminUrl: "",
            occBasePath: "",
            ignoreSslErrors: false
        }
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const environments = p.environments || []
                // If it's the first env, make it default
                if (environments.length === 0) env.isDefault = true
                return { ...p, environments: [...environments, env] }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
        return env.id
    },

    updateEnvironment: async (projectId: string, envId: string, updates: Partial<QaEnvironment>) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const environments = (p.environments || []).map(e => e.id === envId ? { ...e, ...updates } : e)
                return { ...p, environments }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    deleteEnvironment: async (projectId: string, envId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const environments = (p.environments || []).filter(e => e.id !== envId)
                // If we deleted the default, set first remaining as default
                if (environments.length > 0 && !environments.some(e => e.isDefault)) {
                    environments[0].isDefault = true
                }
                return { ...p, environments }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    setEnvironmentDefault: async (projectId: string, envId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const environments = (p.environments || []).map(e => ({
                    ...e,
                    isDefault: e.id === envId
                }))
                return { ...p, environments }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    addTestExecution: async (projectId: string, execution: Omit<TestExecution, 'id' | 'executedAt'>) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                // Find test case metadata for snapshotting
                const targetPlan = p.testPlans.find(tp => tp.id === execution.testPlanId)
                const targetCase = targetPlan?.testCases.find(tc => tc.id === execution.testCaseId)

                const newExecution: TestExecution = {
                    ...execution,
                    id: generateId(),
                    executedAt: Date.now(),
                    snapshotPreConditions: targetCase?.preConditions,
                    snapshotSteps: targetCase?.steps,
                    snapshotTestData: targetCase?.testData,
                    snapshotExpectedResult: targetCase?.expectedResult,
                    snapshotPriority: targetCase?.priority
                }

                // Add to executions history
                const testExecutions = [newExecution, ...(p.testExecutions || [])]

                // Also update the test case status in the plan
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === execution.testPlanId) {
                        const testCases = tp.testCases.map(tc =>
                            tc.id === execution.testCaseId
                                ? { ...tc, status: execution.result, actualResult: execution.actualResult, updatedAt: Date.now() }
                                : tc
                        )
                        return { ...tp, testCases, updatedAt: Date.now() }
                    }
                    return tp
                })

                return { ...p, testExecutions, testPlans }
            }
            return p
        })

        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    addTestRunSession: async (projectId: string, session: Omit<TestRunSession, 'id' | 'timestamp'>) => {
        const newSession: TestRunSession = {
            ...session,
            id: generateId(),
            timestamp: Date.now()
        }

        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                // Add to sessions history
                const testRunSessions = [newSession, ...(p.testRunSessions || [])]

                // Also update the test case status in the plan
                const testPlans = p.testPlans.map(tp => {
                    const planExecution = newSession.planExecutions.find(pe => pe.testPlanId === tp.id)
                    if (planExecution) {
                        const testCases = tp.testCases.map(tc => {
                            const caseExec = planExecution.caseExecutions.find(ce => ce.testCaseId === tc.id)
                            if (caseExec) {
                                return { ...tc, status: caseExec.result, actualResult: caseExec.actualResult, updatedAt: Date.now() }
                            }
                            return tc
                        })
                        return { ...tp, testCases, updatedAt: Date.now() }
                    }
                    return tp
                })

                return { ...p, testRunSessions, testPlans }
            }
            return p
        })

        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    deleteTestRunSession: async (projectId: string, sessionId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testRunSessions = (p.testRunSessions || []).filter(s => s.id !== sessionId)
                return { ...p, testRunSessions }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    archiveTestRunSession: async (projectId: string, sessionId: string, archive: boolean) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testRunSessions = (p.testRunSessions || []).map(s =>
                    s.id === sessionId ? { ...s, isArchived: archive } : s
                )
                return { ...p, testRunSessions }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    deleteTestCaseExecution: async (projectId: string, sessionId: string, planExecutionId: string, caseExecutionId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testRunSessions = (p.testRunSessions || []).map(s => {
                    if (s.id === sessionId) {
                        const planExecutions = s.planExecutions.map(pe => {
                            if (pe.id === planExecutionId) {
                                return {
                                    ...pe,
                                    caseExecutions: pe.caseExecutions.filter(ce => ce.id !== caseExecutionId)
                                }
                            }
                            return pe
                        })
                        return { ...s, planExecutions }
                    }
                    return s
                })
                return { ...p, testRunSessions }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    deleteLegacyExecution: async (projectId: string, executionId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testExecutions = (p.testExecutions || []).filter(ex => ex.id !== executionId)
                return { ...p, testExecutions }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    clearExecutionHistory: async (projectId: string, testCaseId?: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testExecutions = testCaseId
                    ? (p.testExecutions || []).filter(ex => ex.testCaseId !== testCaseId)
                    : []
                return { ...p, testExecutions }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    setActiveProject: (id: string) => {
        set({ activeProjectId: id })
    },

    addTestDataGroup: async (projectId: string, name: string, category: string): Promise<string> => {
        const group: TestDataGroup = { id: generateId(), name, category, entries: [], createdAt: Date.now() }
        const projects = get().projects.map(p => p.id === projectId ? { ...p, testDataGroups: [...(p.testDataGroups || []), group] } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
        return group.id
    },
    updateTestDataGroup: async (projectId: string, groupId: string, updates: Partial<TestDataGroup>) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, testDataGroups: p.testDataGroups.map(g => g.id === groupId ? { ...g, ...updates } : g)
        } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },
    deleteTestDataGroup: async (projectId: string, groupId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, testDataGroups: p.testDataGroups.filter(g => g.id !== groupId) } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },
    addTestDataEntry: async (projectId: string, groupId: string, data: Partial<TestDataEntry>): Promise<string> => {
        const id = generateId()
        const entry = { id, ...data } as TestDataEntry
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, testDataGroups: p.testDataGroups.map(g => g.id === groupId ? { ...g, entries: [...g.entries, entry] } : g)
        } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
        return id
    },
    updateTestDataEntry: async (projectId: string, groupId: string, entryId: string, updates: Partial<TestDataEntry>) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, testDataGroups: p.testDataGroups.map(g => {
                if (g.id === groupId) {
                    return {
                        ...g,
                        entries: g.entries.map(e => e.id === entryId ? { ...e, ...updates } : e)
                    }
                }
                return g
            })
        } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },
    deleteTestDataEntry: async (projectId: string, groupId: string, entryId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, testDataGroups: p.testDataGroups.map(g => g.id === groupId ? { ...g, entries: g.entries.filter(e => e.id !== entryId) } : g)
        } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },

    // file attachments at project-level
    addProjectFile: async (projectId: string, file: Attachment) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, files: [...(p.files || []), file] } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },
    deleteProjectFile: async (projectId: string, fileId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, files: p.files.filter(f => f.id !== fileId) } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },

    addChecklist: async (projectId: string, name: string, category: string) => {
        const checklist: Checklist = { id: generateId(), name, category, items: [], createdAt: Date.now(), updatedAt: Date.now() }
        const projects = get().projects.map(p => p.id === projectId ? { ...p, checklists: [...(p.checklists || []), checklist] } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
        return checklist
    },
    updateChecklist: async (projectId: string, checklistId: string, updates: Partial<Checklist>) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, checklists: p.checklists.map(c => c.id === checklistId ? { ...c, ...updates, updatedAt: Date.now() } : c) } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },
    deleteChecklist: async (projectId: string, checklistId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, checklists: p.checklists.filter(c => c.id !== checklistId) } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },
    toggleChecklistItem: async (projectId: string, checklistId: string, itemId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, checklists: p.checklists.map(c => c.id === checklistId ? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, isChecked: !i.isChecked } : i) } : c)
        } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },
    addChecklistItem: async (projectId: string, checklistId: string, text: string) => {
        const item: ChecklistItem = { id: generateId(), text, isChecked: false }
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, checklists: p.checklists.map(c => c.id === checklistId ? { ...c, items: [...c.items, item] } : c)
        } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
        return item.id
    },
    deleteChecklistItem: async (projectId: string, checklistId: string, itemId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, checklists: p.checklists.map(c => c.id === checklistId ? { ...c, items: c.items.filter(i => i.id !== itemId) } : c)
        } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },

    addApiRequest: async (projectId: string, data: Partial<ApiRequest>) => {
        const req: ApiRequest = { id: generateId(), name: data.name || 'New Request', category: data.category || 'Custom', method: data.method || 'GET', url: data.url || '', headers: data.headers || '', body: data.body || '', createdAt: Date.now(), updatedAt: Date.now() }
        const projects = get().projects.map(p => p.id === projectId ? { ...p, apiRequests: [...(p.apiRequests || []), req] } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
        return req.id
    },
    updateApiRequest: async (projectId: string, requestId: string, updates: Partial<ApiRequest>) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, apiRequests: p.apiRequests.map(r => r.id === requestId ? { ...r, ...updates, updatedAt: Date.now() } : r) } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },
    deleteApiRequest: async (projectId: string, requestId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, apiRequests: p.apiRequests.filter(r => r.id !== requestId) } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },

    addRunbook: async (projectId: string, name: string, category: RunbookCategory) => {
        const runbook: Runbook = {
            id: generateId(),
            name,
            category,
            steps: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        }
        const projects = get().projects.map(p => p.id === projectId ? { ...p, runbooks: [...(p.runbooks || []), runbook] } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
        return runbook
    },
    updateRunbook: async (projectId: string, runbookId: string, updates: Partial<Runbook>) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            runbooks: (p.runbooks || []).map(r => r.id === runbookId ? { ...r, ...updates, updatedAt: Date.now() } : r)
        } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },
    deleteRunbook: async (projectId: string, runbookId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            runbooks: (p.runbooks || []).filter(r => r.id !== runbookId)
        } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },
    addRunbookStep: async (projectId: string, runbookId: string, title: string) => {
        const id = generateId()
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            runbooks: (p.runbooks || []).map(r => {
                if (r.id === runbookId) {
                    const step: RunbookStep = {
                        id,
                        title,
                        status: 'pending',
                        order: r.steps.length,
                        updatedAt: Date.now()
                    }
                    return { ...r, steps: [...r.steps, step], updatedAt: Date.now() }
                }
                return r
            })
        } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
        return id
    },
    updateRunbookStep: async (projectId: string, runbookId: string, stepId: string, updates: Partial<RunbookStep>) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            runbooks: (p.runbooks || []).map(r => {
                if (r.id === runbookId) {
                    return {
                        ...r,
                        steps: r.steps.map(s => s.id === stepId ? { ...s, ...updates, updatedAt: Date.now() } : s),
                        updatedAt: Date.now()
                    }
                }
                return r
            })
        } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },
    deleteRunbookStep: async (projectId: string, runbookId: string, stepId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            runbooks: (p.runbooks || []).map(r => {
                if (r.id === runbookId) {
                    return {
                        ...r,
                        steps: r.steps.filter(s => s.id !== stepId),
                        updatedAt: Date.now()
                    }
                }
                return r
            })
        } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    }
}))
