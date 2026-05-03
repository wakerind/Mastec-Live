# Postgres Migration

## Goal

Move the app from the current single-instance SQLite pilot model to a managed Postgres setup that is better suited for customer-facing internet deployments.

## Why migrate

SQLite is fine for:

- demos
- internal pilots
- one small deployed instance

Postgres is better for:

- broader company rollout
- stronger concurrency
- better operational backups
- easier future reporting and integrations
- multi-customer growth

## What is already prepared

- `db/schema.postgres.sql` defines the current app schema in Postgres form
- `db/index.js`, `db/sqlite.js`, and `db/postgres.js` introduce a real database adapter layer
- `render.postgres.yaml` shows the future Render Blueprint shape for a managed Postgres deployment
- `.env.example` includes `DATABASE_URL`
- `package.json` includes the `pg` dependency for the Postgres path

## Suggested migration sequence

1. Keep the current SQLite app for the first hosted pilot.
2. Provision a managed Postgres database on Render.
3. Set `DATABASE_URL` for the service.
4. Run `npm install` so the `pg` package is available in the environment.
5. Deploy the same app code against Postgres.
6. Validate login, invites, and jobs against the new database.
7. Remove the persistent disk requirement once Postgres is live.

## First code changes for the actual migration

When we do the implementation pass, the next engineering steps should be:

1. Finish the remaining parity testing between SQLite and Postgres adapters.
2. Add migration tooling for existing SQLite pilot data if needed.
3. Add connection retry / startup diagnostics for hosted environments.
4. Keep SQLite as the local fallback for demos and offline work.

## Render target after migration

After Postgres is wired in:

- the app should use a Render Postgres instance
- the app should no longer depend on a persistent disk for primary data
- `DATABASE_URL` should come from the Render database connection string

## Business recommendation

If you are trying to get a public pilot live quickly, deploy the current SQLite version first.

If you are trying to sell this to a company as a more serious production offering, the Postgres migration should be the next major engineering step right after the first hosted pilot proves out the workflow.
