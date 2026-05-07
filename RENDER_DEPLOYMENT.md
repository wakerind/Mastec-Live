# Render Deployment

## Important

`GitHub` by itself is not enough for this app.

This project is not a static website. It needs:

- the `Node` server
- a real database
- authenticated API routes

If you only upload the frontend files to a static host, you will not be testing the real jobs, users, or workflow.

## Best simple remote test

Use `Render` with the existing [render.yaml](C:\Users\yguev\OneDrive\Projects\Mastec%20Live\render.yaml).

That gives you:

- a public HTTPS URL
- the live backend
- a managed Postgres database
- a real shared app for desktop and phone testing

## What to deploy

This repo already includes:

- [render.yaml](C:\Users\yguev\OneDrive\Projects\Mastec%20Live\render.yaml) for `Render + Postgres`
- [render.sqlite.yaml](C:\Users\yguev\OneDrive\Projects\Mastec%20Live\render.sqlite.yaml) for `Render + persistent disk`

Use `render.yaml` for real shared testing.

## Recommended path

### 1. Push the latest repo to GitHub

From [Mastec Live](C:\Users\yguev\OneDrive\Projects\Mastec%20Live):

```powershell
cd "C:\Users\yguev\OneDrive\Projects\Mastec Live"

& "C:\Program Files\Git\cmd\git.exe" status

& "C:\Program Files\Git\cmd\git.exe" add .

& "C:\Program Files\Git\cmd\git.exe" commit -m "Prepare remote deployment"

& "C:\Program Files\Git\cmd\git.exe" push
```

### 2. Create the Render service

In Render:

1. Choose `New +`
2. Choose `Blueprint`
3. Connect `https://github.com/wakerind/Mastec-Live`
4. Select the repo
5. Let Render detect [render.yaml](C:\Users\yguev\OneDrive\Projects\Mastec%20Live\render.yaml)
6. Create the web service and Postgres database

### 3. Wait for the first deploy

Render should:

- install dependencies
- start `node server.js`
- create the Postgres database
- connect the app through `DATABASE_URL`

### 4. Open the public URL

Once deployed, test the Render URL on:

- desktop browser for admin
- phone browser for field workflow

## Test logins

- `admin@fieldsight.local` / `Admin123!`
- `crew1@fieldsight.local` / `Field123!`

## What to expect

If the Render deployment is correct, the app should use the real backend and database.

That means:

- jobs persist
- user roles work
- field and admin screens share the same live state
- phone tests reflect real backend behavior

## If you still see old sample data

That usually means one of these:

- you are opening a cached installed app instead of the Render URL
- you are testing a static GitHub site instead of the Render deployment
- the deployed database still has older seed data and needs a reset

## Recommended production direction after testing

For longer-term rollout:

- keep `Render` for quick MVP validation, or
- move to `AWS ECS/Fargate + RDS + S3`

Use Render first if your goal is simply to test the app properly on phone and desktop with a real backend.
