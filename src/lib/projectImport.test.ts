/**
 * Tests for re-keying a project on import.
 *
 * Import is the only sharing mechanism and also the demo-workspace loader, so a
 * dangling reference here is visible immediately: a handoff detached from its
 * task, dead artifact links, coverage reading zero.
 *
 * The final block runs the real shipped demo project through the same path,
 * because that is the case a new user sees first.
 */
import { describe, it, expect } from 'vitest'
import { remapProjectForImport } from './projectImport'
import { demoProject } from '@/data/demoProject'
import type { Project } from '@/types/project'

/** Deterministic ids so assertions can name them. */
function counter() {
    let n = 0
    return () => `new-${++n}`
}

/** A project exercising every reference the remapper has to rewrite. */
function linkedProject(): Project {
    return {
        id: 'old-project',
        name: 'Storefront QA',
        color: '#6366f1',
        tasks: [
            {
                id: 'task-1', title: 'Checkout 500', description: '', status: 'todo', priority: 'critical',
                activeHandoffId: 'handoff-1', linkedTestCaseId: 'case-1', linkedDefectIds: ['task-2'],
                connectionId: 'conn-1', affectedEnvironments: ['env-1'],
                createdAt: 1, updatedAt: 1,
            },
            { id: 'task-2', title: 'Related bug', description: '', status: 'todo', priority: 'low', createdAt: 1, updatedAt: 1 },
        ],
        notes: [{ id: 'note-1', title: 'Findings', content: '', attachments: [], updatedAt: 1 }],
        files: [{ id: 'file-1', fileName: 'shot.png', filePath: '/a/shot.png' }],
        environments: [{
            id: 'env-1', name: 'Staging', type: 'staging', color: '#fff', isDefault: true, createdAt: 1,
            baseUrl: '', notes: '', healthCheckUrl: '', hacUrl: '', backOfficeUrl: '', storefrontUrl: '', solrAdminUrl: '',
        }],
        testPlans: [{
            id: 'plan-1', displayId: 'TP-001', name: 'Checkout', description: '',
            isArchived: false, isRegressionSuite: true, createdAt: 1, updatedAt: 1,
            testCases: [{
                id: 'case-1', displayId: 'TC-001', title: 'Guest checkout', preConditions: '', steps: '',
                testData: '', expectedResult: '', actualResult: '', priority: 'blocker', status: 'failed',
                linkedDefectIds: ['task-1'], updatedAt: 1,
            }],
        }],
        testRunSessions: [{
            id: 'session-1', timestamp: 1, environmentId: 'env-1',
            planExecutions: [{
                id: 'planexec-1', testPlanId: 'plan-1', snapshotTestPlanName: 'Checkout',
                caseExecutions: [{
                    id: 'caseexec-1', testCaseId: 'case-1', result: 'failed', actualResult: '', notes: '',
                    snapshotTestCaseTitle: 'Guest checkout', environmentId: 'env-1',
                }],
            }],
        }],
        testExecutions: [],
        handoffPackets: [{
            id: 'handoff-1', taskId: 'task-1', type: 'bug_handoff', createdByRole: 'qa',
            createdAt: 1, updatedAt: 1, summary: 'Checkout fails', reproSteps: '', expectedResult: '', actualResult: '',
            environmentId: 'env-1',
            linkedTestCaseIds: ['case-1'], linkedNoteIds: ['note-1'], linkedFileIds: ['file-1'],
            linkedExecutionRefs: [{ sessionId: 'session-1', planExecutionId: 'planexec-1', caseExecutionId: 'caseexec-1' }],
            linkedPrs: [],
        }],
        artifactLinks: [
            { id: 'link-1', sourceType: 'handoff', sourceId: 'handoff-1', targetType: 'task', targetId: 'task-1', label: 'fixes', createdAt: 1 },
            { id: 'link-2', sourceType: 'test_execution', sourceId: 'caseexec-1', targetType: 'note', targetId: 'note-1', label: 'evidence', createdAt: 1 },
            { id: 'link-3', sourceType: 'task', sourceId: 'task-1', targetType: 'pr', targetId: 'acme/store#42', label: 'fixes', createdAt: 1 },
        ],
        collaborationEvents: [
            { id: 'event-1', taskId: 'task-1', handoffId: 'handoff-1', eventType: 'handoff_created', actorRole: 'qa', timestamp: 1, title: 'Created' },
        ],
        exploratorySessions: [{
            id: 'expl-1', charter: 'Poke checkout', timebox: 30, tester: 'sam', startedAt: 1,
            observations: [{ id: 'obs-1', timestamp: 1, type: 'bug', description: 'Broken' }],
            discoveredBugIds: ['task-2'], notes: '',
        }],
        linearConnections: [{ id: 'conn-1', label: 'Core', teamId: 'TEAM' }],
        jiraConnections: [],
        testDataGroups: [{ id: 'group-1', name: 'Users', category: 'Users', entries: [{ id: 'entry-1', key: 'k', value: 'v', description: '', tags: '', environment: 'All' }], createdAt: 1 }],
        checklists: [{ id: 'cl-1', name: 'Release', category: 'release', items: [{ id: 'item-1', text: 'Check', isChecked: false }], createdAt: 1, updatedAt: 1 }],
        runbooks: [{ id: 'rb-1', name: 'Deploy', category: 'deployment', steps: [{ id: 'step-1', title: 'Go', status: 'pending', order: 0, updatedAt: 1 }], createdAt: 1, updatedAt: 1 }],
        apiRequests: [],
    } as Project
}

describe('remapProjectForImport', () => {
    it('gives every entity a fresh id', () => {
        const { project } = remapProjectForImport(linkedProject(), counter())

        expect(project.id).not.toBe('old-project')
        expect(project.tasks.map(t => t.id)).not.toContain('task-1')
        expect(project.testPlans[0].id).not.toBe('plan-1')
        expect(project.testPlans[0].testCases[0].id).not.toBe('case-1')
        expect(project.handoffPackets![0].id).not.toBe('handoff-1')
        expect(project.notes[0].id).not.toBe('note-1')
        expect(project.environments[0].id).not.toBe('env-1')
    })

    it('re-keys test run sessions, which previously kept their ids', () => {
        // Sessions are keyed globally, so a repeated import of the same file let
        // the second copy rewrite the first import's rows.
        const { project } = remapProjectForImport(linkedProject(), counter())

        expect(project.testRunSessions[0].id).not.toBe('session-1')
        expect(project.testRunSessions[0].planExecutions[0].id).not.toBe('planexec-1')
        expect(project.testRunSessions[0].planExecutions[0].caseExecutions[0].id).not.toBe('caseexec-1')
    })

    it('keeps the handoff attached to its task', () => {
        const { project } = remapProjectForImport(linkedProject(), counter())

        const task = project.tasks.find(t => t.title === 'Checkout 500')!
        const handoff = project.handoffPackets![0]

        expect(handoff.taskId).toBe(task.id)
        expect(task.activeHandoffId).toBe(handoff.id)
    })

    it('keeps handoff evidence pointing at the right entities', () => {
        const { project } = remapProjectForImport(linkedProject(), counter())

        const handoff = project.handoffPackets![0]
        const testCase = project.testPlans[0].testCases[0]
        const session = project.testRunSessions[0]

        expect(handoff.linkedTestCaseIds).toEqual([testCase.id])
        expect(handoff.linkedNoteIds).toEqual([project.notes[0].id])
        expect(handoff.linkedFileIds).toEqual([project.files[0].id])
        expect(handoff.environmentId).toBe(project.environments[0].id)
        expect(handoff.linkedExecutionRefs).toEqual([{
            sessionId: session.id,
            planExecutionId: session.planExecutions[0].id,
            caseExecutionId: session.planExecutions[0].caseExecutions[0].id,
        }])
    })

    it('keeps task and test-case traceability mutual', () => {
        const { project } = remapProjectForImport(linkedProject(), counter())

        const task = project.tasks.find(t => t.title === 'Checkout 500')!
        const related = project.tasks.find(t => t.title === 'Related bug')!
        const testCase = project.testPlans[0].testCases[0]

        expect(task.linkedTestCaseId).toBe(testCase.id)
        expect(testCase.linkedDefectIds).toEqual([task.id])
        expect(task.linkedDefectIds).toEqual([related.id])
    })

    it('remaps artifact links by the type each end points at', () => {
        const { project } = remapProjectForImport(linkedProject(), counter())

        const task = project.tasks.find(t => t.title === 'Checkout 500')!
        const handoff = project.handoffPackets![0]
        const caseExec = project.testRunSessions[0].planExecutions[0].caseExecutions[0]
        const [fixes, evidence, prLink] = project.artifactLinks!

        expect(fixes.sourceId).toBe(handoff.id)
        expect(fixes.targetId).toBe(task.id)
        expect(evidence.sourceId).toBe(caseExec.id)
        expect(evidence.targetId).toBe(project.notes[0].id)
        // A pull request is external; its identifier must survive untouched.
        expect(prLink.targetId).toBe('acme/store#42')
    })

    it('remaps collaboration events so the timeline still resolves', () => {
        const { project } = remapProjectForImport(linkedProject(), counter())

        const task = project.tasks.find(t => t.title === 'Checkout 500')!
        const event = project.collaborationEvents![0]

        expect(event.taskId).toBe(task.id)
        expect(event.handoffId).toBe(project.handoffPackets![0].id)
        expect(event.id).not.toBe('event-1')
    })

    it('remaps environment, connection and execution references', () => {
        const { project } = remapProjectForImport(linkedProject(), counter())

        const task = project.tasks.find(t => t.title === 'Checkout 500')!
        const env = project.environments[0]
        const session = project.testRunSessions[0]

        expect(task.affectedEnvironments).toEqual([env.id])
        expect(task.connectionId).toBe(project.linearConnections[0].id)
        expect(session.environmentId).toBe(env.id)
        expect(session.planExecutions[0].testPlanId).toBe(project.testPlans[0].id)
        expect(session.planExecutions[0].caseExecutions[0].testCaseId).toBe(project.testPlans[0].testCases[0].id)
    })

    it('remaps bugs discovered during an exploratory session', () => {
        const { project } = remapProjectForImport(linkedProject(), counter())

        const related = project.tasks.find(t => t.title === 'Related bug')!
        expect(project.exploratorySessions![0].discoveredBugIds).toEqual([related.id])
    })

    it('produces no id that appears twice', () => {
        const { project } = remapProjectForImport(linkedProject(), counter())

        const ids = [
            project.id,
            ...project.tasks.map(t => t.id),
            ...project.notes.map(n => n.id),
            ...project.files.map(f => f.id),
            ...project.environments.map(e => e.id),
            ...project.testPlans.map(p => p.id),
            ...project.testPlans.flatMap(p => p.testCases.map(c => c.id)),
            ...project.testRunSessions.map(s => s.id),
            ...project.handoffPackets!.map(h => h.id),
            ...project.artifactLinks!.map(l => l.id),
            ...project.collaborationEvents!.map(e => e.id),
        ]
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('leaves an unresolvable reference alone rather than corrupting it', () => {
        const source = linkedProject()
        source.handoffPackets![0].taskId = 'task-that-was-never-exported'

        const { project } = remapProjectForImport(source, counter())

        expect(project.handoffPackets![0].taskId).toBe('task-that-was-never-exported')
    })

    it('handles a project with no optional collections', () => {
        const bare = { id: 'p', name: 'Bare', color: '#fff', tasks: [], notes: [], testPlans: [], environments: [], testExecutions: [], testRunSessions: [], files: [], testDataGroups: [], checklists: [], apiRequests: [], runbooks: [], linearConnections: [], jiraConnections: [] } as Project

        expect(() => remapProjectForImport(bare, counter())).not.toThrow()
    })
})

describe('the shipped demo workspace', () => {
    it('arrives with its handoff attached to its task', () => {
        // The README advertises a ready-for-QA handoff in the demo. It was
        // orphaned on load because seedDemoProject goes through this path.
        const { project } = remapProjectForImport(demoProject as Project, counter())

        for (const handoff of project.handoffPackets ?? []) {
            const owner = project.tasks.find(task => task.id === handoff.taskId)
            expect(owner, `handoff ${handoff.summary} has no task`).toBeDefined()
        }
    })

    it('arrives with every artifact link resolving to a real entity', () => {
        const { project } = remapProjectForImport(demoProject as Project, counter())

        const known = new Map<string, Set<string>>([
            ['task', new Set(project.tasks.map(t => t.id))],
            ['test_case', new Set(project.testPlans.flatMap(p => p.testCases.map(c => c.id)))],
            ['note', new Set(project.notes.map(n => n.id))],
            ['file', new Set(project.files.map(f => f.id))],
            ['handoff', new Set((project.handoffPackets ?? []).map(h => h.id))],
            ['test_execution', new Set(project.testRunSessions.flatMap(s => s.planExecutions.flatMap(pe => pe.caseExecutions.map(ce => ce.id))))],
        ])

        for (const link of project.artifactLinks ?? []) {
            const sources = known.get(link.sourceType)
            const targets = known.get(link.targetType)
            if (sources) expect(sources.has(link.sourceId), `${link.label} source dangles`).toBe(true)
            if (targets) expect(targets.has(link.targetId), `${link.label} target dangles`).toBe(true)
        }
    })

    it('arrives with every collaboration event pointing at a real task', () => {
        const { project } = remapProjectForImport(demoProject as Project, counter())
        const taskIds = new Set(project.tasks.map(t => t.id))

        for (const event of project.collaborationEvents ?? []) {
            expect(taskIds.has(event.taskId), `event "${event.title}" has no task`).toBe(true)
        }
    })

    it('keeps external issue keys unchanged, which is how coverage is matched', () => {
        // Tasks and test cases are related through sourceIssueId, an external
        // Jira/Linear key rather than an internal id. Remapping it would silently
        // destroy coverage, so it has to pass through untouched.
        const before = demoProject as Project
        const { project } = remapProjectForImport(before, counter())

        const beforeKeys = before.tasks.map(task => task.sourceIssueId).filter(Boolean)
        expect(beforeKeys.length).toBeGreaterThan(0)
        expect(project.tasks.map(task => task.sourceIssueId)).toEqual(before.tasks.map(task => task.sourceIssueId))

        const caseKeys = project.testPlans.flatMap(plan => plan.testCases.map(c => c.sourceIssueId)).filter(Boolean)
        expect(caseKeys.some(key => beforeKeys.includes(key))).toBe(true)
    })

    it('arrives with handoff test-case evidence resolving', () => {
        const { project } = remapProjectForImport(demoProject as Project, counter())
        const caseIds = new Set(project.testPlans.flatMap(p => p.testCases.map(c => c.id)))

        const withEvidence = (project.handoffPackets ?? []).filter(h => h.linkedTestCaseIds.length > 0)
        expect(withEvidence.length).toBeGreaterThan(0)
        for (const handoff of withEvidence) {
            for (const caseId of handoff.linkedTestCaseIds) {
                expect(caseIds.has(caseId), `handoff "${handoff.summary}" cites a missing test case`).toBe(true)
            }
        }
    })
})
