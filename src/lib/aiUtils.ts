import type { HandoffPacket, Project, QaEnvironment, Task, TestCase, TestExecution, TestPlan } from '@/types/project'
import type {
    AiTaskComment,
    AiContextSelection,
    AiRole,
    AiSafeEnvironment,
    AiSafeExecution,
    DevAiHandoff,
    DevAiTask,
    ProjectAiContext,
    QaAiTask,
    QaAiTestCase,
    QaAiTestPlanDetail,
    QaAiTestPlanSummary,
    QaProjectAiContext,
    DevProjectAiContext,
} from '@/types/ai'
import { useSettingsStore } from '@/store/useSettingsStore'

type SanitizedSapEnvironment = AiSafeEnvironment

function isSapCommerceContextEnabled(): boolean {
    return useSettingsStore.getState().settings.sapCommerceContext === true
}

function buildAllowedSet(ids?: string[]): Set<string> | undefined {
    if (!Array.isArray(ids)) return undefined
    return new Set(ids)
}

function filterByIds<T extends { id: string }>(items: T[] | undefined, allowedIds?: string[]): T[] {
    if (!Array.isArray(items) || items.length === 0) return []
    const allowed = buildAllowedSet(allowedIds)
    if (allowed === undefined) return items
    return items.filter((item) => allowed.has(item.id))
}

function summarizeStatusCounts(cases: TestCase[]): Record<string, number> {
    return cases.reduce((acc: Record<string, number>, testCase) => {
        const key = testCase?.status || 'not-run'
        acc[key] = (acc[key] || 0) + 1
        return acc
    }, {})
}

function buildEnvironmentNameMap(environments: QaEnvironment[]): Map<string, string> {
    return new Map(environments.map((environment) => [environment.id, environment.name]))
}

function sanitizeTaskComments(comments: AiTaskComment[] | undefined): AiTaskComment[] | undefined {
    if (!Array.isArray(comments) || comments.length === 0) return undefined
    return comments.map((comment) => ({
        authorName: comment.authorName,
        createdAt: comment.createdAt,
        body: comment.body,
    }))
}

function sanitizeEnvironment(environment: QaEnvironment): AiSafeEnvironment {
    return {
        id: environment.id,
        name: environment.name,
        type: environment.type,
        isDefault: !!environment.isDefault,
        baseUrl: environment.baseUrl || undefined,
        hacUrl: environment.hacUrl || undefined,
        backOfficeUrl: environment.backOfficeUrl || undefined,
        storefrontUrl: environment.storefrontUrl || undefined,
        solrAdminUrl: environment.solrAdminUrl || undefined,
        occBasePath: environment.occBasePath || undefined,
    }
}

export function sanitizeTaskForQaAi(task: Task, environments: QaEnvironment[] = []): QaAiTask {
    const environmentNames = buildEnvironmentNameMap(environments)

    return {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        issueType: task.issueType,
        labels: task.labels,
        assignee: task.assignee,
        sourceIssueId: task.sourceIssueId,
        externalId: task.externalId,
        acceptanceCriteria: task.acceptanceCriteria,
        reproducibility: task.reproducibility,
        frequency: task.frequency,
        affectedEnvironmentNames: (task.affectedEnvironments || [])
            .map((environmentId) => environmentNames.get(environmentId))
            .filter((value): value is string => Boolean(value)),
        components: task.components,
        linkedTestCaseId: task.linkedTestCaseId,
        comments: sanitizeTaskComments((task as Task & { comments?: AiTaskComment[] }).comments),
    }
}

export function sanitizeTasksForQaAi(tasks: Task[] | undefined, environments: QaEnvironment[] = []): QaAiTask[] {
    if (!Array.isArray(tasks)) return []
    return tasks.map((task) => sanitizeTaskForQaAi(task, environments))
}

export function sanitizeTaskForDevAi(task: Task): DevAiTask {
    return {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        issueType: task.issueType,
        assignee: task.assignee,
        labels: task.labels,
        sourceIssueId: task.sourceIssueId,
        externalId: task.externalId,
        acceptanceCriteria: task.acceptanceCriteria,
        reproducibility: task.reproducibility,
        frequency: task.frequency,
        affectedEnvironmentNames: [],
        components: task.components,
        collabState: task.collabState,
        activeHandoffId: task.activeHandoffId,
        linkedTestCaseId: task.linkedTestCaseId,
        comments: sanitizeTaskComments((task as Task & { comments?: AiTaskComment[] }).comments),
    }
}

export function sanitizeTasksForDevAi(tasks: Task[] | undefined, environments: QaEnvironment[] = []): DevAiTask[] {
    if (!Array.isArray(tasks)) return []
    const environmentNames = buildEnvironmentNameMap(environments)
    return tasks.map((task) => ({
        ...sanitizeTaskForDevAi(task),
        affectedEnvironmentNames: (task.affectedEnvironments || [])
            .map((environmentId) => environmentNames.get(environmentId))
            .filter((value): value is string => Boolean(value)),
    }))
}

export function sanitizeTestCaseForAi(testCase: TestCase): QaAiTestCase {
    return {
        id: testCase.id,
        displayId: testCase.displayId,
        title: testCase.title,
        priority: testCase.priority,
        status: testCase.status,
        actualResult: testCase.actualResult || undefined,
        sourceIssueId: testCase.sourceIssueId,
        sapModule: testCase.sapModule,
    }
}

export function sanitizeTestCasesForAi(testCases: TestCase[] | undefined): QaAiTestCase[] {
    if (!Array.isArray(testCases)) return []
    return testCases.map((testCase) => sanitizeTestCaseForAi(testCase))
}

export function summarizeTestPlansForAi(testPlans: TestPlan[] | undefined): QaAiTestPlanSummary[] {
    if (!Array.isArray(testPlans)) return []
    return testPlans.map((testPlan) => ({
        id: testPlan.id,
        name: testPlan.name,
        source: testPlan.source,
        testCaseCount: (testPlan.testCases || []).length,
        statusCounts: summarizeStatusCounts(testPlan.testCases || []),
    }))
}

export function sanitizeTestPlansForAi(testPlans: TestPlan[] | undefined): QaAiTestPlanDetail[] {
    if (!Array.isArray(testPlans)) return []
    return testPlans.map((testPlan) => ({
        id: testPlan.id,
        name: testPlan.name,
        source: testPlan.source,
        testCases: sanitizeTestCasesForAi(testPlan.testCases || []),
    }))
}

export function sanitizeExecutionsForAi(executions: TestExecution[] | undefined): AiSafeExecution[] {
    if (!Array.isArray(executions)) return []
    return executions.map((execution) => ({
        id: execution.id,
        testCaseId: execution.testCaseId,
        testPlanId: execution.testPlanId,
        result: execution.result,
        actualResult: execution.actualResult || undefined,
        notes: execution.notes || undefined,
        environmentId: execution.environmentId,
        environmentName: execution.environmentName,
    }))
}

function sanitizeHandoffForDevAi(handoff: HandoffPacket): DevAiHandoff {
    return {
        id: handoff.id,
        taskId: handoff.taskId,
        type: handoff.type,
        summary: handoff.summary,
        environmentName: handoff.environmentName,
        severity: handoff.severity,
        branchName: handoff.branchName,
        releaseVersion: handoff.releaseVersion,
        linkedPrs: (handoff.linkedPrs || []).map((linkedPr) => ({
            repoFullName: linkedPr.repoFullName,
            prNumber: linkedPr.prNumber,
            prUrl: linkedPr.prUrl,
            status: linkedPr.status,
        })),
        developerResponse: handoff.developerResponse,
        resolutionSummary: handoff.resolutionSummary,
        isComplete: handoff.isComplete,
    }
}

function sanitizeHandoffsForDevAi(handoffs: HandoffPacket[] | undefined): DevAiHandoff[] {
    if (!Array.isArray(handoffs)) return []
    return handoffs.map((handoff) => sanitizeHandoffForDevAi(handoff))
}

function sanitizeSapEnvironments(environments: QaEnvironment[]): SanitizedSapEnvironment[] {
    return environments
        .filter((environment) => environment.hacUrl || environment.backOfficeUrl || environment.storefrontUrl || environment.solrAdminUrl || environment.occBasePath)
        .map((environment) => sanitizeEnvironment(environment))
}

export function sanitizeProjectForQaAi(project: Project | undefined, selection?: AiContextSelection): QaProjectAiContext | undefined {
    if (!project) return undefined

    const environments = filterByIds(project.environments, selection?.environmentIds)
    const testPlans = filterByIds(project.testPlans, selection?.testPlanIds)
    const tasks = filterByIds(project.tasks, selection?.taskIds)
    const testDataGroups = filterByIds(project.testDataGroups, selection?.testDataGroupIds)
    const checklists = filterByIds(project.checklists, selection?.checklistIds)
    const sanitizedEnvironments = environments.map((environment) => sanitizeEnvironment(environment))
    const sapContextEnabled = selection === undefined
        ? isSapCommerceContextEnabled()
        : (isSapCommerceContextEnabled() && selection.includeSapCommerce === true)
    const sapEnvironments = sapContextEnabled ? sanitizeSapEnvironments(environments) : []

    return {
        role: 'qa',
        manualContextSelection: selection !== undefined,
        name: project.name,
        description: project.description,
        geminiModel: project.geminiModel,
        environments: sanitizedEnvironments,
        tasks: sanitizeTasksForQaAi(tasks, environments),
        testPlans: summarizeTestPlansForAi(testPlans),
        testDataGroups: testDataGroups.map((group) => ({ id: group.id, name: group.name, category: group.category })),
        checklists: checklists.map((checklist) => ({ id: checklist.id, name: checklist.name, category: checklist.category })),
        sapCommerce: {
            enabled: sapContextEnabled,
            environments: sapEnvironments,
        },
    }
}

export function sanitizeProjectForDevAi(project: Project | undefined, selection?: AiContextSelection): DevProjectAiContext | undefined {
    if (!project) return undefined

    const environments = filterByIds(project.environments, selection?.environmentIds)
    const tasks = filterByIds(project.tasks, selection?.taskIds)
    const handoffs = filterByIds(project.handoffPackets || [], selection?.handoffIds)

    return {
        role: 'dev',
        manualContextSelection: selection !== undefined,
        name: project.name,
        description: project.description,
        geminiModel: project.geminiModel,
        environments: environments.map((environment) => sanitizeEnvironment(environment)),
        tasks: sanitizeTasksForDevAi(tasks, environments),
        handoffs: sanitizeHandoffsForDevAi(handoffs),
    }
}

export function attachTaskCommentsToProjectAiContext(
    project: ProjectAiContext | undefined,
    commentsByTaskId: Record<string, AiTaskComment[]>
): ProjectAiContext | undefined {
    if (!project) return undefined
    const attachComments = <T extends { id: string; comments?: AiTaskComment[] }>(task: T): T => ({
        ...task,
        comments: sanitizeTaskComments(commentsByTaskId[task.id]),
    })

    if (project.role === 'dev') {
        return {
            ...project,
            tasks: project.tasks.map(attachComments),
        }
    }

    return {
        ...project,
        tasks: project.tasks.map(attachComments),
    }
}

export function buildProjectAiContext(project: Project | undefined, role: AiRole, selection?: AiContextSelection): ProjectAiContext | undefined {
    return role === 'dev'
        ? sanitizeProjectForDevAi(project, selection)
        : sanitizeProjectForQaAi(project, selection)
}

export function sanitizeProjectForAi(project: Project | undefined, selection?: AiContextSelection): QaProjectAiContext | undefined {
    return sanitizeProjectForQaAi(project, selection)
}
