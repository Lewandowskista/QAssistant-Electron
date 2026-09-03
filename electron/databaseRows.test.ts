/**
 * Tests for the SQLite row -> domain-object mapping.
 *
 * The bug class these guard against is schema drift: the domain types are
 * TypeScript, the schema is hand-written SQL, and the mapping between them is
 * hand-written too. A field the UI writes but the mapping omits produces a
 * feature that works until the app restarts, with nothing logged. Each
 * assertion below names a field some part of the app actually reads.
 *
 * These mappers are pure, so no better-sqlite3 handle is needed — which is the
 * point of them living outside database.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { rowToProject, rowToTask, rowToHandoff, rowToCollaborationEvent } from './databaseRows'
import type { ProjectRow, TaskRow, HandoffRow, CollaborationEventRow } from './databaseRows'

/** A project row with every nullable column empty. */
function projectRow(overrides: Partial<ProjectRow> = {}): ProjectRow {
    return {
        id: 'p1',
        schema_version: 3,
        name: 'Storefront release QA',
        color: '#6366f1',
        client_name: null,
        description: null,
        gemini_model: null,
        ai_provider: null,
        nim_model: null,
        ollama_model: null,
        ollama_base_url: null,
        columns_json: null,
        source_columns_json: null,
        quality_gates_json: null,
        report_templates_json: null,
        report_schedules_json: null,
        report_history_json: null,
        custom_kpis_json: null,
        ai_copilot_history_json: null,
        linear_connections_json: null,
        jira_connections_json: null,
        linear_connection_legacy_json: null,
        jira_connection_legacy_json: null,
        created_at: 1_700_000_000_000,
        updated_at: 1_700_000_000_000,
        ...overrides,
    } as ProjectRow
}

function taskRow(overrides: Partial<TaskRow> = {}): TaskRow {
    return {
        id: 't1',
        project_id: 'p1',
        title: 'Checkout returns 500 on payment step',
        description: 'Card payment fails at the review step',
        status: 'todo',
        priority: 'critical',
        severity: null,
        acceptance_criteria: null,
        version: null,
        source_issue_id: null,
        external_id: null,
        ticket_url: null,
        issue_type: null,
        raw_description: null,
        assignee: null,
        labels: null,
        components_json: null,
        due_date: null,
        source: null,
        connection_id: null,
        attachment_urls_json: null,
        analysis_history_json: null,
        linked_test_case_id: null,
        linked_defect_ids_json: null,
        collab_state: 'draft',
        active_handoff_id: null,
        last_collab_updated_at: null,
        reproducibility: null,
        frequency: null,
        affected_environments_json: null,
        sprint_json: null,
        created_at: 1_700_000_000_000,
        updated_at: 1_700_000_000_000,
        ...overrides,
    } as TaskRow
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('rowToProject', () => {
    describe('AI provider selection', () => {
        // Regression: before the Ollama work the projects table had no ai_provider
        // or nim_model column, so a project configured for NIM silently reverted to
        // Gemini on restart. These fail loudly if the mapping drops them again.
        it('maps the provider and every per-provider model field', () => {
            const project = rowToProject(projectRow({
                ai_provider: 'ollama',
                gemini_model: 'gemini-2.5-flash',
                nim_model: 'meta/llama-3.1-70b-instruct',
                ollama_model: 'gpt-oss:20b',
                ollama_base_url: 'http://192.168.1.10:11434',
            }))

            expect(project.aiProvider).toBe('ollama')
            expect(project.geminiModel).toBe('gemini-2.5-flash')
            expect(project.nimModel).toBe('meta/llama-3.1-70b-instruct')
            expect(project.ollamaModel).toBe('gpt-oss:20b')
            expect(project.ollamaBaseUrl).toBe('http://192.168.1.10:11434')
        })

        it.each(['gemini', 'nim', 'ollama'] as const)('preserves the %s provider', (provider) => {
            expect(rowToProject(projectRow({ ai_provider: provider })).aiProvider).toBe(provider)
        })

        it('leaves the provider undefined when none was chosen', () => {
            const project = rowToProject(projectRow())
            expect(project.aiProvider).toBeUndefined()
            expect(project.ollamaModel).toBeUndefined()
            // Must be a real undefined, not the string "null" reaching the settings UI.
            expect(project.ollamaBaseUrl).toBeUndefined()
        })

        it('keeps a blank Ollama host blank rather than turning it into a string null', () => {
            // An empty host means "use the local default"; the renderer trims and
            // falls back, so it must survive as an empty string.
            expect(rowToProject(projectRow({ ollama_base_url: '' })).ollamaBaseUrl).toBe('')
        })
    })

    describe('JSON columns', () => {
        it('parses the collections the board and settings read', () => {
            const project = rowToProject(projectRow({
                columns_json: JSON.stringify([{ id: 'todo', title: 'To Do' }]),
                quality_gates_json: JSON.stringify([{ id: 'g1', name: 'Release gate', criteria: [], isEnabled: true }]),
                linear_connections_json: JSON.stringify([{ id: 'lc1', label: 'Core', teamId: 'TEAM' }]),
                ai_copilot_history_json: JSON.stringify([{ id: 'h1', role: 'qa', prompt: 'x', response: 'y', createdAt: 1 }]),
            }))

            expect(project.columns).toEqual([{ id: 'todo', title: 'To Do' }])
            expect(project.qualityGates).toHaveLength(1)
            expect(project.linearConnections).toEqual([{ id: 'lc1', label: 'Core', teamId: 'TEAM' }])
            expect(project.aiCopilotHistory).toHaveLength(1)
        })

        it('defaults array columns to empty arrays so the UI can map over them', () => {
            const project = rowToProject(projectRow())
            expect(project.columns).toEqual([])
            expect(project.qualityGates).toEqual([])
            expect(project.linearConnections).toEqual([])
            expect(project.jiraConnections).toEqual([])
            expect(project.aiCopilotHistory).toEqual([])
        })

        it('falls back to a default instead of throwing on corrupt JSON', () => {
            // A half-written column should degrade to an empty board, not crash the
            // whole project load and take every other project with it.
            vi.spyOn(console, 'warn').mockImplementation(() => {})
            const project = rowToProject(projectRow({ columns_json: '[{ this is not json' }))
            expect(project.columns).toEqual([])
        })

        it('initialises the child collections that are loaded by separate queries', () => {
            const project = rowToProject(projectRow())
            expect(project.tasks).toEqual([])
            expect(project.notes).toEqual([])
            expect(project.testPlans).toEqual([])
            expect(project.environments).toEqual([])
            expect(project.testRunSessions).toEqual([])
        })
    })
})

describe('rowToTask', () => {
    it('maps the identity and triage fields the board renders', () => {
        const task = rowToTask(taskRow({
            severity: 'blocker',
            acceptance_criteria: 'Order completes with a 200',
            version: '2211.5',
            assignee: 'stefan',
            components_json: JSON.stringify(['checkout', 'payment']),
        }))

        expect(task.title).toBe('Checkout returns 500 on payment step')
        expect(task.priority).toBe('critical')
        expect(task.severity).toBe('blocker')
        expect(task.acceptanceCriteria).toBe('Order completes with a 200')
        expect(task.version).toBe('2211.5')
        expect(task.components).toEqual(['checkout', 'payment'])
    })

    it('maps the collaboration state the handoff flow keys on', () => {
        const task = rowToTask(taskRow({
            collab_state: 'ready_for_qa',
            active_handoff_id: 'h1',
            last_collab_updated_at: 1_700_000_001_000,
        }))

        expect(task.collabState).toBe('ready_for_qa')
        expect(task.activeHandoffId).toBe('h1')
        expect(task.lastCollabUpdatedAt).toBe(1_700_000_001_000)
    })

    it('maps the traceability links between tasks and tests', () => {
        const task = rowToTask(taskRow({
            linked_test_case_id: 'tc1',
            linked_defect_ids_json: JSON.stringify(['t2', 't3']),
            source_issue_id: 'PROJ-42',
            external_id: 'uuid-42',
            source: 'jira',
            connection_id: 'jc1',
        }))

        expect(task.linkedTestCaseId).toBe('tc1')
        expect(task.linkedDefectIds).toEqual(['t2', 't3'])
        expect(task.sourceIssueId).toBe('PROJ-42')
        expect(task.externalId).toBe('uuid-42')
        expect(task.source).toBe('jira')
        expect(task.connectionId).toBe('jc1')
    })

    it('maps the bug-reproduction fields a handoff packet requires', () => {
        const task = rowToTask(taskRow({
            reproducibility: 'sometimes',
            frequency: 'often',
            affected_environments_json: JSON.stringify(['env1']),
        }))

        expect(task.reproducibility).toBe('sometimes')
        expect(task.frequency).toBe('often')
        expect(task.affectedEnvironments).toEqual(['env1'])
    })

    describe('enum coercion', () => {
        it('falls back on an out-of-union value rather than leaking it', () => {
            // Rows can arrive from a newer schema via sync, or be edited out of band.
            // A stray value must not reach the renderer's discriminated unions.
            vi.spyOn(console, 'warn').mockImplementation(() => {})
            const task = rowToTask(taskRow({ priority: 'wat', collab_state: 'nonsense', severity: 'huge' }))

            expect(task.priority).toBe('medium')
            expect(task.severity).toBeUndefined()
            // collabState is optional on Task, so an unrecognised value becomes
            // undefined ("no collaboration state") rather than being asserted as
            // 'draft' — claiming a specific state the row never had would be worse.
            expect(task.collabState).toBeUndefined()
        })

        it('accepts every documented priority and collaboration state', () => {
            for (const priority of ['low', 'medium', 'high', 'critical'] as const) {
                expect(rowToTask(taskRow({ priority })).priority).toBe(priority)
            }
            const states = [
                'draft', 'ready_for_dev', 'dev_acknowledged', 'in_fix',
                'ready_for_qa', 'qa_retesting', 'verified', 'closed',
            ] as const
            for (const collab_state of states) {
                expect(rowToTask(taskRow({ collab_state })).collabState).toBe(collab_state)
            }
        })
    })
})

describe('rowToHandoff', () => {
    function handoffRow(overrides: Partial<HandoffRow> = {}): HandoffRow {
        return {
            id: 'h1',
            project_id: 'p1',
            task_id: 't1',
            type: 'bug_handoff',
            created_by_role: 'qa',
            created_at: 1_700_000_000_000,
            updated_at: 1_700_000_000_000,
            summary: 'Checkout fails at payment',
            repro_steps: '1. Add to cart\n2. Pay',
            expected_result: 'Order completes',
            actual_result: '500 returned',
            environment_id: 'env1',
            environment_name: 'Staging',
            severity: 'critical',
            branch_name: null,
            release_version: null,
            reproducibility: null,
            frequency: null,
            linked_test_case_ids_json: JSON.stringify(['tc1']),
            linked_execution_refs_json: JSON.stringify([
                { sessionId: 's1', planExecutionId: 'pe1', caseExecutionId: 'ce1' },
            ]),
            linked_note_ids_json: null,
            linked_file_ids_json: null,
            linked_prs_json: null,
            developer_response: null,
            qa_verification_notes: null,
            resolution_summary: null,
            acknowledged_at: null,
            completed_at: null,
            is_complete: 0,
            missing_fields_json: null,
            ...overrides,
        } as HandoffRow
    }

    it('maps the environment a packet needs to be considered complete', () => {
        const handoff = rowToHandoff(handoffRow())
        expect(handoff.environmentId).toBe('env1')
        expect(handoff.environmentName).toBe('Staging')
        expect(handoff.severity).toBe('critical')
    })

    it('maps execution evidence refs, the link back to a failed run', () => {
        const handoff = rowToHandoff(handoffRow())
        expect(handoff.linkedTestCaseIds).toEqual(['tc1'])
        expect(handoff.linkedExecutionRefs).toEqual([
            { sessionId: 's1', planExecutionId: 'pe1', caseExecutionId: 'ce1' },
        ])
    })

    it('maps the acknowledgement and verification lifecycle fields', () => {
        const handoff = rowToHandoff(handoffRow({
            acknowledged_at: 1_700_000_002_000,
            completed_at: 1_700_000_003_000,
            is_complete: 1,
            developer_response: 'Fixed in PR 12',
            qa_verification_notes: 'Verified on staging',
        }))

        expect(handoff.acknowledgedAt).toBe(1_700_000_002_000)
        expect(handoff.completedAt).toBe(1_700_000_003_000)
        expect(handoff.isComplete).toBe(true)
        expect(handoff.developerResponse).toBe('Fixed in PR 12')
        expect(handoff.qaVerificationNotes).toBe('Verified on staging')
    })

    it('reports an unacknowledged packet as incomplete', () => {
        const handoff = rowToHandoff(handoffRow({ is_complete: 0 }))
        expect(handoff.isComplete).toBe(false)
        expect(handoff.acknowledgedAt).toBeUndefined()
    })
})

describe('rowToCollaborationEvent', () => {
    function eventRow(overrides: Partial<CollaborationEventRow> = {}): CollaborationEventRow {
        return {
            id: 'e1',
            project_id: 'p1',
            task_id: 't1',
            handoff_id: 'h1',
            event_type: 'ready_for_qa',
            actor_role: 'dev',
            timestamp: 1_700_000_000_000,
            title: 'Fix ready for QA',
            details: null,
            metadata_json: null,
            ...overrides,
        } as CollaborationEventRow
    }

    it('maps the fields the activity timeline renders', () => {
        const event = rowToCollaborationEvent(eventRow({ details: 'Deployed to staging' }))
        expect(event.taskId).toBe('t1')
        expect(event.handoffId).toBe('h1')
        expect(event.eventType).toBe('ready_for_qa')
        expect(event.actorRole).toBe('dev')
        expect(event.title).toBe('Fix ready for QA')
        expect(event.details).toBe('Deployed to staging')
    })

    it('parses event metadata', () => {
        const event = rowToCollaborationEvent(eventRow({
            metadata_json: JSON.stringify({ prNumber: 12, repo: 'acme/storefront' }),
        }))
        expect(event.metadata).toEqual({ prNumber: 12, repo: 'acme/storefront' })
    })

    // Known gap, tracked for the persistence phase: actor_user_id and
    // actor_display_name are written by the store and read by the timeline, but
    // the schema has no such columns so the mapping cannot carry them. When those
    // columns land, assert them here.
    it('does not yet carry actor identity', () => {
        const event = rowToCollaborationEvent(eventRow())
        expect(event.actorUserId).toBeUndefined()
        expect(event.actorDisplayName).toBeUndefined()
    })
})
