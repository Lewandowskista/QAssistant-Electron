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
$$ LANGUAGE SQL SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION current_workspace_member_role(ws_id UUID, member_id UUID)
RETURNS TEXT AS $$
    SELECT role
    FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = member_id
$$ LANGUAGE SQL SECURITY DEFINER
SET search_path = public;

-- Helper function: generates an 8-character invite code.
CREATE OR REPLACE FUNCTION generate_workspace_invite_code()
RETURNS TEXT AS $$
DECLARE
    candidate TEXT;
BEGIN
    LOOP
        candidate := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT || COALESCE(auth.uid()::TEXT, 'anon')) FROM 1 FOR 8));
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM workspaces WHERE invite_code = candidate
        );
    END LOOP;
    RETURN candidate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Secure workspace creation entrypoint for the desktop app.
CREATE OR REPLACE FUNCTION create_workspace_with_owner(
    workspace_name TEXT,
    member_email TEXT,
    member_display_name TEXT
)
RETURNS TABLE (workspace_id UUID, invite_code TEXT) AS $$
DECLARE
    new_workspace_id UUID;
    new_invite_code TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF COALESCE(BTRIM(workspace_name), '') = '' THEN
        RAISE EXCEPTION 'Workspace name is required';
    END IF;
    IF COALESCE(BTRIM(member_email), '') = '' THEN
        RAISE EXCEPTION 'Member email is required';
    END IF;
    IF COALESCE(BTRIM(member_display_name), '') = '' THEN
        RAISE EXCEPTION 'Display name is required';
    END IF;

    new_invite_code := generate_workspace_invite_code();

    INSERT INTO workspaces (name, owner_id, invite_code)
    VALUES (BTRIM(workspace_name), auth.uid(), new_invite_code)
    RETURNING id INTO new_workspace_id;

    INSERT INTO workspace_members (workspace_id, user_id, email, display_name, role)
    VALUES (new_workspace_id, auth.uid(), BTRIM(member_email), BTRIM(member_display_name), 'owner')
    ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        role = 'owner';

    RETURN QUERY SELECT new_workspace_id, new_invite_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Secure workspace join entrypoint for the desktop app.
CREATE OR REPLACE FUNCTION join_workspace_by_invite(
    invite_code_input TEXT,
    member_email TEXT,
    member_display_name TEXT
)
RETURNS TABLE (workspace_id UUID, workspace_name TEXT) AS $$
DECLARE
    target_workspace RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF COALESCE(BTRIM(invite_code_input), '') = '' THEN
        RAISE EXCEPTION 'Invite code is required';
    END IF;
    IF COALESCE(BTRIM(member_email), '') = '' THEN
        RAISE EXCEPTION 'Member email is required';
    END IF;
    IF COALESCE(BTRIM(member_display_name), '') = '' THEN
        RAISE EXCEPTION 'Display name is required';
    END IF;

    SELECT id, name
    INTO target_workspace
    FROM workspaces
    WHERE invite_code = UPPER(BTRIM(invite_code_input));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid invite code';
    END IF;

    INSERT INTO workspace_members (workspace_id, user_id, email, display_name, role)
    VALUES (target_workspace.id, auth.uid(), BTRIM(member_email), BTRIM(member_display_name), 'member')
    ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        role = workspace_members.role;

    RETURN QUERY SELECT target_workspace.id, target_workspace.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION is_workspace_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION current_workspace_member_role(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_workspace_invite_code() TO authenticated;
GRANT EXECUTE ON FUNCTION create_workspace_with_owner(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION join_workspace_by_invite(TEXT, TEXT, TEXT) TO authenticated;

-- Workspaces: members can read; only owner can update/delete
DROP POLICY IF EXISTS "members_select_workspace" ON workspaces;
DROP POLICY IF EXISTS "owner_update_workspace" ON workspaces;
DROP POLICY IF EXISTS "owner_delete_workspace" ON workspaces;
DROP POLICY IF EXISTS "auth_insert_workspace" ON workspaces;
CREATE POLICY "members_select_workspace" ON workspaces
    FOR SELECT USING (is_workspace_member(id));
CREATE POLICY "owner_update_workspace" ON workspaces
    FOR UPDATE USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owner_delete_workspace" ON workspaces
    FOR DELETE USING (owner_id = auth.uid());
CREATE POLICY "auth_insert_workspace" ON workspaces
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());

-- Workspace members: members can read their workspace; membership writes are restricted.
DROP POLICY IF EXISTS "members_select_members" ON workspace_members;
DROP POLICY IF EXISTS "owner_insert_member" ON workspace_members;
DROP POLICY IF EXISTS "owner_update_member" ON workspace_members;
DROP POLICY IF EXISTS "auth_update_own_member" ON workspace_members;
CREATE POLICY "members_select_members" ON workspace_members
    FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "owner_insert_member" ON workspace_members
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM workspaces
            WHERE id = workspace_id AND owner_id = auth.uid()
        )
    );
CREATE POLICY "owner_update_member" ON workspace_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM workspaces
            WHERE id = workspace_id AND owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM workspaces
            WHERE id = workspace_id AND owner_id = auth.uid()
        )
    );
CREATE POLICY "auth_update_own_member" ON workspace_members
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (
        user_id = auth.uid()
        AND role = current_workspace_member_role(workspace_id, user_id)
    );

-- Sync tables: members can read/write within their workspace
DROP POLICY IF EXISTS "members_all_tasks" ON sync_tasks;
DROP POLICY IF EXISTS "members_all_handoffs" ON sync_handoffs;
DROP POLICY IF EXISTS "members_all_events" ON sync_collab_events;
DROP POLICY IF EXISTS "members_all_links" ON sync_artifact_links;
CREATE POLICY "members_all_tasks" ON sync_tasks
    FOR ALL USING (is_workspace_member(workspace_id))
    WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "members_all_handoffs" ON sync_handoffs
    FOR ALL USING (is_workspace_member(workspace_id))
    WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "members_all_events" ON sync_collab_events
    FOR ALL USING (is_workspace_member(workspace_id))
    WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "members_all_links" ON sync_artifact_links
    FOR ALL USING (is_workspace_member(workspace_id))
    WITH CHECK (is_workspace_member(workspace_id));

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
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_rel pr
        JOIN pg_publication p ON p.oid = pr.prpubid
        JOIN pg_class c ON c.oid = pr.prrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE p.pubname = 'supabase_realtime'
          AND n.nspname = 'public'
          AND c.relname = 'sync_tasks'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_tasks';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_rel pr
        JOIN pg_publication p ON p.oid = pr.prpubid
        JOIN pg_class c ON c.oid = pr.prrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE p.pubname = 'supabase_realtime'
          AND n.nspname = 'public'
          AND c.relname = 'sync_handoffs'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_handoffs';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_rel pr
        JOIN pg_publication p ON p.oid = pr.prpubid
        JOIN pg_class c ON c.oid = pr.prrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE p.pubname = 'supabase_realtime'
          AND n.nspname = 'public'
          AND c.relname = 'sync_collab_events'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_collab_events';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_rel pr
        JOIN pg_publication p ON p.oid = pr.prpubid
        JOIN pg_class c ON c.oid = pr.prrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE p.pubname = 'supabase_realtime'
          AND n.nspname = 'public'
          AND c.relname = 'sync_artifact_links'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_artifact_links';
    END IF;
END;
$$;
