-- QAssistant Phase 2 — Supabase cloud sync schema
-- Run this in your Supabase project's SQL Editor (Database > SQL Editor)

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Workspaces ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    owner_id    UUID NOT NULL,          -- auth.users.id
    invite_code TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Workspace members ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL,         -- auth.users.id
    email        TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

-- ── Synced tasks (collab fields only) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_tasks (
    workspace_id           UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id             TEXT NOT NULL,
    task_id                TEXT NOT NULL,
    collab_state           TEXT NOT NULL DEFAULT 'draft',
    active_handoff_id      TEXT,
    last_collab_updated_at BIGINT,
    updated_at             BIGINT NOT NULL,
    updated_by             UUID,        -- auth.users.id of last writer
    PRIMARY KEY (workspace_id, task_id)
);

-- ── Synced handoff packets ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_handoffs (
    workspace_id               UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id                 TEXT NOT NULL,
    handoff_id                 TEXT NOT NULL,
    task_id                    TEXT NOT NULL,
    type                       TEXT NOT NULL DEFAULT 'bug_handoff',
    created_by_role            TEXT NOT NULL DEFAULT 'qa',
    created_at                 BIGINT NOT NULL,
    updated_at                 BIGINT NOT NULL,
    summary                    TEXT NOT NULL DEFAULT '',
    repro_steps                TEXT NOT NULL DEFAULT '',
    expected_result            TEXT NOT NULL DEFAULT '',
    actual_result              TEXT NOT NULL DEFAULT '',
    environment_id             TEXT,
    environment_name           TEXT,
    severity                   TEXT,
    branch_name                TEXT,
    release_version            TEXT,
    reproducibility            TEXT,
    frequency                  TEXT,
    linked_test_case_ids_json  TEXT,
    linked_execution_refs_json TEXT,
    linked_note_ids_json       TEXT,
    linked_file_ids_json       TEXT,
    linked_prs_json            TEXT,
    developer_response         TEXT,
    qa_verification_notes      TEXT,
    resolution_summary         TEXT,
    acknowledged_at            BIGINT,
    completed_at               BIGINT,
    is_complete                BOOLEAN NOT NULL DEFAULT FALSE,
    missing_fields_json        TEXT,
    updated_by                 UUID,   -- auth.users.id of last writer
    PRIMARY KEY (workspace_id, handoff_id)
);

-- ── Synced collaboration events (append-only) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_collab_events (
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id    TEXT NOT NULL,
    event_id      TEXT NOT NULL,
    task_id       TEXT NOT NULL,
    handoff_id    TEXT,
    event_type    TEXT NOT NULL,
    actor_role    TEXT NOT NULL,
    actor_user_id UUID,               -- auth.users.id of the person who performed the action
    timestamp     BIGINT NOT NULL,
    title         TEXT NOT NULL DEFAULT '',
    details       TEXT,
    metadata_json TEXT,
    PRIMARY KEY (workspace_id, event_id)
);

-- ── Synced artifact links ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_artifact_links (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id   TEXT NOT NULL,
    link_id      TEXT NOT NULL,
    source_type  TEXT NOT NULL,
    source_id    TEXT NOT NULL,
    target_type  TEXT NOT NULL,
    target_id    TEXT NOT NULL,
    label        TEXT NOT NULL,
    created_at   BIGINT NOT NULL,
    created_by   UUID,
    PRIMARY KEY (workspace_id, link_id)
);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Only workspace members can read/write their workspace's data

ALTER TABLE workspaces         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_handoffs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_collab_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_artifact_links ENABLE ROW LEVEL SECURITY;

-- Helper function: is the current user a member of a given workspace?
CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM workspace_members
        WHERE workspace_id = ws_id AND user_id = auth.uid()
    )
$$ LANGUAGE SQL SECURITY DEFINER;

-- Workspaces: members can read; only owner can update/delete
CREATE POLICY "members_select_workspace" ON workspaces
    FOR SELECT USING (is_workspace_member(id));
CREATE POLICY "owner_update_workspace" ON workspaces
    FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "owner_delete_workspace" ON workspaces
    FOR DELETE USING (owner_id = auth.uid());
CREATE POLICY "auth_insert_workspace" ON workspaces
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Workspace members: members can read their workspace; users can insert themselves
CREATE POLICY "members_select_members" ON workspace_members
    FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "auth_insert_member" ON workspace_members
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "auth_update_own_member" ON workspace_members
    FOR UPDATE USING (user_id = auth.uid());

-- Sync tables: members can read/write within their workspace
CREATE POLICY "members_all_tasks" ON sync_tasks
    FOR ALL USING (is_workspace_member(workspace_id));
CREATE POLICY "members_all_handoffs" ON sync_handoffs
    FOR ALL USING (is_workspace_member(workspace_id));
CREATE POLICY "members_all_events" ON sync_collab_events
    FOR ALL USING (is_workspace_member(workspace_id));
CREATE POLICY "members_all_links" ON sync_artifact_links
    FOR ALL USING (is_workspace_member(workspace_id));

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sync_tasks_ws       ON sync_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sync_handoffs_ws    ON sync_handoffs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sync_handoffs_task  ON sync_handoffs(task_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_ws      ON sync_collab_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_task    ON sync_collab_events(task_id);
CREATE INDEX IF NOT EXISTS idx_sync_links_ws       ON sync_artifact_links(workspace_id);

-- ── Enable Realtime on sync tables ───────────────────────────────────────────
-- In Supabase Dashboard: Database > Replication > enable for each sync_* table
-- Or via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE sync_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE sync_handoffs;
ALTER PUBLICATION supabase_realtime ADD TABLE sync_collab_events;
ALTER PUBLICATION supabase_realtime ADD TABLE sync_artifact_links;
