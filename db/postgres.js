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
      END
  `);
}

export async function createPostgresAdapter({ databaseUrl, hashPassword, nowIso, rootDir }) {
  const { Pool } = await import("pg");
  const schemaSql = fs.readFileSync(path.join(rootDir, "db", "schema.postgres.sql"), "utf8");
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });

  await pool.query(schemaSql);
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
      await pool.query("INSERT INTO crews (name, type, capacity, note) VALUES ($1, $2, $3, $4)", crew);
    }
  }

  const jobCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM jobs")).rows[0].count);
  if (!jobCount) {
    const admin = await pool.query("SELECT id FROM users WHERE email = $1", [seedUsers[0].email]);
    for (const job of seedJobs) {
      const [title, market, requestedBy, jobType, priority, intakeStatus, scheduledStartAt, assignedTo, fieldStatus, completion, jobValue, laborCost, plannedHours, actualHours, blockerReason, issue, qualityScore, durationVariance] = job;
      const lifecycleStage = fieldStatus === "Completed"
        ? "Completed"
        : assignedTo
          ? "Assigned"
          : intakeStatus === "Submitted"
            ? "Uploaded"
            : intakeStatus === "Review"
              ? "Admin Approved"
              : "Uploaded";
      await pool.query(`
        INSERT INTO jobs (
          title, market, requested_by, job_type, priority, intake_status, scheduled_start_at,
          assigned_to, field_status, completion, budget, job_value, labor_cost, planned_hours,
          actual_hours, blocker_reason, blocker_stage, lifecycle_stage, issue, quality_score, duration_variance, created_at, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      `, [
        title,
        market,
        requestedBy,
        jobType,
        priority,
        intakeStatus,
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
        issue,
        qualityScore,
        durationVariance,
        nowIso(),
        admin.rows[0].id
      ]);
    }
  }

  async function listCrewsWithUtilization() {
    const crews = (await pool.query("SELECT id, name, type, capacity, note FROM crews ORDER BY name")).rows;
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
      return (await pool.query("SELECT id, email, name, role, status FROM users WHERE id = $1", [id])).rows[0];
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
        SELECT id::int AS id, email, name, role, status, created_at AS "createdAt"
        FROM users ORDER BY id DESC
      `)).rows;
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
          job_type AS "jobType",
          priority,
          intake_status AS "intakeStatus",
          to_char(scheduled_start_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS "scheduledStartAt",
          COALESCE(assigned_to, '') AS "assignedTo",
          field_status AS "fieldStatus",
          completion,
          COALESCE(job_value, budget * 1000000)::float8 AS "jobValue",
          COALESCE(labor_cost, 0)::float8 AS "laborCost",
          COALESCE(planned_hours, 8)::float8 AS "plannedHours",
          COALESCE(actual_hours, 0)::float8 AS "actualHours",
          COALESCE(blocker_reason, '') AS "blockerReason",
          COALESCE(blocker_stage, '') AS "blockerStage",
          COALESCE(lifecycle_stage, 'Uploaded') AS "lifecycleStage",
          issue,
          quality_score AS "qualityScore",
          duration_variance AS "durationVariance",
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
          job_type AS "jobType",
          priority,
          intake_status AS "intakeStatus",
          to_char(scheduled_start_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS "scheduledStartAt",
          COALESCE(assigned_to, '') AS "assignedTo",
          field_status AS "fieldStatus",
          completion,
          COALESCE(job_value, budget * 1000000)::float8 AS "jobValue",
          COALESCE(labor_cost, 0)::float8 AS "laborCost",
          COALESCE(planned_hours, 8)::float8 AS "plannedHours",
          COALESCE(actual_hours, 0)::float8 AS "actualHours",
          COALESCE(blocker_reason, '') AS "blockerReason",
          COALESCE(blocker_stage, '') AS "blockerStage",
          COALESCE(lifecycle_stage, 'Uploaded') AS "lifecycleStage",
          issue,
          quality_score AS "qualityScore",
          duration_variance AS "durationVariance"
        FROM jobs WHERE id = $1
      `, [jobId])).rows[0];
    },
    async createJob({ title, market, requestedBy, jobType, priority, scheduledStartAt, assignedTo, jobValue, laborCost, plannedHours, blockerReason, createdByUserId }) {
      const normalizedJobValue = Number(jobValue || 0);
      const normalizedLaborCost = Number(laborCost || 0);
      const normalizedPlannedHours = Number(plannedHours || 0) || 8;
      const lifecycleStage = assignedTo ? "Assigned" : "Uploaded";
      const result = await pool.query(`
        INSERT INTO jobs (
          title, market, requested_by, job_type, priority, intake_status, scheduled_start_at,
          assigned_to, field_status, completion, budget, job_value, labor_cost, planned_hours,
          actual_hours, blocker_reason, blocker_stage, lifecycle_stage, issue, quality_score, duration_variance, created_at, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        RETURNING id
      `, [
        title,
        market,
        requestedBy,
        jobType,
        priority,
        assignedTo ? "Assigned" : "Uploaded",
        scheduledStartAt,
        assignedTo || null,
        assignedTo ? "Assigned" : "Assigned",
        0,
        normalizedJobValue / 1000000,
        normalizedJobValue,
        normalizedLaborCost,
        normalizedPlannedHours,
        0,
        blockerReason || "",
        blockerReason ? lifecycleStage : "",
        lifecycleStage,
        assignedTo
          ? "Job created and assigned. Waiting on crew acknowledgement."
          : "Job uploaded. Review scope, validate materials, and assign before the 24-hour start window.",
        90,
        0,
        nowIso(),
        createdByUserId
      ]);
      return Number(result.rows[0].id);
    },
    async updateJob(jobId, next) {
      await pool.query(`
        UPDATE jobs
        SET intake_status = $1, assigned_to = $2, scheduled_start_at = $3::timestamptz, priority = $4,
            field_status = $5, completion = $6, issue = $7, job_value = $8, labor_cost = $9,
            planned_hours = $10, actual_hours = $11, blocker_reason = $12, blocker_stage = $13, lifecycle_stage = $14, duration_variance = $15,
            budget = $16
        WHERE id = $17
      `, [
        next.intakeStatus,
        next.assignedTo || null,
        next.scheduledStartAt,
        next.priority,
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
        Number(next.durationVariance || 0),
        Number(next.jobValue || 0) / 1000000,
        jobId
      ]);
    },
    async listCrewsWithUtilization() {
      return listCrewsWithUtilization();
    },
    async listJobUpdates(jobIds) {
      if (!jobIds.length) {
        return [];
      }
      return (await pool.query(`
        SELECT
          id::int AS id,
          job_id::int AS "jobId",
          author_name AS "authorName",
          author_role AS "authorRole",
          note,
          attachment_name AS "attachmentName",
          attachment_path AS "attachmentPath",
          attachment_mime AS "attachmentMime",
          created_at AS "createdAt"
        FROM job_updates
        WHERE job_id = ANY($1::int[])
        ORDER BY created_at DESC, id DESC
      `, [jobIds])).rows;
    },
    async createJobUpdate({ jobId, authorName, authorRole, note, attachmentName, attachmentPath, attachmentMime }) {
      const result = await pool.query(`
        INSERT INTO job_updates (job_id, author_name, author_role, note, attachment_name, attachment_path, attachment_mime, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [jobId, authorName, authorRole, note || "", attachmentName || "", attachmentPath || "", attachmentMime || "", nowIso()]);
      return Number(result.rows[0].id);
    }
  };
}
