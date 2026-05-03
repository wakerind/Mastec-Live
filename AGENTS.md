# AGENTS.md

## Purpose

This repository is the early prototype for **FieldSight**, a project visibility and workforce coordination product for MasTec-style operations. The product goal is to replace spreadsheet-driven tracking with a shared system for:

- project intake
- project assignment
- contractor and employee visibility
- execution tracking
- KPI reporting
- leadership oversight

Codex should treat this repo as a product prototype that will evolve from a static browser demo into a real workflow application.

## Current state

The repo is currently a lightweight static web prototype:

- `index.html` contains the UI structure
- `styles.css` contains the responsive styling
- `app.js` contains sample data and client-side interactions
- `README.md` explains the current sample

There is no build system, backend, test suite, or database yet.

## Product direction

The product should support two main portals plus leadership reporting:

1. **Job intake portal**
   Used by coordinators, dispatchers, project managers, or customers to upload or request jobs.

2. **Execution portal**
   Used by contractors, crews, or employees who take, receive, confirm, and complete assigned jobs.

3. **Leadership and operations portal**
   Used by managers to view load, staffing, schedule risk, backlog, and performance trends.

## Workflow assumptions

Until a formal workflow chart is added to the repo, assume this baseline lifecycle:

1. Job is submitted into intake.
2. Job is reviewed for completeness and priority.
3. Job is approved and made assignable.
4. Job can be assigned up to **24 hours before scheduled start**.
5. Assigned team or worker confirms receipt.
6. Work begins and status updates are logged.
7. Work is completed and closed out with timestamps, notes, and optional attachments.
8. KPI reporting is generated from historical job data.

If a future workflow chart differs from this, Codex should update the implementation to match the documented workflow source of truth.

## Implementation priorities

When adding features, prefer this order:

1. Make the workflow visible end to end.
2. Add durable data structures for jobs, assignments, users, and timestamps.
3. Add role-based views for intake users, assignees, and managers.
4. Add assignment rules, including the 24-hour scheduling window.
5. Add KPI dashboards and exportable reports.
6. Add integrations and migration tools from spreadsheet-based systems.

## KPI guidance

This system may be used to inform staffing and compensation decisions, but Codex should **not** design the product as a blind auto-ranking or auto-termination tool. Performance data should be framed as decision support with review context.

When implementing KPI features:

- measure both speed and quality
- normalize for job type, location, difficulty, and dependencies
- separate employee metrics from contractor/vendor metrics where appropriate
- show confidence and sample size, not just raw averages
- include exception reasons such as permit delays, weather, material shortages, and reassignment
- support manager review before any staffing action is taken

Preferred KPI examples:

- average time to accept assignment
- on-time start rate
- average completion duration by job type
- rework rate
- closeout completeness
- jobs completed per crew per week
- backlog age
- assignment response time

## Repo conventions for Codex

When working in this repo:

- keep the app mobile-friendly first, because field users may rely on phones
- preserve a simple demo mode with local sample data unless explicitly replacing it
- prefer incremental changes over large rewrites
- document new workflow logic in markdown as it is introduced
- keep naming business-oriented and easy for non-technical users to understand
- avoid adding heavy tooling until the product structure justifies it

## Suggested near-term structure

As the repo grows, move toward this layout:

```text
/
  AGENTS.md
  README.md
  PROJECT_PLAN.md
  docs/
    workflow-chart.md
    product-requirements.md
    data-model.md
    kpi-definitions.md
  src/
    pages/
    components/
    data/
    styles/
    utils/
  public/
  tests/
```

If the app remains static for a while, Codex may still introduce a `docs/` folder first before a full `src/` migration.

## Recommended next build steps

Codex should usually choose from these next steps unless the user requests otherwise:

1. Add a documented workflow model and shared terminology.
2. Convert the current sample into separate pages or views for intake, assignment, and execution.
3. Introduce a job data model with status history and timestamps.
4. Add the 24-hour pre-start assignment rule to the UI and data model.
5. Add KPI views with filters by team, worker, contractor, market, and job type.
6. Prepare the repo for a real framework and backend once the workflow is confirmed.

## Decision rules

If the user asks for a new feature and the workflow is unclear:

- make a reasonable assumption
- state the assumption in the related markdown doc
- implement the smallest useful version

If the user provides a workflow chart later:

- treat it as the new product source of truth
- update docs first
- then update UI and logic to match

## Definition of a good change

A good contribution in this repo should do at least one of these:

- improve workflow clarity
- reduce spreadsheet/manual coordination
- improve assignment visibility
- improve field usability
- improve KPI traceability
- make the repo easier for future Codex sessions to extend
