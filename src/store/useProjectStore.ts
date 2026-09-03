// cspell:ignore yxxx
import { create } from 'zustand'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import {
    Project, Task, TestCase, TestExecution, TestRunSession,
    Note, QaEnvironment, Attachment, TaskStatus,
    TestDataGroup, TestPlan, TestCasePriority,
    TestCaseStatus, Checklist, ApiRequest, Runbook, RunbookCategory, RunbookStep,
    TestDataEntry, ChecklistItem, CollabState, HandoffPacket, ArtifactLink,
    CollaborationEvent, HandoffExecutionRef, LinkedPrRef, CollaborationActorRole,
    EnvironmentType, RunbookStepStatus, TestCaseExecution, TestPlanExecution,
    AccuracyTestSuite, ReferenceDocument, AccuracyQaPair, AccuracyEvalRun, AiCopilotHistoryEntry,
    ExploratorySession, ExploratoryObservation
} from '../types/project'
import { demoProject } from '@/data/demoProject'
import { enrichHandoffCompleteness, migrateLegacyExecutionsToSessions, PROJECT_SCHEMA_VERSION } from '@/lib/collaboration'
import { measureAsync } from '@/lib/perf'
import { sanitizeEnvironmentForPersistence, sanitizeProjectForPersistence } from '@/lib/projectSanitization'
import { remapProjectForImport } from '@/lib/projectImport'
import { getSyncActorIdentity, registerProjectSyncBridge } from './syncProjectBridge'

export type {
    Project, Task, TestCase, TestExecution, TestRunSession,
    Note, QaEnvironment, Attachment, TaskStatus,
    TestDataGroup, TestPlan, TestCasePriority,
    TestCaseStatus, Checklist, ApiRequest, Runbook, RunbookCategory, RunbookStep,
    TestDataEntry, ChecklistItem, CollabState, HandoffPacket, ArtifactLink,
    CollaborationEvent, HandoffExecutionRef, LinkedPrRef, CollaborationActorRole,
    EnvironmentType, RunbookStepStatus, TestCaseExecution, TestPlanExecution,
    AccuracyTestSuite, ReferenceDocument, AccuracyQaPair, AccuracyEvalRun, AiCopilotHistoryEntry,
    ExploratorySession, ExploratoryObservation
}

function generateId(): string {
    return crypto.randomUUID()
}

const MAX_AI_COPILOT_HISTORY_ENTRIES = 150
const EMPTY_NOTES: Note[] = []
const EMPTY_TASKS: Task[] = []
const EMPTY_TEST_PLANS: TestPlan[] = []
const EMPTY_HANDOFFS: HandoffPacket[] = []
const EMPTY_ATTACHMENTS: Attachment[] = []
const EMPTY_ARTIFACT_LINKS: ArtifactLink[] = []
const EMPTY_COLLABORATION_EVENTS: CollaborationEvent[] = []
const EMPTY_ENVIRONMENTS: QaEnvironment[] = []
const EMPTY_LINEAR_CONNECTIONS: Project['linearConnections'] = []
const EMPTY_JIRA_CONNECTIONS: Project['jiraConnections'] = []
const EMPTY_TEST_RUN_SESSIONS: TestRunSession[] = []

/**
 * True once a project read has failed. While set, every write is refused.
 *
 * A read failure leaves the store with no projects in memory. Writing that empty
 * state back is how a transient read error turns into permanent data loss, so the
 * store stays read-only until a load succeeds.
 */
let _loadFailed = false

/**
 * Persistence helper — writes projects to the SQLite database via IPC.
 * better-sqlite3 is synchronous on the main-process side, so writes are
 * atomic and do not require debouncing for correctness. We still fire-and-
 * forget (no await at call sites) to keep the UI non-blocking.
 * Returns a Promise<boolean> reporting whether the write actually landed —
 * the main process reports failure in its result rather than by rejecting.
 */
const saveProjectsToDisk = (projects: Project[]): Promise<boolean> => {
    if (!window.electronAPI) return Promise.resolve(false)
    if (_loadFailed) {
        console.error('[store] Refusing to write projects: the last read failed, so in-memory state is not authoritative.')
        return Promise.resolve(false)
    }
    return window.electronAPI.writeProjectsFile(projects.map(sanitizeProjectForPersistence))
        .then((result: { ok: boolean; error?: string } | boolean | undefined) => {
            // A resolved promise is not success: the handler returns { ok: false }
            // when the write threw. Treating resolution as success is how save
            // failures went unnoticed.
            const ok = typeof result === 'object' && result !== null ? result.ok !== false : result !== false
            if (!ok) {
                const detail = typeof result === 'object' && result?.error ? ` (${result.error})` : ''
                console.error(`[store] Project write reported failure${detail}`)
                toast.error('Failed to save — your changes were not written to disk.', { duration: 8000 })
            }
            return ok
        })
        .catch((error: unknown) => {
            console.error('Failed to persist projects to SQLite:', error)
            toast.error('Failed to save — your changes may not have been written to disk.', { duration: 8000 })
            return false
        })
};

/**
 * Debounced variant of saveProjectsToDisk — used for high-frequency entity
 * mutations (test data groups, API requests, runbooks, etc.) that do not yet
 * have granular IPC handlers. The 300ms window coalesces rapid successive
 * writes into a single disk flush. SQLite WAL mode guarantees atomicity, so
 * skipping intermediate states is safe.
 */
let _debounceSaveTimer: ReturnType<typeof setTimeout> | null = null
let _flushListenerRegistered = false
let _projectsChangedListenerRegistered = false
/**
 * The `projects` argument is deliberately ignored: it is a snapshot from when the
 * call was made, and any granular write that lands inside the debounce window
 * would be overwritten by it. Read the live state when the timer fires instead.
 */
const debouncedSaveProjectsToDisk = (_projects?: Project[]): void => {
    if (_debounceSaveTimer !== null) clearTimeout(_debounceSaveTimer)
    _debounceSaveTimer = setTimeout(() => {
        _debounceSaveTimer = null
        saveProjectsToDisk(useProjectStore.getState().projects)
    }, 300)
}

/**
 * Shared fallback for granular IPC persist failures: show a toast and flush
 * the full project snapshot so at least one save path succeeds.
 */
function onPersistError(err: unknown, label: string): void {
    console.error(`[store] ${label} failed:`, err)
    toast.error('Failed to save — retrying with full snapshot.')
    saveProjectsToDisk(useProjectStore.getState().projects)
}

const persistNoteToDisk = async (projectId: string, note: Note) => {
    if (window.electronAPI?.upsertProjectNote) {
        try {
            await window.electronAPI.upsertProjectNote(projectId, note)
        } catch (err) {
            onPersistError(err, 'upsertProjectNote')
        }
        return
    }
    saveProjectsToDisk(useProjectStore.getState().projects)
}

const deleteNoteFromDisk = async (projectId: string, noteId: string) => {
    if (window.electronAPI?.deleteProjectNote) {
        try {
            await window.electronAPI.deleteProjectNote(projectId, noteId)
        } catch (err) {
            onPersistError(err, 'deleteProjectNote')
        }
        return
    }
    saveProjectsToDisk(useProjectStore.getState().projects)
}

const persistTaskToDisk = async (projectId: string, task: Task) => {
    if (window.electronAPI?.upsertProjectTask) {
        try {
            await window.electronAPI.upsertProjectTask(projectId, task)
        } catch (err) {
            onPersistError(err, 'upsertProjectTask')
        }
        return
    }
    saveProjectsToDisk(useProjectStore.getState().projects)
}

const deleteTaskFromDisk = async (projectId: string, taskId: string) => {
    if (window.electronAPI?.deleteProjectTask) {
        try {
            await window.electronAPI.deleteProjectTask(projectId, taskId)
        } catch (err) {
            onPersistError(err, 'deleteProjectTask')
        }
        return
    }
    saveProjectsToDisk(useProjectStore.getState().projects)
}

const persistHandoffToDisk = async (projectId: string, handoff: HandoffPacket) => {
    if (window.electronAPI?.upsertProjectHandoff) {
        try {
            await window.electronAPI.upsertProjectHandoff(projectId, handoff)
        } catch (err) {
            onPersistError(err, 'upsertProjectHandoff')
        }
        return
    }
    saveProjectsToDisk(useProjectStore.getState().projects)
}

const persistCollaborationEventToDisk = async (projectId: string, event: CollaborationEvent) => {
    if (window.electronAPI?.insertProjectCollaborationEvent) {
        try {
            await window.electronAPI.insertProjectCollaborationEvent(projectId, event)
        } catch (err) {
            onPersistError(err, 'insertProjectCollaborationEvent')
        }
        return
    }
    saveProjectsToDisk(useProjectStore.getState().projects)
}

const persistTestPlanToDisk = async (projectId: string, plan: TestPlan) => {
    if (window.electronAPI?.upsertProjectTestPlan) {
        try {
            await window.electronAPI.upsertProjectTestPlan(projectId, plan)
        } catch (err) {
            onPersistError(err, 'upsertProjectTestPlan')
        }
        return
    }
    saveProjectsToDisk(useProjectStore.getState().projects)
}

const deleteTestPlanFromDisk = async (projectId: string, planId: string) => {
    if (window.electronAPI?.deleteProjectTestPlan) {
        try {
            await window.electronAPI.deleteProjectTestPlan(projectId, planId)
        } catch (err) {
            onPersistError(err, 'deleteProjectTestPlan')
        }
        return
    }
    saveProjectsToDisk(useProjectStore.getState().projects)
}

const persistEnvironmentToDisk = async (projectId: string, env: QaEnvironment) => {
    if (window.electronAPI?.upsertProjectEnvironment) {
        try {
            await window.electronAPI.upsertProjectEnvironment(projectId, env)
        } catch (err) {
            onPersistError(err, 'upsertProjectEnvironment')
        }
        return
    }
    saveProjectsToDisk(useProjectStore.getState().projects)
}

const deleteEnvironmentFromDisk = async (projectId: string, envId: string) => {
    if (window.electronAPI?.deleteProjectEnvironment) {
        try {
            await window.electronAPI.deleteProjectEnvironment(projectId, envId)
        } catch (err) {
            onPersistError(err, 'deleteProjectEnvironment')
        }
        return
    }
    saveProjectsToDisk(useProjectStore.getState().projects)
}

const persistChecklistToDisk = async (projectId: string, checklist: Checklist) => {
    if (window.electronAPI?.upsertProjectChecklist) {
        try {
            await window.electronAPI.upsertProjectChecklist(projectId, checklist)
        } catch (err) {
            onPersistError(err, 'upsertProjectChecklist')
        }
        return
    }
    saveProjectsToDisk(useProjectStore.getState().projects)
}

const deleteChecklistFromDisk = async (projectId: string, checklistId: string) => {
    if (window.electronAPI?.deleteProjectChecklist) {
        try {
            await window.electronAPI.deleteProjectChecklist(projectId, checklistId)
        } catch (err) {
            onPersistError(err, 'deleteProjectChecklist')
        }
        return
    }
    saveProjectsToDisk(useProjectStore.getState().projects)
}

const persistTestRunSessionToDisk = async (projectId: string, session: TestRunSession) => {
    if (window.electronAPI?.upsertProjectTestRunSession) {
        try {
            await window.electronAPI.upsertProjectTestRunSession(projectId, session)
        } catch (err) {
            onPersistError(err, 'upsertProjectTestRunSession')
        }
        return
    }
    saveProjectsToDisk(useProjectStore.getState().projects)
}

const deleteTestRunSessionFromDisk = async (projectId: string, sessionId: string) => {
    if (window.electronAPI?.deleteProjectTestRunSession) {
        try {
            await window.electronAPI.deleteProjectTestRunSession(projectId, sessionId)
        } catch (err) {
            onPersistError(err, 'deleteProjectTestRunSession')
        }
        return
    }
    saveProjectsToDisk(useProjectStore.getState().projects)
}

// Fire-and-forget sync push helpers — only enqueue if sync is configured
function syncPushTaskCollab(projectId: string, taskId: string, collabState: string, activeHandoffId?: string | null) {
    window.electronAPI?.syncPushTaskCollab?.({ projectId, taskId, collabState, activeHandoffId, updatedAt: Date.now() }).catch((err: unknown) => {
        console.error('[sync] syncPushTaskCollab failed:', err)
        toast.error('Sync push failed — task collaboration state may not have synced to the cloud.')
    })
}
function syncPushHandoff(projectId: string, handoff: HandoffPacket) {
    window.electronAPI?.syncPushHandoff?.({ projectId, handoff }).catch((err: unknown) => {
        console.error('[sync] syncPushHandoff failed:', err)
        toast.error('Sync push failed — handoff may not have synced to the cloud.')
    })
}
function syncPushCollabEvent(projectId: string, event: CollaborationEvent) {
    window.electronAPI?.syncPushCollabEvent?.({ projectId, event }).catch((err: unknown) => {
        console.error('[sync] syncPushCollabEvent failed:', err)
        toast.error('Sync push failed — collaboration event may not have synced to the cloud.')
    })
}
function syncPushArtifactLink(projectId: string, link: ArtifactLink) {
    window.electronAPI?.syncPushArtifactLink?.({ projectId, link }).catch((err: unknown) => {
        console.error('[sync] syncPushArtifactLink failed:', err)
        toast.error('Sync push failed — artifact link may not have synced to the cloud.')
    })
}

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
        environments: (project.environments || []).map((environment: QaEnvironment) => sanitizeEnvironmentForPersistence(environment)),
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
        aiCopilotHistory: project.aiCopilotHistory || [],
        sourceColumns: project.sourceColumns || (project.columns ? { manual: project.columns } : undefined),
        handoffPackets: (project.handoffPackets || []).map((packet: any) => enrichHandoffCompleteness(packet)),
        artifactLinks: project.artifactLinks || [],
        collaborationEvents: project.collaborationEvents || [],
        accuracyTestSuites: project.accuracyTestSuites || []
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
    const api = window.electronAPI
    if (!api || !project || !task || !handoff) return

    try {
        const settings = await api.readSettingsFile()
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
        // Embed colors for external webhook payloads (Slack/Discord) — must be
        // literal hex; CSS variables don't resolve outside the app.
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
            const result = await api.sendWebhook({
                url: webhook.url,
                type: webhook.type,
                isEnabled: webhook.isEnabled,
            }, titleMap[event], message, colorMap[event])

            if (!result.success) {
                throw new Error(result.error || 'Webhook notification failed.')
            }
        }))
    } catch (error) {
        console.error('Failed to trigger collaboration webhook:', error)
    }
}

export interface ProjectState {
    projects: Project[]
    activeProjectId: string | null
    initialized: boolean

    // Project Actions
    loadProjects: () => Promise<void>
    addProject: (name: string, color: string) => Promise<void>
    updateProject: (id: string, updates: Partial<Omit<Project, 'id'>>) => Promise<void>
    deleteProject: (id: string) => Promise<void>
    purgeAllProjects: () => Promise<{ ok: boolean; deleted: number }>
    importProject: (project: Project) => Promise<void>
    seedDemoProject: () => Promise<void>
    appendAiCopilotHistoryEntry: (projectId: string, entry: Omit<AiCopilotHistoryEntry, 'id' | 'createdAt'>) => Promise<void>
    clearAiCopilotHistory: (projectId: string, role?: AiCopilotHistoryEntry['role']) => Promise<void>

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
    mergeRemoteTask: (task: Task & { handoffPackets?: HandoffPacket[]; collaborationEvents?: CollaborationEvent[] }) => void
    mergeRemoteHandoff: (handoff: HandoffPacket) => void
    mergeRemoteCollaborationEvent: (projectId: string, event: CollaborationEvent) => void
    mergeRemoteArtifactLink: (projectId: string, link: ArtifactLink) => void

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

    // AI Accuracy Testing
    addAccuracySuite: (projectId: string, name: string) => Promise<string>
    updateAccuracySuite: (projectId: string, suiteId: string, updates: Partial<AccuracyTestSuite>) => Promise<void>
    deleteAccuracySuite: (projectId: string, suiteId: string) => Promise<void>
    addAccuracyRefDoc: (projectId: string, suiteId: string, doc: Omit<ReferenceDocument, 'id' | 'uploadedAt'>) => Promise<string>
    removeAccuracyRefDoc: (projectId: string, suiteId: string, docId: string) => Promise<void>
    addAccuracyQaPair: (projectId: string, suiteId: string, question: string, agentResponse: string, sourceLabel?: string, expectedAnswer?: string) => Promise<string>
    batchAddAccuracyQaPairs: (projectId: string, suiteId: string, pairs: Array<{ question: string; agentResponse: string; sourceLabel?: string; expectedAnswer?: string }>) => Promise<void>
    removeAccuracyQaPair: (projectId: string, suiteId: string, pairId: string) => Promise<void>
    addAccuracyEvalRun: (projectId: string, suiteId: string, run: Omit<AccuracyEvalRun, 'id'>) => Promise<string>
    updateAccuracyEvalRun: (projectId: string, suiteId: string, runId: string, updates: Partial<AccuracyEvalRun>) => Promise<void>

    // Exploratory Testing
    addExploratorySession: (projectId: string, charter: string, timebox: number, tester: string) => Promise<string>
    updateExploratorySession: (projectId: string, sessionId: string, updates: Partial<ExploratorySession>) => Promise<void>
    addExploratoryObservation: (projectId: string, sessionId: string, obs: Omit<ExploratoryObservation, 'id' | 'timestamp'>) => Promise<string>
    deleteExploratorySession: (projectId: string, sessionId: string) => Promise<void>
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

        // Register the flush listener exactly once — loadProjects may be called
        // multiple times (e.g. after import), and stacking listeners causes duplicate saves.
        // Main can write to the database without going through this store — the
        // automation API and cloud sync both do. Re-read when it says so, or the
        // next full write from this stale cache reverts those changes.
        if (!_projectsChangedListenerRegistered && window.electronAPI.onProjectsChanged) {
            _projectsChangedListenerRegistered = true
            window.electronAPI.onProjectsChanged(({ source }) => {
                console.info(`[store] Reloading projects: changed by ${source}.`)
                void useProjectStore.getState().loadProjects()
            })
        }

        if (!_flushListenerRegistered && window.electronAPI.onFlushPendingSave) {
            _flushListenerRegistered = true
            window.electronAPI.onFlushPendingSave(async () => {
                try {
                    if (_debounceSaveTimer !== null) {
                        clearTimeout(_debounceSaveTimer)
                        _debounceSaveTimer = null
                        await saveProjectsToDisk(useProjectStore.getState().projects)
                    }
                } finally {
                    // Always ack so the main process can finish quitting promptly,
                    // whether or not there was a pending save to flush.
                    window.electronAPI.notifyFlushComplete?.()
                }
            })
        }

        try {
            const result = await measureAsync('projectLoadMs', () => window.electronAPI.readProjectsFile())

            // The handler distinguishes "read failed" from "no projects". Older
            // builds returned a bare array, so accept both shapes.
            const rawProjects = Array.isArray(result)
                ? result
                : result?.ok === true ? result.projects : null

            if (rawProjects === null) {
                const detail = !Array.isArray(result) && result && result.ok === false ? result.error : 'unknown error'
                throw new Error(`Project read failed: ${detail}`)
            }

            const projects = (rawProjects || []).map((p: any) => normalizeProject(p))
            _loadFailed = false

            set({
                projects,
                initialized: true,
                activeProjectId: get().activeProjectId || (projects.length > 0 ? projects[0].id : null)
            })
        } catch (e) {
            console.error('Failed to load projects from disk:', e)
            // Latch read-only. Without this the empty in-memory state gets written
            // back on the next mutation and the database is pruned to match it.
            _loadFailed = true
            toast.error(
                'Could not read your project data. Nothing has been deleted, and saving is disabled until this is resolved. Restart the app, and check the data folder from Settings if it persists.',
                { duration: 30000 }
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
            aiCopilotHistory: [],
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

    appendAiCopilotHistoryEntry: async (projectId: string, entry: Omit<AiCopilotHistoryEntry, 'id' | 'createdAt'>) => {
        const historyEntry: AiCopilotHistoryEntry = {
            id: generateId(),
            createdAt: Date.now(),
            ...entry,
        }

        const updatedProjects = get().projects.map((project) => {
            if (project.id !== projectId) return project
            return {
                ...project,
                aiCopilotHistory: [historyEntry, ...(project.aiCopilotHistory || [])].slice(0, MAX_AI_COPILOT_HISTORY_ENTRIES),
            }
        })

        if (window.electronAPI) {
            saveProjectsToDisk(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    clearAiCopilotHistory: async (projectId: string, role?: AiCopilotHistoryEntry['role']) => {
        const updatedProjects = get().projects.map((project) => {
            if (project.id !== projectId) return project
            return {
                ...project,
                aiCopilotHistory: role
                    ? (project.aiCopilotHistory || []).filter((entry) => entry.role !== role)
                    : [],
            }
        })

        if (window.electronAPI) {
            saveProjectsToDisk(updatedProjects)
        }
        set({ projects: updatedProjects })
    },

    deleteProject: async (id: string) => {
        // Deletion is explicit: a full write no longer prunes projects it was not
        // given, so removing one from the array is not enough to delete it.
        if (window.electronAPI?.deleteProject) {
            const result = await window.electronAPI.deleteProject(id).catch((error: unknown) => {
                console.error('[store] deleteProject failed:', error)
                return { ok: false as const, error: String(error) }
            })
            if (!result?.ok) {
                toast.error('Could not delete the project. Nothing was removed.')
                return
            }
        }

        const updatedProjects = get().projects.filter(p => p.id !== id)
        set({
            projects: updatedProjects,
            activeProjectId: get().activeProjectId === id ? (updatedProjects[0]?.id || null) : get().activeProjectId
        })
    },

    /**
     * Delete every project. Used by Settings → Purge All Data.
     *
     * Previously this wrote an empty array straight to the IPC layer, which both
     * bypassed the store — leaving every project on screen until a restart, and
     * liable to be re-persisted by the next autosave — and depended on the full
     * write pruning by omission, which it no longer does.
     */
    purgeAllProjects: async () => {
        const ids = get().projects.map(p => p.id)
        let deleted = 0
        let failed = 0

        for (const id of ids) {
            const result = await window.electronAPI?.deleteProject?.(id).catch((error: unknown) => {
                console.error('[store] purge: deleteProject failed:', error)
                return { ok: false as const }
            })
            if (result?.ok) deleted += 1
            else failed += 1
        }

        // Only drop from memory what actually left the database, so the UI keeps
        // showing anything that survived.
        if (failed === 0) {
            set({ projects: [], activeProjectId: null })
        } else {
            await get().loadProjects()
        }
        return { ok: failed === 0, deleted }
    },

    importProject: async (project: Project) => {
        // Every entity gets a fresh id so an import cannot collide with existing
        // rows, and every reference between them is rewritten to match. See
        // remapProjectForImport for why the second half matters.
        const { project: remapped } = remapProjectForImport(project, generateId)
        const newProject = normalizeProject({
            ...remapped,
            tasks: (remapped.tasks ?? []).map((task: Task) => normalizeTask(task)),
        })

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
        set({ projects: updatedProjects })
        if (window.electronAPI) {
            await persistNoteToDisk(projectId, newNote)
        }
        return newNote
    },

    updateNote: async (projectId: string, noteId: string, updates: Partial<Note>) => {
        let persistedNote: Note | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const notes = p.notes.map(n =>
                    n.id === noteId ? (persistedNote = { ...n, ...updates, updatedAt: Date.now() }) : n
                )
                return { ...p, notes }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedNote) {
            await persistNoteToDisk(projectId, persistedNote)
        }
    },

    deleteNote: async (projectId: string, noteId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const notes = p.notes.filter(n => n.id !== noteId)
                return { ...p, notes }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI) {
            await deleteNoteFromDisk(projectId, noteId)
        }
    },

    // Attachments --------------------------------------------------------
    addAttachmentToNote: async (projectId: string, noteId: string, attachment: Attachment) => {
        let persistedNote: Note | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const notes = p.notes.map(n =>
                    n.id === noteId ? (persistedNote = { ...n, attachments: [...n.attachments, attachment], updatedAt: Date.now() }) : n
                )
                return { ...p, notes }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedNote) {
            await persistNoteToDisk(projectId, persistedNote)
        }
    },

    removeAttachmentFromNote: async (projectId: string, noteId: string, attachmentId: string) => {
        let persistedNote: Note | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const notes = p.notes.map(n =>
                    n.id === noteId ? (persistedNote = { ...n, attachments: n.attachments.filter(a => a.id !== attachmentId), updatedAt: Date.now() }) : n
                )
                return { ...p, notes }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedNote) {
            await persistNoteToDisk(projectId, persistedNote)
        }
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
        set({ projects: updatedProjects })
        if (window.electronAPI) {
            await persistTaskToDisk(projectId, task)
        }
        return task.id
    },

    updateTask: async (projectId: string, taskId: string, updates: Partial<Task>) => {
        let persistedTask: Task | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const tasks = p.tasks.map(t =>
                    t.id === taskId ? (persistedTask = normalizeTask({ ...t, ...updates, updatedAt: Date.now() })) : t
                )
                return { ...p, tasks }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedTask) {
            await persistTaskToDisk(projectId, persistedTask)
        }
    },

    createHandoffPacket: async (projectId: string, taskId: string, data: Partial<HandoffPacket> & Pick<HandoffPacket, 'type' | 'createdByRole'>) => {
        const now = Date.now()
        const handoffId = generateId()
        let persistedTask: Task | undefined
        let createdEvent: CollaborationEvent | undefined
        let createdPacket: HandoffPacket | undefined
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
            createdPacket = packet
            createdEvent = {
                id: generateId(),
                taskId,
                handoffId,
                eventType: 'handoff_created' as const,
                actorRole: data.createdByRole,
                timestamp: now,
                title: `Created ${data.type.replace('_', ' ')}`,
                details: packet.summary
            }
            return {
                ...project,
                tasks: project.tasks.map((item) => item.id === taskId ? (persistedTask = normalizeTask({
                    ...item,
                    activeHandoffId: handoffId,
                    collabState: item.collabState === 'closed' ? 'draft' : item.collabState || 'draft',
                    lastCollabUpdatedAt: now,
                    updatedAt: now
                })) : item),
                handoffPackets: [packet, ...(project.handoffPackets || [])],
                collaborationEvents: [createdEvent, ...(project.collaborationEvents || [])]
            }
        })
        set({ projects: updatedProjects })
        if (window.electronAPI) {
            if (createdPacket) await persistHandoffToDisk(projectId, createdPacket)
            if (persistedTask) await persistTaskToDisk(projectId, persistedTask)
            if (createdEvent) await persistCollaborationEventToDisk(projectId, createdEvent)
        }
        // Push new handoff, task collab state, and creation event to cloud
        if (createdPacket) syncPushHandoff(projectId, createdPacket)
        if (persistedTask) syncPushTaskCollab(projectId, taskId, persistedTask.collabState || 'draft', persistedTask.activeHandoffId)
        if (createdEvent) syncPushCollabEvent(projectId, createdEvent)
        return handoffId
    },

    updateHandoffPacket: async (projectId: string, handoffId: string, updates: Partial<HandoffPacket>) => {
        let updatedPacket: HandoffPacket | undefined
        const updatedProjects = get().projects.map((project) => {
            if (project.id !== projectId) return project
            const handoffPackets = (project.handoffPackets || []).map((packet) =>
                packet.id === handoffId ? (updatedPacket = {
                    ...packet,
                    ...updates,
                    ...enrichHandoffCompleteness({
                        ...packet,
                        ...updates,
                    }),
                    updatedAt: Date.now(),
                }) : packet
            )
            return { ...project, handoffPackets }
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && updatedPacket) {
            await persistHandoffToDisk(projectId, updatedPacket)
        }
        if (updatedPacket) syncPushHandoff(projectId, updatedPacket)
    },

    setTaskCollabState: async (projectId: string, taskId: string, collabState: CollabState) => {
        const now = Date.now()
        await get().updateTask(projectId, taskId, { collabState, lastCollabUpdatedAt: now })
        const task = get().projects.find(p => p.id === projectId)?.tasks.find(t => t.id === taskId)
        if (task) syncPushTaskCollab(projectId, taskId, collabState, task.activeHandoffId)
    },

    acknowledgeHandoff: async (projectId: string, handoffId: string, actorRole: CollaborationActorRole = 'dev') => {
        const now = Date.now()
        let ackHandoff: HandoffPacket | undefined
        let ackTask: Task | undefined
        let ackEvent: CollaborationEvent | undefined
        const updatedProjects = get().projects.map((project) => {
            if (project.id !== projectId) return project
            const handoff = (project.handoffPackets || []).find((packet) => packet.id === handoffId)
            if (!handoff) return project
            ackEvent = {
                id: generateId(),
                taskId: handoff.taskId,
                handoffId,
                eventType: 'handoff_acknowledged' as const,
                actorRole,
                timestamp: now,
                title: 'Handoff acknowledged'
            }
            return {
                ...project,
                handoffPackets: (project.handoffPackets || []).map((packet) =>
                    packet.id === handoffId ? (ackHandoff = { ...packet, acknowledgedAt: now, updatedAt: now }) : packet
                ),
                tasks: project.tasks.map((task) => task.id === handoff.taskId ? (ackTask = normalizeTask({
                    ...task,
                    collabState: 'dev_acknowledged',
                    lastCollabUpdatedAt: now,
                    updatedAt: now
                })) : task),
                collaborationEvents: [ackEvent, ...(project.collaborationEvents || [])]
            }
        })
        set({ projects: updatedProjects })
        if (window.electronAPI) {
            if (ackHandoff) await persistHandoffToDisk(projectId, ackHandoff)
            if (ackTask) await persistTaskToDisk(projectId, ackTask)
            if (ackEvent) await persistCollaborationEventToDisk(projectId, ackEvent)
        }
        if (ackTask) syncPushTaskCollab(projectId, ackTask.id, ackTask.collabState || 'draft', ackTask.activeHandoffId)
        if (ackEvent) syncPushCollabEvent(projectId, ackEvent)
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
        set({ projects: updatedProjects })
        if (window.electronAPI) debouncedSaveProjectsToDisk(updatedProjects)
        const newLink = updatedProjects.find(p => p.id === projectId)?.artifactLinks?.find(l => l.id === linkId)
        if (newLink) syncPushArtifactLink(projectId, newLink)
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
        set({ projects: updatedProjects })
        if (window.electronAPI) debouncedSaveProjectsToDisk(updatedProjects)
    },

    linkPrToHandoff: async (projectId: string, handoffId: string, prRef: LinkedPrRef) => {
        const now = Date.now()
        let notificationProject: Project | undefined
        let notificationTask: Task | undefined
        let notificationHandoff: HandoffPacket | undefined
        let persistedHandoff: HandoffPacket | undefined
        let persistedEvent: CollaborationEvent | undefined
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
            persistedEvent = {
                id: generateId(),
                taskId: handoff.taskId,
                handoffId,
                eventType: 'pr_linked' as const,
                actorRole: 'dev' as const,
                timestamp: now,
                title: `Linked PR #${prRef.prNumber}`,
                details: prRef.repoFullName
            }
            return {
                ...project,
                handoffPackets: (project.handoffPackets || []).map((packet) =>
                    packet.id === handoffId ? (persistedHandoff = { ...packet, linkedPrs, updatedAt: now }) : packet
                ),
                collaborationEvents: [persistedEvent, ...(project.collaborationEvents || [])]
            }
        })
        set({ projects: updatedProjects })
        if (window.electronAPI) {
            if (persistedHandoff) await persistHandoffToDisk(projectId, persistedHandoff)
            if (persistedEvent) await persistCollaborationEventToDisk(projectId, persistedEvent)
        }
        // Use persistedHandoff (has the final updatedAt) rather than the pre-update snapshot.
        await triggerCollaborationWebhook('pr_linked', notificationProject, notificationTask, persistedHandoff ?? notificationHandoff)
    },

    addCollaborationEvent: async (projectId: string, event: Omit<CollaborationEvent, 'id' | 'timestamp'> & Partial<Pick<CollaborationEvent, 'timestamp'>>) => {
        const eventId = generateId()
        const syncIdentity = getSyncActorIdentity()
        const actorUserId = event.actorUserId ?? syncIdentity.userId
        const actorDisplayName = event.actorDisplayName ?? syncIdentity.displayName
        let newEvent: CollaborationEvent | undefined
        const updatedProjects = get().projects.map((project) => {
            if (project.id !== projectId) return project
            return {
                ...project,
                collaborationEvents: [newEvent = {
                    id: eventId,
                    timestamp: event.timestamp || Date.now(),
                    actorUserId,
                    actorDisplayName,
                    ...event
                }, ...(project.collaborationEvents || [])]
            }
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && newEvent) {
            await persistCollaborationEventToDisk(projectId, newEvent)
        }
        if (newEvent) syncPushCollabEvent(projectId, newEvent)
        return eventId
    },

    createTaskFromFailedExecution: async (projectId: string, executionRef, seedData) => {
        const taskId = await get().addTask(projectId, {
            ...seedData,
            description: seedData.description || executionRef.steps || executionRef.actualResult || '',
            source: seedData.source || 'manual'
        })
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
        // Re-fetch task after createHandoffPacket has mutated state (e.g. set activeHandoffId).
        const task = get().projects.find((p) => p.id === projectId)?.tasks.find((t) => t.id === taskId)
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

    // ── Granular remote merge (Improvement 5) ──────────────────────────────────
    // These update only the affected entity in Zustand without a full reload.
    mergeRemoteTask: (remoteTask) => {
        set(state => ({
            projects: state.projects.map(p => {
                const taskIdx = p.tasks.findIndex(t => t.id === remoteTask.id)
                if (taskIdx === -1) return p

                const tasks = [...p.tasks]
                tasks[taskIdx] = normalizeTask({ ...tasks[taskIdx], ...remoteTask })

                // Merge handoff packets if provided by the DB query
                const handoffPackets = remoteTask.handoffPackets
                    ? [...(p.handoffPackets || []).filter(h => h.taskId !== remoteTask.id), ...remoteTask.handoffPackets]
                    : p.handoffPackets

                // Merge collaboration events if provided
                const existingEventsForOtherTasks = (p.collaborationEvents || []).filter(e => e.taskId !== remoteTask.id)
                const collaborationEvents = remoteTask.collaborationEvents
                    ? [...existingEventsForOtherTasks, ...remoteTask.collaborationEvents]
                    : p.collaborationEvents

                return { ...p, tasks, handoffPackets, collaborationEvents }
            })
        }))
    },

    mergeRemoteHandoff: (remoteHandoff) => {
        set(state => ({
            projects: state.projects.map(p => {
                const handoffPackets = (p.handoffPackets || [])
                const existingIdx = handoffPackets.findIndex(h => h.id === remoteHandoff.id)
                if (existingIdx === -1) {
                    if (!p.tasks.some((task) => task.id === remoteHandoff.taskId)) return p
                    return { ...p, handoffPackets: [...handoffPackets, remoteHandoff] }
                }
                const updated = [...handoffPackets]
                updated[existingIdx] = { ...updated[existingIdx], ...remoteHandoff }
                return { ...p, handoffPackets: updated }
            })
        }))
    },

    mergeRemoteCollaborationEvent: (projectId, remoteEvent) => {
        set(state => ({
            projects: state.projects.map((project) => {
                if (project.id !== projectId) return project
                const existingEvents = project.collaborationEvents || []
                const existingIdx = existingEvents.findIndex((event) => event.id === remoteEvent.id)
                if (existingIdx === -1) {
                    return { ...project, collaborationEvents: [...existingEvents, remoteEvent].sort((a, b) => a.timestamp - b.timestamp) }
                }
                const updated = [...existingEvents]
                updated[existingIdx] = { ...updated[existingIdx], ...remoteEvent }
                return { ...project, collaborationEvents: updated }
            }),
        }))
    },

    mergeRemoteArtifactLink: (projectId, remoteLink) => {
        set(state => ({
            projects: state.projects.map((project) => {
                if (project.id !== projectId) return project
                const existingLinks = project.artifactLinks || []
                const existingIdx = existingLinks.findIndex((link) => link.id === remoteLink.id)
                if (existingIdx === -1) {
                    return { ...project, artifactLinks: [remoteLink, ...existingLinks] }
                }
                const updated = [...existingLinks]
                updated[existingIdx] = { ...updated[existingIdx], ...remoteLink }
                return { ...project, artifactLinks: updated }
            }),
        }))
    },

    deleteTask: async (projectId: string, taskId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const tasks = p.tasks.filter(t => t.id !== taskId)
                return { ...p, tasks }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI) {
            await deleteTaskFromDisk(projectId, taskId)
        }
    },

    moveTask: async (projectId: string, taskId: string, status: TaskStatus, overId?: string) => {
        let persistedTask: Task | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const tasks = [...p.tasks]
                const activeIndex = tasks.findIndex(t => t.id === taskId)
                if (activeIndex === -1) return p

                const oldTask = tasks[activeIndex]
                const newTask = persistedTask = normalizeTask({ ...oldTask, status, updatedAt: Date.now() })

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
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedTask) {
            await persistTaskToDisk(projectId, persistedTask)
        }
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
            // 'critical' previously fell through to 'low', the opposite of intent.
            priority: task.priority === 'critical' ? 'blocker'
                : task.priority === 'high' ? 'major'
                    : task.priority === 'medium' ? 'medium'
                        : 'low',
            status: 'not-run',
            sourceIssueId: task.sourceIssueId,
            updatedAt: Date.now()
        }

        let persistedPlan: TestPlan | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === planId) {
                        return (persistedPlan = { ...tp, testCases: [testCase, ...tp.testCases], updatedAt: Date.now() })
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })

        set({ projects: updatedProjects })
        if (window.electronAPI && persistedPlan) {
            await persistTestPlanToDisk(projectId, persistedPlan)
        }
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
        set({ projects: updatedProjects })
        if (window.electronAPI) {
            await persistTestPlanToDisk(projectId, plan)
        }
        return id
    },

    updateTestPlan: async (projectId: string, planId: string, updates: Partial<TestPlan>) => {
        let persistedPlan: TestPlan | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp =>
                    tp.id === planId ? (persistedPlan = { ...tp, ...updates, updatedAt: Date.now() }) : tp
                )
                return { ...p, testPlans }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedPlan) {
            await persistTestPlanToDisk(projectId, persistedPlan)
        }
    },

    deleteTestPlan: async (projectId: string, planId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.filter(tp => tp.id !== planId)
                return { ...p, testPlans }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI) {
            await deleteTestPlanFromDisk(projectId, planId)
        }
    },

    archiveTestPlan: async (projectId: string, planId: string, archive: boolean) => {
        let persistedPlan: TestPlan | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp =>
                    tp.id === planId ? (persistedPlan = { ...tp, isArchived: archive, updatedAt: Date.now() }) : tp
                )
                return { ...p, testPlans }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedPlan) {
            await persistTestPlanToDisk(projectId, persistedPlan)
        }
    },

    resetTestPlanStatuses: async (projectId: string, planId: string) => {
        let persistedPlan: TestPlan | undefined
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
                        return (persistedPlan = { ...tp, testCases, updatedAt: Date.now() })
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedPlan) {
            await persistTestPlanToDisk(projectId, persistedPlan)
        }
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

        set({ projects: updatedProjects })
        if (window.electronAPI) {
            await persistTestPlanToDisk(projectId, newPlan)
        }
    },

    batchAddTestCasesToPlan: async (projectId: string, planId: string, testCases: Omit<TestCase, 'id' | 'displayId' | 'updatedAt'>[]) => {
        let persistedPlan: TestPlan | undefined
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
                        return (persistedPlan = { ...tp, testCases: [...newCases, ...tp.testCases], updatedAt: Date.now() })
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })

        set({ projects: updatedProjects })
        if (window.electronAPI && persistedPlan) {
            await persistTestPlanToDisk(projectId, persistedPlan)
        }
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
        let persistedPlan: TestPlan | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === planId) {
                        return (persistedPlan = { ...tp, testCases: [testCase, ...tp.testCases], updatedAt: Date.now() })
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedPlan) {
            await persistTestPlanToDisk(projectId, persistedPlan)
        }
        return testCase.id
    },

    updateTestCase: async (projectId: string, planId: string, caseId: string, updates: Partial<TestCase>) => {
        let persistedPlan: TestPlan | undefined
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
                        return (persistedPlan = { ...tp, testCases, updatedAt: Date.now() })
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedPlan) {
            await persistTestPlanToDisk(projectId, persistedPlan)
        }
    },

    batchUpdateTestCases: async (projectId: string, planId: string, caseIds: string[], updates: Partial<TestCase>) => {
        let persistedPlan: TestPlan | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === planId) {
                        const testCases = tp.testCases.map(tc =>
                            caseIds.includes(tc.id) ? { ...tc, ...updates, updatedAt: Date.now() } : tc
                        )
                        return (persistedPlan = { ...tp, testCases, updatedAt: Date.now() })
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedPlan) {
            await persistTestPlanToDisk(projectId, persistedPlan)
        }
    },

    batchDeleteTestCases: async (projectId: string, planId: string, caseIds: string[]) => {
        let persistedPlan: TestPlan | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === planId) {
                        const testCases = tp.testCases.filter(tc => !caseIds.includes(tc.id))
                        return (persistedPlan = { ...tp, testCases, updatedAt: Date.now() })
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedPlan) {
            await persistTestPlanToDisk(projectId, persistedPlan)
        }
    },

    deleteTestCase: async (projectId: string, planId: string, caseId: string) => {
        let persistedPlan: TestPlan | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testPlans = p.testPlans.map(tp => {
                    if (tp.id === planId) {
                        const testCases = tp.testCases.filter(tc => tc.id !== caseId)
                        return (persistedPlan = { ...tp, testCases, updatedAt: Date.now() })
                    }
                    return tp
                })
                return { ...p, testPlans }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedPlan) {
            await persistTestPlanToDisk(projectId, persistedPlan)
        }
    },

    addEnvironment: async (projectId: string, name: string): Promise<string> => {
        const env: QaEnvironment = {
            id: generateId(),
            name,
            type: 'custom',
            color: '#38BDF8',
            isDefault: false,
            createdAt: Date.now(),
            baseUrl: "",
            notes: "",
            healthCheckUrl: "",
            hacUrl: "",
            backOfficeUrl: "",
            storefrontUrl: "",
            solrAdminUrl: ""
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
        set({ projects: updatedProjects })
        if (window.electronAPI) {
            await persistEnvironmentToDisk(projectId, env)
        }
        return env.id
    },

    updateEnvironment: async (projectId: string, envId: string, updates: Partial<QaEnvironment>) => {
        let persistedEnv: QaEnvironment | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const environments = (p.environments || []).map(e =>
                    e.id === envId ? (persistedEnv = { ...e, ...updates }) : e
                )
                return { ...p, environments }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedEnv) {
            await persistEnvironmentToDisk(projectId, persistedEnv)
        }
    },

    deleteEnvironment: async (projectId: string, envId: string) => {
        // Promoting a new default has to be a copy, not a mutation: the old array
        // holds objects shared with the previous zustand state.
        let promotedDefault: QaEnvironment | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id !== projectId) return p
            const remaining = (p.environments || []).filter(e => e.id !== envId)
            if (remaining.length > 0 && !remaining.some(e => e.isDefault)) {
                promotedDefault = { ...remaining[0], isDefault: true }
                return { ...p, environments: [promotedDefault, ...remaining.slice(1)] }
            }
            return { ...p, environments: remaining }
        })
        set({ projects: updatedProjects })

        if (window.electronAPI) {
            await deleteEnvironmentFromDisk(projectId, envId)
            // The promotion is a second change and needs its own write, or after a
            // restart the project has no default environment at all.
            if (promotedDefault) await persistEnvironmentToDisk(projectId, promotedDefault)
        }
    },

    setEnvironmentDefault: async (projectId: string, envId: string) => {
        let updatedEnvs: QaEnvironment[] = []
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                updatedEnvs = (p.environments || []).map(e => ({ ...e, isDefault: e.id === envId }))
                return { ...p, environments: updatedEnvs }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI) {
            await Promise.all(updatedEnvs.map(e => persistEnvironmentToDisk(projectId, e)))
        }
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

        set({ projects: updatedProjects })
        if (window.electronAPI) {
            debouncedSaveProjectsToDisk(updatedProjects)
        }
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

        set({ projects: updatedProjects })
        if (window.electronAPI) {
            // Persist the new session and update each affected test plan's status
            await persistTestRunSessionToDisk(projectId, newSession)
            const project = updatedProjects.find(p => p.id === projectId)
            const affectedPlanIds = new Set(newSession.planExecutions.map(pe => pe.testPlanId))
            const affectedPlans = (project?.testPlans || []).filter(tp => affectedPlanIds.has(tp.id))
            await Promise.all(affectedPlans.map(tp => persistTestPlanToDisk(projectId, tp)))
        }
    },

    deleteTestRunSession: async (projectId: string, sessionId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testRunSessions = (p.testRunSessions || []).filter(s => s.id !== sessionId)
                return { ...p, testRunSessions }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI) {
            await deleteTestRunSessionFromDisk(projectId, sessionId)
        }
    },

    archiveTestRunSession: async (projectId: string, sessionId: string, archive: boolean) => {
        let persistedSession: TestRunSession | undefined
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testRunSessions = (p.testRunSessions || []).map(s =>
                    s.id === sessionId ? (persistedSession = { ...s, isArchived: archive }) : s
                )
                return { ...p, testRunSessions }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedSession) {
            await persistTestRunSessionToDisk(projectId, persistedSession)
        }
    },

    deleteTestCaseExecution: async (projectId: string, sessionId: string, planExecutionId: string, caseExecutionId: string) => {
        let persistedSession: TestRunSession | undefined
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
                        return (persistedSession = { ...s, planExecutions })
                    }
                    return s
                })
                return { ...p, testRunSessions }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI && persistedSession) {
            await persistTestRunSessionToDisk(projectId, persistedSession)
        }
    },

    deleteLegacyExecution: async (projectId: string, executionId: string) => {
        const updatedProjects = get().projects.map(p => {
            if (p.id === projectId) {
                const testExecutions = (p.testExecutions || []).filter(ex => ex.id !== executionId)
                return { ...p, testExecutions }
            }
            return p
        })
        set({ projects: updatedProjects })
        if (window.electronAPI) {
            debouncedSaveProjectsToDisk(updatedProjects)
        }
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
        set({ projects: updatedProjects })
        if (window.electronAPI) {
            debouncedSaveProjectsToDisk(updatedProjects)
        }
    },

    setActiveProject: (id: string) => {
        set({ activeProjectId: id })
    },

    addTestDataGroup: async (projectId: string, name: string, category: string): Promise<string> => {
        const group: TestDataGroup = { id: generateId(), name, category, entries: [], createdAt: Date.now() }
        const projects = get().projects.map(p => p.id === projectId ? { ...p, testDataGroups: [...(p.testDataGroups || []), group] } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
        return group.id
    },
    updateTestDataGroup: async (projectId: string, groupId: string, updates: Partial<TestDataGroup>) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, testDataGroups: p.testDataGroups.map(g => g.id === groupId ? { ...g, ...updates } : g)
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },
    deleteTestDataGroup: async (projectId: string, groupId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, testDataGroups: p.testDataGroups.filter(g => g.id !== groupId) } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },
    addTestDataEntry: async (projectId: string, groupId: string, data: Partial<TestDataEntry>): Promise<string> => {
        const id = generateId()
        const entry = { id, ...data } as TestDataEntry
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, testDataGroups: p.testDataGroups.map(g => g.id === groupId ? { ...g, entries: [...g.entries, entry] } : g)
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
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
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },
    deleteTestDataEntry: async (projectId: string, groupId: string, entryId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, testDataGroups: p.testDataGroups.map(g => g.id === groupId ? { ...g, entries: g.entries.filter(e => e.id !== entryId) } : g)
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },

    // file attachments at project-level
    addProjectFile: async (projectId: string, file: Attachment) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, files: [...(p.files || []), file] } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },
    deleteProjectFile: async (projectId: string, fileId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, files: p.files.filter(f => f.id !== fileId) } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },

    addChecklist: async (projectId: string, name: string, category: string) => {
        const checklist: Checklist = { id: generateId(), name, category, items: [], createdAt: Date.now(), updatedAt: Date.now() }
        const projects = get().projects.map(p => p.id === projectId ? { ...p, checklists: [...(p.checklists || []), checklist] } : p)
        set({ projects })
        if (window.electronAPI) await persistChecklistToDisk(projectId, checklist)
        return checklist
    },
    updateChecklist: async (projectId: string, checklistId: string, updates: Partial<Checklist>) => {
        let persistedChecklist: Checklist | undefined
        const projects = get().projects.map(p => p.id === projectId ? { ...p, checklists: p.checklists.map(c => c.id === checklistId ? (persistedChecklist = { ...c, ...updates, updatedAt: Date.now() }) : c) } : p)
        set({ projects })
        if (window.electronAPI && persistedChecklist) await persistChecklistToDisk(projectId, persistedChecklist)
    },
    deleteChecklist: async (projectId: string, checklistId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? { ...p, checklists: p.checklists.filter(c => c.id !== checklistId) } : p)
        set({ projects })
        if (window.electronAPI) await deleteChecklistFromDisk(projectId, checklistId)
    },
    toggleChecklistItem: async (projectId: string, checklistId: string, itemId: string) => {
        let persistedChecklist: Checklist | undefined
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, checklists: p.checklists.map(c => c.id === checklistId ? (persistedChecklist = { ...c, items: c.items.map(i => i.id === itemId ? { ...i, isChecked: !i.isChecked } : i) }) : c)
        } : p)
        set({ projects })
        if (window.electronAPI && persistedChecklist) await persistChecklistToDisk(projectId, persistedChecklist)
    },
    addChecklistItem: async (projectId: string, checklistId: string, text: string) => {
        const item: ChecklistItem = { id: generateId(), text, isChecked: false }
        let persistedChecklist: Checklist | undefined
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, checklists: p.checklists.map(c => c.id === checklistId ? (persistedChecklist = { ...c, items: [...c.items, item] }) : c)
        } : p)
        set({ projects })
        if (window.electronAPI && persistedChecklist) await persistChecklistToDisk(projectId, persistedChecklist)
        return item.id
    },
    deleteChecklistItem: async (projectId: string, checklistId: string, itemId: string) => {
        let persistedChecklist: Checklist | undefined
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p, checklists: p.checklists.map(c => c.id === checklistId ? (persistedChecklist = { ...c, items: c.items.filter(i => i.id !== itemId) }) : c)
        } : p)
        set({ projects })
        if (window.electronAPI && persistedChecklist) await persistChecklistToDisk(projectId, persistedChecklist)
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
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
        return runbook
    },
    updateRunbook: async (projectId: string, runbookId: string, updates: Partial<Runbook>) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            runbooks: (p.runbooks || []).map(r => r.id === runbookId ? { ...r, ...updates, updatedAt: Date.now() } : r)
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },
    deleteRunbook: async (projectId: string, runbookId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            runbooks: (p.runbooks || []).filter(r => r.id !== runbookId)
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
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
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
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
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
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
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
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
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
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
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },

    deleteReportTemplate: async (projectId: string, templateId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            reportTemplates: (p.reportTemplates || []).filter(t => t.id !== templateId)
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
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
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },

    // ── AI Accuracy Testing ──────────────────────────────────────────────

    addAccuracySuite: async (projectId: string, name: string): Promise<string> => {
        const suite: AccuracyTestSuite = {
            id: generateId(),
            name,
            referenceDocuments: [],
            qaPairs: [],
            evalRuns: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        }
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            accuracyTestSuites: [...(p.accuracyTestSuites || []), suite]
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
        return suite.id
    },

    updateAccuracySuite: async (projectId: string, suiteId: string, updates: Partial<AccuracyTestSuite>) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            accuracyTestSuites: (p.accuracyTestSuites || []).map(s =>
                s.id === suiteId ? { ...s, ...updates, updatedAt: Date.now() } : s
            )
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },

    deleteAccuracySuite: async (projectId: string, suiteId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            accuracyTestSuites: (p.accuracyTestSuites || []).filter(s => s.id !== suiteId)
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },

    addAccuracyRefDoc: async (projectId: string, suiteId: string, doc: Omit<ReferenceDocument, 'id' | 'uploadedAt'>): Promise<string> => {
        const id = generateId()
        const newDoc: ReferenceDocument = { ...doc, id, uploadedAt: Date.now() }
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            accuracyTestSuites: (p.accuracyTestSuites || []).map(s =>
                s.id === suiteId ? {
                    ...s,
                    referenceDocuments: [...s.referenceDocuments, newDoc],
                    updatedAt: Date.now()
                } : s
            )
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
        return id
    },

    removeAccuracyRefDoc: async (projectId: string, suiteId: string, docId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            accuracyTestSuites: (p.accuracyTestSuites || []).map(s =>
                s.id === suiteId ? {
                    ...s,
                    referenceDocuments: s.referenceDocuments.filter(d => d.id !== docId),
                    updatedAt: Date.now()
                } : s
            )
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },

    addAccuracyQaPair: async (projectId: string, suiteId: string, question: string, agentResponse: string, sourceLabel?: string, expectedAnswer?: string): Promise<string> => {
        const id = generateId()
        const pair: AccuracyQaPair = { id, question, agentResponse, expectedAnswer, addedAt: Date.now(), sourceLabel }
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            accuracyTestSuites: (p.accuracyTestSuites || []).map(s =>
                s.id === suiteId ? {
                    ...s,
                    qaPairs: [...s.qaPairs, pair],
                    updatedAt: Date.now()
                } : s
            )
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
        return id
    },

    batchAddAccuracyQaPairs: async (projectId: string, suiteId: string, pairs: Array<{ question: string; agentResponse: string; sourceLabel?: string; expectedAnswer?: string }>) => {
        const newPairs: AccuracyQaPair[] = pairs.map(p => ({
            id: generateId(),
            question: p.question,
            agentResponse: p.agentResponse,
            expectedAnswer: p.expectedAnswer,
            addedAt: Date.now(),
            sourceLabel: p.sourceLabel
        }))
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            accuracyTestSuites: (p.accuracyTestSuites || []).map(s =>
                s.id === suiteId ? {
                    ...s,
                    qaPairs: [...s.qaPairs, ...newPairs],
                    updatedAt: Date.now()
                } : s
            )
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },

    removeAccuracyQaPair: async (projectId: string, suiteId: string, pairId: string) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            accuracyTestSuites: (p.accuracyTestSuites || []).map(s =>
                s.id === suiteId ? {
                    ...s,
                    qaPairs: s.qaPairs.filter(pair => pair.id !== pairId),
                    updatedAt: Date.now()
                } : s
            )
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },

    addAccuracyEvalRun: async (projectId: string, suiteId: string, run: Omit<AccuracyEvalRun, 'id'>): Promise<string> => {
        const id = generateId()
        const newRun: AccuracyEvalRun = { ...run, id }
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            accuracyTestSuites: (p.accuracyTestSuites || []).map(s =>
                s.id === suiteId ? {
                    ...s,
                    evalRuns: [...s.evalRuns, newRun],
                    updatedAt: Date.now()
                } : s
            )
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
        return id
    },

    updateAccuracyEvalRun: async (projectId: string, suiteId: string, runId: string, updates: Partial<AccuracyEvalRun>) => {
        const projects = get().projects.map(p => p.id === projectId ? {
            ...p,
            accuracyTestSuites: (p.accuracyTestSuites || []).map(s =>
                s.id === suiteId ? {
                    ...s,
                    evalRuns: s.evalRuns.map(r => r.id === runId ? { ...r, ...updates } : r),
                    updatedAt: Date.now()
                } : s
            )
        } : p)
        if (window.electronAPI) debouncedSaveProjectsToDisk(projects)
        set({ projects })
    },

    // ── Exploratory Sessions ─────────────────────────────────────────────────

    addExploratorySession: async (projectId: string, charter: string, timebox: number, tester: string) => {
        const id = generateId()
        const updated = get().projects.map(p => p.id !== projectId ? p : {
            ...p,
            exploratorySessions: [
                { id, charter, timebox, tester, startedAt: Date.now(), observations: [], discoveredBugIds: [], notes: '' },
                ...(p.exploratorySessions || [])
            ]
        })
        if (window.electronAPI) debouncedSaveProjectsToDisk(updated)
        set({ projects: updated })
        return id
    },

    updateExploratorySession: async (projectId: string, sessionId: string, updates: Partial<ExploratorySession>) => {
        const updated = get().projects.map(p => p.id !== projectId ? p : {
            ...p,
            exploratorySessions: (p.exploratorySessions || []).map(s => s.id === sessionId ? { ...s, ...updates } : s)
        })
        if (window.electronAPI) debouncedSaveProjectsToDisk(updated)
        set({ projects: updated })
    },

    addExploratoryObservation: async (projectId: string, sessionId: string, obs: Omit<ExploratoryObservation, 'id' | 'timestamp'>) => {
        const id = generateId()
        const updated = get().projects.map(p => p.id !== projectId ? p : {
            ...p,
            exploratorySessions: (p.exploratorySessions || []).map(s => s.id !== sessionId ? s : {
                ...s,
                observations: [...s.observations, { id, timestamp: Date.now(), ...obs }]
            })
        })
        if (window.electronAPI) debouncedSaveProjectsToDisk(updated)
        set({ projects: updated })
        return id
    },

    deleteExploratorySession: async (projectId: string, sessionId: string) => {
        const updated = get().projects.map(p => p.id !== projectId ? p : {
            ...p,
            exploratorySessions: (p.exploratorySessions || []).filter(s => s.id !== sessionId)
        })
        if (window.electronAPI) debouncedSaveProjectsToDisk(updated)
        set({ projects: updated })
    },
}))

registerProjectSyncBridge({
    loadProjects: () => useProjectStore.getState().loadProjects(),
    mergeRemoteTask: (task) => useProjectStore.getState().mergeRemoteTask(task),
    mergeRemoteHandoff: (handoff) => useProjectStore.getState().mergeRemoteHandoff(handoff),
    mergeRemoteCollaborationEvent: (projectId, event) => useProjectStore.getState().mergeRemoteCollaborationEvent(projectId, event),
    mergeRemoteArtifactLink: (projectId, link) => useProjectStore.getState().mergeRemoteArtifactLink(projectId, link),
})

export function useActiveProjectId() {
    return useProjectStore((state) => state.activeProjectId)
}

function selectActiveProject(state: ProjectState): Project | null {
    if (!state.activeProjectId) return null
    return state.projects.find((project) => project.id === state.activeProjectId) ?? null
}

export function useActiveProject() {
    return useProjectStore((state) => selectActiveProject(state))
}

export function useActiveProjectNotesContext() {
    return useProjectStore(useShallow((state) => {
        const activeProject = selectActiveProject(state)
        return {
            activeProjectId: state.activeProjectId,
            activeProjectName: activeProject?.name ?? null,
            notes: activeProject?.notes ?? EMPTY_NOTES,
            tasks: activeProject?.tasks ?? EMPTY_TASKS,
            artifactLinks: activeProject?.artifactLinks ?? EMPTY_ARTIFACT_LINKS,
            handoffPackets: activeProject?.handoffPackets ?? EMPTY_HANDOFFS,
        }
    }))
}

export function useActiveProjectTaskBoardContext() {
    return useProjectStore(useShallow((state) => {
        const activeProject = selectActiveProject(state)
        return {
            activeProjectId: state.activeProjectId,
            projectId: activeProject?.id ?? null,
            tasks: activeProject?.tasks ?? EMPTY_TASKS,
            testPlans: activeProject?.testPlans ?? EMPTY_TEST_PLANS,
            handoffPackets: activeProject?.handoffPackets ?? EMPTY_HANDOFFS,
            notes: activeProject?.notes ?? EMPTY_NOTES,
            files: activeProject?.files ?? EMPTY_ATTACHMENTS,
            artifactLinks: activeProject?.artifactLinks ?? EMPTY_ARTIFACT_LINKS,
            collaborationEvents: activeProject?.collaborationEvents ?? EMPTY_COLLABORATION_EVENTS,
            environments: activeProject?.environments ?? EMPTY_ENVIRONMENTS,
            linearConnections: activeProject?.linearConnections ?? EMPTY_LINEAR_CONNECTIONS,
            jiraConnections: activeProject?.jiraConnections ?? EMPTY_JIRA_CONNECTIONS,
            sourceColumns: activeProject?.sourceColumns,
            columns: activeProject?.columns,
            geminiModel: activeProject?.geminiModel,
        }
    }))
}

// ---------------------------------------------------------------------------
// Flakiness stats selector
// ---------------------------------------------------------------------------
import { useMemo } from 'react'
import { computeFlakinessStatsForProject, TestCaseFlakinessStats } from '@/lib/utils'

export function useFlakinessStats(windowSize = 10): Map<string, TestCaseFlakinessStats> {
    const sessions = useProjectStore(s => {
        const p = s.projects.find(p => p.id === s.activeProjectId)
        return p?.testRunSessions ?? EMPTY_TEST_RUN_SESSIONS
    })
    return useMemo(() => computeFlakinessStatsForProject(sessions, windowSize), [sessions, windowSize])
}
