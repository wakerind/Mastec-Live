# MasTec Live

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
- Configurable attachment storage with local development mode and S3-ready production mode
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

## Important about GitHub hosting

`GitHub` by itself does not run the real app backend for this project.

If you only upload the frontend files to a static site, you are not testing:

- the live database
- the real accounts
- the job workflow API
- the shared admin and field state

To test the real app online, deploy the repo to a service that runs `server.js` and the database.

Use:

- [render.yaml](C:\Users\yguev\OneDrive\Projects\Mastec%20Live\render.yaml) for a simple real backend deployment
- [RENDER_DEPLOYMENT.md](C:\Users\yguev\OneDrive\Projects\Mastec%20Live\RENDER_DEPLOYMENT.md) for the exact setup path

Demo admin login:

- email: `admin@fieldsight.local`
- password: `Admin123!`

Demo field login:

- email: `crew1@fieldsight.local`
- password: `Field123!`

The login screen also includes:

- `Use demo admin login`
- `Use demo field login`

## Refresh commands

Use these commands from `C:\Users\yguev\OneDrive\Projects\Mastec Live` when you want to save changes and refresh GitHub/Render.

Example credentials for testing:

- Admin: `admin@fieldsight.local` / `Admin123!`
- Field: `crew1@fieldsight.local` / `Field123!`

Start the local app:

`node server.js`

Open the local app:

`http://localhost:4173`

Save changes to Git:

```powershell
& "C:\Program Files\Git\cmd\git.exe" add .
& "C:\Program Files\Git\cmd\git.exe" commit -m "Describe the changes"
```

Push normal updates to GitHub:

```powershell
& "C:\Program Files\Git\cmd\git.exe" push
```

If GitHub rejects the push because the remote history is different and you intentionally want this local version to replace it:

```powershell
& "C:\Program Files\Git\cmd\git.exe" push -u origin main --force
```

Check what changed before pushing:

```powershell
& "C:\Program Files\Git\cmd\git.exe" status
```

After a push, Render should redeploy automatically from:

`https://github.com/wakerind/Mastec-Live`

## App structure

- `index.html` contains the app shell
- `styles.css` contains the responsive design system
- `app.js` runs the browser app and connects to the shared API
- `server.js` serves the app and shared data
- `data/fieldsight.sqlite` stores shared users, invites, sessions, crews, and jobs
- `STORAGE_PROVIDER` selects `local` or `s3` attachment storage
- `ATTACHMENTS_DIR` and `ATTACHMENTS_BASE_PATH` control local attachment storage and the authenticated attachment route
- `AWS_REGION`, `S3_BUCKET`, and `S3_PREFIX` enable S3-backed job photo/file storage for production deployments
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
