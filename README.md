# QAssistant

QAssistant is an Electron desktop workspace for balanced QA/dev teams that need one place to manage:

- task and defect triage
- manual test planning and execution
- QA-to-dev handoffs
- release verification queues
- GitHub review and PR context
- environments, runbooks, evidence, and reports

It is designed for local-first usage. Project data lives on disk on the user's machine, integrations stay optional, and teams can pilot the app without standing up a backend.

## Who It Is For

- QA engineers running regression, retest, and release-readiness workflows
- developers collaborating with QA through structured handoffs instead of scattered ticket comments
- mixed squads that want traceability between tasks, tests, evidence, and PRs

## Core Workflow

The app is opinionated around one collaboration loop:

1. Sync or create a task
2. Link test coverage and execute a run
3. Create a handoff packet with evidence
4. Link the fixing PR
5. Mark the fix ready for QA
6. Verify or reject the fix from the release queue

## Quick Start

### Install and run

```bash
nvm use
npm install
npm run dev
```

Use Node `20.19.0` or newer in the supported ranges `^20.19.0 || >=22.12.0`.
If `npm install` fails with `node: command not found`, install Node first and then rerun the commands above.
If Electron reports a native-module ABI mismatch for `better-sqlite3`, run `npm run rebuild:native` and then start the app again.

### Useful scripts

```bash
npm run lint
npm run test
npm run build
npm run version:next
npm run version:bump:logical
```

### Release versioning

QAssistant now treats `1.0.0` as the baseline application version.

- `major`: breaking or architecture-shifting changes
- `minor`: meaningful new features or feature expansions
- `patch`: fixes, polish, and small non-breaking improvements

Use these commands before creating a release tag:

```bash
npm run version:next
npm run version:bump:logical
```

`version:next` prints the recommended next semantic version based on commits since the latest `v*` release tag. `version:bump:logical` applies that recommended version to `package.json` and `package-lock.json`. The release workflow then verifies that the pushed tag matches the repo version.

### Supabase cloud sync setup

For a brand-new Supabase project, use the guided bootstrap in `SUPABASE_SETUP.md`.
`SUPABASE_SCHEMA.sql` is the canonical schema bootstrap file for new projects.

### First-run options

When you open QAssistant with no projects:

- create an empty project from the sidebar or dashboard
- load the built-in demo workspace to explore the intended flow

The demo workspace includes:

- linked tasks and tests
- a failing checkout defect
- a ready-for-QA handoff
- release gate data
- evidence and PR links

## Main Areas

- `Dashboard`: high-level QA/dev health, release-readiness metrics, and collaboration KPIs
- `Tasks`: operational board for manual, Linear, or Jira-backed work
- `Tests`: test plans, case generation, regression suite building, and execution history
- `Release Queue`: ready-for-QA fixes, missing-evidence handoffs, and retest focus
- `GitHub` / `Code Reviews`: repo, PR, checks, deployment, and review visibility
- `Environments`, `API`, `Runbooks`, `SAP`, `Reports`: support tooling around delivery and diagnosis

## Integrations

Integrations are configured from `Settings`.

### GitHub

- connect with OAuth
- browse repos, PRs, checks, comments, deployments, and review requests

### Linear / Jira

- sync tasks into the board
- load comments and status history
- push status changes back to the source system

### Gemini

- generate test cases
- analyze issues
- build smoke subsets and prioritization suggestions

### Automation API

QAssistant starts a local automation API that can ingest results and expose release state.

Health check:

```bash
curl http://localhost:5248/health
```

Protected endpoints require the automation API bearer token configured in `Settings`.

Examples:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:5248/api/projects
curl -H "Authorization: Bearer <token>" http://localhost:5248/api/projects/<projectId>/release-readiness
curl -H "Authorization: Bearer <token>" http://localhost:5248/api/projects/<projectId>/retest-queue
```

Submit a test result:

```bash
curl -X POST http://localhost:5248/api/results ^
  -H "Authorization: Bearer <token>" ^
  -H "Content-Type: application/json" ^
  -d "{\"displayId\":\"TC-101\",\"status\":\"failed\",\"actualResult\":\"500 on payment step\"}"
```

Create a handoff:

```bash
curl -X POST http://localhost:5248/api/handoffs ^
  -H "Authorization: Bearer <token>" ^
  -H "Content-Type: application/json" ^
  -d "{\"projectId\":\"<projectId>\",\"taskId\":\"<taskId>\",\"summary\":\"Checkout fails\",\"reproSteps\":\"...\",\"expectedResult\":\"Order completes\",\"actualResult\":\"500 returned\",\"severity\":\"critical\",\"environmentName\":\"Staging\"}"
```

## Data Model and Storage

QAssistant stores data under the Electron user-data directory in `QAssistantData`.

Key files:

- `projects.json`: project workspace data
- `settings.json`: app-level settings
- `user.json`: role and identity state
- `attachments/`: copied evidence and generated reports

Credentials and tokens are stored separately via the secure credential service and are not included in project exports.

## Schema Versioning and Migration

Current schema version: `2`

Recent changes in schema version 2:

- added explicit `schemaVersion`
- added handoff completeness fields: `isComplete`, `missingFields`
- added branch/release metadata on handoffs
- added `components` tags on tasks and test cases
- migrated legacy `testExecutions` into derived archived `testRunSessions` when session history is missing

Backward compatibility rules:

- legacy `testExecutions` are still read
- old projects without `schemaVersion` are normalized to schema version 2 on load
- imported project data gets fresh IDs to avoid collisions in local storage

## Export / Import

Use `Settings -> Export / Import` to share a project with teammates.

What is exported:

- tasks, tests, handoffs, evidence links, reports, and runbooks

What is not exported:

- secure credentials
- OAuth sessions
- machine-local secrets

## Testing Strategy

Baseline automated coverage currently targets the new adoption-first workflow helpers:

- handoff completeness validation
- release queue derivation
- legacy execution migration

Recommended next additions:

- store-level workflow tests
- UI smoke tests for project creation, handoff creation, and verification
- automation API contract tests

## Current Limitations

- GitHub data is visible in-app, but change-impact suggestions are still heuristic
- import remapping still favors local safety over preserving original IDs
- some large store modules still need decomposition into smaller domain slices

## License / Ownership

Internal project for QAssistant development.
