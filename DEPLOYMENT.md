# Deployment

## Current hosting model

This repo is now a lightweight Node.js web app with:

- browser frontend
- SQLite local fallback and Postgres-ready shared storage
- invite-based onboarding
- admin and field roles

## Local run

```powershell
cd "C:\Users\yguev\OneDrive\Projects\MasTec Tracking"
node server.js
```

Then open `http://localhost:4173`.

Demo admin login:

- email: `admin@fieldsight.local`
- password: `Admin123!`

## Internet hosting path

For a simple pilot, deploy this as a Node web service on Render or Railway.

Requirements:

- public HTTPS URL
- environment variable `PORT` supplied by the host
- either `DATABASE_URL` for Postgres or `DATA_DIR` for SQLite fallback

## Production notes

Before selling this broadly, plan to add:

- stronger password hashing
- password reset emails
- audit logs
- organization/company accounts
- database migration path to Postgres
- branded customer domains

## Render deployment

This repo now includes `render.yaml` for a Render Blueprint deployment for `Mastec Live`.

### What the current Render config does

- creates a Node web service
- uses `npm install` as the build command
- uses `npm start` as the start command
- adds a health check at `/healthz`
- creates a free Render Postgres database
- injects `DATABASE_URL` from that database into the app

### Important note

Render's docs say the Hobby workspace supports free web services and free Render Postgres databases, but free Postgres has major limits including a 30-day expiration, a 1 GB limit, and no backups. This makes it useful for testing and short pilots, not production. This is based on Render's current docs:

- [Web Services](https://render.com/docs/web-services)
- [Deploy for Free](https://render.com/docs/free)
- [Blueprint YAML Reference](https://render.com/docs/blueprint-spec)
- [Render Postgres](https://render.com/docs/postgresql)

### How to deploy on Render

1. Push this repo to GitHub.
2. In Render, create a new Blueprint deployment from that repo.
3. Confirm the service settings from `render.yaml`.
4. Deploy.
5. After the deploy finishes, use the generated `onrender.com` URL.

### Exact Render dashboard clicks

Current Render web-service docs say you deploy a web service from the dashboard with `New > Web Service`, and that disk, env vars, and health check live under the Advanced section. Their Blueprint docs also support repo-driven setup through `render.yaml`. Based on those current docs, the simplest click path is:

1. Push this repo to GitHub.
2. Sign in to Render.
3. Click `New`.
4. Choose `Blueprint`.
5. Connect your GitHub account if needed.
6. Select the repo that contains this project.
7. Render should detect `render.yaml`.
8. Review the service name, region, and free database settings.
9. Click `Apply`.
10. Wait for the first deploy to finish.
11. Open the generated `https://...onrender.com` URL.

If you prefer not to use Blueprints, the manual free path is:

1. Click `New`.
2. Choose `Web Service`.
3. Select your GitHub repo.
4. Set:
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Open `Advanced`.
6. Add:
   - `NODE_ENV=production`
7. Create a free Render Postgres database in the same region.
8. Add `DATABASE_URL` to the web service using that database's connection string.
9. Set the health check path to `/healthz`.
10. Create the web service.

### After deployment

- sign in with the demo admin account once:
  - `admin@fieldsight.local`
  - `Admin123!`
- create real field/admin invites from the Accounts screen
- add a custom domain in Render when you are ready for a customer-facing URL

### Paid SQLite alternative

If you want the older SQLite-plus-disk deployment path instead, use `render.sqlite.yaml`. That version requires a paid Render web service because persistent disks are a paid feature.
