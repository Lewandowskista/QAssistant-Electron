import { create } from 'zustand'

export type TaskStatus = 'backlog' | 'todo' | 'in-progress' | 'in-review' | 'done' | 'canceled' | 'duplicate'

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
    createdAt: number
    updatedAt: number
}

export type ProjectLink = {
    id: string
    title: string
    url: string
}

export type Attachment = {
    id: string
    name: string
    path: string
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
    backofficeUrl: string
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
    links: ProjectLink[]
    testPlans: TestPlan[]
    environments: QaEnvironment[]
    testExecutions: TestExecution[]
    files: any[]
    testDataGroups: TestDataGroup[]
    checklists: Checklist[]
    apiRequests: ApiRequest[]
    // Multiple named connections (C# model)
    linearConnections: LinearConnection[]
    jiraConnections: JiraConnection[]
    // Legacy single-connection fields (kept for backwards compat)
    linearConnection?: { apiKey: string; teamId: string }
    jiraConnection?: { domain: string; email: string; projectKey: string }
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

    // Link Actions
    addLink: (projectId: string, title: string, url: string) => Promise<void>
    updateLink: (projectId: string, linkId: string, updates: Partial<ProjectLink>) => Promise<void>
    deleteLink: (projectId: string, linkId: string) => Promise<void>

    // Note Actions
    addNote: (projectId: string, title: string) => Promise<Note>
    updateNote: (projectId: string, noteId: string, updates: Partial<Note>) => Promise<void>
    deleteNote: (projectId: string, noteId: string) => Promise<void>

    // Task Actions
    addTask: (projectId: string, title: string, description?: string) => Promise<void>
    updateTask: (projectId: string, taskId: string, updates: Partial<Task>) => Promise<void>
    deleteTask: (projectId: string, taskId: string) => Promise<void>
    moveTask: (projectId: string, taskId: string, status: TaskStatus) => Promise<void>
    generateTestCaseFromTask: (projectId: string, taskId: string, planId: string) => Promise<void>

    // Test Plan Actions
    addTestPlan: (projectId: string, name: string, description: string) => Promise<string>
    updateTestPlan: (projectId: string, planId: string, updates: Partial<TestPlan>) => Promise<void>
    deleteTestPlan: (projectId: string, planId: string) => Promise<void>
    archiveTestPlan: (projectId: string, planId: string, archive: boolean) => Promise<void>

    // Test Case Actions
    addTestCase: (projectId: string, planId: string, data: Partial<TestCase>) => Promise<void>
    updateTestCase: (projectId: string, planId: string, caseId: string, updates: Partial<TestCase>) => Promise<void>
    deleteTestCase: (projectId: string, planId: string, caseId: string) => Promise<void>

    // Test Execution Actions
    addTestExecution: (projectId: string, execution: Omit<TestExecution, 'id' | 'executedAt'>) => Promise<void>
    clearExecutionHistory: (projectId: string, testCaseId?: string) => Promise<void>

    // Environment Actions
    addEnvironment: (projectId: string, name: string) => Promise<void>
    updateEnvironment: (projectId: string, envId: string, updates: Partial<QaEnvironment>) => Promise<void>
    deleteEnvironment: (projectId: string, envId: string) => Promise<void>
    setEnvironmentDefault: (projectId: string, envId: string) => Promise<void>

    setActiveProject: (id: string) => void

    // --- NEW EXPERIMENTAL ACTIONS ---
    addTestDataGroup: (projectId: string, name: string, category: string) => Promise<void>
    deleteTestDataGroup: (projectId: string, groupId: string) => Promise<void>
    addTestDataEntry: (projectId: string, groupId: string, data: Partial<TestDataEntry>) => Promise<void>
    deleteTestDataEntry: (projectId: string, groupId: string, entryId: string) => Promise<void>

    addChecklist: (projectId: string, name: string, category: string) => Promise<Checklist>
    updateChecklist: (projectId: string, checklistId: string, updates: Partial<Checklist>) => Promise<void>
    deleteChecklist: (projectId: string, checklistId: string) => Promise<void>
    toggleChecklistItem: (projectId: string, checklistId: string, itemId: string) => Promise<void>
    addChecklistItem: (projectId: string, checklistId: string, text: string) => Promise<void>
    deleteChecklistItem: (projectId: string, checklistId: string, itemId: string) => Promise<void>

    addApiRequest: (projectId: string, data: Partial<ApiRequest>) => Promise<void>
    updateApiRequest: (projectId: string, requestId: string, updates: Partial<ApiRequest>) => Promise<void>
    deleteApiRequest: (projectId: string, requestId: string) => Promise<void>
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
            copyToAttachments: (sourcePath: string) => Promise<{ success: boolean; path?: string; fileName?: string; error?: string }>
            deleteAttachment: (filePath: string) => Promise<{ success: boolean; error?: string }>
            openFile: (filePath: string) => Promise<void>
            openUrl: (url: string) => Promise<{ success: boolean; error?: string }>
            readCsvFile: (filePath: string) => Promise<{ success: boolean; headers: string[]; rows: any[]; mappings: any[]; error?: string }>
            readJsonFile: (filePath: string) => Promise<{ success: boolean; data?: any; error?: string }>
            // Linear
            syncLinear: (apiKey: string, teamKey: string) => Promise<any>
            getLinearComments: (apiKey: string, issueId: string) => Promise<any[]>
            addLinearComment: (apiKey: string, issueId: string, body: string) => Promise<{ success: boolean }>
            getLinearWorkflowStates: (apiKey: string) => Promise<any[]>
            updateLinearStatus: (apiKey: string, issueId: string, stateId: string) => Promise<{ success: boolean }>
            getLinearHistory: (apiKey: string, issueId: string) => Promise<any[]>
            createLinearIssue: (apiKey: string, teamId: string, title: string, description: string, priority?: number) => Promise<string | null>
            // Jira
            syncJira: (domain: string, email: string, apiKey: string, projectKey: string) => Promise<any>
            getJiraComments: (args: { domain: string, email: string, apiKey: string, issueKey: string }) => Promise<any[]>
            addJiraComment: (args: { domain: string, email: string, apiKey: string, issueKey: string, body: string }) => Promise<{ success: boolean }>
            transitionJiraIssue: (args: { domain: string, email: string, apiKey: string, issueKey: string, transitionName: string }) => Promise<{ success: boolean }>
            getJiraHistory: (args: { domain: string, email: string, apiKey: string, issueKey: string }) => Promise<any[]>
            // AI / Gemini
            aiGenerateCases: (apiKey: string, tasks: any[], sourceName?: string, project?: any) => Promise<any[]>
            aiAnalyzeIssue: (apiKey: string, task: any, comments?: any[], project?: any) => Promise<string>
            aiAnalyze: (apiKey: string, context: string) => Promise<string>
            aiCriticality: (apiKey: string, tasks: any[], testPlans: any[], executions: any[], project?: any) => Promise<string>
            aiTestRunSuggestions: (apiKey: string, testPlans: any[], executions: any[], project?: any) => Promise<string>
            aiSmokeSubset: (apiKey: string, candidates: any[], doneTasks: any[], project?: any) => Promise<string[]>
            // SAP HAC
            sapHacRequest: (opts: { url: string; method: string; headers?: Record<string, string>; body?: string; ignoreSsl?: boolean }) => Promise<{ success: boolean; status?: number; body?: string; error?: string }>
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
                links: p.links || [],
                testPlans: p.testPlans || [],
                environments: p.environments || [],
                testExecutions: p.testExecutions || [],
                files: p.files || [],
                testDataGroups: p.testDataGroups || [],
                checklists: p.checklists || [],
                apiRequests: p.apiRequests || [],
                linearConnections: p.linearConnections || [],
                jiraConnections: p.jiraConnections || [],
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
            id: crypto.randomUUID(),
            name,
            color,
            tasks: [],
            notes: [],
            links: [],
            testPlans: [],
            environments: [],
            testExecutions: [],
            files: [],
            testDataGroups: [],
            checklists: [],
            apiRequests: [],
            linearConnections: [],
            jiraConnections: [],
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
            id: crypto.randomUUID(),
            tasks: (project.tasks || []).map(t => ({ ...t, id: crypto.randomUUID() })),
            notes: (project.notes || []).map(n => ({ ...n, id: crypto.randomUUID() })),
            links: (project.links || []).map(l => ({ ...l, id: crypto.randomUUID() })),
            testPlans: (project.testPlans || []).map(tp => ({
                ...tp,
                id: crypto.randomUUID(),
                testCases: (tp.testCases || []).map(tc => ({ ...tc, id: crypto.randomUUID() }))
            })),
            environments: (project.environments || []).map(e => ({ ...e, id: crypto.randomUUID() })),
            testExecutions: (project.testExecutions || []).map(te => ({ ...te, id: crypto.randomUUID() })),
            testDataGroups: (project.testDataGroups || []).map(tdg => ({
                ...tdg,
                id: crypto.randomUUID(),
                entries: (tdg.entries || []).map(e => ({ ...e, id: crypto.randomUUID() }))
            })),
            checklists: (project.checklists || []).map(c => ({
                ...c,
                id: crypto.randomUUID(),
                items: (c.items || []).map(i => ({ ...i, id: crypto.randomUUID() }))
            })),
            apiRequests: (project.apiRequests || []).map(ar => ({ ...ar, id: crypto.randomUUID() })),
            linearConnections: (project.linearConnections || []).map(lc => ({ ...lc, id: crypto.randomUUID() })),
            jiraConnections: (project.jiraConnections || []).map(jc => ({ ...jc, id: crypto.randomUUID() })),
        }

        const updatedProjects = [...get().projects, newProject]
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects, activeProjectId: newProject.id })
    },

    addLink: async (projectId: string, title: string, url: string) => {
        const link: ProjectLink = { id: crypto.randomUUID(), title, url }
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                return { ...p, links: [...p.links, link] }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    updateLink: async (projectId: string, linkId: string, updates: Partial<ProjectLink>) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const links = p.links.map(l => l.id === linkId ? { ...l, ...updates } : l)
                return { ...p, links }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    deleteLink: async (projectId: string, linkId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const links = p.links.filter(l => l.id !== linkId)
                return { ...p, links }
            }
            return p
        })
        if (window.electronAPI) {
            await window.electronAPI.writeProjectsFile(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    addNote: async (projectId: string, title: string) => {
        const note: Note = {
            id: crypto.randomUUID(),
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

    addTask: async (projectId: string, title: string, description: string = "") => {
        const task: Task = {
            id: crypto.randomUUID(),
            title,
            description,
            status: 'todo',
            priority: 'medium',
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

    moveTask: async (projectId: string, taskId: string, status: TaskStatus) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const tasks = p.tasks.map(t =>
                    t.id === taskId ? { ...t, status, updatedAt: Date.now() } : t
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

    generateTestCaseFromTask: async (projectId: string, taskId: string, planId: string) => {
        const activeProject = get().projects.find(p => p.id === projectId)
        if (!activeProject) return
        const task = activeProject.tasks.find(t => t.id === taskId)
        if (!task) return

        // Create the test case using addTestCase logic but here we do it directly to be efficient
        const activePlan = activeProject.testPlans.find(tp => tp.id === planId)
        if (!activePlan) return

        const testCase: TestCase = {
            id: crypto.randomUUID(),
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

    addTestPlan: async (projectId: string, name: string, description: string) => {
        const id = crypto.randomUUID()
        const plan: TestPlan = {
            id,
            displayId: `TP-${(get().projects.find(p => p.id === projectId)?.testPlans.length || 0) + 1}`.padStart(6, '0'),
            name,
            description,
            testCases: [],
            isArchived: false,
            isRegressionSuite: false,
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

    addTestCase: async (projectId: string, planId: string, data: Partial<TestCase>) => {
        const activeProject = get().projects.find(p => p.id === projectId)
        const activePlan = activeProject?.testPlans.find(tp => tp.id === planId)
        const testCase: TestCase = {
            id: crypto.randomUUID(),
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

    addEnvironment: async (projectId: string, name: string) => {
        const env: QaEnvironment = {
            id: crypto.randomUUID(),
            name,
            type: 'custom',
            color: '#A78BFA',
            isDefault: false,
            createdAt: Date.now(),
            baseUrl: "",
            notes: "",
            healthCheckUrl: "",
            hacUrl: "",
            backofficeUrl: "",
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
        const newExecution: TestExecution = {
            ...execution,
            id: crypto.randomUUID(),
            executedAt: Date.now()
        }

        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
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

    addTestDataGroup: async (projectId: string, name: string, category: string) => {
        const group: TestDataGroup = { id: crypto.randomUUID(), name, category, entries: [], createdAt: Date.now() }
        const projects = get().projects.map(p => p.id === projectId ? { ...p, testDataGroups: [...(p.testDataGroups || []), group] } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },
    deleteTestDataGroup: async (projectId: string, groupId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, testDataGroups: p.testDataGroups.filter(g => g.id !== groupId) } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },
    addTestDataEntry: async (projectId: string, groupId: string, data: Partial<TestDataEntry>) => {
        const entry = { id: crypto.randomUUID(), ...data } as TestDataEntry
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, testDataGroups: p.testDataGroups.map(g => g.id === groupId ? { ...g, entries: [...g.entries, entry] } : g)
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

    addChecklist: async (projectId: string, name: string, category: string) => {
        const checklist: Checklist = { id: crypto.randomUUID(), name, category, items: [], createdAt: Date.now(), updatedAt: Date.now() }
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
        const item: ChecklistItem = { id: crypto.randomUUID(), text, isChecked: false }
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, checklists: p.checklists.map(c => c.id === checklistId ? { ...c, items: [...c.items, item] } : c)
        } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },
    deleteChecklistItem: async (projectId: string, checklistId: string, itemId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, checklists: p.checklists.map(c => c.id === checklistId ? { ...c, items: c.items.filter(i => i.id !== itemId) } : c)
        } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
    },

    addApiRequest: async (projectId: string, data: Partial<ApiRequest>) => {
        const req: ApiRequest = { id: crypto.randomUUID(), name: data.name || 'New Request', category: data.category || 'Custom', method: data.method || 'GET', url: data.url || '', headers: data.headers || '', body: data.body || '', createdAt: Date.now(), updatedAt: Date.now() }
        const projects = get().projects.map(p => p.id === projectId ? { ...p, apiRequests: [...(p.apiRequests || []), req] } : p)
        if (window.electronAPI) await window.electronAPI.writeProjectsFile(projects)
        set({ projects })
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
    }
}))
