import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { seedCrews, seedJobs, seedUsers } from "./seed-data.js";

function addColumnIfMissing(db, sql) {
  try {
    db.exec(sql);
  } catch (error) {
    if (!String(error.message || "").includes("duplicate column name")) {
      throw error;
    }
  }
}

function hydrateLegacyJobData(db) {
  db.exec(`
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
        WHEN COALESCE(actual_hours, 0) = 0 AND completion > 0 THEN ROUND((40 + COALESCE(duration_variance, 0) / 2.0) * (completion / 100.0), 1)
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
  db.exec(`
    UPDATE job_updates
    SET
      attachment_name = COALESCE(attachment_name, ''),
      attachment_path = COALESCE(attachment_path, ''),
      attachment_mime = COALESCE(attachment_mime, '')
  `);
}

function listCrewsWithUtilization(db) {
  const crews = db.prepare("SELECT id, name, type, capacity, note FROM crews ORDER BY name").all();
  const activeAssignments = db.prepare(`
    SELECT assigned_to, COUNT(*) AS assigned
    FROM jobs
    WHERE assigned_to IS NOT NULL AND assigned_to != '' AND field_status NOT IN ('Completed', 'Closed')
    GROUP BY assigned_to
  `).all();
  const byName = new Map(activeAssignments.map((row) => [row.assigned_to, row.assigned]));

  return crews.map((crew) => {
    const assigned = byName.get(crew.name) || 0;
    return {
      id: crew.id,
      name: crew.name,
      type: crew.type,
      capacity: crew.capacity,
      assigned,
      available: Math.max(crew.capacity - assigned, 0),
      utilization: Math.round((assigned / crew.capacity) * 100),
      note: crew.note
    };
  });
}

export async function createSqliteAdapter({ dataDir, dbFile, hashPassword, nowIso }) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new DatabaseSync(dbFile);
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'field')),
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'field')),
      token TEXT NOT NULL UNIQUE,
      invited_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      redeemed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS crews (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      note TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      market TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      job_type TEXT NOT NULL,
      priority TEXT NOT NULL,
      intake_status TEXT NOT NULL,
      scheduled_start_at TEXT NOT NULL,
      assigned_to TEXT,
      field_status TEXT NOT NULL,
      completion INTEGER NOT NULL DEFAULT 0,
      budget REAL NOT NULL DEFAULT 1.5,
      issue TEXT NOT NULL,
      quality_score INTEGER NOT NULL DEFAULT 90,
      duration_variance INTEGER NOT NULL DEFAULT 0,
      job_value REAL NOT NULL DEFAULT 0,
      labor_cost REAL NOT NULL DEFAULT 0,
      planned_hours REAL NOT NULL DEFAULT 8,
      actual_hours REAL NOT NULL DEFAULT 0,
      blocker_reason TEXT NOT NULL DEFAULT '',
      blocker_stage TEXT NOT NULL DEFAULT '',
      lifecycle_stage TEXT NOT NULL DEFAULT 'Uploaded',
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS job_updates (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      attachment_name TEXT NOT NULL DEFAULT '',
      attachment_path TEXT NOT NULL DEFAULT '',
      attachment_mime TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);

  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN job_value REAL NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN labor_cost REAL NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN planned_hours REAL NOT NULL DEFAULT 8");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN actual_hours REAL NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN blocker_reason TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN blocker_stage TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN lifecycle_stage TEXT NOT NULL DEFAULT 'Uploaded'");
  addColumnIfMissing(db, "ALTER TABLE job_updates ADD COLUMN attachment_name TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE job_updates ADD COLUMN attachment_path TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE job_updates ADD COLUMN attachment_mime TEXT NOT NULL DEFAULT ''");
  hydrateLegacyJobData(db);

  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, name, role, status, created_at)
    VALUES (?, ?, ?, ?, 'active', ?)
  `);
  seedUsers.forEach((seedUser) => {
    const userExists = db.prepare("SELECT id FROM users WHERE email = ?").get(seedUser.email);
    if (!userExists) {
      insertUser.run(seedUser.email, hashPassword(seedUser.password), seedUser.name, seedUser.role, nowIso());
    }
  });

  const crewCount = db.prepare("SELECT COUNT(*) AS count FROM crews").get().count;
  if (!crewCount) {
    const insertCrew = db.prepare("INSERT INTO crews (name, type, capacity, note) VALUES (?, ?, ?, ?)");
    seedCrews.forEach((crew) => insertCrew.run(...crew));
  }

  const jobCount = db.prepare("SELECT COUNT(*) AS count FROM jobs").get().count;
  if (!jobCount) {
    const admin = db.prepare("SELECT id FROM users WHERE email = ?").get(seedUsers[0].email);
    const insertJob = db.prepare(`
      INSERT INTO jobs (
        title, market, requested_by, job_type, priority, intake_status, scheduled_start_at,
        assigned_to, field_status, completion, budget, job_value, labor_cost, planned_hours,
        actual_hours, blocker_reason, blocker_stage, lifecycle_stage, issue, quality_score, duration_variance, created_at, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    seedJobs.forEach((job) => {
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
      insertJob.run(
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
        admin.id
      );
    });
  }

  return {
    kind: "sqlite",
    storagePath: dbFile,
    async findUserByEmail(email) {
      return db.prepare(`
        SELECT id, email, name, role, status, password_hash AS passwordHash
        FROM users WHERE email = ?
      `).get(email);
    },
    async findUserById(id) {
      return db.prepare("SELECT id, email, name, role, status FROM users WHERE id = ?").get(id);
    },
    async createSession(token, userId) {
      db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(token, userId, nowIso());
    },
    async findSessionUser(token) {
      return db.prepare(`
        SELECT sessions.token, users.id, users.email, users.name, users.role, users.status
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token = ?
      `).get(token);
    },
    async deleteSession(token) {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    },
    async findInviteByToken(token) {
      return db.prepare(`
        SELECT id, email, role, redeemed_at AS redeemedAt
        FROM invites WHERE token = ?
      `).get(token);
    },
    async createInvite({ email, role, token, invitedByUserId }) {
      db.prepare(`
        INSERT INTO invites (email, role, token, invited_by_user_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(email.toLowerCase(), role, token, invitedByUserId, nowIso());
    },
    async redeemInvite(inviteId) {
      db.prepare("UPDATE invites SET redeemed_at = ? WHERE id = ?").run(nowIso(), inviteId);
    },
    async listInvites() {
      return db.prepare(`
        SELECT id, email, role, token, created_at AS createdAt, redeemed_at AS redeemedAt
        FROM invites
        ORDER BY id DESC
      `).all();
    },
    async listUsers() {
      return db.prepare(`
        SELECT id, email, name, role, status, created_at AS createdAt
        FROM users
        ORDER BY id DESC
      `).all();
    },
    async createUser({ email, passwordHash, name, role }) {
      const result = db.prepare(`
        INSERT INTO users (email, password_hash, name, role, status, created_at)
        VALUES (?, ?, ?, ?, 'active', ?)
      `).run(email.toLowerCase(), passwordHash, name, role, nowIso());
      return this.findUserById(Number(result.lastInsertRowid));
    },
    async listJobs() {
      return db.prepare(`
        SELECT
          id,
          title,
          market,
          requested_by AS requestedBy,
          job_type AS jobType,
          priority,
          intake_status AS intakeStatus,
          scheduled_start_at AS scheduledStartAt,
          COALESCE(assigned_to, '') AS assignedTo,
          field_status AS fieldStatus,
          completion,
          COALESCE(job_value, budget * 1000000) AS jobValue,
          COALESCE(labor_cost, 0) AS laborCost,
          COALESCE(planned_hours, 8) AS plannedHours,
          COALESCE(actual_hours, 0) AS actualHours,
          COALESCE(blocker_reason, '') AS blockerReason,
          COALESCE(blocker_stage, '') AS blockerStage,
          COALESCE(lifecycle_stage, 'Uploaded') AS lifecycleStage,
          issue,
          quality_score AS qualityScore,
          duration_variance AS durationVariance,
          created_at AS createdAt
        FROM jobs
        ORDER BY datetime(scheduled_start_at) ASC, id DESC
      `).all();
    },
    async findJobById(jobId) {
      return db.prepare(`
        SELECT
          id,
          title,
          market,
          requested_by AS requestedBy,
          job_type AS jobType,
          priority,
          intake_status AS intakeStatus,
          scheduled_start_at AS scheduledStartAt,
          COALESCE(assigned_to, '') AS assignedTo,
          field_status AS fieldStatus,
          completion,
          COALESCE(job_value, budget * 1000000) AS jobValue,
          COALESCE(labor_cost, 0) AS laborCost,
          COALESCE(planned_hours, 8) AS plannedHours,
          COALESCE(actual_hours, 0) AS actualHours,
          COALESCE(blocker_reason, '') AS blockerReason,
          COALESCE(blocker_stage, '') AS blockerStage,
          COALESCE(lifecycle_stage, 'Uploaded') AS lifecycleStage,
          issue,
          quality_score AS qualityScore,
          duration_variance AS durationVariance
        FROM jobs WHERE id = ?
      `).get(jobId);
    },
    async createJob({ title, market, requestedBy, jobType, priority, scheduledStartAt, assignedTo, jobValue, laborCost, plannedHours, blockerReason, createdByUserId }) {
      const normalizedJobValue = Number(jobValue || 0);
      const normalizedLaborCost = Number(laborCost || 0);
      const normalizedPlannedHours = Number(plannedHours || 0) || 8;
      const lifecycleStage = assignedTo ? "Assigned" : "Uploaded";
      const result = db.prepare(`
        INSERT INTO jobs (
          title, market, requested_by, job_type, priority, intake_status, scheduled_start_at,
          assigned_to, field_status, completion, budget, job_value, labor_cost, planned_hours,
          actual_hours, blocker_reason, blocker_stage, lifecycle_stage, issue, quality_score, duration_variance, created_at, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
      );
      return Number(result.lastInsertRowid);
    },
    async updateJob(jobId, next) {
      db.prepare(`
        UPDATE jobs
        SET intake_status = ?, assigned_to = ?, scheduled_start_at = ?, priority = ?,
            field_status = ?, completion = ?, issue = ?, job_value = ?, labor_cost = ?,
            planned_hours = ?, actual_hours = ?, blocker_reason = ?, blocker_stage = ?, lifecycle_stage = ?, duration_variance = ?,
            budget = ?
        WHERE id = ?
      `).run(
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
      );
    },
    async listCrewsWithUtilization() {
      return listCrewsWithUtilization(db);
    },
    async listJobUpdates(jobIds) {
      if (!jobIds.length) {
        return [];
      }
      const placeholders = jobIds.map(() => "?").join(", ");
      return db.prepare(`
        SELECT
          id,
          job_id AS jobId,
          author_name AS authorName,
          author_role AS authorRole,
          note,
          attachment_name AS attachmentName,
          attachment_path AS attachmentPath,
          attachment_mime AS attachmentMime,
          created_at AS createdAt
        FROM job_updates
        WHERE job_id IN (${placeholders})
        ORDER BY datetime(created_at) DESC, id DESC
      `).all(...jobIds);
    },
    async createJobUpdate({ jobId, authorName, authorRole, note, attachmentName, attachmentPath, attachmentMime }) {
      const result = db.prepare(`
        INSERT INTO job_updates (job_id, author_name, author_role, note, attachment_name, attachment_path, attachment_mime, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(jobId, authorName, authorRole, note || "", attachmentName || "", attachmentPath || "", attachmentMime || "", nowIso());
      return Number(result.lastInsertRowid);
    }
  };
}
