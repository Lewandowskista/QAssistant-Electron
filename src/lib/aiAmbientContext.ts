import type { Project } from '@/types/project'
import type { AiContextSelection, AiRole } from '@/types/ai'
import type { TestCaseFlakinessStats } from '@/lib/utils'

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000

function isDoneColumn(project: Project, statusId: string): boolean {
    const col = project.columns?.find(c => c.id === statusId)
    return col?.type === 'done' || col?.type === 'completed'
}

export function buildAmbientContextSelection(
    project: Project,
    role: AiRole,
    flakinessMap?: Map<string, TestCaseFlakinessStats>
): AiContextSelection {
    const now = Date.now()

    if (role === 'qa') {
        // Tasks: updated in last 7 days, not in a done column
        let recentTasks = (project.tasks ?? []).filter(t =>
            t.updatedAt > now - SEVEN_DAYS && !isDoneColumn(project, t.status)
        )
        if (recentTasks.length < 3) {
            recentTasks = (project.tasks ?? []).filter(t =>
                t.updatedAt > now - FOURTEEN_DAYS && !isDoneColumn(project, t.status)
            )
        }
        const taskIds = recentTasks.slice(0, 10).map(t => t.id)

        // Test plans: has a failing/blocked case OR has a session in the last 7 days
        const recentSessionPlanIds = new Set<string>(
            (project.testRunSessions ?? [])
                .filter(s => s.timestamp > now - SEVEN_DAYS)
                .flatMap(s => s.planExecutions.map(pe => pe.testPlanId))
        )
        const flakyPlanIds = new Set<string>()
        if (flakinessMap) {
            for (const [tcId] of flakinessMap) {
                for (const plan of project.testPlans ?? []) {
                    if (plan.testCases?.some(tc => tc.id === tcId)) {
                        flakyPlanIds.add(plan.id)
                    }
                }
            }
        }
        const testPlanIds = (project.testPlans ?? [])
            .filter(tp =>
                !tp.isArchived && (
                    tp.testCases?.some(tc => tc.status === 'failed' || tc.status === 'blocked') ||
                    recentSessionPlanIds.has(tp.id) ||
                    flakyPlanIds.has(tp.id)
                )
            )
            .slice(0, 5)
            .map(tp => tp.id)

        // Environments: always include default; also any referenced by selected tasks
        const taskEnvIds = new Set<string>(
            recentTasks.flatMap(t => (t as any).affectedEnvironmentIds ?? [])
        )
        const envIds = (project.environments ?? [])
            .filter(e => e.isDefault || taskEnvIds.has(e.id))
            .slice(0, 3)
            .map(e => e.id)

        return {
            taskIds,
            testPlanIds,
            environmentIds: envIds,
            testDataGroupIds: [],
            checklistIds: [],
        }
    }

    // Dev role
    const devCollabStates = new Set(['ready_for_dev', 'in_fix', 'qa_retesting', 'dev_acknowledged'])
    let devTasks = (project.tasks ?? []).filter(t =>
        (devCollabStates.has((t as any).collabState ?? '') || t.updatedAt > now - SEVEN_DAYS) &&
        !isDoneColumn(project, t.status)
    )
    if (devTasks.length < 3) {
        devTasks = (project.tasks ?? []).filter(t =>
            t.updatedAt > now - FOURTEEN_DAYS && !isDoneColumn(project, t.status)
        )
    }
    const taskIds = devTasks.slice(0, 10).map(t => t.id)

    const taskIdSet = new Set(taskIds)
    const handoffIds = (project.handoffPackets ?? [])
        .filter(h => !h.isComplete && taskIdSet.has(h.taskId))
        .map(h => h.id)

    const envIds = (project.environments ?? [])
        .filter(e => e.isDefault)
        .slice(0, 3)
        .map(e => e.id)

    return {
        taskIds,
        handoffIds,
        environmentIds: envIds,
    }
}
