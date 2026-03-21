-- ── QAssistant — Destructive Supabase reset + rebuild ─────────────────────────
-- Use this only for an existing QAssistant Supabase project that you want to
-- wipe and recreate from scratch. For a brand-new Supabase project, run
-- SUPABASE_SCHEMA.sql instead. See SUPABASE_SETUP.md for the recommended flow.

-- ── 1. Drop all RPC functions ─────────────────────────────────────────────────
DROP FUNCTION IF EXISTS create_workspace_with_owner(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS join_workspace_by_invite(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_workspace_invite_code(UUID) CASCADE;
DROP FUNCTION IF EXISTS rotate_workspace_invite_code(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_workspace_member(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_workspace_owner(UUID) CASCADE;
DROP FUNCTION IF EXISTS current_workspace_member_role(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS current_user_email() CASCADE;
DROP FUNCTION IF EXISTS current_user_display_name() CASCADE;
DROP FUNCTION IF EXISTS generate_workspace_invite_code() CASCADE;

-- ── 2. Drop all tables (cascade removes policies, indexes, FK constraints) ────
DROP TABLE IF EXISTS sync_artifact_links CASCADE;
DROP TABLE IF EXISTS sync_collab_events  CASCADE;
DROP TABLE IF EXISTS sync_handoffs       CASCADE;
DROP TABLE IF EXISTS sync_tasks          CASCADE;
DROP TABLE IF EXISTS workspace_members   CASCADE;
DROP TABLE IF EXISTS user_profiles       CASCADE;
DROP TABLE IF EXISTS workspaces          CASCADE;

-- ── 3. Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 4. Tables ─────────────────────────────────────────────────────────────────
CREATE TABLE workspaces (
    id                     UUID        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    name                   TEXT        NOT NULL,
    owner_id               UUID        NOT NULL,
    invite_code            TEXT        NOT NULL UNIQUE,
    invite_code_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invite_code_expires_at TIMESTAMPTZ,
    invite_code_revoked_at TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_profiles (
    user_id      UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workspace_members (
    workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL,
    email        TEXT        NOT NULL,
    display_name TEXT        NOT NULL,
    role         TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE sync_tasks (
    workspace_id           UUID   NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id             TEXT   NOT NULL,
    task_id                TEXT   NOT NULL,
    collab_state           TEXT   NOT NULL DEFAULT 'draft',
    active_handoff_id      TEXT,
    last_collab_updated_at BIGINT,
    updated_at             BIGINT NOT NULL,
    updated_by             UUID,
    PRIMARY KEY (workspace_id, task_id)
);

CREATE TABLE sync_handoffs (
    workspace_id               UUID    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id                 TEXT    NOT NULL,
    handoff_id                 TEXT    NOT NULL,
    task_id                    TEXT    NOT NULL,
    type                       TEXT    NOT NULL DEFAULT 'bug_handoff',
    created_by_role            TEXT    NOT NULL DEFAULT 'qa',
    created_at                 BIGINT  NOT NULL,
    updated_at                 BIGINT  NOT NULL,
    summary                    TEXT    NOT NULL DEFAULT '',
    repro_steps                TEXT    NOT NULL DEFAULT '',
    expected_result            TEXT    NOT NULL DEFAULT '',
    actual_result              TEXT    NOT NULL DEFAULT '',
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
    updated_by                 UUID,
    PRIMARY KEY (workspace_id, handoff_id)
);

CREATE TABLE sync_collab_events (
    workspace_id  UUID   NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id    TEXT   NOT NULL,
    event_id      TEXT   NOT NULL,
    task_id       TEXT   NOT NULL,
    handoff_id    TEXT,
    event_type    TEXT   NOT NULL,
    actor_role    TEXT   NOT NULL,
    actor_user_id UUID,
    timestamp     BIGINT NOT NULL,
    title         TEXT   NOT NULL DEFAULT '',
    details       TEXT,
    metadata_json TEXT,
    PRIMARY KEY (workspace_id, event_id)
);

CREATE TABLE sync_artifact_links (
    workspace_id UUID   NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id   TEXT   NOT NULL,
    link_id      TEXT   NOT NULL,
    source_type  TEXT   NOT NULL,
    source_id    TEXT   NOT NULL,
    target_type  TEXT   NOT NULL,
    target_id    TEXT   NOT NULL,
    label        TEXT   NOT NULL,
    created_at   BIGINT NOT NULL,
    created_by   UUID,
    PRIMARY KEY (workspace_id, link_id)
);

-- ── 5. Replica identity for Realtime ─────────────────────────────────────────
ALTER TABLE sync_tasks          REPLICA IDENTITY FULL;
ALTER TABLE sync_handoffs       REPLICA IDENTITY FULL;
ALTER TABLE sync_collab_events  REPLICA IDENTITY FULL;
ALTER TABLE sync_artifact_links REPLICA IDENTITY FULL;

-- ── 6. Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE workspaces          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_handoffs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_collab_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_artifact_links ENABLE ROW LEVEL SECURITY;

-- ── 7. Helper functions ───────────────────────────────────────────────────────
CREATE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM workspace_members
        WHERE workspace_id = ws_id AND user_id = auth.uid()
    )
$$;

CREATE FUNCTION is_workspace_owner(ws_id UUID)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM workspaces
        WHERE id = ws_id AND owner_id = auth.uid()
    )
$$;

CREATE FUNCTION current_workspace_member_role(ws_id UUID, member_id UUID)
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
    SELECT role FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = member_id
$$;

CREATE FUNCTION current_user_email()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
    SELECT NULLIF(BTRIM(auth.jwt() ->> 'email'), '')
$$;

CREATE FUNCTION current_user_display_name()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
    SELECT NULLIF(BTRIM(display_name), '')
    FROM user_profiles WHERE user_id = auth.uid()
$$;

CREATE FUNCTION generate_workspace_invite_code()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    candidate TEXT;
BEGIN
    LOOP
        candidate := UPPER(encode(extensions.gen_random_bytes(12), 'hex'));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM workspaces WHERE invite_code = candidate);
    END LOOP;
    RETURN candidate;
END;
$$;

-- ── 8. RPC: Create workspace ──────────────────────────────────────────────────
CREATE FUNCTION create_workspace_with_owner(
    p_workspace_name     TEXT,
    p_member_email       TEXT,
    p_member_display_name TEXT
)
RETURNS TABLE (workspace_id UUID, invite_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_workspace_id UUID;
    v_invite_code  TEXT;
    v_email        TEXT;
    v_display_name TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF COALESCE(BTRIM(p_workspace_name), '') = '' THEN
        RAISE EXCEPTION 'Workspace name is required';
    END IF;

    v_email := COALESCE(NULLIF(BTRIM(p_member_email), ''), current_user_email());
    v_display_name := COALESCE(
        NULLIF(BTRIM(p_member_display_name), ''),
        current_user_display_name(),
        NULLIF(BTRIM(auth.jwt() -> 'user_metadata' ->> 'display_name'), ''),
        NULLIF(BTRIM(SPLIT_PART(COALESCE(current_user_email(), ''), '@', 1)), ''),
        'User'
    );

    IF COALESCE(v_email, '') = '' THEN
        RAISE EXCEPTION 'Member email is required';
    END IF;

    v_invite_code := generate_workspace_invite_code();

    INSERT INTO workspaces (name, owner_id, invite_code, invite_code_rotated_at, invite_code_expires_at)
    VALUES (BTRIM(p_workspace_name), auth.uid(), v_invite_code, NOW(), NOW() + INTERVAL '30 days')
    RETURNING id INTO v_workspace_id;

    INSERT INTO workspace_members (workspace_id, user_id, email, display_name, role)
    VALUES (v_workspace_id, auth.uid(), v_email, v_display_name, 'owner');

    workspace_id := v_workspace_id;
    invite_code  := v_invite_code;
    RETURN NEXT;
END;
$$;

-- ── 9. RPC: Join workspace ────────────────────────────────────────────────────
CREATE FUNCTION join_workspace_by_invite(
    p_invite_code        TEXT,
    p_member_email       TEXT,
    p_member_display_name TEXT
)
RETURNS TABLE (workspace_id UUID, workspace_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_workspace RECORD;
    v_email     TEXT;
    v_display   TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT id, name INTO v_workspace
    FROM workspaces
    WHERE invite_code = UPPER(BTRIM(p_invite_code))
      AND invite_code_revoked_at IS NULL
      AND (invite_code_expires_at IS NULL OR invite_code_expires_at > NOW());

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired invite code';
    END IF;

    v_email := COALESCE(NULLIF(BTRIM(p_member_email), ''), current_user_email());
    v_display := COALESCE(
        NULLIF(BTRIM(p_member_display_name), ''),
        current_user_display_name(),
        NULLIF(BTRIM(SPLIT_PART(COALESCE(current_user_email(), ''), '@', 1)), ''),
        'User'
    );

    INSERT INTO workspace_members (workspace_id, user_id, email, display_name, role)
    VALUES (v_workspace.id, auth.uid(), v_email, v_display, 'member')
    ON CONFLICT (workspace_id, user_id) DO UPDATE
        SET email = EXCLUDED.email, display_name = EXCLUDED.display_name;

    workspace_id   := v_workspace.id;
    workspace_name := v_workspace.name;
    RETURN NEXT;
END;
$$;

-- ── 10. RPC: Get invite code (owner only) ─────────────────────────────────────
CREATE FUNCTION get_workspace_invite_code(p_workspace_id UUID)
RETURNS TABLE (invite_code TEXT, invite_code_expires_at TIMESTAMPTZ, invite_code_rotated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT is_workspace_owner(p_workspace_id) THEN
        RAISE EXCEPTION 'Only workspace owners can view invite codes';
    END IF;
    RETURN QUERY
        SELECT w.invite_code, w.invite_code_expires_at, w.invite_code_rotated_at
        FROM workspaces w WHERE w.id = p_workspace_id;
END;
$$;

-- ── 11. RPC: Rotate invite code (owner only) ──────────────────────────────────
CREATE FUNCTION rotate_workspace_invite_code(p_workspace_id UUID)
RETURNS TABLE (invite_code TEXT, invite_code_expires_at TIMESTAMPTZ, invite_code_rotated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_new_code TEXT;
BEGIN
    IF NOT is_workspace_owner(p_workspace_id) THEN
        RAISE EXCEPTION 'Only workspace owners can rotate invite codes';
    END IF;
    v_new_code := generate_workspace_invite_code();
    UPDATE workspaces
    SET invite_code = v_new_code, invite_code_rotated_at = NOW(), invite_code_expires_at = NOW() + INTERVAL '30 days', invite_code_revoked_at = NULL
    WHERE id = p_workspace_id;
    RETURN QUERY
        SELECT w.invite_code, w.invite_code_expires_at, w.invite_code_rotated_at
        FROM workspaces w WHERE w.id = p_workspace_id;
END;
$$;

-- ── 12. Grants ────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION is_workspace_member(UUID)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_workspace_owner(UUID)                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION current_workspace_member_role(UUID, UUID)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION current_user_email()                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION current_user_display_name()                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION generate_workspace_invite_code()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION create_workspace_with_owner(TEXT, TEXT, TEXT)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION join_workspace_by_invite(TEXT, TEXT, TEXT)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_workspace_invite_code(UUID)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION rotate_workspace_invite_code(UUID)                FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION is_workspace_member(UUID)                         TO authenticated;
GRANT EXECUTE ON FUNCTION is_workspace_owner(UUID)                          TO authenticated;
GRANT EXECUTE ON FUNCTION current_workspace_member_role(UUID, UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_email()                              TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_display_name()                       TO authenticated;
GRANT EXECUTE ON FUNCTION generate_workspace_invite_code()                  TO authenticated;
GRANT EXECUTE ON FUNCTION create_workspace_with_owner(TEXT, TEXT, TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION join_workspace_by_invite(TEXT, TEXT, TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION get_workspace_invite_code(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION rotate_workspace_invite_code(UUID)                TO authenticated;

-- ── 13. Column-level security (hide raw invite_code from direct SELECT) ───────
REVOKE SELECT (invite_code) ON workspaces FROM authenticated;
GRANT  SELECT (id, name, owner_id, invite_code_rotated_at, invite_code_expires_at, invite_code_revoked_at, created_at)
    ON workspaces TO authenticated;

-- ── 14. RLS policies ──────────────────────────────────────────────────────────
-- user_profiles
CREATE POLICY "own_profile_select" ON user_profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_profile_insert" ON user_profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_profile_update" ON user_profiles FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- workspaces
CREATE POLICY "members_select_workspace" ON workspaces FOR SELECT USING (is_workspace_member(id));
CREATE POLICY "owner_update_workspace"   ON workspaces FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owner_delete_workspace"   ON workspaces FOR DELETE USING (owner_id = auth.uid());
CREATE POLICY "auth_insert_workspace"    ON workspaces FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());

-- workspace_members
CREATE POLICY "members_select_members"  ON workspace_members FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "members_leave_workspace" ON workspace_members FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "owner_manage_members"    ON workspace_members FOR ALL USING (is_workspace_owner(workspace_id)) WITH CHECK (is_workspace_owner(workspace_id));

-- sync tables
CREATE POLICY "members_all_tasks"    ON sync_tasks          FOR ALL USING (is_workspace_member(workspace_id)) WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "members_all_handoffs" ON sync_handoffs        FOR ALL USING (is_workspace_member(workspace_id)) WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "members_all_events"   ON sync_collab_events   FOR ALL USING (is_workspace_member(workspace_id)) WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "members_all_links"    ON sync_artifact_links  FOR ALL USING (is_workspace_member(workspace_id)) WITH CHECK (is_workspace_member(workspace_id));

-- ── 15. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX idx_sync_tasks_ws      ON sync_tasks(workspace_id);
CREATE INDEX idx_sync_tasks_project ON sync_tasks(project_id);
CREATE INDEX idx_sync_handoffs_ws   ON sync_handoffs(workspace_id);
CREATE INDEX idx_sync_handoffs_task ON sync_handoffs(task_id);
CREATE INDEX idx_sync_events_ws     ON sync_collab_events(workspace_id);
CREATE INDEX idx_sync_events_task   ON sync_collab_events(task_id);
CREATE INDEX idx_sync_links_ws      ON sync_artifact_links(workspace_id);
CREATE INDEX idx_sync_links_source  ON sync_artifact_links(source_type, source_id);
CREATE INDEX idx_sync_links_target  ON sync_artifact_links(target_type, target_id);

-- ── 16. Realtime publication ──────────────────────────────────────────────────
DO $$
DECLARE tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['sync_tasks','sync_handoffs','sync_collab_events','sync_artifact_links']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_rel pr
            JOIN pg_publication p ON p.oid = pr.prpubid
            JOIN pg_class c ON c.oid = pr.prrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public' AND c.relname = tbl
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
        END IF;
    END LOOP;
END;
$$;
