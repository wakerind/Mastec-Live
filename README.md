# Mastec Live

This folder is the live-integration workspace for a MasTec-style operations platform intended to replace spreadsheet-heavy project and work tracking.

## What it includes

- Executive portfolio overview
- Shared administrator portal for job requests and approvals
- Shared assignment board with 24-hour pre-start visibility
- Shared field portal for assigned crews and contractors
- Leadership KPI scorecards
- Mobile-friendly layout for phone and desktop browsers
- Installable app basics through a web app manifest and service worker
- Lightweight built-in Node server with SQLite-backed shared data
- Demo admin login plus invite-based user onboarding
- Role-based administrator and field access

## Intended live workflow

- work uploaded into the system
- work reviewed and approved
- work assigned to a crew, contractor, or employee
- work updated in the field
- work completed and closed out
- KPI tracking across value, duration, assignment timing, and workforce cost

## Portal model

- `Admin portal`
  Used for upload, approval, assignment, staffing, and oversight
- `Worker portal`
  Used for seeing assigned jobs, updating status, and completing work
- `Leadership view`
  Used for KPI review, backlog, cycle time, and workforce visibility

## Shared app mode

Start the shared app from this folder with:

`node server.js`

Then open:

`http://localhost:4173`

Anyone on the same Wi-Fi or local network can open:

`http://YOUR-COMPUTER-IP:4173`

This is the mode to use when administrators and field users need to share the same jobs and updates.

Demo admin login:

- email: `admin@fieldsight.local`
- password: `Admin123!`

## App structure

- `index.html` contains the app shell
- `styles.css` contains the responsive design system
- `app.js` runs the browser app and connects to the shared API
- `server.js` serves the app and shared data
- `data/fieldsight.sqlite` stores shared users, invites, sessions, crews, and jobs
- `Dockerfile` and `DEPLOYMENT.md` prepare the app for internet hosting
- `render.yaml` prepares the app for free Render web service + free Render Postgres deployment
- `render.sqlite.yaml` preserves the paid SQLite + persistent disk deployment path
- `render.postgres.yaml` and `POSTGRES_MIGRATION.md` prepare the next move to managed Postgres
- `manifest.json` and `sw.js` add installable app foundations

## Next product directions

- Add password reset and email delivery for invites
- Add company/org separation for multi-tenant customers
- Move from starter SQLite storage to managed Postgres for scale
- Move the layout toward a Smartsheet-style grid and sheet view for teams that prefer tabular workflows
- Add photo uploads, field check-ins, and schedule milestones
- Add Excel/Smartsheet import so teams can migrate existing trackers
- Build approval workflows for intake, staffing, and budget changes

## Repo planning docs

- `AGENTS.md` gives Codex guidance for how this repo should evolve
- `PROJECT_PLAN.md` lays out the phased product plan for intake, assignment, field execution, and KPI tracking
