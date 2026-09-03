/**
 * databaseRows.ts — pure row <-> domain-object mapping for the SQLite layer.
 *
 * Split out of database.ts so it can be tested without a native better-sqlite3
 * handle. The binding is compiled against Electron's ABI, so anything that
 * imports database.ts cannot load under vitest's node environment — which is
 * why this mapping went untested for so long.
 *
 * Everything here is pure: it takes a plain row object and returns a domain
 * object, with no database access. That matters because this is exactly where
 * schema drift bites: `Project` and friends are TypeScript types, the schema is
 * hand-written SQL, and a field the UI writes but the mapping omits looks like
 * "it worked until I restarted the app".
 */

import type {
    Project, Task, TaskSeverity, CollabState, Reproducibility, Frequency,
    TestPlan, TestCase,
} from '../src/types/project'

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function j(v: unknown): string | null {
    if (v === undefined || v === null) return null
    return JSON.stringify(v)
}

export function p<T>(v: string | null | undefined): T | undefined {
    if (v === null || v === undefined) return undefined
    try { return JSON.parse(v) as T } catch { return undefined }
}

export function bool(v: number | null | undefined): boolean {
    return v === 1
}

/**
 * Coerce an untyped DB string column into a known union, falling back when the
 * stored value is outside the union (e.g. a record synced from a newer schema or
 * edited out-of-band). Returns `fallback` (which may be undefined) on mismatch so
 * a stray value never reaches the renderer's discriminated-union logic untyped.
 */
export function asEnum<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T
export function asEnum<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback?: undefined): T | undefined
export function asEnum<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback?: T): T | undefined {
    if (value != null && (allowed as readonly string[]).includes(value)) return value as T
    if (value != null) console.warn(`[db] Unexpected enum value '${value}' (allowed: ${allowed.join('|')}); using fallback '${fallback ?? 'undefined'}'`)
    return fallback
}

const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
const TASK_SEVERITIES: readonly TaskSeverity[] = ['cosmetic', 'minor', 'major', 'critical', 'blocker']
const TASK_SOURCES = ['manual', 'linear', 'jira'] as const
const COLLAB_STATES: readonly CollabState[] = ['draft', 'ready_for_dev', 'dev_acknowledged', 'in_fix', 'ready_for_qa', 'qa_retesting', 'verified', 'closed']
const REPRODUCIBILITIES: readonly Reproducibility[] = ['always', 'sometimes', 'rarely', 'once', 'unable']
const FREQUENCIES: readonly Frequency[] = ['everytime', 'often', 'occasionally', 'once']
// ─── Project row ↔ Project object ─────────────────────────────────────────────

export type ProjectRow = {
    id: string
    schema_version: number | null
    name: string
    color: string
    client_name: string | null
    description: string | null
    gemini_model: string | null
    ai_provider: string | null
    nim_model: string | null
    ollama_model: string | null
    ollama_base_url: string | null
    columns_json: string | null
    source_columns_json: string | null
    quality_gates_json: string | null
    report_templates_json: string | null
    report_schedules_json: string | null
    report_history_json: string | null
    custom_kpis_json: string | null
    ai_copilot_history_json: string | null
    linear_connections_json: string | null
    jira_connections_json: string | null
    linear_connection_legacy_json: string | null
    jira_connection_legacy_json: string | null
}

export function rowToProject(row: ProjectRow): Project {
    return {
        id: row.id,
        schemaVersion: row.schema_version ?? undefined,
        name: row.name,
        color: row.color,
        clientName: row.client_name ?? undefined,
        description: row.description ?? undefined,
        tasks: [],
        notes: [],
        testPlans: [],
        environments: [],
        testExecutions: [],
        testRunSessions: [],
        files: [],
        testDataGroups: [],
        checklists: [],
        apiRequests: [],
        runbooks: [],
        geminiModel: row.gemini_model ?? undefined,
        aiProvider: (row.ai_provider as 'gemini' | 'nim' | 'ollama' | null) ?? undefined,
        nimModel: row.nim_model ?? undefined,
        ollamaModel: row.ollama_model ?? undefined,
        ollamaBaseUrl: row.ollama_base_url ?? undefined,
        columns: p(row.columns_json) ?? [],
        sourceColumns: p(row.source_columns_json),
        qualityGates: p(row.quality_gates_json) ?? [],
        reportTemplates: p(row.report_templates_json) ?? [],
        reportSchedules: p(row.report_schedules_json) ?? [],
        reportHistory: p(row.report_history_json) ?? [],
        customKpis: p(row.custom_kpis_json) ?? [],
        aiCopilotHistory: p(row.ai_copilot_history_json) ?? [],
        linearConnections: p(row.linear_connections_json) ?? [],
        jiraConnections: p(row.jira_connections_json) ?? [],
        linearConnection: p(row.linear_connection_legacy_json),
        jiraConnection: p(row.jira_connection_legacy_json),
    }
}

// ─── Task row ↔ Task object ───────────────────────────────────────────────────

export type TaskRow = {
    id: string
    project_id: string
    title: string
    description: string
    status: string
    priority: string
    severity: string | null
    acceptance_criteria: string | null
    version: string | null
    source_issue_id: string | null
    external_id: string | null
    ticket_url: string | null
    issue_type: string | null
    raw_description: string | null
    assignee: string | null
    labels: string | null
    components_json: string | null
    due_date: number | null
    source: string | null
    connection_id: string | null
    attachment_urls_json: string | null
    analysis_history_json: string | null
    linked_test_case_id: string | null
    linked_defect_ids_json: string | null
    collab_state: string
    active_handoff_id: string | null
    last_collab_updated_at: number | null
    reproducibility: string | null
    frequency: string | null
    affected_environments_json: string | null
    sprint_json: string | null
    created_at: number
    updated_at: number
}

export function rowToTask(row: TaskRow): Task {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: asEnum(row.priority, TASK_PRIORITIES, 'medium'),
        severity: asEnum(row.severity, TASK_SEVERITIES),
        acceptanceCriteria: row.acceptance_criteria ?? undefined,
        version: row.version ?? undefined,
        sourceIssueId: row.source_issue_id ?? undefined,
        externalId: row.external_id ?? undefined,
        ticketUrl: row.ticket_url ?? undefined,
        issueType: row.issue_type ?? undefined,
        rawDescription: row.raw_description ?? undefined,
        assignee: row.assignee ?? undefined,
        labels: row.labels ?? undefined,
        components: p<string[]>(row.components_json) ?? [],
        dueDate: row.due_date ?? undefined,
        source: asEnum(row.source, TASK_SOURCES),
        connectionId: row.connection_id ?? undefined,
        attachmentUrls: p<string[]>(row.attachment_urls_json) ?? undefined,
        analysisHistory: p(row.analysis_history_json) ?? [],
        linkedTestCaseId: row.linked_test_case_id ?? undefined,
        linkedDefectIds: p<string[]>(row.linked_defect_ids_json) ?? [],
        collabState: asEnum(row.collab_state, COLLAB_STATES),
        activeHandoffId: row.active_handoff_id ?? undefined,
        lastCollabUpdatedAt: row.last_collab_updated_at ?? undefined,
        reproducibility: asEnum(row.reproducibility, REPRODUCIBILITIES),
        frequency: asEnum(row.frequency, FREQUENCIES),
        affectedEnvironments: p<string[]>(row.affected_environments_json),
        sprint: p(row.sprint_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export type NoteRow = {
    id: string
    title: string
    content: string
    updated_at: number
}

export type NoteAttachmentRow = {
    id: string
    file_name: string
    file_path: string
    mime_type: string | null
    file_size_bytes: number | null
}

export type HandoffRow = {
    id: string
    task_id: string
    type: string
    created_by_role: string
    created_at: number
    updated_at: number
    summary: string
    repro_steps: string
    expected_result: string
    actual_result: string
    environment_id: string | null
    environment_name: string | null
    severity: string | null
    branch_name: string | null
    release_version: string | null
    reproducibility: string | null
    frequency: string | null
    linked_test_case_ids_json: string | null
    linked_execution_refs_json: string | null
    linked_note_ids_json: string | null
    linked_file_ids_json: string | null
    linked_prs_json: string | null
    developer_response: string | null
    qa_verification_notes: string | null
    resolution_summary: string | null
    acknowledged_at: number | null
    completed_at: number | null
    is_complete: number | null
    missing_fields_json: string | null
}

export type CollaborationEventRow = {
    id: string
    task_id: string
    handoff_id: string | null
    event_type: string
    actor_role: string
    timestamp: number
    title: string
    details: string | null
    metadata_json: string | null
}

export type TestPlanRow = {
    id: string
    display_id: string
    name: string
    description: string
    is_archived: number | null
    is_regression_suite: number | null
    source: TestPlan['source']
    criticality: string | null
    created_at: number
    updated_at: number
}

export type TestCaseRow = {
    id: string
    display_id: string
    title: string
    pre_conditions: string
    steps: string
    test_data: string
    expected_result: string
    actual_result: string
    priority: TestCase['priority']
    status: TestCase['status']
    sap_module: TestCase['sapModule'] | null
    source_issue_id: string | null
    tags_json: string | null
    components_json: string | null
    assigned_to: string | null
    estimated_minutes: number | null
    test_type: TestCase['testType'] | null
    linked_defect_ids_json: string | null
    change_log_json: string | null
    updated_at: number
}

export function rowToHandoff(row: HandoffRow): any {
    return {
        id: row.id, taskId: row.task_id, type: row.type,
        createdByRole: row.created_by_role, createdAt: row.created_at, updatedAt: row.updated_at,
        summary: row.summary, reproSteps: row.repro_steps,
        expectedResult: row.expected_result, actualResult: row.actual_result,
        environmentId: row.environment_id ?? undefined, environmentName: row.environment_name ?? undefined,
        severity: row.severity ?? undefined, branchName: row.branch_name ?? undefined,
        releaseVersion: row.release_version ?? undefined,
        reproducibility: row.reproducibility ?? undefined, frequency: row.frequency ?? undefined,
        linkedTestCaseIds: p<string[]>(row.linked_test_case_ids_json) ?? [],
        linkedExecutionRefs: p(row.linked_execution_refs_json) ?? [],
        linkedNoteIds: p<string[]>(row.linked_note_ids_json) ?? [],
        linkedFileIds: p<string[]>(row.linked_file_ids_json) ?? [],
        linkedPrs: p(row.linked_prs_json) ?? [],
        developerResponse: row.developer_response ?? undefined,
        qaVerificationNotes: row.qa_verification_notes ?? undefined,
        resolutionSummary: row.resolution_summary ?? undefined,
        acknowledgedAt: row.acknowledged_at ?? undefined,
        completedAt: row.completed_at ?? undefined,
        isComplete: bool(row.is_complete),
        missingFields: p<string[]>(row.missing_fields_json) ?? undefined,
    }
}

export function rowToCollaborationEvent(row: CollaborationEventRow): any {
    return {
        id: row.id,
        taskId: row.task_id,
        handoffId: row.handoff_id ?? undefined,
        eventType: row.event_type,
        actorRole: row.actor_role,
        timestamp: row.timestamp,
        title: row.title,
        details: row.details ?? undefined,
        metadata: p(row.metadata_json),
    }
}
