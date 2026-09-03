/**
 * projectImport.ts — re-key a project for import.
 *
 * Importing is the only way to share a project, and it is also how the demo
 * workspace is loaded. Every entity needs a fresh id so an import cannot collide
 * with, or overwrite, something already in the database — several tables are
 * keyed globally rather than per project, so a repeated import of the same file
 * would otherwise let the second copy steal the first's rows.
 *
 * The part that was missing is the second half: once ids change, every reference
 * to them has to change too. Without that a handoff points at a task id that no
 * longer exists, artifact links dangle, and coverage reads as zero. The demo
 * workspace goes through this path, so its advertised "ready-for-QA handoff" was
 * detached from its task on arrival.
 *
 * Kept pure and separate from the store so it can be tested directly.
 */
import type { Project } from '@/types/project'

/** Maps old entity id to newly minted id, per entity kind. */
export interface IdRemap {
    tasks: Map<string, string>
    notes: Map<string, string>
    files: Map<string, string>
    testPlans: Map<string, string>
    testCases: Map<string, string>
    handoffs: Map<string, string>
    sessions: Map<string, string>
    planExecutions: Map<string, string>
    caseExecutions: Map<string, string>
    environments: Map<string, string>
    connections: Map<string, string>
}

function emptyRemap(): IdRemap {
    return {
        tasks: new Map(), notes: new Map(), files: new Map(),
        testPlans: new Map(), testCases: new Map(), handoffs: new Map(),
        sessions: new Map(), planExecutions: new Map(), caseExecutions: new Map(),
        environments: new Map(), connections: new Map(),
    }
}

/** Translate one id, leaving anything unknown untouched. */
function remap(map: Map<string, string>, id: string | undefined): string | undefined {
    if (id === undefined || id === null) return id
    return map.get(id) ?? id
}

/** Translate a list of ids, dropping nothing. */
function remapAll(map: Map<string, string>, ids: string[] | undefined): string[] | undefined {
    if (!ids) return ids
    return ids.map(id => map.get(id) ?? id)
}

/**
 * Give every entity in `project` a fresh id and rewrite all cross-references.
 *
 * `newId` is injected so tests can assert deterministic output; production
 * passes the store's id generator.
 */
export function remapProjectForImport(project: Project, newId: () => string): { project: Project; remap: IdRemap } {
    const ids = emptyRemap()

    const take = (map: Map<string, string>, oldId: string | undefined): string => {
        const fresh = newId()
        if (oldId) map.set(oldId, fresh)
        return fresh
    }

    // ── Pass 1: mint new ids, recording what each old id became ──────────────
    const tasks = (project.tasks ?? []).map(task => ({ ...task, id: take(ids.tasks, task.id) }))
    const notes = (project.notes ?? []).map(note => ({ ...note, id: take(ids.notes, note.id) }))
    const files = (project.files ?? []).map(file => ({ ...file, id: take(ids.files, file.id) }))
    const environments = (project.environments ?? []).map(env => ({ ...env, id: take(ids.environments, env.id) }))

    const testPlans = (project.testPlans ?? []).map(plan => ({
        ...plan,
        id: take(ids.testPlans, plan.id),
        testCases: (plan.testCases ?? []).map(testCase => ({ ...testCase, id: take(ids.testCases, testCase.id) })),
    }))

    // Sessions were previously left with their original ids, which is how a
    // second import of the same file could rewrite the first import's rows.
    const testRunSessions = (project.testRunSessions ?? []).map(session => ({
        ...session,
        id: take(ids.sessions, session.id),
        planExecutions: (session.planExecutions ?? []).map(planExecution => ({
            ...planExecution,
            id: take(ids.planExecutions, planExecution.id),
            caseExecutions: (planExecution.caseExecutions ?? []).map(caseExecution => ({
                ...caseExecution,
                id: take(ids.caseExecutions, caseExecution.id),
            })),
        })),
    }))

    const handoffPackets = (project.handoffPackets ?? []).map(packet => ({
        ...packet,
        id: take(ids.handoffs, packet.id),
    }))

    const linearConnections = (project.linearConnections ?? []).map(connection => ({
        ...connection,
        id: take(ids.connections, connection.id),
    }))
    const jiraConnections = (project.jiraConnections ?? []).map(connection => ({
        ...connection,
        id: take(ids.connections, connection.id),
    }))

    const testDataGroups = (project.testDataGroups ?? []).map(group => ({
        ...group,
        id: newId(),
        entries: (group.entries ?? []).map(entry => ({ ...entry, id: newId() })),
    }))
    const checklists = (project.checklists ?? []).map(checklist => ({
        ...checklist,
        id: newId(),
        items: (checklist.items ?? []).map(item => ({ ...item, id: newId() })),
    }))
    const runbooks = (project.runbooks ?? []).map(runbook => ({
        ...runbook,
        id: newId(),
        steps: (runbook.steps ?? []).map(step => ({ ...step, id: newId() })),
    }))
    const exploratorySessions = (project.exploratorySessions ?? []).map(session => ({
        ...session,
        id: newId(),
        observations: (session.observations ?? []).map(observation => ({ ...observation, id: newId() })),
    }))
    const accuracyTestSuites = (project.accuracyTestSuites ?? []).map(suite => ({
        ...suite,
        id: newId(),
    }))
    const apiRequests = (project.apiRequests ?? []).map(request => ({ ...request, id: newId() }))

    // ── Pass 2: rewrite every reference ──────────────────────────────────────
    const remappedTasks = tasks.map(task => ({
        ...task,
        activeHandoffId: remap(ids.handoffs, task.activeHandoffId),
        linkedTestCaseId: remap(ids.testCases, task.linkedTestCaseId),
        linkedDefectIds: remapAll(ids.tasks, task.linkedDefectIds),
        connectionId: remap(ids.connections, task.connectionId),
        affectedEnvironments: remapAll(ids.environments, task.affectedEnvironments),
    }))

    const remappedTestPlans = testPlans.map(plan => ({
        ...plan,
        testCases: plan.testCases.map(testCase => ({
            ...testCase,
            linkedDefectIds: remapAll(ids.tasks, testCase.linkedDefectIds),
        })),
    }))

    const remappedSessions = testRunSessions.map(session => ({
        ...session,
        environmentId: remap(ids.environments, session.environmentId),
        planExecutions: session.planExecutions.map(planExecution => ({
            ...planExecution,
            testPlanId: remap(ids.testPlans, planExecution.testPlanId) ?? planExecution.testPlanId,
            caseExecutions: planExecution.caseExecutions.map(caseExecution => ({
                ...caseExecution,
                testCaseId: remap(ids.testCases, caseExecution.testCaseId) ?? caseExecution.testCaseId,
                environmentId: remap(ids.environments, caseExecution.environmentId),
            })),
        })),
    }))

    const remappedHandoffs = handoffPackets.map(packet => ({
        ...packet,
        taskId: remap(ids.tasks, packet.taskId) ?? packet.taskId,
        environmentId: remap(ids.environments, packet.environmentId),
        linkedTestCaseIds: remapAll(ids.testCases, packet.linkedTestCaseIds) ?? [],
        linkedNoteIds: remapAll(ids.notes, packet.linkedNoteIds) ?? [],
        linkedFileIds: remapAll(ids.files, packet.linkedFileIds) ?? [],
        linkedExecutionRefs: (packet.linkedExecutionRefs ?? []).map(ref => ({
            sessionId: remap(ids.sessions, ref.sessionId) ?? ref.sessionId,
            planExecutionId: remap(ids.planExecutions, ref.planExecutionId) ?? ref.planExecutionId,
            caseExecutionId: remap(ids.caseExecutions, ref.caseExecutionId) ?? ref.caseExecutionId,
        })),
    }))

    // Artifact links are typed, so each end is remapped by the kind it points at.
    const artifactTypeMap: Record<string, Map<string, string>> = {
        task: ids.tasks,
        test_case: ids.testCases,
        test_execution: ids.caseExecutions,
        note: ids.notes,
        file: ids.files,
        handoff: ids.handoffs,
    }
    const remappedArtifactLinks = (project.artifactLinks ?? []).map(link => ({
        ...link,
        id: newId(),
        // 'pr' targets are external references and keep their identifier.
        sourceId: artifactTypeMap[link.sourceType] ? (artifactTypeMap[link.sourceType].get(link.sourceId) ?? link.sourceId) : link.sourceId,
        targetId: artifactTypeMap[link.targetType] ? (artifactTypeMap[link.targetType].get(link.targetId) ?? link.targetId) : link.targetId,
    }))

    const remappedEvents = (project.collaborationEvents ?? []).map(event => ({
        ...event,
        id: newId(),
        taskId: remap(ids.tasks, event.taskId) ?? event.taskId,
        handoffId: remap(ids.handoffs, event.handoffId),
    }))

    const remappedExploratory = exploratorySessions.map(session => ({
        ...session,
        discoveredBugIds: remapAll(ids.tasks, session.discoveredBugIds) ?? [],
    }))

    return {
        project: {
            ...project,
            id: newId(),
            tasks: remappedTasks,
            notes,
            files,
            environments,
            testPlans: remappedTestPlans,
            testRunSessions: remappedSessions,
            testExecutions: (project.testExecutions ?? []).map(execution => ({
                ...execution,
                id: newId(),
                testCaseId: remap(ids.testCases, execution.testCaseId) ?? execution.testCaseId,
                testPlanId: remap(ids.testPlans, execution.testPlanId) ?? execution.testPlanId,
                environmentId: remap(ids.environments, execution.environmentId),
            })),
            handoffPackets: remappedHandoffs,
            artifactLinks: remappedArtifactLinks,
            collaborationEvents: remappedEvents,
            exploratorySessions: remappedExploratory,
            accuracyTestSuites,
            testDataGroups,
            checklists,
            runbooks,
            apiRequests,
            linearConnections,
            jiraConnections,
        },
        remap: ids,
    }
}
