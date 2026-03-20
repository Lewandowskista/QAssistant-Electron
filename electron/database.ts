/**
 * database.ts — SQLite data layer for QAssistant
 *
 * Replaces the monolithic projects.json file with a proper relational schema.
 * Uses better-sqlite3 (synchronous API) which is safe in the Electron main process.
 *
 * All public functions mirror the shape previously exposed via read-projects-file /
 * write-projects-file IPC, so the renderer-side store needs minimal changes.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3')

type DB = ReturnType<typeof Database>
let db: DB | null = null

// ─── Schema version ──────────────────────────────────────────────────────────
const SCHEMA_VERSION = 1

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initDatabase(dbPath: string): void {
    db = new Database(dbPath)

    // WAL mode: reads don't block writes, important for Express API + renderer IPC coexistence
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    createSchema()
    runMigrations()
}

export function getDb(): DB {
    if (!db) throw new Error('Database not initialised — call initDatabase() first')
    return db
}

export function closeDatabase(): void {
    db?.close()
    db = null
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function createSchema(): void {
    const database = getDb()

    database.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER NOT NULL
        );

        -- Root project record
        CREATE TABLE IF NOT EXISTS projects (
            id          TEXT PRIMARY KEY,
            schema_version INTEGER,
            name        TEXT NOT NULL,
            color       TEXT NOT NULL DEFAULT '#6366f1',
            client_name TEXT,
            description TEXT,
            gemini_model TEXT,
            columns_json TEXT,          -- JSON: column definitions
            source_columns_json TEXT,   -- JSON: per-source column overrides
            quality_gates_json TEXT,    -- JSON: QualityGate[]
            report_templates_json TEXT, -- JSON: ReportTemplate[]
            report_schedules_json TEXT,
            report_history_json TEXT,
            custom_kpis_json TEXT,
            linear_connections_json TEXT, -- JSON: LinearConnection[]
            jira_connections_json TEXT,   -- JSON: JiraConnection[]
            linear_connection_legacy_json TEXT,
            jira_connection_legacy_json TEXT,
            created_at  INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
            updated_at  INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        );

        -- Tasks
        CREATE TABLE IF NOT EXISTS tasks (
            id                  TEXT PRIMARY KEY,
            project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title               TEXT NOT NULL,
            description         TEXT NOT NULL DEFAULT '',
            status              TEXT NOT NULL DEFAULT 'open',
            priority            TEXT NOT NULL DEFAULT 'medium',
            severity            TEXT,
            acceptance_criteria TEXT,
            version             TEXT,
            source_issue_id     TEXT,
            external_id         TEXT,
            ticket_url          TEXT,
            issue_type          TEXT,
            raw_description     TEXT,
            assignee            TEXT,
            labels              TEXT,
            components_json     TEXT,       -- JSON: string[]
            due_date            INTEGER,
            source              TEXT,
            connection_id       TEXT,
            attachment_urls_json TEXT,      -- JSON: string[]
            analysis_history_json TEXT,     -- JSON: AnalysisEntry[]
            linked_test_case_id TEXT,
            linked_defect_ids_json TEXT,    -- JSON: string[]
            collab_state        TEXT NOT NULL DEFAULT 'draft',
            active_handoff_id   TEXT,
            last_collab_updated_at INTEGER,
            reproducibility     TEXT,
            frequency           TEXT,
            affected_environments_json TEXT, -- JSON: string[]
            sprint_json         TEXT,        -- JSON: { name, isActive, startDate?, endDate? }
            created_at          INTEGER NOT NULL,
            updated_at          INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_collab_state ON tasks(collab_state);

        -- Notes
        CREATE TABLE IF NOT EXISTS notes (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title       TEXT NOT NULL DEFAULT '',
            content     TEXT NOT NULL DEFAULT '',
            updated_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id);

        -- Note attachments (sub-records of notes)
        CREATE TABLE IF NOT EXISTS note_attachments (
            id              TEXT PRIMARY KEY,
            note_id         TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            project_id      TEXT NOT NULL,
            file_name       TEXT NOT NULL,
            file_path       TEXT NOT NULL,
            mime_type       TEXT,
            file_size_bytes INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_note_attachments_note ON note_attachments(note_id);

        -- Test plans
        CREATE TABLE IF NOT EXISTS test_plans (
            id                  TEXT PRIMARY KEY,
            project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            display_id          TEXT NOT NULL,
            name                TEXT NOT NULL,
            description         TEXT NOT NULL DEFAULT '',
            is_archived         INTEGER NOT NULL DEFAULT 0,
            is_regression_suite INTEGER NOT NULL DEFAULT 0,
            source              TEXT,
            criticality         TEXT,
            created_at          INTEGER NOT NULL,
            updated_at          INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_test_plans_project ON test_plans(project_id);

        -- Test cases
        CREATE TABLE IF NOT EXISTS test_cases (
            id                  TEXT PRIMARY KEY,
            test_plan_id        TEXT NOT NULL REFERENCES test_plans(id) ON DELETE CASCADE,
            project_id          TEXT NOT NULL,
            display_id          TEXT NOT NULL,
            title               TEXT NOT NULL,
            pre_conditions      TEXT NOT NULL DEFAULT '',
            steps               TEXT NOT NULL DEFAULT '',
            test_data           TEXT NOT NULL DEFAULT '',
            expected_result     TEXT NOT NULL DEFAULT '',
            actual_result       TEXT NOT NULL DEFAULT '',
            priority            TEXT NOT NULL DEFAULT 'medium',
            status              TEXT NOT NULL DEFAULT 'not-run',
            sap_module          TEXT,
            source_issue_id     TEXT,
            tags_json           TEXT,       -- JSON: string[]
            components_json     TEXT,       -- JSON: string[]
            assigned_to         TEXT,
            estimated_minutes   INTEGER,
            test_type           TEXT,
            linked_defect_ids_json TEXT,    -- JSON: string[]
            change_log_json     TEXT,       -- JSON: ChangeLogEntry[]
            updated_at          INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_test_cases_plan ON test_cases(test_plan_id);
        CREATE INDEX IF NOT EXISTS idx_test_cases_project ON test_cases(project_id);

        -- Test run sessions
        CREATE TABLE IF NOT EXISTS test_run_sessions (
            id              TEXT PRIMARY KEY,
            project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            timestamp       INTEGER NOT NULL,
            is_archived     INTEGER NOT NULL DEFAULT 0,
            environment_id  TEXT,
            environment_name TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_project ON test_run_sessions(project_id);

        -- Test plan executions (within a session)
        CREATE TABLE IF NOT EXISTS test_plan_executions (
            id                      TEXT PRIMARY KEY,
            session_id              TEXT NOT NULL REFERENCES test_run_sessions(id) ON DELETE CASCADE,
            project_id              TEXT NOT NULL,
            test_plan_id            TEXT NOT NULL,
            snapshot_test_plan_name TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_plan_execs_session ON test_plan_executions(session_id);

        -- Test case executions (within a plan execution)
        CREATE TABLE IF NOT EXISTS test_case_executions (
            id                      TEXT PRIMARY KEY,
            plan_execution_id       TEXT NOT NULL REFERENCES test_plan_executions(id) ON DELETE CASCADE,
            session_id              TEXT NOT NULL,
            project_id              TEXT NOT NULL,
            test_case_id            TEXT NOT NULL,
            result                  TEXT NOT NULL DEFAULT 'not-run',
            actual_result           TEXT NOT NULL DEFAULT '',
            notes                   TEXT NOT NULL DEFAULT '',
            snapshot_title          TEXT NOT NULL DEFAULT '',
            snapshot_pre_conditions TEXT,
            snapshot_steps          TEXT,
            snapshot_test_data      TEXT,
            snapshot_expected_result TEXT,
            snapshot_priority       TEXT,
            duration_seconds        REAL,
            blocked_reason          TEXT,
            environment_id          TEXT,
            environment_name        TEXT,
            attachments_json        TEXT    -- JSON: Attachment[]
        );
        CREATE INDEX IF NOT EXISTS idx_case_execs_plan ON test_case_executions(plan_execution_id);
        CREATE INDEX IF NOT EXISTS idx_case_execs_session ON test_case_executions(session_id);

        -- Legacy test executions (flat, kept for backwards compat)
        CREATE TABLE IF NOT EXISTS test_executions_legacy (
            id                      TEXT PRIMARY KEY,
            project_id              TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            test_case_id            TEXT NOT NULL,
            test_plan_id            TEXT NOT NULL,
            result                  TEXT NOT NULL DEFAULT 'not-run',
            actual_result           TEXT NOT NULL DEFAULT '',
            notes                   TEXT NOT NULL DEFAULT '',
            executed_at             INTEGER NOT NULL,
            snapshot_title          TEXT NOT NULL DEFAULT '',
            snapshot_pre_conditions TEXT,
            snapshot_steps          TEXT,
            snapshot_test_data      TEXT,
            snapshot_expected_result TEXT,
            snapshot_priority       TEXT,
            duration_seconds        REAL,
            blocked_reason          TEXT,
            environment_id          TEXT,
            environment_name        TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_legacy_execs_project ON test_executions_legacy(project_id);

        -- Environments
        CREATE TABLE IF NOT EXISTS environments (
            id                TEXT PRIMARY KEY,
            project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name              TEXT NOT NULL,
            type              TEXT NOT NULL DEFAULT 'custom',
            color             TEXT NOT NULL DEFAULT '#6366f1',
            is_default        INTEGER NOT NULL DEFAULT 0,
            created_at        INTEGER NOT NULL,
            base_url          TEXT NOT NULL DEFAULT '',
            notes             TEXT NOT NULL DEFAULT '',
            health_check_url  TEXT NOT NULL DEFAULT '',
            hac_url           TEXT NOT NULL DEFAULT '',
            back_office_url   TEXT NOT NULL DEFAULT '',
            storefront_url    TEXT NOT NULL DEFAULT '',
            solr_admin_url    TEXT NOT NULL DEFAULT '',
            occ_base_path     TEXT NOT NULL DEFAULT '',
            ignore_ssl_errors INTEGER NOT NULL DEFAULT 0,
            username          TEXT,
            password          TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_environments_project ON environments(project_id);

        -- Project-level file attachments
        CREATE TABLE IF NOT EXISTS project_files (
            id              TEXT PRIMARY KEY,
            project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            file_name       TEXT NOT NULL,
            file_path       TEXT NOT NULL,
            mime_type       TEXT,
            file_size_bytes INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);

        -- Test data groups
        CREATE TABLE IF NOT EXISTS test_data_groups (
            id         TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name       TEXT NOT NULL,
            category   TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tdg_project ON test_data_groups(project_id);

        -- Test data entries
        CREATE TABLE IF NOT EXISTS test_data_entries (
            id          TEXT PRIMARY KEY,
            group_id    TEXT NOT NULL REFERENCES test_data_groups(id) ON DELETE CASCADE,
            project_id  TEXT NOT NULL,
            key         TEXT NOT NULL DEFAULT '',
            value       TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            tags        TEXT NOT NULL DEFAULT '',
            environment TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_tde_group ON test_data_entries(group_id);

        -- Checklists
        CREATE TABLE IF NOT EXISTS checklists (
            id         TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name       TEXT NOT NULL,
            category   TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_checklists_project ON checklists(project_id);

        -- Checklist items
        CREATE TABLE IF NOT EXISTS checklist_items (
            id           TEXT PRIMARY KEY,
            checklist_id TEXT NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
            project_id   TEXT NOT NULL,
            text         TEXT NOT NULL DEFAULT '',
            is_checked   INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_checklist_items_list ON checklist_items(checklist_id);

        -- API requests
        CREATE TABLE IF NOT EXISTS api_requests (
            id         TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name       TEXT NOT NULL,
            category   TEXT NOT NULL DEFAULT '',
            method     TEXT NOT NULL DEFAULT 'GET',
            url        TEXT NOT NULL DEFAULT '',
            headers    TEXT NOT NULL DEFAULT '',
            body       TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_api_requests_project ON api_requests(project_id);

        -- Runbooks
        CREATE TABLE IF NOT EXISTS runbooks (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            description TEXT,
            category    TEXT NOT NULL DEFAULT 'other',
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_runbooks_project ON runbooks(project_id);

        -- Runbook steps
        CREATE TABLE IF NOT EXISTS runbook_steps (
            id          TEXT PRIMARY KEY,
            runbook_id  TEXT NOT NULL REFERENCES runbooks(id) ON DELETE CASCADE,
            project_id  TEXT NOT NULL,
            title       TEXT NOT NULL,
            description TEXT,
            status      TEXT NOT NULL DEFAULT 'pending',
            ord         INTEGER NOT NULL DEFAULT 0,
            updated_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_runbook_steps_rb ON runbook_steps(runbook_id);

        -- Handoff packets
        CREATE TABLE IF NOT EXISTS handoff_packets (
            id                      TEXT PRIMARY KEY,
            project_id              TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            task_id                 TEXT NOT NULL,
            type                    TEXT NOT NULL DEFAULT 'bug_handoff',
            created_by_role         TEXT NOT NULL DEFAULT 'qa',
            created_at              INTEGER NOT NULL,
            updated_at              INTEGER NOT NULL,
            summary                 TEXT NOT NULL DEFAULT '',
            repro_steps             TEXT NOT NULL DEFAULT '',
            expected_result         TEXT NOT NULL DEFAULT '',
            actual_result           TEXT NOT NULL DEFAULT '',
            environment_id          TEXT,
            environment_name        TEXT,
            severity                TEXT,
            branch_name             TEXT,
            release_version         TEXT,
            reproducibility         TEXT,
            frequency               TEXT,
            linked_test_case_ids_json   TEXT,       -- JSON: string[]
            linked_execution_refs_json  TEXT,       -- JSON: HandoffExecutionRef[]
            linked_note_ids_json        TEXT,       -- JSON: string[]
            linked_file_ids_json        TEXT,       -- JSON: string[]
            linked_prs_json             TEXT,       -- JSON: LinkedPrRef[]
            developer_response      TEXT,
            qa_verification_notes   TEXT,
            resolution_summary      TEXT,
            acknowledged_at         INTEGER,
            completed_at            INTEGER,
            is_complete             INTEGER NOT NULL DEFAULT 0,
            missing_fields_json     TEXT            -- JSON: string[]
        );
        CREATE INDEX IF NOT EXISTS idx_handoffs_project ON handoff_packets(project_id);
        CREATE INDEX IF NOT EXISTS idx_handoffs_task ON handoff_packets(task_id);

        -- Artifact links
        CREATE TABLE IF NOT EXISTS artifact_links (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            source_type TEXT NOT NULL,
            source_id   TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id   TEXT NOT NULL,
            label       TEXT NOT NULL,
            created_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_artifact_links_project ON artifact_links(project_id);
        CREATE INDEX IF NOT EXISTS idx_artifact_links_source ON artifact_links(source_id);
        CREATE INDEX IF NOT EXISTS idx_artifact_links_target ON artifact_links(target_id);

        -- Collaboration events (append-only audit log)
        CREATE TABLE IF NOT EXISTS collaboration_events (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            task_id     TEXT NOT NULL,
            handoff_id  TEXT,
            event_type  TEXT NOT NULL,
            actor_role  TEXT NOT NULL,
            timestamp   INTEGER NOT NULL,
            title       TEXT NOT NULL DEFAULT '',
            details     TEXT,
            metadata_json TEXT      -- JSON: Record<string, any>
        );
        CREATE INDEX IF NOT EXISTS idx_collab_events_project ON collaboration_events(project_id);
        CREATE INDEX IF NOT EXISTS idx_collab_events_task ON collaboration_events(task_id);

        -- Exploratory sessions
        CREATE TABLE IF NOT EXISTS exploratory_sessions (
            id                  TEXT PRIMARY KEY,
            project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            charter             TEXT NOT NULL DEFAULT '',
            timebox             INTEGER NOT NULL DEFAULT 60,
            tester              TEXT NOT NULL DEFAULT '',
            started_at          INTEGER NOT NULL,
            completed_at        INTEGER,
            notes               TEXT NOT NULL DEFAULT '',
            discovered_bug_ids_json TEXT    -- JSON: string[]
        );
        CREATE INDEX IF NOT EXISTS idx_exp_sessions_project ON exploratory_sessions(project_id);

        -- Exploratory observations
        CREATE TABLE IF NOT EXISTS exploratory_observations (
            id          TEXT PRIMARY KEY,
            session_id  TEXT NOT NULL REFERENCES exploratory_sessions(id) ON DELETE CASCADE,
            project_id  TEXT NOT NULL,
            timestamp   INTEGER NOT NULL,
            type        TEXT NOT NULL DEFAULT 'observation',
            description TEXT NOT NULL DEFAULT '',
            severity    TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_exp_obs_session ON exploratory_observations(session_id);

        -- Accuracy test suites
        CREATE TABLE IF NOT EXISTS accuracy_test_suites (
            id                  TEXT PRIMARY KEY,
            project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name                TEXT NOT NULL,
            created_at          INTEGER NOT NULL,
            updated_at          INTEGER NOT NULL,
            high_accuracy_mode  INTEGER NOT NULL DEFAULT 0,
            reference_docs_json TEXT,   -- JSON: ReferenceDocument[]
            qa_pairs_json       TEXT,   -- JSON: AccuracyQaPair[]
            eval_runs_json      TEXT    -- JSON: AccuracyEvalRun[]
        );
        CREATE INDEX IF NOT EXISTS idx_accuracy_suites_project ON accuracy_test_suites(project_id);

        -- Pending sync mutations (persisted so they survive app restarts)
        CREATE TABLE IF NOT EXISTS sync_pending_queue (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            table_name   TEXT NOT NULL,
            op           TEXT NOT NULL,
            row_id       TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            retry_count  INTEGER NOT NULL DEFAULT 0,
            enqueued_at  INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_dedup ON sync_pending_queue(table_name, row_id);
    `)
}

// ─── Migrations ───────────────────────────────────────────────────────────────

function runMigrations(): void {
    const database = getDb()
    const row = database.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined
    const currentVersion = row?.version ?? 0

    if (currentVersion < SCHEMA_VERSION) {
        // Future migrations go here as: if (currentVersion < N) { ... }
        database.prepare('DELETE FROM schema_version').run()
        database.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION)
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function j(v: unknown): string | null {
    if (v === undefined || v === null) return null
    return JSON.stringify(v)
}

function p<T>(v: string | null | undefined): T | undefined {
    if (v === null || v === undefined) return undefined
    try { return JSON.parse(v) as T } catch { return undefined }
}

function bool(v: number | null | undefined): boolean {
    return v === 1
}

// ─── Project row ↔ Project object ─────────────────────────────────────────────

type ProjectRow = {
    id: string
    schema_version: number | null
    name: string
    color: string
    client_name: string | null
    description: string | null
    gemini_model: string | null
    columns_json: string | null
    source_columns_json: string | null
    quality_gates_json: string | null
    report_templates_json: string | null
    report_schedules_json: string | null
    report_history_json: string | null
    custom_kpis_json: string | null
    linear_connections_json: string | null
    jira_connections_json: string | null
    linear_connection_legacy_json: string | null
    jira_connection_legacy_json: string | null
}

function rowToProject(row: ProjectRow): any {
    return {
        id: row.id,
        schemaVersion: row.schema_version,
        name: row.name,
        color: row.color,
        clientName: row.client_name ?? undefined,
        description: row.description ?? undefined,
        geminiModel: row.gemini_model ?? undefined,
        columns: p(row.columns_json) ?? [],
        sourceColumns: p(row.source_columns_json),
        qualityGates: p(row.quality_gates_json) ?? [],
        reportTemplates: p(row.report_templates_json) ?? [],
        reportSchedules: p(row.report_schedules_json) ?? [],
        reportHistory: p(row.report_history_json) ?? [],
        customKpis: p(row.custom_kpis_json) ?? [],
        linearConnections: p(row.linear_connections_json) ?? [],
        jiraConnections: p(row.jira_connections_json) ?? [],
        linearConnection: p(row.linear_connection_legacy_json),
        jiraConnection: p(row.jira_connection_legacy_json),
    }
}

// ─── Task row ↔ Task object ───────────────────────────────────────────────────

type TaskRow = {
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

function rowToTask(row: TaskRow): any {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        severity: row.severity ?? undefined,
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
        source: row.source ?? undefined,
        connectionId: row.connection_id ?? undefined,
        attachmentUrls: p<string[]>(row.attachment_urls_json) ?? undefined,
        analysisHistory: p(row.analysis_history_json) ?? [],
        linkedTestCaseId: row.linked_test_case_id ?? undefined,
        linkedDefectIds: p<string[]>(row.linked_defect_ids_json) ?? [],
        collabState: row.collab_state,
        activeHandoffId: row.active_handoff_id ?? undefined,
        lastCollabUpdatedAt: row.last_collab_updated_at ?? undefined,
        reproducibility: row.reproducibility ?? undefined,
        frequency: row.frequency ?? undefined,
        affectedEnvironments: p<string[]>(row.affected_environments_json),
        sprint: p(row.sprint_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

// ─── Read all projects (full denormalised document, mirrors old JSON shape) ────

export function getAllProjects(): any[] {
    const database = getDb()

    const projectRows = database.prepare('SELECT * FROM projects ORDER BY rowid').all() as ProjectRow[]

    return projectRows.map(projectRow => {
        const proj = rowToProject(projectRow)
        const pid = projectRow.id

        // tasks
        const taskRows = database.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY rowid').all(pid) as TaskRow[]
        proj.tasks = taskRows.map(rowToTask)

        // notes + note attachments
        const noteRows = database.prepare('SELECT * FROM notes WHERE project_id = ? ORDER BY rowid').all(pid) as any[]
        proj.notes = noteRows.map((n: any) => {
            const attachRows = database.prepare('SELECT * FROM note_attachments WHERE note_id = ?').all(n.id) as any[]
            return {
                id: n.id,
                title: n.title,
                content: n.content,
                updatedAt: n.updated_at,
                attachments: attachRows.map((a: any) => ({
                    id: a.id, fileName: a.file_name, filePath: a.file_path,
                    mimeType: a.mime_type ?? undefined, fileSizeBytes: a.file_size_bytes ?? undefined
                }))
            }
        })

        // test plans + test cases
        const planRows = database.prepare('SELECT * FROM test_plans WHERE project_id = ? ORDER BY rowid').all(pid) as any[]
        proj.testPlans = planRows.map((plan: any) => {
            const caseRows = database.prepare('SELECT * FROM test_cases WHERE test_plan_id = ? ORDER BY rowid').all(plan.id) as any[]
            return {
                id: plan.id,
                displayId: plan.display_id,
                name: plan.name,
                description: plan.description,
                isArchived: bool(plan.is_archived),
                isRegressionSuite: bool(plan.is_regression_suite),
                source: plan.source ?? undefined,
                criticality: plan.criticality ?? undefined,
                createdAt: plan.created_at,
                updatedAt: plan.updated_at,
                testCases: caseRows.map((tc: any) => ({
                    id: tc.id,
                    displayId: tc.display_id,
                    title: tc.title,
                    preConditions: tc.pre_conditions,
                    steps: tc.steps,
                    testData: tc.test_data,
                    expectedResult: tc.expected_result,
                    actualResult: tc.actual_result,
                    priority: tc.priority,
                    status: tc.status,
                    sapModule: tc.sap_module ?? undefined,
                    sourceIssueId: tc.source_issue_id ?? undefined,
                    tags: p<string[]>(tc.tags_json) ?? undefined,
                    components: p<string[]>(tc.components_json) ?? undefined,
                    assignedTo: tc.assigned_to ?? undefined,
                    estimatedMinutes: tc.estimated_minutes ?? undefined,
                    testType: tc.test_type ?? undefined,
                    linkedDefectIds: p<string[]>(tc.linked_defect_ids_json) ?? undefined,
                    changeLog: p(tc.change_log_json) ?? undefined,
                    updatedAt: tc.updated_at,
                }))
            }
        })

        // test run sessions + plan executions + case executions
        const sessionRows = database.prepare('SELECT * FROM test_run_sessions WHERE project_id = ? ORDER BY rowid').all(pid) as any[]
        proj.testRunSessions = sessionRows.map((sess: any) => {
            const planExecRows = database.prepare('SELECT * FROM test_plan_executions WHERE session_id = ? ORDER BY rowid').all(sess.id) as any[]
            return {
                id: sess.id,
                timestamp: sess.timestamp,
                isArchived: bool(sess.is_archived),
                environmentId: sess.environment_id ?? undefined,
                environmentName: sess.environment_name ?? undefined,
                planExecutions: planExecRows.map((pe: any) => {
                    const caseExecRows = database.prepare('SELECT * FROM test_case_executions WHERE plan_execution_id = ? ORDER BY rowid').all(pe.id) as any[]
                    return {
                        id: pe.id,
                        testPlanId: pe.test_plan_id,
                        snapshotTestPlanName: pe.snapshot_test_plan_name,
                        caseExecutions: caseExecRows.map((ce: any) => ({
                            id: ce.id,
                            testCaseId: ce.test_case_id,
                            result: ce.result,
                            actualResult: ce.actual_result,
                            notes: ce.notes,
                            snapshotTestCaseTitle: ce.snapshot_title,
                            snapshotPreConditions: ce.snapshot_pre_conditions ?? undefined,
                            snapshotSteps: ce.snapshot_steps ?? undefined,
                            snapshotTestData: ce.snapshot_test_data ?? undefined,
                            snapshotExpectedResult: ce.snapshot_expected_result ?? undefined,
                            snapshotPriority: ce.snapshot_priority ?? undefined,
                            durationSeconds: ce.duration_seconds ?? undefined,
                            blockedReason: ce.blocked_reason ?? undefined,
                            environmentId: ce.environment_id ?? undefined,
                            environmentName: ce.environment_name ?? undefined,
                            attachments: p(ce.attachments_json) ?? undefined,
                        }))
                    }
                })
            }
        })

        // legacy test executions
        const legacyRows = database.prepare('SELECT * FROM test_executions_legacy WHERE project_id = ? ORDER BY rowid').all(pid) as any[]
        proj.testExecutions = legacyRows.map((te: any) => ({
            id: te.id,
            testCaseId: te.test_case_id,
            testPlanId: te.test_plan_id,
            result: te.result,
            actualResult: te.actual_result,
            notes: te.notes,
            executedAt: te.executed_at,
            snapshotTestCaseTitle: te.snapshot_title,
            snapshotPreConditions: te.snapshot_pre_conditions ?? undefined,
            snapshotSteps: te.snapshot_steps ?? undefined,
            snapshotTestData: te.snapshot_test_data ?? undefined,
            snapshotExpectedResult: te.snapshot_expected_result ?? undefined,
            snapshotPriority: te.snapshot_priority ?? undefined,
            durationSeconds: te.duration_seconds ?? undefined,
            blockedReason: te.blocked_reason ?? undefined,
            environmentId: te.environment_id ?? undefined,
            environmentName: te.environment_name ?? undefined,
        }))

        // environments
        const envRows = database.prepare('SELECT * FROM environments WHERE project_id = ? ORDER BY rowid').all(pid) as any[]
        proj.environments = envRows.map((e: any) => ({
            id: e.id, name: e.name, type: e.type, color: e.color,
            isDefault: bool(e.is_default), createdAt: e.created_at,
            baseUrl: e.base_url, notes: e.notes,
            healthCheckUrl: e.health_check_url, hacUrl: e.hac_url,
            backOfficeUrl: e.back_office_url, storefrontUrl: e.storefront_url,
            solrAdminUrl: e.solr_admin_url, occBasePath: e.occ_base_path,
            ignoreSslErrors: bool(e.ignore_ssl_errors),
            username: e.username ?? undefined, password: e.password ?? undefined,
        }))

        // project files
        const fileRows = database.prepare('SELECT * FROM project_files WHERE project_id = ? ORDER BY rowid').all(pid) as any[]
        proj.files = fileRows.map((f: any) => ({
            id: f.id, fileName: f.file_name, filePath: f.file_path,
            mimeType: f.mime_type ?? undefined, fileSizeBytes: f.file_size_bytes ?? undefined
        }))

        // test data groups + entries
        const tdgRows = database.prepare('SELECT * FROM test_data_groups WHERE project_id = ? ORDER BY rowid').all(pid) as any[]
        proj.testDataGroups = tdgRows.map((g: any) => {
            const entryRows = database.prepare('SELECT * FROM test_data_entries WHERE group_id = ? ORDER BY rowid').all(g.id) as any[]
            return {
                id: g.id, name: g.name, category: g.category, createdAt: g.created_at,
                entries: entryRows.map((e: any) => ({
                    id: e.id, key: e.key, value: e.value,
                    description: e.description, tags: e.tags, environment: e.environment
                }))
            }
        })

        // checklists + items
        const checklistRows = database.prepare('SELECT * FROM checklists WHERE project_id = ? ORDER BY rowid').all(pid) as any[]
        proj.checklists = checklistRows.map((cl: any) => {
            const itemRows = database.prepare('SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY rowid').all(cl.id) as any[]
            return {
                id: cl.id, name: cl.name, category: cl.category,
                createdAt: cl.created_at, updatedAt: cl.updated_at,
                items: itemRows.map((i: any) => ({
                    id: i.id, text: i.text, isChecked: bool(i.is_checked)
                }))
            }
        })

        // api requests
        const apiRows = database.prepare('SELECT * FROM api_requests WHERE project_id = ? ORDER BY rowid').all(pid) as any[]
        proj.apiRequests = apiRows.map((r: any) => ({
            id: r.id, name: r.name, category: r.category, method: r.method,
            url: r.url, headers: r.headers, body: r.body,
            createdAt: r.created_at, updatedAt: r.updated_at,
        }))

        // runbooks + steps
        const runbookRows = database.prepare('SELECT * FROM runbooks WHERE project_id = ? ORDER BY rowid').all(pid) as any[]
        proj.runbooks = runbookRows.map((rb: any) => {
            const stepRows = database.prepare('SELECT * FROM runbook_steps WHERE runbook_id = ? ORDER BY ord').all(rb.id) as any[]
            return {
                id: rb.id, name: rb.name, description: rb.description ?? undefined,
                category: rb.category, createdAt: rb.created_at, updatedAt: rb.updated_at,
                steps: stepRows.map((s: any) => ({
                    id: s.id, title: s.title, description: s.description ?? undefined,
                    status: s.status, order: s.ord, updatedAt: s.updated_at,
                }))
            }
        })

        // handoff packets
        const handoffRows = database.prepare('SELECT * FROM handoff_packets WHERE project_id = ? ORDER BY rowid').all(pid) as any[]
        proj.handoffPackets = handoffRows.map((h: any) => ({
            id: h.id, taskId: h.task_id, type: h.type,
            createdByRole: h.created_by_role, createdAt: h.created_at, updatedAt: h.updated_at,
            summary: h.summary, reproSteps: h.repro_steps,
            expectedResult: h.expected_result, actualResult: h.actual_result,
            environmentId: h.environment_id ?? undefined, environmentName: h.environment_name ?? undefined,
            severity: h.severity ?? undefined, branchName: h.branch_name ?? undefined,
            releaseVersion: h.release_version ?? undefined,
            reproducibility: h.reproducibility ?? undefined, frequency: h.frequency ?? undefined,
            linkedTestCaseIds: p<string[]>(h.linked_test_case_ids_json) ?? [],
            linkedExecutionRefs: p(h.linked_execution_refs_json) ?? [],
            linkedNoteIds: p<string[]>(h.linked_note_ids_json) ?? [],
            linkedFileIds: p<string[]>(h.linked_file_ids_json) ?? [],
            linkedPrs: p(h.linked_prs_json) ?? [],
            developerResponse: h.developer_response ?? undefined,
            qaVerificationNotes: h.qa_verification_notes ?? undefined,
            resolutionSummary: h.resolution_summary ?? undefined,
            acknowledgedAt: h.acknowledged_at ?? undefined,
            completedAt: h.completed_at ?? undefined,
            isComplete: bool(h.is_complete),
            missingFields: p<string[]>(h.missing_fields_json) ?? undefined,
        }))

        // artifact links
        const linkRows = database.prepare('SELECT * FROM artifact_links WHERE project_id = ? ORDER BY rowid').all(pid) as any[]
        proj.artifactLinks = linkRows.map((l: any) => ({
            id: l.id, sourceType: l.source_type, sourceId: l.source_id,
            targetType: l.target_type, targetId: l.target_id,
            label: l.label, createdAt: l.created_at,
        }))

        // collaboration events
        const eventRows = database.prepare('SELECT * FROM collaboration_events WHERE project_id = ? ORDER BY timestamp').all(pid) as any[]
        proj.collaborationEvents = eventRows.map((e: any) => ({
            id: e.id, taskId: e.task_id, handoffId: e.handoff_id ?? undefined,
            eventType: e.event_type, actorRole: e.actor_role, timestamp: e.timestamp,
            title: e.title, details: e.details ?? undefined,
            metadata: p(e.metadata_json),
        }))

        // exploratory sessions + observations
        const expRows = database.prepare('SELECT * FROM exploratory_sessions WHERE project_id = ? ORDER BY rowid').all(pid) as any[]
        proj.exploratorySessions = expRows.map((sess: any) => {
            const obsRows = database.prepare('SELECT * FROM exploratory_observations WHERE session_id = ? ORDER BY timestamp').all(sess.id) as any[]
            return {
                id: sess.id, charter: sess.charter, timebox: sess.timebox,
                tester: sess.tester, startedAt: sess.started_at,
                completedAt: sess.completed_at ?? undefined, notes: sess.notes,
                discoveredBugIds: p<string[]>(sess.discovered_bug_ids_json) ?? [],
                observations: obsRows.map((o: any) => ({
                    id: o.id, timestamp: o.timestamp, type: o.type,
                    description: o.description, severity: o.severity ?? undefined,
                }))
            }
        })

        // accuracy test suites (stored as JSON blobs — they are large and rarely queried)
        const accRows = database.prepare('SELECT * FROM accuracy_test_suites WHERE project_id = ? ORDER BY rowid').all(pid) as any[]
        proj.accuracyTestSuites = accRows.map((s: any) => ({
            id: s.id, name: s.name, createdAt: s.created_at, updatedAt: s.updated_at,
            highAccuracyMode: bool(s.high_accuracy_mode),
            referenceDocuments: p(s.reference_docs_json) ?? [],
            qaPairs: p(s.qa_pairs_json) ?? [],
            evalRuns: p(s.eval_runs_json) ?? [],
        }))

        return proj
    })
}

// ─── Write all projects (full upsert, mirrors old write-projects-file) ─────────
// Uses a single transaction for atomicity.

export function saveAllProjects(projects: any[]): void {
    const database = getDb()
    const now = Date.now()

    const upsertProject = database.prepare(`
        INSERT INTO projects (id, schema_version, name, color, client_name, description, gemini_model,
            columns_json, source_columns_json, quality_gates_json, report_templates_json,
            report_schedules_json, report_history_json, custom_kpis_json,
            linear_connections_json, jira_connections_json,
            linear_connection_legacy_json, jira_connection_legacy_json,
            created_at, updated_at)
        VALUES (@id, @schema_version, @name, @color, @client_name, @description, @gemini_model,
            @columns_json, @source_columns_json, @quality_gates_json, @report_templates_json,
            @report_schedules_json, @report_history_json, @custom_kpis_json,
            @linear_connections_json, @jira_connections_json,
            @linear_connection_legacy_json, @jira_connection_legacy_json,
            @created_at, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
            schema_version = excluded.schema_version,
            name = excluded.name, color = excluded.color,
            client_name = excluded.client_name, description = excluded.description,
            gemini_model = excluded.gemini_model,
            columns_json = excluded.columns_json,
            source_columns_json = excluded.source_columns_json,
            quality_gates_json = excluded.quality_gates_json,
            report_templates_json = excluded.report_templates_json,
            report_schedules_json = excluded.report_schedules_json,
            report_history_json = excluded.report_history_json,
            custom_kpis_json = excluded.custom_kpis_json,
            linear_connections_json = excluded.linear_connections_json,
            jira_connections_json = excluded.jira_connections_json,
            linear_connection_legacy_json = excluded.linear_connection_legacy_json,
            jira_connection_legacy_json = excluded.jira_connection_legacy_json,
            updated_at = excluded.updated_at
    `)

    const insertTask = database.prepare(`
        INSERT OR REPLACE INTO tasks (id, project_id, title, description, status, priority, severity,
            acceptance_criteria, version, source_issue_id, external_id, ticket_url, issue_type,
            raw_description, assignee, labels, components_json, due_date, source, connection_id,
            attachment_urls_json, analysis_history_json, linked_test_case_id, linked_defect_ids_json,
            collab_state, active_handoff_id, last_collab_updated_at, reproducibility, frequency,
            affected_environments_json, sprint_json, created_at, updated_at)
        VALUES (@id, @project_id, @title, @description, @status, @priority, @severity,
            @acceptance_criteria, @version, @source_issue_id, @external_id, @ticket_url, @issue_type,
            @raw_description, @assignee, @labels, @components_json, @due_date, @source, @connection_id,
            @attachment_urls_json, @analysis_history_json, @linked_test_case_id, @linked_defect_ids_json,
            @collab_state, @active_handoff_id, @last_collab_updated_at, @reproducibility, @frequency,
            @affected_environments_json, @sprint_json, @created_at, @updated_at)
    `)

    const insertNote = database.prepare(`
        INSERT OR REPLACE INTO notes (id, project_id, title, content, updated_at)
        VALUES (@id, @project_id, @title, @content, @updated_at)
    `)
    const insertNoteAttachment = database.prepare(`
        INSERT OR REPLACE INTO note_attachments (id, note_id, project_id, file_name, file_path, mime_type, file_size_bytes)
        VALUES (@id, @note_id, @project_id, @file_name, @file_path, @mime_type, @file_size_bytes)
    `)
    const deleteNoteAttachments = database.prepare('DELETE FROM note_attachments WHERE note_id = @note_id')

    const insertPlan = database.prepare(`
        INSERT OR REPLACE INTO test_plans (id, project_id, display_id, name, description, is_archived,
            is_regression_suite, source, criticality, created_at, updated_at)
        VALUES (@id, @project_id, @display_id, @name, @description, @is_archived,
            @is_regression_suite, @source, @criticality, @created_at, @updated_at)
    `)
    const insertCase = database.prepare(`
        INSERT OR REPLACE INTO test_cases (id, test_plan_id, project_id, display_id, title,
            pre_conditions, steps, test_data, expected_result, actual_result, priority, status,
            sap_module, source_issue_id, tags_json, components_json, assigned_to,
            estimated_minutes, test_type, linked_defect_ids_json, change_log_json, updated_at)
        VALUES (@id, @test_plan_id, @project_id, @display_id, @title,
            @pre_conditions, @steps, @test_data, @expected_result, @actual_result, @priority, @status,
            @sap_module, @source_issue_id, @tags_json, @components_json, @assigned_to,
            @estimated_minutes, @test_type, @linked_defect_ids_json, @change_log_json, @updated_at)
    `)
    const deleteCasesByPlan = database.prepare('DELETE FROM test_cases WHERE test_plan_id = @plan_id AND project_id = @project_id')

    const insertSession = database.prepare(`
        INSERT OR REPLACE INTO test_run_sessions (id, project_id, timestamp, is_archived, environment_id, environment_name)
        VALUES (@id, @project_id, @timestamp, @is_archived, @environment_id, @environment_name)
    `)
    const insertPlanExec = database.prepare(`
        INSERT OR REPLACE INTO test_plan_executions (id, session_id, project_id, test_plan_id, snapshot_test_plan_name)
        VALUES (@id, @session_id, @project_id, @test_plan_id, @snapshot_test_plan_name)
    `)
    const insertCaseExec = database.prepare(`
        INSERT OR REPLACE INTO test_case_executions (id, plan_execution_id, session_id, project_id, test_case_id,
            result, actual_result, notes, snapshot_title, snapshot_pre_conditions, snapshot_steps,
            snapshot_test_data, snapshot_expected_result, snapshot_priority, duration_seconds,
            blocked_reason, environment_id, environment_name, attachments_json)
        VALUES (@id, @plan_execution_id, @session_id, @project_id, @test_case_id,
            @result, @actual_result, @notes, @snapshot_title, @snapshot_pre_conditions, @snapshot_steps,
            @snapshot_test_data, @snapshot_expected_result, @snapshot_priority, @duration_seconds,
            @blocked_reason, @environment_id, @environment_name, @attachments_json)
    `)
    const deleteCaseExecsByPlanExec = database.prepare('DELETE FROM test_case_executions WHERE plan_execution_id = @plan_exec_id')
    const deletePlanExecsBySession = database.prepare('DELETE FROM test_plan_executions WHERE session_id = @session_id')

    const insertLegacyExec = database.prepare(`
        INSERT OR REPLACE INTO test_executions_legacy (id, project_id, test_case_id, test_plan_id, result,
            actual_result, notes, executed_at, snapshot_title, snapshot_pre_conditions, snapshot_steps,
            snapshot_test_data, snapshot_expected_result, snapshot_priority, duration_seconds,
            blocked_reason, environment_id, environment_name)
        VALUES (@id, @project_id, @test_case_id, @test_plan_id, @result,
            @actual_result, @notes, @executed_at, @snapshot_title, @snapshot_pre_conditions, @snapshot_steps,
            @snapshot_test_data, @snapshot_expected_result, @snapshot_priority, @duration_seconds,
            @blocked_reason, @environment_id, @environment_name)
    `)

    const insertEnv = database.prepare(`
        INSERT OR REPLACE INTO environments (id, project_id, name, type, color, is_default, created_at,
            base_url, notes, health_check_url, hac_url, back_office_url, storefront_url,
            solr_admin_url, occ_base_path, ignore_ssl_errors, username, password)
        VALUES (@id, @project_id, @name, @type, @color, @is_default, @created_at,
            @base_url, @notes, @health_check_url, @hac_url, @back_office_url, @storefront_url,
            @solr_admin_url, @occ_base_path, @ignore_ssl_errors, @username, @password)
    `)

    const insertFile = database.prepare(`
        INSERT OR REPLACE INTO project_files (id, project_id, file_name, file_path, mime_type, file_size_bytes)
        VALUES (@id, @project_id, @file_name, @file_path, @mime_type, @file_size_bytes)
    `)

    const insertTdg = database.prepare(`
        INSERT OR REPLACE INTO test_data_groups (id, project_id, name, category, created_at)
        VALUES (@id, @project_id, @name, @category, @created_at)
    `)
    const insertTde = database.prepare(`
        INSERT OR REPLACE INTO test_data_entries (id, group_id, project_id, key, value, description, tags, environment)
        VALUES (@id, @group_id, @project_id, @key, @value, @description, @tags, @environment)
    `)
    const deleteTdeByGroup = database.prepare('DELETE FROM test_data_entries WHERE group_id = @group_id')

    const insertChecklist = database.prepare(`
        INSERT OR REPLACE INTO checklists (id, project_id, name, category, created_at, updated_at)
        VALUES (@id, @project_id, @name, @category, @created_at, @updated_at)
    `)
    const insertChecklistItem = database.prepare(`
        INSERT OR REPLACE INTO checklist_items (id, checklist_id, project_id, text, is_checked)
        VALUES (@id, @checklist_id, @project_id, @text, @is_checked)
    `)
    const deleteChecklistItems = database.prepare('DELETE FROM checklist_items WHERE checklist_id = @checklist_id')

    const insertApiReq = database.prepare(`
        INSERT OR REPLACE INTO api_requests (id, project_id, name, category, method, url, headers, body, created_at, updated_at)
        VALUES (@id, @project_id, @name, @category, @method, @url, @headers, @body, @created_at, @updated_at)
    `)

    const insertRunbook = database.prepare(`
        INSERT OR REPLACE INTO runbooks (id, project_id, name, description, category, created_at, updated_at)
        VALUES (@id, @project_id, @name, @description, @category, @created_at, @updated_at)
    `)
    const insertRunbookStep = database.prepare(`
        INSERT OR REPLACE INTO runbook_steps (id, runbook_id, project_id, title, description, status, ord, updated_at)
        VALUES (@id, @runbook_id, @project_id, @title, @description, @status, @ord, @updated_at)
    `)
    const deleteStepsByRunbook = database.prepare('DELETE FROM runbook_steps WHERE runbook_id = @runbook_id')

    const insertHandoff = database.prepare(`
        INSERT OR REPLACE INTO handoff_packets (id, project_id, task_id, type, created_by_role, created_at, updated_at,
            summary, repro_steps, expected_result, actual_result, environment_id, environment_name,
            severity, branch_name, release_version, reproducibility, frequency,
            linked_test_case_ids_json, linked_execution_refs_json, linked_note_ids_json, linked_file_ids_json, linked_prs_json,
            developer_response, qa_verification_notes, resolution_summary,
            acknowledged_at, completed_at, is_complete, missing_fields_json)
        VALUES (@id, @project_id, @task_id, @type, @created_by_role, @created_at, @updated_at,
            @summary, @repro_steps, @expected_result, @actual_result, @environment_id, @environment_name,
            @severity, @branch_name, @release_version, @reproducibility, @frequency,
            @linked_test_case_ids_json, @linked_execution_refs_json, @linked_note_ids_json, @linked_file_ids_json, @linked_prs_json,
            @developer_response, @qa_verification_notes, @resolution_summary,
            @acknowledged_at, @completed_at, @is_complete, @missing_fields_json)
    `)

    const insertLink = database.prepare(`
        INSERT OR REPLACE INTO artifact_links (id, project_id, source_type, source_id, target_type, target_id, label, created_at)
        VALUES (@id, @project_id, @source_type, @source_id, @target_type, @target_id, @label, @created_at)
    `)

    const insertEvent = database.prepare(`
        INSERT OR REPLACE INTO collaboration_events (id, project_id, task_id, handoff_id, event_type, actor_role, timestamp, title, details, metadata_json)
        VALUES (@id, @project_id, @task_id, @handoff_id, @event_type, @actor_role, @timestamp, @title, @details, @metadata_json)
    `)

    const insertExpSession = database.prepare(`
        INSERT OR REPLACE INTO exploratory_sessions (id, project_id, charter, timebox, tester, started_at, completed_at, notes, discovered_bug_ids_json)
        VALUES (@id, @project_id, @charter, @timebox, @tester, @started_at, @completed_at, @notes, @discovered_bug_ids_json)
    `)
    const insertExpObs = database.prepare(`
        INSERT OR REPLACE INTO exploratory_observations (id, session_id, project_id, timestamp, type, description, severity)
        VALUES (@id, @session_id, @project_id, @timestamp, @type, @description, @severity)
    `)
    const deleteObsBySession = database.prepare('DELETE FROM exploratory_observations WHERE session_id = @session_id')

    const insertAccSuite = database.prepare(`
        INSERT OR REPLACE INTO accuracy_test_suites (id, project_id, name, created_at, updated_at, high_accuracy_mode, reference_docs_json, qa_pairs_json, eval_runs_json)
        VALUES (@id, @project_id, @name, @created_at, @updated_at, @high_accuracy_mode, @reference_docs_json, @qa_pairs_json, @eval_runs_json)
    `)

    // Collect all incoming project IDs to prune deleted ones after the upsert
    const incomingProjectIds = new Set<string>(projects.map((p: any) => p.id))
    const existingIds = (database.prepare('SELECT id FROM projects').all() as { id: string }[]).map(r => r.id)

    const deleteProjectById = database.prepare('DELETE FROM projects WHERE id = ?')

    const runAll = database.transaction(() => {
        // Remove projects that are no longer in the array
        for (const existingId of existingIds) {
            if (!incomingProjectIds.has(existingId)) {
                deleteProjectById.run(existingId)
            }
        }

        for (const proj of projects) {
            const pid = proj.id

            upsertProject.run({
                id: pid,
                schema_version: proj.schemaVersion ?? null,
                name: proj.name,
                color: proj.color ?? '#6366f1',
                client_name: proj.clientName ?? null,
                description: proj.description ?? null,
                gemini_model: proj.geminiModel ?? null,
                columns_json: j(proj.columns),
                source_columns_json: j(proj.sourceColumns),
                quality_gates_json: j(proj.qualityGates),
                report_templates_json: j(proj.reportTemplates),
                report_schedules_json: j(proj.reportSchedules),
                report_history_json: j(proj.reportHistory),
                custom_kpis_json: j(proj.customKpis),
                linear_connections_json: j(proj.linearConnections),
                jira_connections_json: j(proj.jiraConnections),
                linear_connection_legacy_json: j(proj.linearConnection),
                jira_connection_legacy_json: j(proj.jiraConnection),
                created_at: now,
                updated_at: now,
            })

            // tasks
            const incomingTaskIds = new Set<string>((proj.tasks ?? []).map((t: any) => t.id))
            const existingTaskIds = (database.prepare('SELECT id FROM tasks WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const tid of existingTaskIds) {
                if (!incomingTaskIds.has(tid)) database.prepare('DELETE FROM tasks WHERE id = ?').run(tid)
            }
            for (const task of proj.tasks ?? []) {
                insertTask.run({
                    id: task.id, project_id: pid,
                    title: task.title, description: task.description ?? '',
                    status: task.status, priority: task.priority,
                    severity: task.severity ?? null,
                    acceptance_criteria: task.acceptanceCriteria ?? null,
                    version: task.version ?? null,
                    source_issue_id: task.sourceIssueId ?? null,
                    external_id: task.externalId ?? null,
                    ticket_url: task.ticketUrl ?? null,
                    issue_type: task.issueType ?? null,
                    raw_description: task.rawDescription ?? null,
                    assignee: task.assignee ?? null,
                    labels: task.labels ?? null,
                    components_json: j(task.components),
                    due_date: task.dueDate ?? null,
                    source: task.source ?? null,
                    connection_id: task.connectionId ?? null,
                    attachment_urls_json: j(task.attachmentUrls),
                    analysis_history_json: j(task.analysisHistory),
                    linked_test_case_id: task.linkedTestCaseId ?? null,
                    linked_defect_ids_json: j(task.linkedDefectIds),
                    collab_state: task.collabState ?? 'draft',
                    active_handoff_id: task.activeHandoffId ?? null,
                    last_collab_updated_at: task.lastCollabUpdatedAt ?? null,
                    reproducibility: task.reproducibility ?? null,
                    frequency: task.frequency ?? null,
                    affected_environments_json: j(task.affectedEnvironments),
                    sprint_json: j(task.sprint),
                    created_at: task.createdAt, updated_at: task.updatedAt,
                })
            }

            // notes
            const incomingNoteIds = new Set<string>((proj.notes ?? []).map((n: any) => n.id))
            const existingNoteIds = (database.prepare('SELECT id FROM notes WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const nid of existingNoteIds) {
                if (!incomingNoteIds.has(nid)) database.prepare('DELETE FROM notes WHERE id = ?').run(nid)
            }
            for (const note of proj.notes ?? []) {
                insertNote.run({ id: note.id, project_id: pid, title: note.title ?? '', content: note.content ?? '', updated_at: note.updatedAt })
                deleteNoteAttachments.run({ note_id: note.id })
                for (const att of note.attachments ?? []) {
                    insertNoteAttachment.run({ id: att.id, note_id: note.id, project_id: pid, file_name: att.fileName, file_path: att.filePath, mime_type: att.mimeType ?? null, file_size_bytes: att.fileSizeBytes ?? null })
                }
            }

            // test plans + cases
            const incomingPlanIds = new Set<string>((proj.testPlans ?? []).map((tp: any) => tp.id))
            const existingPlanIds = (database.prepare('SELECT id FROM test_plans WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const tpid of existingPlanIds) {
                if (!incomingPlanIds.has(tpid)) database.prepare('DELETE FROM test_plans WHERE id = ?').run(tpid)
            }
            for (const plan of proj.testPlans ?? []) {
                insertPlan.run({
                    id: plan.id, project_id: pid, display_id: plan.displayId ?? '',
                    name: plan.name, description: plan.description ?? '',
                    is_archived: plan.isArchived ? 1 : 0,
                    is_regression_suite: plan.isRegressionSuite ? 1 : 0,
                    source: plan.source ?? null, criticality: plan.criticality ?? null,
                    created_at: plan.createdAt, updated_at: plan.updatedAt,
                })
                deleteCasesByPlan.run({ plan_id: plan.id, project_id: pid })
                for (const tc of plan.testCases ?? []) {
                    insertCase.run({
                        id: tc.id, test_plan_id: plan.id, project_id: pid,
                        display_id: tc.displayId ?? '', title: tc.title,
                        pre_conditions: tc.preConditions ?? '', steps: tc.steps ?? '',
                        test_data: tc.testData ?? '', expected_result: tc.expectedResult ?? '',
                        actual_result: tc.actualResult ?? '', priority: tc.priority ?? 'medium',
                        status: tc.status ?? 'not-run', sap_module: tc.sapModule ?? null,
                        source_issue_id: tc.sourceIssueId ?? null,
                        tags_json: j(tc.tags), components_json: j(tc.components),
                        assigned_to: tc.assignedTo ?? null,
                        estimated_minutes: tc.estimatedMinutes ?? null,
                        test_type: tc.testType ?? null,
                        linked_defect_ids_json: j(tc.linkedDefectIds),
                        change_log_json: j(tc.changeLog),
                        updated_at: tc.updatedAt,
                    })
                }
            }

            // test run sessions
            const incomingSessionIds = new Set<string>((proj.testRunSessions ?? []).map((s: any) => s.id))
            const existingSessionIds = (database.prepare('SELECT id FROM test_run_sessions WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const sid of existingSessionIds) {
                if (!incomingSessionIds.has(sid)) database.prepare('DELETE FROM test_run_sessions WHERE id = ?').run(sid)
            }
            for (const sess of proj.testRunSessions ?? []) {
                insertSession.run({
                    id: sess.id, project_id: pid, timestamp: sess.timestamp,
                    is_archived: sess.isArchived ? 1 : 0,
                    environment_id: sess.environmentId ?? null,
                    environment_name: sess.environmentName ?? null,
                })
                deletePlanExecsBySession.run({ session_id: sess.id })
                for (const pe of sess.planExecutions ?? []) {
                    insertPlanExec.run({
                        id: pe.id, session_id: sess.id, project_id: pid,
                        test_plan_id: pe.testPlanId, snapshot_test_plan_name: pe.snapshotTestPlanName ?? '',
                    })
                    deleteCaseExecsByPlanExec.run({ plan_exec_id: pe.id })
                    for (const ce of pe.caseExecutions ?? []) {
                        insertCaseExec.run({
                            id: ce.id, plan_execution_id: pe.id, session_id: sess.id, project_id: pid,
                            test_case_id: ce.testCaseId, result: ce.result ?? 'not-run',
                            actual_result: ce.actualResult ?? '', notes: ce.notes ?? '',
                            snapshot_title: ce.snapshotTestCaseTitle ?? '',
                            snapshot_pre_conditions: ce.snapshotPreConditions ?? null,
                            snapshot_steps: ce.snapshotSteps ?? null,
                            snapshot_test_data: ce.snapshotTestData ?? null,
                            snapshot_expected_result: ce.snapshotExpectedResult ?? null,
                            snapshot_priority: ce.snapshotPriority ?? null,
                            duration_seconds: ce.durationSeconds ?? null,
                            blocked_reason: ce.blockedReason ?? null,
                            environment_id: ce.environmentId ?? null,
                            environment_name: ce.environmentName ?? null,
                            attachments_json: j(ce.attachments),
                        })
                    }
                }
            }

            // legacy test executions
            const incomingLegacyIds = new Set<string>((proj.testExecutions ?? []).map((te: any) => te.id))
            const existingLegacyIds = (database.prepare('SELECT id FROM test_executions_legacy WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const lid of existingLegacyIds) {
                if (!incomingLegacyIds.has(lid)) database.prepare('DELETE FROM test_executions_legacy WHERE id = ?').run(lid)
            }
            for (const te of proj.testExecutions ?? []) {
                insertLegacyExec.run({
                    id: te.id, project_id: pid,
                    test_case_id: te.testCaseId, test_plan_id: te.testPlanId,
                    result: te.result ?? 'not-run', actual_result: te.actualResult ?? '',
                    notes: te.notes ?? '', executed_at: te.executedAt,
                    snapshot_title: te.snapshotTestCaseTitle ?? '',
                    snapshot_pre_conditions: te.snapshotPreConditions ?? null,
                    snapshot_steps: te.snapshotSteps ?? null,
                    snapshot_test_data: te.snapshotTestData ?? null,
                    snapshot_expected_result: te.snapshotExpectedResult ?? null,
                    snapshot_priority: te.snapshotPriority ?? null,
                    duration_seconds: te.durationSeconds ?? null,
                    blocked_reason: te.blockedReason ?? null,
                    environment_id: te.environmentId ?? null,
                    environment_name: te.environmentName ?? null,
                })
            }

            // environments
            const incomingEnvIds = new Set<string>((proj.environments ?? []).map((e: any) => e.id))
            const existingEnvIds = (database.prepare('SELECT id FROM environments WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const eid of existingEnvIds) {
                if (!incomingEnvIds.has(eid)) database.prepare('DELETE FROM environments WHERE id = ?').run(eid)
            }
            for (const env of proj.environments ?? []) {
                insertEnv.run({
                    id: env.id, project_id: pid, name: env.name, type: env.type ?? 'custom',
                    color: env.color ?? '#6366f1', is_default: env.isDefault ? 1 : 0,
                    created_at: env.createdAt, base_url: env.baseUrl ?? '',
                    notes: env.notes ?? '', health_check_url: env.healthCheckUrl ?? '',
                    hac_url: env.hacUrl ?? '', back_office_url: env.backOfficeUrl ?? '',
                    storefront_url: env.storefrontUrl ?? '', solr_admin_url: env.solrAdminUrl ?? '',
                    occ_base_path: env.occBasePath ?? '',
                    ignore_ssl_errors: env.ignoreSslErrors ? 1 : 0,
                    username: env.username ?? null, password: env.password ?? null,
                })
            }

            // project files
            const incomingFileIds = new Set<string>((proj.files ?? []).map((f: any) => f.id))
            const existingFileIds = (database.prepare('SELECT id FROM project_files WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const fid of existingFileIds) {
                if (!incomingFileIds.has(fid)) database.prepare('DELETE FROM project_files WHERE id = ?').run(fid)
            }
            for (const f of proj.files ?? []) {
                insertFile.run({ id: f.id, project_id: pid, file_name: f.fileName, file_path: f.filePath, mime_type: f.mimeType ?? null, file_size_bytes: f.fileSizeBytes ?? null })
            }

            // test data groups + entries
            const incomingTdgIds = new Set<string>((proj.testDataGroups ?? []).map((g: any) => g.id))
            const existingTdgIds = (database.prepare('SELECT id FROM test_data_groups WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const gid of existingTdgIds) {
                if (!incomingTdgIds.has(gid)) database.prepare('DELETE FROM test_data_groups WHERE id = ?').run(gid)
            }
            for (const g of proj.testDataGroups ?? []) {
                insertTdg.run({ id: g.id, project_id: pid, name: g.name, category: g.category ?? '', created_at: g.createdAt })
                deleteTdeByGroup.run({ group_id: g.id })
                for (const e of g.entries ?? []) {
                    insertTde.run({ id: e.id, group_id: g.id, project_id: pid, key: e.key ?? '', value: e.value ?? '', description: e.description ?? '', tags: e.tags ?? '', environment: e.environment ?? '' })
                }
            }

            // checklists + items
            const incomingClIds = new Set<string>((proj.checklists ?? []).map((cl: any) => cl.id))
            const existingClIds = (database.prepare('SELECT id FROM checklists WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const clid of existingClIds) {
                if (!incomingClIds.has(clid)) database.prepare('DELETE FROM checklists WHERE id = ?').run(clid)
            }
            for (const cl of proj.checklists ?? []) {
                insertChecklist.run({ id: cl.id, project_id: pid, name: cl.name, category: cl.category ?? '', created_at: cl.createdAt, updated_at: cl.updatedAt })
                deleteChecklistItems.run({ checklist_id: cl.id })
                for (const item of cl.items ?? []) {
                    insertChecklistItem.run({ id: item.id, checklist_id: cl.id, project_id: pid, text: item.text ?? '', is_checked: item.isChecked ? 1 : 0 })
                }
            }

            // api requests
            const incomingApiIds = new Set<string>((proj.apiRequests ?? []).map((r: any) => r.id))
            const existingApiIds = (database.prepare('SELECT id FROM api_requests WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const rid of existingApiIds) {
                if (!incomingApiIds.has(rid)) database.prepare('DELETE FROM api_requests WHERE id = ?').run(rid)
            }
            for (const r of proj.apiRequests ?? []) {
                insertApiReq.run({ id: r.id, project_id: pid, name: r.name, category: r.category ?? '', method: r.method ?? 'GET', url: r.url ?? '', headers: r.headers ?? '', body: r.body ?? '', created_at: r.createdAt, updated_at: r.updatedAt })
            }

            // runbooks + steps
            const incomingRbIds = new Set<string>((proj.runbooks ?? []).map((rb: any) => rb.id))
            const existingRbIds = (database.prepare('SELECT id FROM runbooks WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const rbid of existingRbIds) {
                if (!incomingRbIds.has(rbid)) database.prepare('DELETE FROM runbooks WHERE id = ?').run(rbid)
            }
            for (const rb of proj.runbooks ?? []) {
                insertRunbook.run({ id: rb.id, project_id: pid, name: rb.name, description: rb.description ?? null, category: rb.category ?? 'other', created_at: rb.createdAt, updated_at: rb.updatedAt })
                deleteStepsByRunbook.run({ runbook_id: rb.id })
                for (const s of rb.steps ?? []) {
                    insertRunbookStep.run({ id: s.id, runbook_id: rb.id, project_id: pid, title: s.title, description: s.description ?? null, status: s.status ?? 'pending', ord: s.order ?? 0, updated_at: s.updatedAt })
                }
            }

            // handoff packets
            const incomingHandoffIds = new Set<string>((proj.handoffPackets ?? []).map((h: any) => h.id))
            const existingHandoffIds = (database.prepare('SELECT id FROM handoff_packets WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const hid of existingHandoffIds) {
                if (!incomingHandoffIds.has(hid)) database.prepare('DELETE FROM handoff_packets WHERE id = ?').run(hid)
            }
            for (const h of proj.handoffPackets ?? []) {
                insertHandoff.run({
                    id: h.id, project_id: pid, task_id: h.taskId, type: h.type ?? 'bug_handoff',
                    created_by_role: h.createdByRole ?? 'qa',
                    created_at: h.createdAt, updated_at: h.updatedAt,
                    summary: h.summary ?? '', repro_steps: h.reproSteps ?? '',
                    expected_result: h.expectedResult ?? '', actual_result: h.actualResult ?? '',
                    environment_id: h.environmentId ?? null, environment_name: h.environmentName ?? null,
                    severity: h.severity ?? null, branch_name: h.branchName ?? null,
                    release_version: h.releaseVersion ?? null,
                    reproducibility: h.reproducibility ?? null, frequency: h.frequency ?? null,
                    linked_test_case_ids_json: j(h.linkedTestCaseIds),
                    linked_execution_refs_json: j(h.linkedExecutionRefs),
                    linked_note_ids_json: j(h.linkedNoteIds),
                    linked_file_ids_json: j(h.linkedFileIds),
                    linked_prs_json: j(h.linkedPrs),
                    developer_response: h.developerResponse ?? null,
                    qa_verification_notes: h.qaVerificationNotes ?? null,
                    resolution_summary: h.resolutionSummary ?? null,
                    acknowledged_at: h.acknowledgedAt ?? null,
                    completed_at: h.completedAt ?? null,
                    is_complete: h.isComplete ? 1 : 0,
                    missing_fields_json: j(h.missingFields),
                })
            }

            // artifact links
            const incomingLinkIds = new Set<string>((proj.artifactLinks ?? []).map((l: any) => l.id))
            const existingLinkIds = (database.prepare('SELECT id FROM artifact_links WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const lid of existingLinkIds) {
                if (!incomingLinkIds.has(lid)) database.prepare('DELETE FROM artifact_links WHERE id = ?').run(lid)
            }
            for (const l of proj.artifactLinks ?? []) {
                insertLink.run({ id: l.id, project_id: pid, source_type: l.sourceType, source_id: l.sourceId, target_type: l.targetType, target_id: l.targetId, label: l.label, created_at: l.createdAt })
            }

            // collaboration events
            const incomingEventIds = new Set<string>((proj.collaborationEvents ?? []).map((e: any) => e.id))
            const existingEventIds = (database.prepare('SELECT id FROM collaboration_events WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const eid of existingEventIds) {
                if (!incomingEventIds.has(eid)) database.prepare('DELETE FROM collaboration_events WHERE id = ?').run(eid)
            }
            for (const ev of proj.collaborationEvents ?? []) {
                insertEvent.run({
                    id: ev.id, project_id: pid, task_id: ev.taskId,
                    handoff_id: ev.handoffId ?? null, event_type: ev.eventType,
                    actor_role: ev.actorRole, timestamp: ev.timestamp,
                    title: ev.title ?? '', details: ev.details ?? null,
                    metadata_json: j(ev.metadata),
                })
            }

            // exploratory sessions + observations
            const incomingExpIds = new Set<string>((proj.exploratorySessions ?? []).map((s: any) => s.id))
            const existingExpIds = (database.prepare('SELECT id FROM exploratory_sessions WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const sid of existingExpIds) {
                if (!incomingExpIds.has(sid)) database.prepare('DELETE FROM exploratory_sessions WHERE id = ?').run(sid)
            }
            for (const sess of proj.exploratorySessions ?? []) {
                insertExpSession.run({
                    id: sess.id, project_id: pid, charter: sess.charter ?? '',
                    timebox: sess.timebox ?? 60, tester: sess.tester ?? '',
                    started_at: sess.startedAt, completed_at: sess.completedAt ?? null,
                    notes: sess.notes ?? '',
                    discovered_bug_ids_json: j(sess.discoveredBugIds),
                })
                deleteObsBySession.run({ session_id: sess.id })
                for (const obs of sess.observations ?? []) {
                    insertExpObs.run({ id: obs.id, session_id: sess.id, project_id: pid, timestamp: obs.timestamp, type: obs.type ?? 'observation', description: obs.description ?? '', severity: obs.severity ?? null })
                }
            }

            // accuracy test suites
            const incomingAccIds = new Set<string>((proj.accuracyTestSuites ?? []).map((s: any) => s.id))
            const existingAccIds = (database.prepare('SELECT id FROM accuracy_test_suites WHERE project_id = ?').all(pid) as { id: string }[]).map(r => r.id)
            for (const sid of existingAccIds) {
                if (!incomingAccIds.has(sid)) database.prepare('DELETE FROM accuracy_test_suites WHERE id = ?').run(sid)
            }
            for (const s of proj.accuracyTestSuites ?? []) {
                insertAccSuite.run({
                    id: s.id, project_id: pid, name: s.name,
                    created_at: s.createdAt, updated_at: s.updatedAt,
                    high_accuracy_mode: s.highAccuracyMode ? 1 : 0,
                    reference_docs_json: j(s.referenceDocuments),
                    qa_pairs_json: j(s.qaPairs),
                    eval_runs_json: j(s.evalRuns),
                })
            }
        }
    })

    runAll()
}

// ─── Lightweight helpers used by reminders.ts ─────────────────────────────────

/** Returns minimal task info for all projects — avoids loading the full document. */
export function getTasksForReminders(): Array<{
    projectId: string
    projectName: string
    taskId: string
    taskTitle: string
    dueDate: number | null
    status: string
}> {
    const database = getDb()
    return (database.prepare(`
        SELECT t.project_id as projectId, p.name as projectName,
               t.id as taskId, t.title as taskTitle,
               t.due_date as dueDate, t.status as status
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
    `).all() as any[])
}

export function getRunbookStepsForReminders(): Array<{
    projectId: string
    projectName: string
    runbookId: string
    runbookName: string
    stepId: string
    stepTitle: string
    status: string
}> {
    const database = getDb()
    return (database.prepare(`
        SELECT rs.project_id as projectId, p.name as projectName,
               rb.id as runbookId, rb.name as runbookName,
               rs.id as stepId, rs.title as stepTitle, rs.status as status
        FROM runbook_steps rs
        JOIN runbooks rb ON rb.id = rs.runbook_id
        JOIN projects p ON p.id = rs.project_id
    `).all() as any[])
}

export function getTestCaseStatusCountsForReminders(): Array<{
    projectId: string
    projectName: string
    status: string
    count: number
}> {
    const database = getDb()
    return (database.prepare(`
        SELECT tc.project_id as projectId, p.name as projectName,
               tc.status as status, COUNT(*) as count
        FROM test_cases tc
        JOIN projects p ON p.id = tc.project_id
        GROUP BY tc.project_id, tc.status
    `).all() as any[])
}

// ─── Granular sync queries (Improvement 5) ────────────────────────────────────

/** Returns a single task with its handoff packets and collaboration events.
 *  Used by the renderer to do a targeted post-sync refresh instead of a full reload. */
export function getTaskById(taskId: string): any | null {
    const database = getDb()
    const taskRow = database.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined
    if (!taskRow) return null

    const task = rowToTask(taskRow)

    const handoffRows = database.prepare('SELECT * FROM handoff_packets WHERE task_id = ? ORDER BY rowid').all(taskId) as any[]
    task.handoffPackets = handoffRows.map((h: any) => ({
        id: h.id, taskId: h.task_id, type: h.type,
        createdByRole: h.created_by_role, createdAt: h.created_at, updatedAt: h.updated_at,
        summary: h.summary, reproSteps: h.repro_steps,
        expectedResult: h.expected_result, actualResult: h.actual_result,
        environmentId: h.environment_id ?? undefined, environmentName: h.environment_name ?? undefined,
        severity: h.severity ?? undefined, branchName: h.branch_name ?? undefined,
        releaseVersion: h.release_version ?? undefined,
        reproducibility: h.reproducibility ?? undefined, frequency: h.frequency ?? undefined,
        linkedTestCaseIds: p<string[]>(h.linked_test_case_ids_json) ?? [],
        linkedExecutionRefs: p(h.linked_execution_refs_json) ?? [],
        linkedNoteIds: p<string[]>(h.linked_note_ids_json) ?? [],
        linkedFileIds: p<string[]>(h.linked_file_ids_json) ?? [],
        linkedPrs: p(h.linked_prs_json) ?? [],
        developerResponse: h.developer_response ?? undefined,
        qaVerificationNotes: h.qa_verification_notes ?? undefined,
        resolutionSummary: h.resolution_summary ?? undefined,
        acknowledgedAt: h.acknowledged_at ?? undefined,
        completedAt: h.completed_at ?? undefined,
        isComplete: bool(h.is_complete),
        missingFields: p<string[]>(h.missing_fields_json) ?? undefined,
    }))

    const eventRows = database.prepare('SELECT * FROM collaboration_events WHERE task_id = ? ORDER BY timestamp').all(taskId) as any[]
    task.collaborationEvents = eventRows.map((e: any) => ({
        id: e.id, taskId: e.task_id, handoffId: e.handoff_id ?? undefined,
        eventType: e.event_type, actorRole: e.actor_role, timestamp: e.timestamp,
        title: e.title, details: e.details ?? undefined,
        actorUserId: e.actor_user_id ?? undefined,
        actorDisplayName: e.actor_display_name ?? undefined,
        metadata: p(e.metadata_json),
    }))

    return task
}

/** Returns a single handoff packet by ID. */
export function getHandoffById(handoffId: string): any | null {
    const database = getDb()
    const h = database.prepare('SELECT * FROM handoff_packets WHERE id = ?').get(handoffId) as any
    if (!h) return null
    return {
        id: h.id, taskId: h.task_id, type: h.type,
        createdByRole: h.created_by_role, createdAt: h.created_at, updatedAt: h.updated_at,
        summary: h.summary, reproSteps: h.repro_steps,
        expectedResult: h.expected_result, actualResult: h.actual_result,
        environmentId: h.environment_id ?? undefined, environmentName: h.environment_name ?? undefined,
        severity: h.severity ?? undefined, branchName: h.branch_name ?? undefined,
        releaseVersion: h.release_version ?? undefined,
        reproducibility: h.reproducibility ?? undefined, frequency: h.frequency ?? undefined,
        linkedTestCaseIds: p<string[]>(h.linked_test_case_ids_json) ?? [],
        linkedExecutionRefs: p(h.linked_execution_refs_json) ?? [],
        linkedNoteIds: p<string[]>(h.linked_note_ids_json) ?? [],
        linkedFileIds: p<string[]>(h.linked_file_ids_json) ?? [],
        linkedPrs: p(h.linked_prs_json) ?? [],
        developerResponse: h.developer_response ?? undefined,
        qaVerificationNotes: h.qa_verification_notes ?? undefined,
        resolutionSummary: h.resolution_summary ?? undefined,
        acknowledgedAt: h.acknowledged_at ?? undefined,
        completedAt: h.completed_at ?? undefined,
        isComplete: bool(h.is_complete),
        missingFields: p<string[]>(h.missing_fields_json) ?? undefined,
    }
}

// ─── Persistent mutation queue helpers (used by sync.ts) ──────────────────────

export function enqueueSyncMutation(tableName: string, op: string, rowId: string, payload: Record<string, unknown>): void {
    const database = getDb()
    // DELETE + INSERT to implement dedup (last-write-wins for same table+row_id)
    database.prepare('DELETE FROM sync_pending_queue WHERE table_name = ? AND row_id = ?').run(tableName, rowId)
    database.prepare(
        'INSERT INTO sync_pending_queue (table_name, op, row_id, payload_json, retry_count, enqueued_at) VALUES (?, ?, ?, ?, 0, ?)'
    ).run(tableName, op, rowId, JSON.stringify(payload), Date.now())
}

export function loadSyncPendingQueue(): Array<{ id: number; table_name: string; op: string; row_id: string; payload: Record<string, unknown>; retry_count: number; enqueued_at: number }> {
    const database = getDb()
    const rows = database.prepare('SELECT * FROM sync_pending_queue ORDER BY id').all() as any[]
    return rows.map(r => ({
        id: r.id,
        table_name: r.table_name,
        op: r.op,
        row_id: r.row_id,
        payload: JSON.parse(r.payload_json),
        retry_count: r.retry_count,
        enqueued_at: r.enqueued_at,
    }))
}

export function removeSyncMutation(id: number): void {
    const database = getDb()
    database.prepare('DELETE FROM sync_pending_queue WHERE id = ?').run(id)
}

export function incrementSyncMutationRetry(id: number): void {
    const database = getDb()
    database.prepare('UPDATE sync_pending_queue SET retry_count = retry_count + 1 WHERE id = ?').run(id)
}

export function clearSyncPendingQueue(): void {
    const database = getDb()
    database.prepare('DELETE FROM sync_pending_queue').run()
}
