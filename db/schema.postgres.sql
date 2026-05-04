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
  note TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  coverage_area TEXT NOT NULL DEFAULT ''
);

ALTER TABLE crews ADD COLUMN IF NOT EXISTS contact_name TEXT NOT NULL DEFAULT '';
ALTER TABLE crews ADD COLUMN IF NOT EXISTS contact_email TEXT NOT NULL DEFAULT '';
ALTER TABLE crews ADD COLUMN IF NOT EXISTS contact_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE crews ADD COLUMN IF NOT EXISTS coverage_area TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  market TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  job_address TEXT NOT NULL DEFAULT '',
  job_type TEXT NOT NULL,
  priority TEXT NOT NULL,
  intake_status TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  assignment_at TIMESTAMPTZ,
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  assigned_to TEXT,
  dispatcher_name TEXT NOT NULL DEFAULT '',
  dispatcher_phone TEXT NOT NULL DEFAULT '',
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
  blocker_stage TEXT NOT NULL DEFAULT '',
  lifecycle_stage TEXT NOT NULL DEFAULT 'Uploaded',
  admin_approved BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  admin_reviewed_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id BIGINT REFERENCES users(id)
);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_value NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS labor_cost NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS planned_hours NUMERIC(10, 2) NOT NULL DEFAULT 8;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_address TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispatcher_name TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispatcher_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assignment_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS blocker_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS blocker_stage TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT NOT NULL DEFAULT 'Uploaded';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rejection_reason TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS job_updates (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  update_type TEXT NOT NULL DEFAULT '',
  work_done TEXT NOT NULL DEFAULT '',
  codes_used TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  attachment_name TEXT NOT NULL DEFAULT '',
  attachment_path TEXT NOT NULL DEFAULT '',
  attachment_mime TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE job_updates ADD COLUMN IF NOT EXISTS update_type TEXT NOT NULL DEFAULT '';
ALTER TABLE job_updates ADD COLUMN IF NOT EXISTS work_done TEXT NOT NULL DEFAULT '';
ALTER TABLE job_updates ADD COLUMN IF NOT EXISTS codes_used TEXT NOT NULL DEFAULT '[]';
ALTER TABLE job_updates ADD COLUMN IF NOT EXISTS attachment_name TEXT NOT NULL DEFAULT '';
ALTER TABLE job_updates ADD COLUMN IF NOT EXISTS attachment_path TEXT NOT NULL DEFAULT '';
ALTER TABLE job_updates ADD COLUMN IF NOT EXISTS attachment_mime TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS job_update_attachments (
  id BIGSERIAL PRIMARY KEY,
  job_update_id BIGINT NOT NULL REFERENCES job_updates(id) ON DELETE CASCADE,
  attachment_name TEXT NOT NULL DEFAULT '',
  attachment_path TEXT NOT NULL DEFAULT '',
  attachment_mime TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_stage_events (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exited_at TIMESTAMPTZ,
  actor_role TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_start_at ON jobs (scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_to ON jobs (assigned_to);
CREATE INDEX IF NOT EXISTS idx_jobs_intake_status ON jobs (intake_status);
CREATE INDEX IF NOT EXISTS idx_jobs_field_status ON jobs (field_status);
CREATE INDEX IF NOT EXISTS idx_job_updates_job_id ON job_updates (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_update_attachments_update_id ON job_update_attachments (job_update_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_stage_events_job_id ON job_stage_events (job_id, entered_at DESC);
