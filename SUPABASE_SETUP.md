# QAssistant Supabase Setup

This guide walks through provisioning a brand-new Supabase project for QAssistant cloud sync.

## What to run

- Run `SUPABASE_SCHEMA.sql` on a fresh Supabase project.
- Use `SUPABASE_FULL_RESET.sql` only when you intentionally want to wipe an existing QAssistant Supabase database and rebuild it.
- Use `SUPABASE_DIAGNOSTIC.sql` after install or when troubleshooting.

## 1. Create a new Supabase project

1. Go to the Supabase dashboard and create a new project.
2. Wait for the database and API to finish provisioning.
3. Open `Project Settings -> API`.
4. Copy:
   - `Project URL`
   - `anon public` key

## 2. Configure authentication

1. Open `Authentication -> Providers -> Email`.
2. Make sure Email auth is enabled.
3. Keep email confirmation enabled if you want the app's verification flow to match production-like behavior.
4. If you use custom redirects later, review `Authentication -> URL Configuration`.

QAssistant's current bootstrap path assumes email/password auth and the app handles sign-up, sign-in, and verification prompts itself.

## 3. Apply the QAssistant schema

1. Open the Supabase SQL Editor.
2. Paste the full contents of `SUPABASE_SCHEMA.sql`.
3. Run the script once, as a whole.

What this sets up:

- required extensions
- per-user app snapshot storage for projects, settings, and secrets
- workspace and sync tables
- row-level security
- helper functions and workspace RPCs
- authenticated-only RPC grants
- realtime publication for the sync tables

## 4. Point QAssistant at the new Supabase project

QAssistant reads Supabase config from either:

- environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- or the desktop app settings file if those values are stored there

The app already knows how to read these values and bootstrap auth/session state from them.

## 5. First-run workflow in QAssistant

1. Launch QAssistant with the new `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
2. Sign up with email/password.
3. Verify the email if confirmation is enabled.
4. Sign in.
5. Open `Cloud Sync Setup`.
6. Create a workspace.
7. Confirm the owner can reveal the invite code.
8. Sign in with a second user and join the workspace using that invite code.

Expected result:

- workspace creation returns immediately
- the owner can fetch and rotate invite codes
- the second user is inserted into `workspace_members`
- sync status moves to connected after workspace selection

## 6. Verification checklist

After applying the schema, run the checks in `SUPABASE_DIAGNOSTIC.sql`.

Healthy install signals:

- only one version of each QAssistant RPC exists
- all expected tables exist
- RLS is enabled on the sync and workspace tables
- `authenticated` has `EXECUTE` on the QAssistant RPCs
- `PUBLIC` and `anon` do not have `EXECUTE` on those RPCs

## 7. Recovery notes

Use `SUPABASE_FULL_RESET.sql` when:

- you want to destroy and recreate an existing QAssistant schema intentionally
- test data and workspaces can be discarded

Use `SUPABASE_DIAGNOSTIC.sql` when:

- workspace creation or join starts failing
- invite RPCs return permission or signature errors
- a schema change may not have been applied cleanly

Common symptom of stale or incorrect schema:

- workspace creation hangs or times out
- RPC errors mention missing functions, wrong parameters, or permission mismatches
- invite-code generation fails because extension-backed functions are not visible from the function search path
