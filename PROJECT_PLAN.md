# Project Plan

## Goal

Turn the current static demo into a practical project and job operations platform that can replace spreadsheet-based coordination for intake, assignment, execution tracking, and reporting.

## Product vision

The platform should give one shared view of:

- jobs being requested
- jobs accepted into the pipeline
- jobs assigned to internal teams or contractors
- jobs scheduled to start
- jobs in progress
- jobs completed or delayed
- KPI trends across workers, teams, markets, and vendors

It should work well on both desktop and mobile because office users and field crews will use it differently.

## Primary user roles

### 1. Intake user

This role uploads or requests work.

Core needs:

- create job requests
- attach required details
- set requested dates and priority
- see whether a job is pending review, approved, assigned, or completed

### 2. Dispatcher or operations coordinator

This role reviews incoming jobs and assigns them.

Core needs:

- validate job details
- assign teams or contractors
- respect staffing availability
- assign work up to **24 hours before scheduled start**
- rebalance work when teams are overloaded

### 3. Worker, crew lead, or contractor

This role receives and executes assigned jobs.

Core needs:

- view assigned jobs
- confirm acceptance
- see location, instructions, and start times
- update status from the field
- upload notes, proof, or closeout information

### 4. Manager or leadership user

This role needs visibility across all projects and performance trends.

Core needs:

- view live portfolio status
- track delayed work
- compare teams and vendors
- review KPIs with context
- identify bottlenecks before projects are lost

## Workflow to implement

Until a formal workflow chart is added, use this workflow:

1. Job submitted
2. Job reviewed
3. Job approved
4. Job scheduled
5. Job assigned within the allowed assignment window
6. Assignee confirms
7. Work starts
8. Work completed
9. Closeout reviewed
10. Job archived into reporting

## Key business rule

### 24-hour assignment rule

The system should support assigning a job as late as **24 hours before the job start time**.

Implementation requirements:

- every job must store a planned start date/time
- assignment actions must compare current time to planned start
- the UI should show whether a job is:
  - open for assignment
  - entering the 24-hour window
  - overdue for assignment
- alerts should surface unassigned jobs approaching start time

## KPI strategy

The KPI layer should help leadership protect project performance and reward strong teams, but it should not rely on raw speed alone.

Recommended KPI categories:

- throughput
- response time
- on-time start
- completion duration
- quality or rework
- closeout completeness
- backlog aging
- utilization

Required KPI filters:

- employee
- crew
- contractor company
- market
- customer or project
- job type
- date range

Required KPI context:

- job complexity tier
- weather or permit blockers
- material delays
- reassignment history
- sample size

Recommended guardrail:

Use KPI views as management decision support, with human review before compensation or staffing actions are made.

## Recommended repo improvements for Codex

### Phase 0: Documentation and workflow source of truth

Deliverables:

- `AGENTS.md`
- `PROJECT_PLAN.md`
- `docs/workflow-chart.md`
- `docs/data-model.md`
- `docs/kpi-definitions.md`

Why this matters:

- gives Codex stable context
- reduces repeated explanation in future sessions
- makes workflow assumptions visible before code expands

### Phase 1: Prototype reorganization

Deliverables:

- move from one-page demo toward clear feature sections
- split UI into:
  - intake
  - assignment board
  - field portal
  - leadership dashboard
- centralize sample data into a dedicated data file

Why this matters:

- easier to extend without breaking the demo
- each workflow role gets a visible home in the interface

### Phase 2: Job data model

Deliverables:

- define job record structure
- add assignment records
- add status history
- add worker/team records
- add audit timestamps

Suggested core fields:

- `jobId`
- `title`
- `market`
- `requestedBy`
- `requestDate`
- `priority`
- `jobType`
- `scheduledStartAt`
- `assignmentDeadlineAt`
- `assignedTo`
- `assignmentAcceptedAt`
- `startedAt`
- `completedAt`
- `status`
- `delayReason`
- `qualityScore`

### Phase 3: Intake portal

Deliverables:

- job request form
- validation for required details
- intake queue with filters
- review and approve actions

Features:

- draft vs submitted jobs
- attachment placeholders
- priority and due-date fields
- approval notes

### Phase 4: Assignment portal

Deliverables:

- assignment board by date and market
- available crew view
- conflict warnings
- 24-hour assignment status badges

Features:

- assign by individual or team
- assign to contractor company
- reassign with history
- highlight jobs nearing start without assignees

### Phase 5: Field execution portal

Deliverables:

- assignee dashboard
- today and upcoming jobs
- accept or confirm assignment
- in-progress and complete actions

Features:

- mobile-first cards
- simple status changes
- notes and closeout checklist
- proof of completion placeholders

### Phase 6: KPI and reporting

Deliverables:

- team performance dashboard
- employee performance dashboard
- contractor scorecard
- delayed work analysis

Features:

- compare similar job types
- show trend lines
- export filtered reports
- flag outliers with context

### Phase 7: Technical foundation

Recommended next architecture when ready:

- frontend framework such as React
- backend API for jobs, users, assignments, and metrics
- database for persistent workflow and historical KPIs
- authentication with role-based access

Codex-ready structure:

```text
/
  AGENTS.md
  PROJECT_PLAN.md
  README.md
  docs/
  src/
  public/
  tests/
```

## Proposed first implementation backlog

1. Create `docs/workflow-chart.md` with the approved workflow.
2. Create `docs/data-model.md` for jobs, users, teams, assignments, and KPI entities.
3. Refactor the one-page sample into distinct views for intake, assignment, field, and leadership.
4. Add a mock assignment timeline that enforces the 24-hour rule visually.
5. Add mock assignee dashboards for internal teams and contractors.
6. Add a KPI page showing completion time by team and job type.
7. Introduce a framework and backend only after the workflow and data model are stable.

## Definition of success

This repo is ready for the next stage when:

- the workflow is documented clearly enough that Codex can extend it without re-guessing the process
- each major user role has a clear portal or view
- jobs can be tracked from request through completion
- the 24-hour assignment rule is visible in the experience
- KPI reporting is understandable, filtered, and grounded in context
