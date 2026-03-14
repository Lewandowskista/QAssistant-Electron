// cspell:ignore yxxx
import { create } from 'zustand'
import { toast } from 'sonner'
import {
    Project, Task, TestCase, TestExecution, TestRunSession,
    Note, QaEnvironment, Attachment, TaskStatus,
    TestDataGroup, TestPlan, TestCasePriority,
    TestCaseStatus, Checklist, ApiRequest, Runbook, RunbookCategory, RunbookStep,
    TestDataEntry, ChecklistItem, CollabState, HandoffPacket, ArtifactLink,
    CollaborationEvent, HandoffExecutionRef, LinkedPrRef, CollaborationActorRole,
    EnvironmentType, RunbookStepStatus, TestCaseExecution, TestPlanExecution
} from '../types/project'
import { demoProject } from '@/data/demoProject'
import { enrichHandoffCompleteness, migrateLegacyExecutionsToSessions, PROJECT_SCHEMA_VERSION } from '@/lib/collaboration'

export type {
    Project, Task, TestCase, TestExecution, TestRunSession,
    Note, QaEnvironment, Attachment, TaskStatus,
    TestDataGroup, TestPlan, TestCasePriority,
    TestCaseStatus, Checklist, ApiRequest, Runbook, RunbookCategory, RunbookStep,
    TestDataEntry, ChecklistItem, CollabState, HandoffPacket, ArtifactLink,
    CollaborationEvent, HandoffExecutionRef, LinkedPrRef, CollaborationActorRole,
    EnvironmentType, RunbookStepStatus, TestCaseExecution, TestPlanExecution
}

function generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID (should not occur in Electron).
    // Uses Math.random which is NOT cryptographically secure - collision risk is low but non-zero.
    console.warn('generateId: crypto.randomUUID unavailable, using Math.random fallback. IDs may collide under high load.')
    let d = Date.now()
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = (d + Math.random() * 16) % 16 | 0
        d = Math.floor(d / 16)
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
    })
}

/**
 * Debounced persistence helper to prevent excessive disk I/O on every state change.
 * Issues #6 in Code Review.
 */
let saveTimeout: any = null;
const saveProjectsToDisk = (projects: Project[]) => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            if (window.electronAPI) {
                await window.electronAPI.writeProjectsFile(projects);
            }
        } catch (error) {
            console.error('Failed to persist projects to disk:', error);
        }
    }, 1000);
};

export type TraceabilityResult = {
    task: Task | undefined
    activeHandoff: HandoffPacket | undefined
    handoffs: HandoffPacket[]
    links: ArtifactLink[]
    linkedTestCases: TestCase[]
    linkedNotes: Note[]
    linkedFiles: Attachment[]
}

type WebhookConfig = {
    id: string
    name: string
    url: string
    type: 'Slack' | 'Teams' | 'Generic'
    isEnabled: boolean
    notifyOnTestPlanFail: boolean
    notifyOnHighPriorityDone: boolean
    notifyOnDueDate: boolean
    notifyOnAiAnalysis: boolean
    notifyOnHandoffSent?: boolean
    notifyOnReadyForQa?: boolean
    notifyOnVerificationFailed?: boolean
    notifyOnPrLinkedToHandoff?: boolean
}

function normalizeTask(task: any): Task {
    return {
        ...task,
        collabState: task.collabState || 'draft',
        activeHandoffId: task.activeHandoffId || undefined,
        lastCollabUpdatedAt: task.lastCollabUpdatedAt || undefined,
        components: task.components || [],
        linkedDefectIds: task.linkedDefectIds || [],
        analysisHistory: task.analysisHistory || []
    }
}

function normalizeProject(project: any): Project {
    const normalizedProject: Project = {
        ...project,
        schemaVersion: project.schemaVersion || PROJECT_SCHEMA_VERSION,
        tasks: (project.tasks || []).map(normalizeTask),
        notes: (project.notes || []).map((n: any) => ({
            ...n,
            attachments: (n.attachments || []).map((a: any) => ({
                id: a.id,
                fileName: a.fileName || a.name,
                filePath: a.filePath || a.path,
                mimeType: a.mimeType,
                fileSizeBytes: a.fileSizeBytes || a.sizeBytes
            }))
        })),
        testPlans: (project.testPlans || []).map((plan: any) => ({
            ...plan,
            testCases: (plan.testCases || []).map((testCase: any) => ({
                ...testCase,
                components: testCase.components || [],
            })),
        })),
        environments: project.environments || [],
        testExecutions: project.testExecutions || [],
        files: (project.files || []).map((f: any) => ({
            id: f.id,
            fileName: f.fileName || f.name,
            filePath: f.filePath || f.path,
            mimeType: f.mimeType,
            fileSizeBytes: f.fileSizeBytes || f.sizeBytes
        })),
        testDataGroups: project.testDataGroups || [],
        checklists: project.checklists || [],
        apiRequests: project.apiRequests || [],
        runbooks: project.runbooks || [],
        linearConnections: project.linearConnections || [],
        jiraConnections: project.jiraConnections || [],
        testRunSessions: project.testRunSessions || [],
        reportTemplates: project.reportTemplates || [],
        reportSchedules: project.reportSchedules || [],
        reportHistory: project.reportHistory || [],
        customKpis: project.customKpis || [],
        sourceColumns: project.sourceColumns || (project.columns ? { manual: project.columns } : undefined),
        handoffPackets: (project.handoffPackets || []).map((packet: any) => enrichHandoffCompleteness(packet)),
        artifactLinks: project.artifactLinks || [],
        collaborationEvents: project.collaborationEvents || []
    }
    normalizedProject.testRunSessions = migrateLegacyExecutionsToSessions(normalizedProject)
    return normalizedProject
}

async function triggerCollaborationWebhook(
    event: 'handoff_sent' | 'ready_for_qa' | 'verification_failed' | 'pr_linked',
    project: Project | undefined,
    task: Task | undefined,
    handoff: HandoffPacket | undefined
) {
    if (!window.electronAPI || !project || !task || !handoff) return

    try {
        const settings = await window.electronAPI.readSettingsFile()
        const webhooks = ((settings?.webhooks || []) as WebhookConfig[]).filter((webhook) => {
            if (!webhook.isEnabled) return false
            if (event === 'handoff_sent') return !!webhook.notifyOnHandoffSent
            if (event === 'ready_for_qa') return !!webhook.notifyOnReadyForQa
            if (event === 'verification_failed') return !!webhook.notifyOnVerificationFailed
            return !!webhook.notifyOnPrLinkedToHandoff
        })

        if (webhooks.length === 0) return

        const titleMap = {
            handoff_sent: 'QA Handoff Sent',
            ready_for_qa: 'Fix Ready for QA',
            verification_failed: 'QA Verification Failed',
            pr_linked: 'PR Linked to Handoff'
        }
        const colorMap = {
            handoff_sent: '#F59E0B',
            ready_for_qa: '#10B981',
            verification_failed: '#EF4444',
            pr_linked: '#3B82F6'
        }
        const message = JSON.stringify({
            projectName: project.name,
            taskTitle: task.title,
            handoffType: handoff.type,
            handoffState: task.collabState || 'draft',
            environment: handoff.environmentName || 'Unknown',
            linkedPrCount: handoff.linkedPrs.length,
            taskId: task.id,
            handoffId: handoff.id
        }, null, 2)

        await Promise.all(webhooks.map(async (webhook) => {
            let payload = ''
            if (webhook.type === 'Teams') {
                payload = JSON.stringify({
                    type: 'message',
                    attachments: [{
                        contentType: 'application/vnd.microsoft.card.adaptive',
                        content: {
                            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                            type: 'AdaptiveCard',
                            version: '1.4',
                            body: [
                                { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: titleMap[event] },
                                { type: 'TextBlock', text: message, wrap: true }
                            ]
                        }
                    }]
                })
            } else if (webhook.type === 'Slack') {
                payload = JSON.stringify({
                    attachments: [{
                        color: colorMap[event],
                        title: titleMap[event],
                        text: message,
                        footer: 'QAssistant',
                        ts: Math.floor(Date.now() / 1000)
                    }]
                })
            } else {
                payload = JSON.stringify({ title: titleMap[event], payload: JSON.parse(message) })
            }

            await fetch(webhook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            }).catch((error) => console.error('Webhook notification failed:', error))
        }))
    } catch (error) {
        console.error('Failed to trigger collaboration webhook:', error)
    }
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
    seedDemoProject: () => Promise<void>

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
    createHandoffPacket: (projectId: string, taskId: string, data: Partial<HandoffPacket> & Pick<HandoffPacket, 'type' | 'createdByRole'>) => Promise<string>
    updateHandoffPacket: (projectId: string, handoffId: string, updates: Partial<HandoffPacket>) => Promise<void>
    setTaskCollabState: (projectId: string, taskId: string, collabState: CollabState) => Promise<void>
    acknowledgeHandoff: (projectId: string, handoffId: string, actorRole?: CollaborationActorRole) => Promise<void>
    linkArtifact: (projectId: string, link: Omit<ArtifactLink, 'id' | 'createdAt'>) => Promise<string>
    unlinkArtifact: (projectId: string, linkId: string) => Promise<void>
    linkPrToHandoff: (projectId: string, handoffId: string, prRef: LinkedPrRef) => Promise<void>
    addCollaborationEvent: (projectId: string, event: Omit<CollaborationEvent, 'id' | 'timestamp'> & Partial<Pick<CollaborationEvent, 'timestamp'>>) => Promise<string>
    createTaskFromFailedExecution: (
        projectId: string,
        executionRef: HandoffExecutionRef & { testCaseId: string; testPlanId?: string; title: string; actualResult?: string; expectedResult?: string; steps?: string },
        seedData: Partial<Task> & { title: string }
    ) => Promise<string>
    getTaskTraceability: (projectId: string, taskId: string) => TraceabilityResult

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
    batchUpdateTestCases: (projectId: string, planId: string, caseIds: string[], updates: Partial<TestCase>) => Promise<void>
    deleteTestCase: (projectId: string, planId: string, caseId: string) => Promise<void>
    batchDeleteTestCases: (projectId: string, planId: string, caseIds: string[]) => Promise<void>

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

    // Report Templates (M1: Custom Report Builder)
    addReportTemplate: (projectId: string, name: string, description: string, sections: any[]) => Promise<string>
    updateReportTemplate: (projectId: string, templateId: string, updates: any) => Promise<void>
    deleteReportTemplate: (projectId: string, templateId: string) => Promise<void>
    reorderReportSections: (projectId: string, templateId: string, sectionIds: string[]) => Promise<void>
}

// Canonical ElectronAPI type is now in src/types/electron.d.ts


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
            const projects = (rawProjects || []).map((p: any) => normalizeProject(p))

            set({
                projects,
                initialized: true,
                activeProjectId: get().activeProjectId || (projects.length > 0 ? projects[0].id : null)
            })
        } catch (e) {
            console.error('Failed to load projects from disk:', e)
            toast.error(
                'Could not read your project data. Your data has NOT been deleted. Please check the file at your data path or contact support.',
                { duration: 10000 }
            )
            set({ initialized: true })
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
            testRunSessions: [],
            reportTemplates: [],
            reportSchedules: [],
            reportHistory: [],
            customKpis: [],
            handoffPackets: [],
            artifactLinks: [],
            collaborationEvents: []
        }

        const normalizedImportedProject = normalizeProject(newProject)
        const updatedProjects = [...get().projects, normalizedImportedProject]
        if (window.electronAPI) {
            saveProjectsToDisk(updatedProjects)
        }
        set({ projects: updatedProjects, activeProjectId: normalizedImportedProject.id })
    },

    updateProject: async (id: string, updates: Partial<Omit<Project, 'id'>>) => {
        const updatedProjects = get().projects.map(p =>
            p.id === id ? { ...p, ...updates } : p
        )
        if (window.electronAPI) {
            saveProjectsToDisk(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    deleteProject: async (id: string) => {
        const updatedProjects = get().projects.filter(p => p.id !== id)
        if (window.electronAPI) {
            saveProjectsToDisk(updatedProjects)
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
            tasks: (project.tasks || []).map(t => normalizeTask({ ...t, id: generateId() })),
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
            handoffPackets: (project.handoffPackets || []).map((packet) => ({ ...packet, id: generateId() })),
            artifactLinks: (project.artifactLinks || []).map((link) => ({ ...link, id: generateId() })),
            collaborationEvents: (project.collaborationEvents || []).map((event) => ({ ...event, id: generateId() })),
        }

        const updatedProjects = [...get().projects, newProject]
        if (window.electronAPI) {
            saveProjectsToDisk(updatedProjects)
        }
        set({ projects: updatedProjects, activeProjectId: newProject.id })
    },

    seedDemoProject: async () => {
        const existingDemo = get().projects.find((project) => project.name === demoProject.name)
        if (existingDemo) {
            set({ activeProjectId: existingDemo.id })
            toast.info('Demo workspace already exists.')
            return
        }

        await get().importProject(demoProject)
        toast.success('Demo workspace loaded.')
    },


    addNote: async (projectId: string, title: string) => {
        const newNote: Note = {
            id: generateId(),
            title,
            content: "",
            attachments: [],
            updatedAt: Date.now()
        }
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                return { ...p, notes: [newNote, ...p.notes] }
            }
            return p
        })
        if (window.electronAPI) {
            saveProjectsToDisk(updatedProjects)
        }
        set({ projects: updatedProjects })
        return newNote
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
                fileName: res.attachment.fileName,
                filePath: res.attachment.filePath,
                mimeType: res.attachment.mimeType,
                fileSizeBytes: res.attachment.fileSizeBytes
            }
            await get().addAttachmentToNote(projectId, noteId, attachment)
            return attachment
        }
        throw new Error(res.error || 'Failed to copy attachment')
    },


    addTask: async (projectId: string, data: Partial<Task> & { title: string }) => {
        const task: Task = normalizeTask({
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
            collabState: data.collabState || 'draft',
            activeHandoffId: data.activeHandoffId,
            lastCollabUpdatedAt: data.lastCollabUpdatedAt,
            createdAt: Date.now(),
            updatedAt: Date.now()
        })
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                return { ...p, tasks: [task, ...p.tasks] }
            }
            return p
        })

        if (window.electronAPI) {
            saveProjectsToDisk(updatedProjects)
        }
        set({ projects: updatedProjects })
        return task.id
    },

    updateTask: async (projectId: string, taskId: string, updates: Partial<Task>) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const tasks = p.tasks.map(t =>
                    t.id === taskId ? normalizeTask({ ...t, ...updates, updatedAt: Date.now() }) : t
                )
                return { ...p, tasks }
            }
            return p
        })
        if (window.electronAPI) {
            saveProjectsToDisk(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    createHandoffPacket: async (projectId: string, taskId: string, data: Partial<HandoffPacket> & Pick<HandoffPacket, 'type' | 'createdByRole'>) => {
        const now = Date.now()
        const handoffId = generateId()
        const updatedProjects = get().projects.map((project) => {
            if (project.id !== projectId) return project
            const task = project.tasks.find((item) => item.id === taskId)
            const environment = project.environments.find((item) => item.id === data.environmentId)
            const completeness = enrichHandoffCompleteness({
                summary: data.summary || task?.title || '',
                reproSteps: data.reproSteps || task?.description || '',
                expectedResult: data.expectedResult || '',
                actualResult: data.actualResult || '',
                environmentId: data.environmentId,
                environmentName: data.environmentName || environment?.name,
                severity: data.severity || task?.severity,
                linkedExecutionRefs: data.linkedExecutionRefs || [],
                linkedNoteIds: data.linkedNoteIds || [],
                linkedFileIds: data.linkedFileIds || [],
            })
            const packet: HandoffPacket = {
                id: handoffId,
                taskId,
                type: data.type,
                createdByRole: data.createdByRole,
                createdAt: now,
                updatedAt: now,
                summary: data.summary || task?.title || '',
                reproSteps: data.reproSteps || task?.description || '',
                expectedResult: data.expectedResult || '',
                actualResult: data.actualResult || '',
                environmentId: data.environmentId,
                environmentName: data.environmentName || environment?.name,
                severity: data.severity || task?.severity,
                branchName: data.branchName,
                releaseVersion: data.releaseVersion,
                reproducibility: data.reproducibility || task?.reproducibility,
                frequency: data.frequency || task?.frequency,
                linkedTestCaseIds: data.linkedTestCaseIds || [],
                linkedExecutionRefs: data.linkedExecutionRefs || [],
                linkedNoteIds: data.linkedNoteIds || [],
                linkedFileIds: data.linkedFileIds || [],
                linkedPrs: data.linkedPrs || [],
                developerResponse: data.developerResponse,
                qaVerificationNotes: data.qaVerificationNotes,
                resolutionSummary: data.resolutionSummary,
                acknowledgedAt: data.acknowledgedAt,
                completedAt: data.completedAt,
                isComplete: completeness.isComplete,
                missingFields: completeness.missingFields,
            }
            return {
                ...project,
                tasks: project.tasks.map((item) => item.id === taskId ? normalizeTask({
                    ...item,
                    activeHandoffId: handoffId,
                    collabState: item.collabState === 'closed' ? 'draft' : item.collabState || 'draft',
                    lastCollabUpdatedAt: now,
                    updatedAt: now
                }) : item),
                handoffPackets: [packet, ...(project.handoffPackets || [])],
                collaborationEvents: [{
                    id: generateId(),
                    taskId,
                    handoffId,
                    eventType: 'handoff_created' as const,
                    actorRole: data.createdByRole,
                    timestamp: now,
                    title: `Created ${data.type.replace('_', ' ')}`,
                    details: packet.summary
                }, ...(project.collaborationEvents || [])]
            }
        })
        if (window.electronAPI) saveProjectsToDisk(updatedProjects)
        set({ projects: updatedProjects })
        return handoffId
    },

    updateHandoffPacket: async (projectId: string, handoffId: string, updates: Partial<HandoffPacket>) => {
        const updatedProjects = get().projects.map((project) => {
            if (project.id !== projectId) return project
            const handoffPackets = (project.handoffPackets || []).map((packet) =>
                packet.id === handoffId ? {
                    ...packet,
                    ...updates,
                    ...enrichHandoffCompleteness({
                        ...packet,
                        ...updates,
                    }),
                    updatedAt: Date.now(),
                } : packet
            )
            return { ...project, handoffPackets }
        })
        if (window.electronAPI) saveProjectsToDisk(updatedProjects)
        set({ projects: updatedProjects })
    },

    setTaskCollabState: async (projectId: string, taskId: string, collabState: CollabState) => {
        await get().updateTask(projectId, taskId, { collabState, lastCollabUpdatedAt: Date.now() })
    },

    acknowledgeHandoff: async (projectId: string, handoffId: string, actorRole: CollaborationActorRole = 'dev') => {
        const now = Date.now()
        const updatedProjects = get().projects.map((project) => {
            if (project.id !== projectId) return project
            const handoff = (project.handoffPackets || []).find((packet) => packet.id === handoffId)
            if (!handoff) return project
            return {
                ...project,
                handoffPackets: (project.handoffPackets || []).map((packet) =>
                    packet.id === handoffId ? { ...packet, acknowledgedAt: now, updatedAt: now } : packet
                ),
                tasks: project.tasks.map((task) => task.id === handoff.taskId ? normalizeTask({
                    ...task,
                    collabState: 'dev_acknowledged',
                    lastCollabUpdatedAt: now,
                    updatedAt: now
                }) : task),
                collaborationEvents: [{
                    id: generateId(),
                    taskId: handoff.taskId,
                    handoffId,
                    eventType: 'handoff_acknowledged' as const,
                    actorRole,
                    timestamp: now,
                    title: 'Handoff acknowledged'
                }, ...(project.collaborationEvents || [])]
            }
        })
        if (window.electronAPI) saveProjectsToDisk(updatedProjects)
        set({ projects: updatedProjects })
    },

    linkArtifact: async (projectId: string, link: Omit<ArtifactLink, 'id' | 'createdAt'>) => {
        const linkId = generateId()
        const now = Date.now()
        const updatedProjects = get().projects.map((project) => {
            if (project.id !== projectId) return project
            const exists = (project.artifactLinks || []).some((item) =>
                item.sourceType === link.sourceType &&
                item.sourceId === link.sourceId &&
                item.targetType === link.targetType &&
                item.targetId === link.targetId &&
                item.label === link.label
            )
            if (exists) return project
            return {
                ...project,
                artifactLinks: [{ id: linkId, createdAt: now, ...link }, ...(project.artifactLinks || [])]
            }
        })
        if (window.electronAPI) saveProjectsToDisk(updatedProjects)
        set({ projects: updatedProjects })
        return linkId
    },

    unlinkArtifact: async (projectId: string, linkId: string) => {
        const updatedProjects = get().projects.map((project) => {
            if (project.id !== projectId) return project
            return {
                ...project,
                artifactLinks: (project.artifactLinks || []).filter((link) => link.id !== linkId)
            }
        })
        if (window.electronAPI) saveProjectsToDisk(updatedProjects)
        set({ projects: updatedProjects })
    },

    linkPrToHandoff: async (projectId: string, handoffId: string, prRef: LinkedPrRef) => {
        const now = Date.now()
        let notificationProject: Project | undefined
        let notificationTask: Task | undefined
        let notificationHandoff: HandoffPacket | undefined
        const updatedProjects = get().projects.map((project) => {
            if (project.id !== projectId) return project
            const handoff = (project.handoffPackets || []).find((packet) => packet.id === handoffId)
            if (!handoff) return project
            const linkedPrs = handoff.linkedPrs.some((item) => item.repoFullName === prRef.repoFullName && item.prNumber === prRef.prNumber)
                ? handoff.linkedPrs
                : [...handoff.linkedPrs, prRef]
            notificationProject = project
            notificationTask = project.tasks.find((task) => task.id === handoff.taskId)
            notificationHandoff = { ...handoff, linkedPrs }
            return {
                ...project,
                handoffPackets: (project.handoffPackets || []).map((packet) =>
                    packet.id === handoffId ? { ...packet, linkedPrs, updatedAt: now } : packet
                ),
                collaborationEvents: [{
                    id: generateId(),
                    taskId: handoff.taskId,
                    handoffId,
                    eventType: 'pr_linked' as const,
                    actorRole: 'dev' as const,
                    timestamp: now,
                    title: `Linked PR #${prRef.prNumber}`,
                    details: prRef.repoFullName
                }, ...(project.collaborationEvents || [])]
            }
        })
        if (window.electronAPI) saveProjectsToDisk(updatedProjects)
        set({ projects: updatedProjects })
        await triggerCollaborationWebhook('pr_linked', notificationProject, notificationTask, notificationHandoff)
    },

    addCollaborationEvent: async (projectId: string, event: Omit<CollaborationEvent, 'id' | 'timestamp'> & Partial<Pick<CollaborationEvent, 'timestamp'>>) => {
        const eventId = generateId()
        const updatedProjects = get().projects.map((project) => {
            if (project.id !== projectId) return project
            return {
                ...project,
                collaborationEvents: [{
                    id: eventId,
                    timestamp: event.timestamp || Date.now(),
                    ...event
                }, ...(project.collaborationEvents || [])]
            }
        })
        if (window.electronAPI) saveProjectsToDisk(updatedProjects)
        set({ projects: updatedProjects })
        return eventId
    },

    createTaskFromFailedExecution: async (projectId: string, executionRef, seedData) => {
        const taskId = await get().addTask(projectId, {
            ...seedData,
            description: seedData.description || executionRef.steps || executionRef.actualResult || '',
            source: seedData.source || 'manual'
        })
        const activeProject = get().projects.find((project) => project.id === projectId)
        const task = activeProject?.tasks.find((item) => item.id === taskId)
        const handoffId = await get().createHandoffPacket(projectId, taskId, {
            type: 'bug_handoff',
            createdByRole: 'qa',
            summary: seedData.title,
            reproSteps: executionRef.steps || '',
            expectedResult: executionRef.expectedResult || '',
            actualResult: executionRef.actualResult || '',
            linkedExecutionRefs: [{
                sessionId: executionRef.sessionId,
                planExecutionId: executionRef.planExecutionId,
                caseExecutionId: executionRef.caseExecutionId
            }]
        })
        await get().setTaskCollabState(projectId, taskId, 'ready_for_dev')
        if (task) {
            await get().addCollaborationEvent(projectId, {
                taskId,
                handoffId,
                eventType: 'execution_linked' as const,
                actorRole: 'qa',
                title: 'Created task from failed execution',
                details: executionRef.title
            })
        }
        return taskId
    },

    getTaskTraceability: (projectId: string, taskId: string) => {
        const project = get().projects.find((item) => item.id === projectId)
        const task = project?.tasks.find((item) => item.id === taskId)
        const handoffs = (project?.handoffPackets || []).filter((packet) => packet.taskId === taskId)
        const links = (project?.artifactLinks || []).filter((link) =>
            (link.sourceType === 'task' && link.sourceId === taskId) ||
            (link.targetType === 'task' && link.targetId === taskId) ||
            handoffs.some((packet) => packet.id === link.sourceId || packet.id === link.targetId)
        )
        const linkedTestCaseIds = new Set<string>()
        handoffs.forEach((packet) => packet.linkedTestCaseIds.forEach((id) => linkedTestCaseIds.add(id)))
        links.forEach((link) => {
            if (link.sourceType === 'test_case') linkedTestCaseIds.add(link.sourceId)
            if (link.targetType === 'test_case') linkedTestCaseIds.add(link.targetId)
        })
        const linkedNoteIds = new Set<string>()
        handoffs.forEach((packet) => packet.linkedNoteIds.forEach((id) => linkedNoteIds.add(id)))
        links.forEach((link) => {
            if (link.sourceType === 'note') linkedNoteIds.add(link.sourceId)
            if (link.targetType === 'note') linkedNoteIds.add(link.targetId)
        })
        const linkedFileIds = new Set<string>()
        handoffs.forEach((packet) => packet.linkedFileIds.forEach((id) => linkedFileIds.add(id)))
        links.forEach((link) => {
            if (link.sourceType === 'file') linkedFileIds.add(link.sourceId)
            if (link.targetType === 'file') linkedFileIds.add(link.targetId)
        })

        return {
            task,
            activeHandoff: handoffs.find((packet) => packet.id === task?.activeHandoffId),
            handoffs,
            links,
            linkedTestCases: (project?.testPlans || []).flatMap((plan) => plan.testCases || []).filter((testCase) => linkedTestCaseIds.has(testCase.id)),
            linkedNotes: (project?.notes || []).filter((note) => linkedNoteIds.has(note.id)),
            linkedFiles: (project?.files || []).filter((file) => linkedFileIds.has(file.id))
        }
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
        }
        set({ projects: updatedProjects })
        return testCase.id
    },

    updateTestCase: async (projectId: string, planId: string, caseId: string, updates: Partial<TestCase>) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === planId) {
                        const testCases = tp.testCases.map(tc => {
                            if (tc.id === caseId) {
                                // Build changelog entry for any field changes
                                const newChangeLog = [...(tc.changeLog || [])]
                                const now = Date.now()

                                // Track specific field changes (exclude updatedAt)
                                const fieldsToTrack = ['title', 'status', 'priority', 'testType', 'steps', 'expectedResult', 'actualResult', 'tags', 'assignedTo', 'sapModule']
                                fieldsToTrack.forEach(field => {
                                    if (field in updates && updates[field as keyof TestCase] !== tc[field as keyof TestCase]) {
                                        const oldValue = String(tc[field as keyof TestCase] || '')
                                        const newValue = String(updates[field as keyof TestCase] || '')
                                        newChangeLog.push({
                                            timestamp: now,
                                            field,
                                            oldValue,
                                            newValue
                                        })
                                    }
                                })

                                return { ...tc, ...updates, changeLog: newChangeLog, updatedAt: now }
                            }
                            return tc
                        })
                        return { ...tp, testCases, updatedAt: Date.now() }
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })
        if (window.electronAPI) {
            saveProjectsToDisk(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    batchUpdateTestCases: async (projectId: string, planId: string, caseIds: string[], updates: Partial<TestCase>) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === planId) {
                        const testCases = tp.testCases.map(tc =>
                            caseIds.includes(tc.id) ? { ...tc, ...updates, updatedAt: Date.now() } : tc
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
            saveProjectsToDisk(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    batchDeleteTestCases: async (projectId: string, planId: string, caseIds: string[]) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === planId) {
                        const testCases = tp.testCases.filter(tc => !caseIds.includes(tc.id))
                        return { ...tp, testCases, updatedAt: Date.now() }
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })
        if (window.electronAPI) {
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
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
            saveProjectsToDisk(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    setActiveProject: (id: string) => {
        set({ activeProjectId: id })
    },

    addTestDataGroup: async (projectId: string, name: string, category: string): Promise<string> => {
        const group: TestDataGroup = { id: generateId(), name, category, entries: [], createdAt: Date.now() }
        const projects = get().projects.map(p => p.id === projectId ? { ...p, testDataGroups: [...(p.testDataGroups || []), group] } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
        return group.id
    },
    updateTestDataGroup: async (projectId: string, groupId: string, updates: Partial<TestDataGroup>) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, testDataGroups: p.testDataGroups.map(g => g.id === groupId ? { ...g, ...updates } : g)
        } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },
    deleteTestDataGroup: async (projectId: string, groupId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, testDataGroups: p.testDataGroups.filter(g => g.id !== groupId) } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },
    addTestDataEntry: async (projectId: string, groupId: string, data: Partial<TestDataEntry>): Promise<string> => {
        const id = generateId()
        const entry = { id, ...data } as TestDataEntry
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, testDataGroups: p.testDataGroups.map(g => g.id === groupId ? { ...g, entries: [...g.entries, entry] } : g)
        } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
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
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },
    deleteTestDataEntry: async (projectId: string, groupId: string, entryId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, testDataGroups: p.testDataGroups.map(g => g.id === groupId ? { ...g, entries: g.entries.filter(e => e.id !== entryId) } : g)
        } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },

    // file attachments at project-level
    addProjectFile: async (projectId: string, file: Attachment) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, files: [...(p.files || []), file] } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },
    deleteProjectFile: async (projectId: string, fileId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, files: p.files.filter(f => f.id !== fileId) } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },

    addChecklist: async (projectId: string, name: string, category: string) => {
        const checklist: Checklist = { id: generateId(), name, category, items: [], createdAt: Date.now(), updatedAt: Date.now() }
        const projects = get().projects.map(p => p.id === projectId ? { ...p, checklists: [...(p.checklists || []), checklist] } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
        return checklist
    },
    updateChecklist: async (projectId: string, checklistId: string, updates: Partial<Checklist>) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, checklists: p.checklists.map(c => c.id === checklistId ? { ...c, ...updates, updatedAt: Date.now() } : c) } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },
    deleteChecklist: async (projectId: string, checklistId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, checklists: p.checklists.filter(c => c.id !== checklistId) } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },
    toggleChecklistItem: async (projectId: string, checklistId: string, itemId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, checklists: p.checklists.map(c => c.id === checklistId ? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, isChecked: !i.isChecked } : i) } : c)
        } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },
    addChecklistItem: async (projectId: string, checklistId: string, text: string) => {
        const item: ChecklistItem = { id: generateId(), text, isChecked: false }
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, checklists: p.checklists.map(c => c.id === checklistId ? { ...c, items: [...c.items, item] } : c)
        } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
        return item.id
    },
    deleteChecklistItem: async (projectId: string, checklistId: string, itemId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, checklists: p.checklists.map(c => c.id === checklistId ? { ...c, items: c.items.filter(i => i.id !== itemId) } : c)
        } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },

    addApiRequest: async (projectId: string, data: Partial<ApiRequest>) => {
        const req: ApiRequest = { id: generateId(), name: data.name || 'New Request', category: data.category || 'Custom', method: data.method || 'GET', url: data.url || '', headers: data.headers || '', body: data.body || '', createdAt: Date.now(), updatedAt: Date.now() }
        const projects = get().projects.map(p => p.id === projectId ? { ...p, apiRequests: [...(p.apiRequests || []), req] } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
        return req.id
    },
    updateApiRequest: async (projectId: string, requestId: string, updates: Partial<ApiRequest>) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, apiRequests: p.apiRequests.map(r => r.id === requestId ? { ...r, ...updates, updatedAt: Date.now() } : r) } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },
    deleteApiRequest: async (projectId: string, requestId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, apiRequests: p.apiRequests.filter(r => r.id !== requestId) } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
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
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
        return runbook
    },
    updateRunbook: async (projectId: string, runbookId: string, updates: Partial<Runbook>) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            runbooks: (p.runbooks || []).map(r => r.id === runbookId ? { ...r, ...updates, updatedAt: Date.now() } : r)
        } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },
    deleteRunbook: async (projectId: string, runbookId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            runbooks: (p.runbooks || []).filter(r => r.id !== runbookId)
        } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
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
        if (window.electronAPI) saveProjectsToDisk(projects)
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
        if (window.electronAPI) saveProjectsToDisk(projects)
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
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },

    // Report Templates (M1)
    addReportTemplate: async (projectId: string, name: string, description: string, sections: any[]) => {
        const templateId = generateId()
        const now = Date.now()
        const newTemplate = {
            id: templateId,
            name,
            description,
            sections: sections.map((s, idx) => ({ ...s, id: generateId(), order: idx })),
            filters: {},
            format: 'html',
            createdAt: now,
            updatedAt: now
        }
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            reportTemplates: [...(p.reportTemplates || []), newTemplate]
        } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
        return templateId
    },

    updateReportTemplate: async (projectId: string, templateId: string, updates: any) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            reportTemplates: (p.reportTemplates || []).map(t =>
                t.id === templateId ? { ...t, ...updates, updatedAt: Date.now() } : t
            )
        } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },

    deleteReportTemplate: async (projectId: string, templateId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            reportTemplates: (p.reportTemplates || []).filter(t => t.id !== templateId)
        } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    },

    reorderReportSections: async (projectId: string, templateId: string, sectionIds: string[]) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            reportTemplates: (p.reportTemplates || []).map(t =>
                t.id === templateId ? {
                    ...t,
                    sections: t.sections.map((s: any) => ({
                        ...s,
                        order: sectionIds.indexOf(s.id)
                    })),
                    updatedAt: Date.now()
                } : t
            )
        } : p)
        if (window.electronAPI) saveProjectsToDisk(projects)
        set({ projects })
    }
}))
