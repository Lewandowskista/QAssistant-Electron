-- ── QAssistant — post-install diagnostics and troubleshooting ─────────────────
-- Run these blocks only after applying SUPABASE_SCHEMA.sql, or while debugging a
-- broken deployment. For fresh-project setup steps, see SUPABASE_SETUP.md.

-- 0. Quick RPC smoke test — run this as postgres/service role to confirm the function works at all
--    Replace 'test@example.com' and 'Test User' with real values
-- SELECT * FROM create_workspace_with_owner('Test Workspace', 'test@example.com', 'Test User');

-- 1. List ALL versions of create_workspace_with_owner (check for overloads)
SELECT
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS returns,
    p.prosecdef AS security_definer,
    r.rolname AS owner
FROM pg_proc p
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.proname IN (
    'create_workspace_with_owner',
    'join_workspace_by_invite',
    'get_workspace_invite_code',
    'rotate_workspace_invite_code',
    'is_workspace_member',
    'is_workspace_owner',
    'current_user_email',
    'current_user_display_name',
    'generate_workspace_invite_code'
)
ORDER BY p.proname;

-- 2. Check all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('workspaces','workspace_members','user_profiles',
                     'sync_tasks','sync_handoffs','sync_collab_events','sync_artifact_links')
ORDER BY table_name;

-- 3. Check RLS is enabled on all tables
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('workspaces','workspace_members','user_profiles',
                  'sync_tasks','sync_handoffs','sync_collab_events','sync_artifact_links')
ORDER BY relname;

-- 4. Check all policies exist
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 5. Check grants on the RPC functions
SELECT routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN (
    'create_workspace_with_owner',
    'join_workspace_by_invite',
    'get_workspace_invite_code',
    'rotate_workspace_invite_code'
  )
ORDER BY routine_name, grantee;

-- Expected on a clean install:
-- - authenticated has EXECUTE on the QAssistant RPCs
-- - PUBLIC and anon do not

-- 6. Simulate an authenticated app user in SQL Editor and run the RPC
--    Replace the UUID/email/name with your real authenticated Supabase user.
--    Run these statements in the same SQL editor tab/session.
-- SELECT set_config(
--   'request.jwt.claims',
--   json_build_object(
--     'sub', 'YOUR-USER-UUID',
--     'email', 'you@example.com',
--     'role', 'authenticated'
--   )::text,
--   true
-- );
-- SET LOCAL ROLE authenticated;
-- SELECT auth.uid(), auth.jwt();
-- SELECT * FROM create_workspace_with_owner('Test Workspace', 'you@example.com', 'Your Name');

-- 7. While the app is hanging on "Create Workspace", inspect active queries/waits
SELECT
    pid,
    usename,
    state,
    wait_event_type,
    wait_event,
    now() - query_start AS runtime,
    query
FROM pg_stat_activity
WHERE state <> 'idle'
ORDER BY query_start ASC;

-- 8. Check locks involving the workspace tables
SELECT
    a.pid,
    a.usename,
    a.state,
    a.wait_event_type,
    a.wait_event,
    c.relname AS locked_relation,
    l.mode,
    l.granted,
    now() - a.query_start AS runtime,
    a.query
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
LEFT JOIN pg_class c ON c.oid = l.relation
WHERE c.relname IN ('workspaces', 'workspace_members', 'user_profiles')
ORDER BY a.query_start ASC, c.relname, l.granted;
