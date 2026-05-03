CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'field')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invites (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'field')),
  token TEXT NOT NULL UNIQUE,
  invited_by_user_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS crews (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  market TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  job_type TEXT NOT NULL,
  priority TEXT NOT NULL,
  intake_status TEXT NOT NULL,
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  assigned_to TEXT,
  field_status TEXT NOT NULL,
  completion INTEGER NOT NULL DEFAULT 0,
  budget NUMERIC(10, 2) NOT NULL DEFAULT 1.5,
  issue TEXT NOT NULL,
  quality_score INTEGER NOT NULL DEFAULT 90,
  duration_variance INTEGER NOT NULL DEFAULT 0,
  job_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  labor_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  planned_hours NUMERIC(10, 2) NOT NULL DEFAULT 8,
  actual_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  blocker_reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id BIGINT REFERENCES users(id)
);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_value NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS labor_cost NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS planned_hours NUMERIC(10, 2) NOT NULL DEFAULT 8;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS blocker_reason TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS job_updates (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_start_at ON jobs (scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_to ON jobs (assigned_to);
CREATE INDEX IF NOT EXISTS idx_jobs_intake_status ON jobs (intake_status);
CREATE INDEX IF NOT EXISTS idx_jobs_field_status ON jobs (field_status);
CREATE INDEX IF NOT EXISTS idx_job_updates_job_id ON job_updates (job_id, created_at DESC);
