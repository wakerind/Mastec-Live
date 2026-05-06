# App Deployment Plan

## Goal

`MasTec Live` should be deployed as an app-first product, not as a desktop website squeezed onto a phone.

That means:

- concise screens
- top-level navigation that stays available
- minimal horizontal scrolling
- fast field actions
- offline-safe field workflow
- a backend and database that remain the source of truth

## Recommended release path

Use a two-stage deployment plan.

### Stage 1: Installable field app plus web admin

This is the best MVP path with the current repo.

- `Field app`
  Ship the existing frontend as a mobile-first PWA for technicians.
- `Admin app`
  Keep the dispatcher/admin experience as a web app.
- `Backend`
  Keep the Node server as the shared API layer.
- `Database`
  Use Postgres for shared production data.
- `Attachments`
  Move photos to object storage.

Why this is the right next step:

- fastest path to a usable product
- one codebase can still move quickly
- app can be installed on phones from the browser
- backend rules stay centralized
- offline queueing can keep improving without a full native rewrite yet

### Stage 2: Native shell when the workflow is stable

Once the field workflow is proven, wrap the field app in a native shell using Capacitor.

- `iPhone app`
  Capacitor iOS shell
- `Android app`
  Capacitor Android shell
- `Shared UI`
  Reuse the mobile field frontend
- `Backend`
  Reuse the same Node API and database

Why this comes second:

- avoids spending early time on app-store packaging before the workflow is mature
- keeps the MVP modular
- lets us add camera, push notifications, and deeper offline controls later

## Product shape

The product should not feel like a mirrored admin portal.

### Field app

Use only a few screens:

1. `Home`
   Show sync state, next assigned job, and one main action.
2. `My Jobs`
   Show only active job cards with status, priority, address, and one CTA.
3. `Job Detail`
   Show address, map link, description, checklist, and start/close-out actions.
4. `Close-Out`
   Use a step flow:
   - complete or blocked
   - codes used
   - summary
   - photos
   - submit
5. `History`
   Keep this light and searchable.
6. `Activity`
   Show a compact audit trail or sync activity, not a full admin board.

### Admin web app

Keep the admin side web-first:

- dispatch jobs
- review active work
- reassign
- review close-out queue
- inspect audit history
- manage users and crews

## Deployment architecture

### Frontend

- `Field frontend`
  Mobile-first PWA
- `Admin frontend`
  Same repo for now, but desktop-oriented sections stay separate in the UI
- `Manifest + service worker`
  Keep these for installability and caching

### Backend

- `Runtime`
  Node.js web service
- `API`
  Shared authenticated API for job actions, notes, photos, and audit events
- `Rules`
  All workflow restrictions enforced server-side

### Database

- `Production`
  Postgres
- `Local dev`
  SQLite is still okay

### File storage

- `Production`
  S3, Cloudflare R2, or Supabase Storage
- `Local dev`
  Existing local attachment directory is fine

## Hosting recommendation

For a real MVP, use:

- `Frontend + backend`
  Render, Railway, or Fly.io
- `Database`
  Managed Postgres
- `Object storage`
  S3-compatible bucket
- `App shell later`
  Capacitor for App Store / Play Store packaging

## Environment recommendation

Minimum production environment:

- `NODE_ENV=production`
- `PORT`
- `DATABASE_URL`
- `ATTACHMENTS_BASE_PATH`
- `ATTACHMENTS_DIR` for local fallback only
- `SESSION_SECRET` or equivalent auth secret once auth is hardened further

Recommended future additions:

- `STORAGE_PROVIDER`
- `STORAGE_BUCKET`
- `STORAGE_REGION`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `APP_BASE_URL`

## MVP deployment checklist

### 1. Backend

- deploy `server.js` as a Node service
- point it to Postgres
- enable HTTPS
- expose `/healthz`

### 2. Database

- create production Postgres database
- migrate away from shared production SQLite
- verify optimistic concurrency works across multiple users

### 3. Storage

- keep local attachments for dev only
- move production photos to object storage
- store only file metadata and URLs in the database

### 4. Mobile installability

- keep `manifest.json`
- keep the service worker
- verify install prompt on Android
- verify Add to Home Screen on iPhone

### 5. App UX gates before rollout

- no horizontal scroll on phone
- sticky top navigation
- single-column mobile layout
- concise field cards
- close-out wizard flow
- visible sync status
- safe offline queue behavior

## What “true app configuration” means here

For this repo, a true app configuration should mean:

- field users open a clean app-like shell
- they do not see spreadsheet-like tables by default
- they do not need to pan sideways
- they can install it to the home screen
- the app remains usable with weak signal
- the backend still protects all workflow state

It does **not** need to mean “native app first” yet.

The right MVP is:

- `PWA first`
- `Capacitor second`

## Immediate next build targets

1. Finish the field close-out wizard inside the app flow.
2. Split admin and field routing more cleanly.
3. Move production data to Postgres.
4. Move photo storage to object storage.
5. Add better conflict messaging for queued offline changes.
6. Prepare a Capacitor wrapper once the field flow is stable.

## Local run

From [Mastec Live](C:\Users\yguev\OneDrive\Projects\Mastec Live):

```powershell
& "C:\Program Files\nodejs\node.exe" server.js
```

Then open:

- `http://localhost:4173`

On your phone, while on the same local network:

- `http://YOUR-COMPUTER-IP:4173`

## Current recommendation

Treat the current product as:

- `web admin console`
- `installable field app MVP`

That is the cleanest, most modular path with the repo you already have.
