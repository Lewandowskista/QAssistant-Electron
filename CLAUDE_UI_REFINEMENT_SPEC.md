# Minimalist Workflow UI Reset Spec

## Purpose
This document captures the current UI/UX direction for QAssistant after the recent minimalist reset so another model can refine it without reintroducing clutter.

The goal is not a redesign from scratch. The goal is to keep all existing functionality while making the app feel calmer, cleaner, and more focused through subtraction, consolidation, and stronger hierarchy.

## Core Design Intent

### Primary goal
- Reduce cognitive load on dense workflow screens.
- Preserve existing capabilities.
- Make the default view show only what users need to act.

### Guiding principles
- One slim header band per dense page.
- One primary toolbar per dense page.
- One main work surface.
- Advanced controls hidden by default.
- Summary information should be inline text, not stacked cards.
- Fewer badges, fewer tinted surfaces, fewer competing panels.
- Primary workflow should be obvious without scrolling.
- Secondary tools should be reachable, but not visually loud.

### Default behavior expectations
- `Tasks` remains board-first by default.
- `Tests` keeps `Case Generation` as the default subtab.
- `Release Queue` should read as a focused action list, not a dashboard.
- `Settings` should feel like a clean setup/configuration screen, not a reporting page.

## Scope Of The Current Reset

### Screens included
- `Tasks`
- Task details drawer / sidebar
- `Tests`
- `Release Queue`
- `Settings`
- Main navigation shell

### Non-goals
- No backend changes
- No schema changes
- No IPC contract changes
- No feature removal
- No large branding or theme redesign

## What Changed

### 1. Shared page structure
The previous direction introduced stacked context surfaces near the top of pages. That increased clutter. The new direction removes those extra summary bands and returns the main screens to a focus-mode structure:

- slim title row
- single primary toolbar
- optional inline summary text
- main content surface

The intent is that the first viewport should show the actual work area, not layers of explanatory chrome.

### 2. Tasks page
The `Tasks` page was simplified to make the board the dominant default surface.

#### Current behavior
- Board remains the default primary view.
- Triage/list still exists, but is treated as a secondary mode.
- Top-of-page summary cards and stacked workflow context blocks were removed from the default view.
- Workflow counts were reduced into a compact inline status line.
- Filters, saved views, sort, sync details, quick views, and shortcuts were consolidated into a single `More` disclosure path.

#### Desired visible hierarchy
- title
- source selector
- search
- primary action: `New Task`
- one `More` entry point
- board surface

#### Task card intent
Task cards should only emphasize:
- title
- owner
- primary collaboration/workflow state
- one next-step hint
- minimal secondary metadata

Lower-priority metadata should not dominate the card face.

#### Task details drawer intent
The drawer/sidebar should open into a plain overview, not a dense workflow dashboard. It should still preserve all existing actions and tabs, but the initial section should feel readable and calm.

### 3. Tests page
The `Tests` page was reduced to one slim header plus one main toolbar.

#### Current behavior
- `Case Generation` remains the default first subtab.
- Top-level context strips/cards were removed.
- Primary visible controls are now limited to:
  - source selector
  - search
  - context selection
  - generate action
  - archived toggle
  - one `More tools` path
- Secondary generation tools were moved behind `More tools`.

#### Tools now intended for advanced disclosure
- CSV import
- result import
- design doc tools
- additional plan creation shortcuts
- source filter segmentation

The page should still support advanced QA workflows, but those tools should not compete with the main generation flow on first load.

### 4. Release Queue page
The `Release Queue` page was flattened from a dashboard-like layout into a simpler verification/workflow list.

#### Current behavior
- Stacked metrics, workload panels, and SLA summary cards were removed from the top.
- The page now uses compact inline summaries instead of large card groups.
- The dominant surface is the queue list itself.

#### Queue item intent
Each item should communicate:
- title
- owner or actor context
- current state
- one next action
- one blocker / missing-context line

The page should feel like a clean action surface, not a status-report collage.

### 5. Settings page
The `Settings` page was simplified into a cleaner setup-oriented screen.

#### Current behavior
- Top summary/context strip was removed.
- Default open section remains `Account`.
- Quick-jump buttons remain, but they are lighter-weight than the old summary treatment.

#### Presentation goal
Settings should be organized behaviorally:
- account / workspace
- app behavior
- integrations / automation
- diagnostics / help

The page should expose everything, but only one section should visually dominate at a time.

### 6. Navigation shell
The sidebar shell was quieted rather than expanded.

#### Current behavior
- The previously added `Resume Work` card was removed.
- Navigation spacing and active state styling were softened.
- The active route should stand out clearly, while inactive routes should remain visually calm.

#### Shell goal
The sidebar should support orientation without competing with the page content.

## Functional Guardrails

These must remain true during refinement:

- No user-facing feature should be removed.
- Advanced controls can move, but must remain reachable.
- Dense pages should not regain stacked summary cards by default.
- `Tasks` must remain board-first by default.
- `Tests` must keep `Case Generation` as default.
- `Release Queue` must remain action-oriented.
- `Settings` must still expose all current controls and sections.
- Keyboard and mouse access should continue to work.

## Files Touched In The Current Reset

- `src/pages/TasksPage.tsx`
- `src/components/tasks/TaskFilterBar.tsx`
- `src/components/tasks/TaskCard.tsx`
- `src/components/tasks/TaskDetailsSidebar.tsx`
- `src/pages/TestsPage.tsx`
- `src/pages/ReleaseQueuePage.tsx`
- `src/pages/SettingsPage.tsx`
- `src/layouts/MainLayout.tsx`
- `src/index.css`

### Files removed as part of the reset
- `src/components/tasks/TaskBoardSummary.tsx`
- `src/components/ui/quick-context-strip.tsx`

These removals were intentional because those components contributed to the clutter the user disliked.

## What Claude Should Refine Next

Claude should refine within this direction, not revert to the old “context-heavy” style.

### Highest-priority refinement goals
- Make spacing, density, and typography feel more deliberate and consistent.
- Further reduce badge/chip noise where it still feels busy.
- Improve the visual restraint of the `More` disclosures so advanced controls feel organized, not dumped.
- Tighten card layouts so they read faster at a glance.
- Ensure the first viewport on dense pages is mostly real work surface, not controls.
- Make the active route and active mode obvious without using loud surfaces everywhere.

### Surface-specific refinement goals

#### Tasks
- Make the header/toolbar feel cleaner and more compact.
- Ensure the board is visually dominant over utility controls.
- Improve the clarity of the inline status line.
- Further reduce noisy metadata on task cards without hiding necessary signals.

#### Task details drawer
- Keep the first section plain and readable.
- Avoid turning the top of the drawer back into a dashboard.
- Preserve all actions, but make the visual priority obvious.

#### Tests
- Keep `Case Generation` feeling like the clear main job of the screen.
- Make `More tools` feel intentionally grouped.
- Demote rarely used tooling without making it hard to find.

#### Release Queue
- Continue simplifying rows/items so they read like a clean workflow checklist.
- Avoid duplicated state labels and repeated status chips.
- Keep “next action” and blocker context readable in one pass.

#### Settings
- Keep the screen calm and setup-focused.
- Avoid reintroducing summary cards or analytics-like header blocks.
- Keep section switching clean and predictable.

#### Navigation shell
- Keep the shell visually quiet.
- Avoid adding new sidebar cards or attention-grabbing boxes.
- Make the current route feel intentional but restrained.

## Style Direction

The preferred style direction is:
- minimalistic
- organized
- calm
- focused
- low-noise
- clean hierarchy

The style direction is not:
- dashboard-heavy
- card-heavy
- badge-heavy
- explanation-heavy
- “show everything at once”

## Known Issues / Notes For Refinement

### Validation state
A TypeScript validation pass was run with:

```powershell
npx tsc --noEmit -p tsconfig.app.json
```

It still fails because of pre-existing repo issues outside this UI reset. Examples include:
- auth-related test typing problems
- missing `ElectronAPI` typings in unrelated areas
- exploratory page typing/state issues
- existing `Project | null` typing issues already present in `Tasks` / `Tests`
- some store/type mismatches

Claude should not assume those failures were introduced by this UI work.

### Cleanup note
Some inline separator characters displayed oddly in terminal output during inspection. If any odd characters appear in text separators in the UI code, those should be normalized as part of polish.

## Success Criteria

Claude’s refinement should be considered successful if:
- the UI feels noticeably calmer than before
- the user can immediately identify the main action area on each page
- advanced tools are still available, but no longer visually dominant
- no core functionality is lost
- the screens feel more minimal without becoming empty or underpowered

## Short Handoff Summary
The user explicitly rejected the more context-heavy UI direction because it increased clutter. The current direction intentionally removes extra summary surfaces and pushes the app toward a quieter, focus-mode workflow. Any further refinement should continue that minimalist path rather than reintroducing stacked cards, extra context strips, or dashboard-style chrome.
