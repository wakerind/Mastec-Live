import fs from "node:fs";
import path from "node:path";
import { seedCrews, seedJobs, seedUsers } from "./seed-data.js";

async function hydrateLegacyJobData(pool) {
  await pool.query(`
    UPDATE jobs
    SET
      job_value = CASE
        WHEN COALESCE(job_value, 0) = 0 THEN ROUND(COALESCE(budget, 0) * 1000000, 2)
        ELSE job_value
      END,
      labor_cost = CASE
        WHEN COALESCE(labor_cost, 0) = 0 THEN ROUND(COALESCE(budget, 0) * 620000, 2)
        ELSE labor_cost
      END,
      planned_hours = CASE
        WHEN COALESCE(planned_hours, 0) = 0 THEN 40
        ELSE planned_hours
      END,
      actual_hours = CASE
        WHEN COALESCE(actual_hours, 0) = 0 AND completion > 0 THEN ROUND(((40 + COALESCE(duration_variance, 0) / 2.0) * (completion / 100.0))::numeric, 1)
        ELSE actual_hours
      END,
      due_at = COALESCE(due_at, scheduled_start_at),
      assignment_at = COALESCE(assignment_at, created_at),
      blocker_reason = COALESCE(blocker_reason, ''),
      lifecycle_stage = CASE
        WHEN COALESCE(lifecycle_stage, '') != '' THEN lifecycle_stage
        WHEN field_status IN ('Closed') THEN 'Closed'
        WHEN field_status IN ('Completed') THEN 'Completed'
        WHEN field_status IN ('In Progress') THEN 'In Progress'
        WHEN field_status IN ('Acknowledged', 'En Route', 'Assigned') AND COALESCE(assigned_to, '') != '' THEN 'Accepted'
        WHEN intake_status IN ('Scheduled') THEN 'Scheduled'
        WHEN COALESCE(assigned_to, '') != '' THEN 'Assigned'
        WHEN intake_status IN ('Approved', 'Review') THEN 'Admin Approved'
        ELSE 'Uploaded'
      END,
      blocker_stage = CASE
        WHEN COALESCE(blocker_reason, '') != '' AND COALESCE(blocker_stage, '') = '' THEN
          CASE
            WHEN COALESCE(lifecycle_stage, '') != '' THEN lifecycle_stage
            ELSE 'Uploaded'
          END
        ELSE COALESCE(blocker_stage, '')
      END,
      admin_approved = CASE
        WHEN admin_approved IS TRUE THEN admin_approved
        WHEN COALESCE(assigned_to, '') != '' OR intake_status IN ('Approved', 'Review', 'Assigned', 'Scheduled') THEN TRUE
        ELSE FALSE
      END,
      accepted_at = CASE
        WHEN accepted_at IS NOT NULL THEN accepted_at
        WHEN lifecycle_stage IN ('Accepted', 'Scheduled', 'In Progress', 'Completed', 'Admin Reviewed', 'Closed') THEN created_at
        ELSE NULL
      END,
      dispatched_at = CASE
        WHEN dispatched_at IS NOT NULL THEN dispatched_at
        WHEN lifecycle_stage IN ('In Progress', 'Completed', 'Admin Reviewed', 'Closed') THEN started_at
        ELSE NULL
      END,
      started_at = CASE
        WHEN started_at IS NOT NULL THEN started_at
        WHEN lifecycle_stage IN ('In Progress', 'Completed', 'Admin Reviewed', 'Closed') THEN created_at
        ELSE NULL
      END,
      completed_at = CASE
        WHEN completed_at IS NOT NULL THEN completed_at
        WHEN lifecycle_stage IN ('Completed', 'Admin Reviewed', 'Closed') THEN created_at
        ELSE NULL
      END,
      updated_at = COALESCE(updated_at, created_at, NOW()),
      job_version = CASE
        WHEN COALESCE(job_version, 0) <= 0 THEN 1
        ELSE job_version
      END,
      admin_reviewed_at = CASE
        WHEN admin_reviewed_at IS NOT NULL THEN admin_reviewed_at
        WHEN lifecycle_stage IN ('Admin Reviewed', 'Closed') THEN created_at
        ELSE NULL
      END
  `);
  await pool.query(`
    INSERT INTO job_update_attachments (job_update_id, attachment_name, attachment_path, attachment_mime, created_at)
    SELECT id, attachment_name, attachment_path, attachment_mime, created_at
    FROM job_updates
    WHERE attachment_path != ''
      AND NOT EXISTS (
        SELECT 1 FROM job_update_attachments
        WHERE job_update_attachments.job_update_id = job_updates.id
      )
  `);
}

async function ensureJobColumns(pool) {
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS office_address TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS zone_of_work TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_value NUMERIC(12, 2) NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS labor_cost NUMERIC(12, 2) NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS planned_hours NUMERIC(10, 2) NOT NULL DEFAULT 8");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(10, 2) NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_address TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_description TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispatcher_name TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispatcher_phone TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assignment_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS blocker_reason TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS blocker_stage TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT NOT NULL DEFAULT 'Uploaded'");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN NOT NULL DEFAULT FALSE");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rejection_reason TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_version INTEGER NOT NULL DEFAULT 1");
  await pool.query("ALTER TABLE crews ADD COLUMN IF NOT EXISTS contact_name TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE crews ADD COLUMN IF NOT EXISTS contact_email TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE crews ADD COLUMN IF NOT EXISTS contact_phone TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE crews ADD COLUMN IF NOT EXISTS coverage_area TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE crews ADD COLUMN IF NOT EXISTS office_address TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE job_updates ADD COLUMN IF NOT EXISTS update_type TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE job_updates ADD COLUMN IF NOT EXISTS work_done TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE job_updates ADD COLUMN IF NOT EXISTS codes_used TEXT NOT NULL DEFAULT '[]'");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_audit_events (
      id BIGSERIAL PRIMARY KEY,
      job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      actor_role TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      device_time TIMESTAMPTZ,
      server_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      previous_state JSONB NOT NULL DEFAULT '{}'::jsonb,
      next_state JSONB NOT NULL DEFAULT '{}'::jsonb,
      changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_job_audit_events_job_id ON job_audit_events (job_id, server_time DESC)");
}

export async function createPostgresAdapter({ databaseUrl, hashPassword, nowIso, rootDir }) {
  const { Pool } = await import("pg");
  const schemaSql = fs.readFileSync(path.join(rootDir, "db", "schema.postgres.sql"), "utf8");
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });

  await pool.query(schemaSql);
  await ensureJobColumns(pool);
  await hydrateLegacyJobData(pool);

  for (const seedUser of seedUsers) {
    const userExists = await pool.query("SELECT id FROM users WHERE email = $1", [seedUser.email]);
    if (!userExists.rowCount) {
      await pool.query(`
        INSERT INTO users (email, password_hash, name, role, status, created_at)
        VALUES ($1, $2, $3, $4, 'active', $5)
      `, [seedUser.email, hashPassword(seedUser.password), seedUser.name, seedUser.role, nowIso()]);
    }
  }

  const crewCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM crews")).rows[0].count);
  if (!crewCount) {
    for (const crew of seedCrews) {
      await pool.query("INSERT INTO crews (name, type, capacity, note, contact_name, contact_email, contact_phone, coverage_area) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", crew);
    }
  }

  const jobCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM jobs")).rows[0].count);
  if (!jobCount) {
    const admin = await pool.query("SELECT id FROM users WHERE email = $1", [seedUsers[0].email]);
    for (const job of seedJobs) {
      const {
        title,
        market,
        requestedBy,
        jobAddress = "",
        jobType,
        jobDescription = "",
        priority,
        intakeStatus,
        scheduledStartAt,
        assignedTo = null,
        fieldStatus = "Uploaded",
        completion = 0,
        jobValue = 0,
        laborCost = 0,
        plannedHours = 8,
        actualHours = 0,
        blockerReason = "",
        dispatcherName = "",
        dispatcherPhone = "",
        issue = "",
        qualityScore = 90,
        durationVariance = 0
      } = job;
      const lifecycleStage = fieldStatus === "Completed"
        ? "Completed"
        : assignedTo
          ? "Assigned"
          : "Uploaded";
      const createdAt = nowIso();
      const inserted = await pool.query(`
        INSERT INTO jobs (
          title, market, requested_by, job_address, job_type, job_description, priority, intake_status, due_at, assignment_at, scheduled_start_at,
          assigned_to, field_status, completion, budget, job_value, labor_cost, planned_hours,
          actual_hours, blocker_reason, blocker_stage, lifecycle_stage, admin_approved, accepted_at, dispatched_at, started_at, completed_at, admin_reviewed_at, rejected_at, rejection_reason, dispatcher_name, dispatcher_phone, issue, quality_score, duration_variance, updated_at, job_version, created_at, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38::timestamptz, $39, $40::timestamptz, $41)
      `, [
        title,
        market,
        requestedBy,
        jobAddress,
        jobType,
        jobDescription,
        priority,
        intakeStatus,
        scheduledStartAt,
        createdAt,
        scheduledStartAt,
        assignedTo,
        fieldStatus,
        completion,
        jobValue / 1000000,
        jobValue,
        laborCost,
        plannedHours,
        actualHours,
        blockerReason,
        blockerReason ? lifecycleStage : "",
        lifecycleStage,
        lifecycleStage !== "Uploaded",
        null,
        null,
        null,
        null,
        null,
        null,
        "",
        dispatcherName || requestedBy || "",
        dispatcherPhone,
        issue,
        qualityScore,
        durationVariance,
        createdAt,
        1,
        createdAt,
        admin.rows[0].id
      ]);
      await pool.query(`
        INSERT INTO job_stage_events (job_id, stage, entered_at, exited_at, actor_role, actor_name)
        VALUES ($1, $2, $3, NULL, $4, $5)
      `, [Number(inserted.rows[0].id), lifecycleStage, createdAt, "system", "Seed import"]);
    }
  }

  async function listCrewsWithUtilization() {
    const crews = (await pool.query("SELECT id, name, type, capacity, note, contact_name AS \"contactName\", contact_email AS \"contactEmail\", contact_phone AS \"contactPhone\", coverage_area AS \"coverageArea\", office_address AS \"officeAddress\" FROM crews ORDER BY name")).rows;
    const assignments = (await pool.query(`
      SELECT assigned_to AS "assignedTo", COUNT(*)::int AS assigned
      FROM jobs
      WHERE assigned_to IS NOT NULL AND assigned_to != '' AND field_status NOT IN ('Completed', 'Closed')
      GROUP BY assigned_to
    `)).rows;
    const byName = new Map(assignments.map((row) => [row.assignedTo, row.assigned]));

    return crews.map((crew) => {
      const assigned = byName.get(crew.name) || 0;
      return {
        ...crew,
        capacity: Number(crew.capacity),
        assigned,
        available: Math.max(Number(crew.capacity) - assigned, 0),
        utilization: Math.round((assigned / Number(crew.capacity)) * 100)
      };
    });
  }

  return {
    kind: "postgres",
    storagePath: "render-postgres",
    async findUserByEmail(email) {
      return (await pool.query(`
        SELECT id, email, name, role, status, password_hash AS "passwordHash"
        FROM users WHERE email = $1
      `, [email])).rows[0];
    },
    async findUserById(id) {
      return (await pool.query(`
        SELECT
          id, email, name, role, status,
          COALESCE(phone, '') AS phone,
          COALESCE(office_address, '') AS "officeAddress",
          COALESCE(zone_of_work, '') AS "zoneOfWork",
          COALESCE(note, '') AS note
        FROM users WHERE id = $1
      `, [id])).rows[0];
    },
    async createSession(token, userId) {
      await pool.query("INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, $3)", [token, userId, nowIso()]);
    },
    async findSessionUser(token) {
      return (await pool.query(`
        SELECT sessions.token, users.id, users.email, users.name, users.role, users.status
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token = $1
      `, [token])).rows[0];
    },
    async deleteSession(token) {
      await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
    },
    async findInviteByToken(token) {
      return (await pool.query(`
        SELECT id, email, role, redeemed_at AS "redeemedAt"
        FROM invites WHERE token = $1
      `, [token])).rows[0];
    },
    async createInvite({ email, role, token, invitedByUserId }) {
      await pool.query(`
        INSERT INTO invites (email, role, token, invited_by_user_id, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [email.toLowerCase(), role, token, invitedByUserId, nowIso()]);
    },
    async redeemInvite(inviteId) {
      await pool.query("UPDATE invites SET redeemed_at = $1 WHERE id = $2", [nowIso(), inviteId]);
    },
    async listInvites() {
      return (await pool.query(`
        SELECT id::int AS id, email, role, token, created_at AS "createdAt", redeemed_at AS "redeemedAt"
        FROM invites ORDER BY id DESC
      `)).rows;
    },
    async listUsers() {
      return (await pool.query(`
        SELECT
          id::int AS id, email, name, role, status,
          COALESCE(phone, '') AS phone,
          COALESCE(office_address, '') AS "officeAddress",
          COALESCE(zone_of_work, '') AS "zoneOfWork",
          COALESCE(note, '') AS note,
          created_at AS "createdAt"
        FROM users ORDER BY id DESC
      `)).rows;
    },
    async updateUser(userId, next) {
      await pool.query(`
        UPDATE users
        SET name = $1, status = $2, phone = $3, office_address = $4, zone_of_work = $5, note = $6
        WHERE id = $7
      `, [
        next.name || "",
        next.status || "active",
        next.phone || "",
        next.officeAddress || "",
        next.zoneOfWork || "",
        next.note || "",
        userId
      ]);
    },
    async updateCrew(crewId, next) {
      await pool.query(`
        UPDATE crews
        SET contact_name = $1, contact_email = $2, contact_phone = $3, coverage_area = $4, office_address = $5, note = $6
        WHERE id = $7
      `, [
        next.contactName || "",
        next.contactEmail || "",
        next.contactPhone || "",
        next.coverageArea || "",
        next.officeAddress || "",
        next.note || "",
        crewId
      ]);
    },
    async createUser({ email, passwordHash, name, role }) {
      const result = await pool.query(`
        INSERT INTO users (email, password_hash, name, role, status, created_at)
        VALUES ($1, $2, $3, $4, 'active', $5)
        RETURNING id, email, name, role, status
      `, [email.toLowerCase(), passwordHash, name, role, nowIso()]);
      return result.rows[0];
    },
    async listJobs() {
      return (await pool.query(`
        SELECT
          id::int AS id,
          title,
          market,
          requested_by AS "requestedBy",
          COALESCE(job_address, '') AS "jobAddress",
          job_type AS "jobType",
          COALESCE(job_description, '') AS "jobDescription",
          priority,
          intake_status AS "intakeStatus",
          due_at AS "dueAt",
          assignment_at AS "assignmentAt",
          to_char(scheduled_start_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS "scheduledStartAt",
          COALESCE(assigned_to, '') AS "assignedTo",
          COALESCE(dispatcher_name, '') AS "dispatcherName",
          COALESCE(dispatcher_phone, '') AS "dispatcherPhone",
          field_status AS "fieldStatus",
          completion,
          COALESCE(job_value, budget * 1000000)::float8 AS "jobValue",
          COALESCE(labor_cost, 0)::float8 AS "laborCost",
          COALESCE(planned_hours, 8)::float8 AS "plannedHours",
          COALESCE(actual_hours, 0)::float8 AS "actualHours",
          COALESCE(blocker_reason, '') AS "blockerReason",
          COALESCE(blocker_stage, '') AS "blockerStage",
          COALESCE(lifecycle_stage, 'Uploaded') AS "lifecycleStage",
          admin_approved AS "adminApproved",
          accepted_at AS "acceptedAt",
          dispatched_at AS "dispatchedAt",
          started_at AS "startedAt",
          completed_at AS "completedAt",
          admin_reviewed_at AS "adminReviewedAt",
          rejected_at AS "rejectedAt",
           COALESCE(rejection_reason, '') AS "rejectionReason",
           issue,
           quality_score AS "qualityScore",
           duration_variance AS "durationVariance",
           updated_at AS "updatedAt",
           job_version::int AS "jobVersion",
           created_at AS "createdAt"
         FROM jobs
        ORDER BY scheduled_start_at ASC, id DESC
      `)).rows;
    },
    async findJobById(jobId) {
      return (await pool.query(`
        SELECT
          id::int AS id,
          title,
          market,
          requested_by AS "requestedBy",
          COALESCE(job_address, '') AS "jobAddress",
          job_type AS "jobType",
          COALESCE(job_description, '') AS "jobDescription",
          priority,
          intake_status AS "intakeStatus",
          due_at AS "dueAt",
          assignment_at AS "assignmentAt",
          to_char(scheduled_start_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS "scheduledStartAt",
          COALESCE(assigned_to, '') AS "assignedTo",
          COALESCE(dispatcher_name, '') AS "dispatcherName",
          COALESCE(dispatcher_phone, '') AS "dispatcherPhone",
          field_status AS "fieldStatus",
          completion,
          COALESCE(job_value, budget * 1000000)::float8 AS "jobValue",
          COALESCE(labor_cost, 0)::float8 AS "laborCost",
          COALESCE(planned_hours, 8)::float8 AS "plannedHours",
          COALESCE(actual_hours, 0)::float8 AS "actualHours",
          COALESCE(blocker_reason, '') AS "blockerReason",
          COALESCE(blocker_stage, '') AS "blockerStage",
          COALESCE(lifecycle_stage, 'Uploaded') AS "lifecycleStage",
          admin_approved AS "adminApproved",
          accepted_at AS "acceptedAt",
          dispatched_at AS "dispatchedAt",
          started_at AS "startedAt",
          completed_at AS "completedAt",
          admin_reviewed_at AS "adminReviewedAt",
          rejected_at AS "rejectedAt",
           COALESCE(rejection_reason, '') AS "rejectionReason",
           issue,
           quality_score AS "qualityScore",
           duration_variance AS "durationVariance",
           updated_at AS "updatedAt",
           job_version::int AS "jobVersion",
           created_at AS "createdAt"
        FROM jobs WHERE id = $1
      `, [jobId])).rows[0];
    },
    async createJob({ title, market, requestedBy, jobAddress, jobType, jobDescription, priority, dueAt, assignmentAt, scheduledStartAt, assignedTo, dispatcherName, dispatcherPhone, jobValue, laborCost, plannedHours, blockerReason, createdByUserId }) {
      const normalizedJobValue = Number(jobValue || 0);
      const normalizedLaborCost = Number(laborCost || 0);
      const normalizedPlannedHours = Number(plannedHours || 0) || 8;
      const lifecycleStage = assignedTo ? "Assigned" : "Uploaded";
      const result = await pool.query(`
        INSERT INTO jobs (
          title, market, requested_by, job_address, job_type, job_description, priority, intake_status, due_at, assignment_at, scheduled_start_at,
          assigned_to, dispatcher_name, dispatcher_phone, field_status, completion, budget, job_value, labor_cost, planned_hours,
          actual_hours, blocker_reason, blocker_stage, lifecycle_stage, admin_approved, accepted_at, dispatched_at, started_at, completed_at, admin_reviewed_at, issue, quality_score, duration_variance, updated_at, job_version, created_at, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37)
        RETURNING id
      `, [
        title,
        market,
        requestedBy,
        jobAddress || "",
        jobType,
        jobDescription || "",
        priority,
        assignedTo ? "Assigned" : "Uploaded",
        dueAt || scheduledStartAt,
        assignmentAt || nowIso(),
        scheduledStartAt,
        assignedTo || null,
        dispatcherName || requestedBy || "",
        dispatcherPhone || "",
        assignedTo ? "Assigned" : "Uploaded",
        0,
        normalizedJobValue / 1000000,
        normalizedJobValue,
        normalizedLaborCost,
        normalizedPlannedHours,
        0,
        blockerReason || "",
        blockerReason ? lifecycleStage : "",
        lifecycleStage,
        false,
        null,
        null,
        null,
        null,
        null,
        assignedTo
          ? "Job created and assigned. Waiting on crew acknowledgement."
          : "Job uploaded. Review scope, validate materials, and assign before the 24-hour start window.",
        90,
        0,
        nowIso(),
        1,
        nowIso(),
        createdByUserId
      ]);
      const jobId = Number(result.rows[0].id);
      await pool.query(`
        INSERT INTO job_stage_events (job_id, stage, entered_at, exited_at, actor_role, actor_name)
        VALUES ($1, $2, $3, NULL, $4, $5)
      `, [jobId, lifecycleStage, nowIso(), "admin", "Job created"]);
      return jobId;
    },
    async updateJob(jobId, next, expectedJobVersion) {
      const result = await pool.query(`
        UPDATE jobs
        SET intake_status = $1, assigned_to = $2, scheduled_start_at = $3::timestamptz, priority = $4,
            requested_by = $5, job_address = $6, job_description = $7, dispatcher_name = $8, dispatcher_phone = $9, due_at = $10::timestamptz, assignment_at = $11::timestamptz,
            field_status = $12, completion = $13, issue = $14, job_value = $15, labor_cost = $16,
            planned_hours = $17, actual_hours = $18, blocker_reason = $19, blocker_stage = $20, lifecycle_stage = $21, admin_approved = $22, accepted_at = $23, dispatched_at = $24, started_at = $25, completed_at = $26, admin_reviewed_at = $27, rejected_at = $28, rejection_reason = $29, duration_variance = $30,
            budget = $31, updated_at = $32::timestamptz, job_version = $33
        WHERE id = $34 AND job_version = $35
      `, [
        next.intakeStatus,
        next.assignedTo || null,
        next.scheduledStartAt,
        next.priority,
        next.requestedBy || "",
        next.jobAddress || "",
        next.jobDescription || "",
        next.dispatcherName || "",
        next.dispatcherPhone || "",
        next.dueAt || null,
        next.assignmentAt || null,
        next.fieldStatus,
        Number(next.completion),
        next.issue,
        Number(next.jobValue || 0),
        Number(next.laborCost || 0),
        Number(next.plannedHours || 0),
        Number(next.actualHours || 0),
        next.blockerReason || "",
        next.blockerStage || "",
        next.lifecycleStage || "Uploaded",
        Boolean(next.adminApproved),
        next.acceptedAt || null,
        next.dispatchedAt || null,
        next.startedAt || null,
        next.completedAt || null,
        next.adminReviewedAt || null,
        next.rejectedAt || null,
        next.rejectionReason || "",
        Math.round(Number(next.durationVariance || 0)),
        Number(next.jobValue || 0) / 1000000,
        next.updatedAt || nowIso(),
        Number(next.jobVersion || 1),
        jobId,
        Number(expectedJobVersion || 0)
      ]);
      return result.rowCount > 0;
    },
    async listStageEvents(jobIds) {
      if (!jobIds.length) {
        return [];
      }
      return (await pool.query(`
        SELECT
          id::int AS id,
          job_id::int AS "jobId",
          stage,
          entered_at AS "enteredAt",
          exited_at AS "exitedAt",
          actor_role AS "actorRole",
          actor_name AS "actorName"
        FROM job_stage_events
        WHERE job_id = ANY($1::int[])
        ORDER BY entered_at DESC, id DESC
      `, [jobIds])).rows;
    },
    async recordStageTransition({ jobId, toStage, actorRole, actorName, changedAt }) {
      const timestamp = changedAt || nowIso();
      await pool.query(`
        UPDATE job_stage_events
        SET exited_at = $1
        WHERE job_id = $2 AND exited_at IS NULL
      `, [timestamp, jobId]);
      await pool.query(`
        INSERT INTO job_stage_events (job_id, stage, entered_at, exited_at, actor_role, actor_name)
        VALUES ($1, $2, $3, NULL, $4, $5)
      `, [jobId, toStage, timestamp, actorRole || "", actorName || ""]);
    },
    async listCrewsWithUtilization() {
      return listCrewsWithUtilization();
    },
    async listJobUpdates(jobIds) {
      if (!jobIds.length) {
        return [];
      }
      const updates = (await pool.query(`
        SELECT
          id::int AS id,
          job_id::int AS "jobId",
          author_name AS "authorName",
          author_role AS "authorRole",
          update_type AS "updateType",
          work_done AS "workDone",
          codes_used AS "codesUsed",
          note,
          attachment_name AS "attachmentName",
          attachment_path AS "attachmentPath",
          attachment_mime AS "attachmentMime",
          created_at AS "createdAt"
        FROM job_updates
        WHERE job_id = ANY($1::int[])
        ORDER BY created_at DESC, id DESC
      `, [jobIds])).rows;
      const updateIds = updates.map((update) => update.id);
      const attachments = updateIds.length
        ? (await pool.query(`
          SELECT
            id::int AS id,
            job_update_id::int AS "jobUpdateId",
            attachment_name AS "attachmentName",
            attachment_path AS "attachmentPath",
            attachment_mime AS "attachmentMime",
            created_at AS "createdAt"
          FROM job_update_attachments
          WHERE job_update_id = ANY($1::int[])
          ORDER BY id ASC
        `, [updateIds])).rows
        : [];
      const attachmentsByUpdate = new Map();
      attachments.forEach((attachment) => {
        if (!attachmentsByUpdate.has(attachment.jobUpdateId)) {
          attachmentsByUpdate.set(attachment.jobUpdateId, []);
        }
        attachmentsByUpdate.get(attachment.jobUpdateId).push(attachment);
      });
      return updates.map((update) => ({
        ...update,
        codesUsed: JSON.parse(update.codesUsed || "[]"),
        attachments: attachmentsByUpdate.get(update.id) || []
      }));
    },
    async createJobUpdate({ jobId, authorName, authorRole, updateType, workDone, codesUsed, note, attachments }) {
      const result = await pool.query(`
        INSERT INTO job_updates (job_id, author_name, author_role, update_type, work_done, codes_used, note, attachment_name, attachment_path, attachment_mime, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [jobId, authorName, authorRole, updateType || "", workDone || "", JSON.stringify(Array.isArray(codesUsed) ? codesUsed : []), note || "", "", "", "", nowIso()]);
      const updateId = Number(result.rows[0].id);
      for (const attachment of attachments || []) {
        await pool.query(`
          INSERT INTO job_update_attachments (job_update_id, attachment_name, attachment_path, attachment_mime, created_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [updateId, attachment.attachmentName || "", attachment.attachmentPath || "", attachment.attachmentMime || "", nowIso()]);
      }
      return updateId;
    },
    async resetDemoData() {
      const adminSeed = seedUsers[0];
      const fieldSeed = seedUsers[1];
      const [crewName, crewType, crewCapacity, crewNote, crewContactName, crewContactEmail, crewContactPhone, crewCoverageArea] = seedCrews[0];

      await pool.query("BEGIN");
      try {
        await pool.query("DELETE FROM job_update_attachments");
        await pool.query("DELETE FROM job_updates");
        await pool.query("DELETE FROM job_stage_events");
        await pool.query("DELETE FROM job_audit_events");
        await pool.query("DELETE FROM jobs");
        await pool.query("DELETE FROM sessions");
        await pool.query("DELETE FROM invites");

        const existingAdmin = await pool.query("SELECT id FROM users WHERE email = $1", [adminSeed.email]);
        if (existingAdmin.rows.length) {
          await pool.query(`
            UPDATE users
            SET name = $1, role = 'admin', status = 'active', phone = $2, office_address = $3, zone_of_work = $4, note = $5
            WHERE email = $6
          `, [adminSeed.name, "(305) 555-0100", "Miami, FL", "Dispatch", "Primary admin login for the Miami demo environment.", adminSeed.email]);
        } else {
          await pool.query(`
            INSERT INTO users (email, password_hash, name, role, status, phone, office_address, zone_of_work, note, created_at)
            VALUES ($1, $2, $3, 'admin', 'active', $4, $5, $6, $7, $8::timestamptz)
          `, [adminSeed.email, hashPassword(adminSeed.password), adminSeed.name, "(305) 555-0100", "Miami, FL", "Dispatch", "Primary admin login for the Miami demo environment.", nowIso()]);
        }

        const existingField = await pool.query("SELECT id FROM users WHERE email = $1", [fieldSeed.email]);
        if (existingField.rows.length) {
          await pool.query(`
            UPDATE users
            SET name = $1, role = 'field', status = 'active', phone = $2, office_address = $3, zone_of_work = $4, note = $5
            WHERE email = $6
          `, [fieldSeed.name, "(305) 555-0142", "Miami, FL", "Miami-Dade County", "Only field account kept in this demo environment.", fieldSeed.email]);
        } else {
          await pool.query(`
            INSERT INTO users (email, password_hash, name, role, status, phone, office_address, zone_of_work, note, created_at)
            VALUES ($1, $2, $3, 'field', 'active', $4, $5, $6, $7, $8::timestamptz)
          `, [fieldSeed.email, hashPassword(fieldSeed.password), fieldSeed.name, "(305) 555-0142", "Miami, FL", "Miami-Dade County", "Only field account kept in this demo environment.", nowIso()]);
        }
        await pool.query("DELETE FROM users WHERE role = 'field' AND email != $1", [fieldSeed.email]);

        await pool.query("DELETE FROM crews WHERE name != $1", [crewName]);
        const existingCrew = await pool.query("SELECT id FROM crews WHERE name = $1", [crewName]);
        if (existingCrew.rows.length) {
          await pool.query(`
            UPDATE crews
            SET type = $1, capacity = $2, note = $3, contact_name = $4, contact_email = $5, contact_phone = $6, coverage_area = $7, office_address = $8
            WHERE id = $9
          `, [crewType, crewCapacity, crewNote, crewContactName, crewContactEmail, crewContactPhone, crewCoverageArea, "Miami, FL", existingCrew.rows[0].id]);
        } else {
          await pool.query(`
            INSERT INTO crews (name, type, capacity, note, contact_name, contact_email, contact_phone, coverage_area, office_address)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [crewName, crewType, crewCapacity, crewNote, crewContactName, crewContactEmail, crewContactPhone, crewCoverageArea, "Miami, FL"]);
        }

        const admin = await pool.query("SELECT id FROM users WHERE email = $1", [adminSeed.email]);
        for (const job of seedJobs) {
          const createdAt = nowIso();
          const inserted = await pool.query(`
            INSERT INTO jobs (
              title, market, requested_by, job_address, job_type, job_description, priority, intake_status, due_at, assignment_at, scheduled_start_at,
              assigned_to, dispatcher_name, dispatcher_phone, field_status, completion, budget, job_value, labor_cost, planned_hours,
              actual_hours, blocker_reason, blocker_stage, lifecycle_stage, admin_approved, accepted_at, dispatched_at, started_at, completed_at, admin_reviewed_at, rejected_at, rejection_reason, issue, quality_score, duration_variance, updated_at, job_version, created_at, created_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Uploaded', $8::timestamptz, $9::timestamptz, $10::timestamptz, NULL, $11, $12, 'Uploaded', 0, $13, $14, $15, $16, 0, '', '', 'Uploaded', FALSE, NULL, NULL, NULL, NULL, NULL, NULL, '', $17, $18, 0, $19::timestamptz, 1, $20::timestamptz, $21)
            RETURNING id
          `, [
            job.title,
            job.market,
            job.requestedBy,
            job.jobAddress || "",
            job.jobType,
            job.jobDescription || "",
            job.priority,
            job.scheduledStartAt,
            createdAt,
            job.scheduledStartAt,
            job.dispatcherName || job.requestedBy || "",
            job.dispatcherPhone || "",
            Number(job.jobValue || 0) / 1000000,
            Number(job.jobValue || 0),
            Number(job.laborCost || 0),
            Number(job.plannedHours || 8),
            "Job uploaded and waiting for dispatcher review and assignment.",
            Number(job.qualityScore || 90),
            createdAt,
            createdAt,
            admin.rows[0].id
          ]);
          await pool.query(`
            INSERT INTO job_stage_events (job_id, stage, entered_at, exited_at, actor_role, actor_name)
            VALUES ($1, $2, $3::timestamptz, NULL, $4, $5)
          `, [Number(inserted.rows[0].id), "Uploaded", createdAt, "admin", adminSeed.name]);
        }

        await pool.query("COMMIT");
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    },
    async recordJobAuditEvent({ jobId, action, actorRole, actorName, source, deviceTime, serverTime, previousState, nextState, changedFields }) {
      await pool.query(`
        INSERT INTO job_audit_events (job_id, action, actor_role, actor_name, source, device_time, server_time, previous_state, next_state, changed_fields)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8::jsonb, $9::jsonb, $10::jsonb)
      `, [
        jobId,
        action || "updateJob",
        actorRole || "",
        actorName || "",
        source || "",
        deviceTime || null,
        serverTime || nowIso(),
        JSON.stringify(previousState || {}),
        JSON.stringify(nextState || {}),
        JSON.stringify(Array.isArray(changedFields) ? changedFields : [])
      ]);
    },
    async listJobAuditEvents(jobIds) {
      if (!jobIds.length) {
        return [];
      }
      return (await pool.query(`
        SELECT
          id::int AS id,
          job_id::int AS "jobId",
          action,
          actor_role AS "actorRole",
          actor_name AS "actorName",
          source,
          device_time AS "deviceTime",
          server_time AS "serverTime",
          previous_state AS "previousState",
          next_state AS "nextState",
          changed_fields AS "changedFields"
        FROM job_audit_events
        WHERE job_id = ANY($1::int[])
        ORDER BY server_time DESC, id DESC
      `, [jobIds])).rows;
    }
  };
}
