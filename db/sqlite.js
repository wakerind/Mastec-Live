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
        WHEN COALESCE(admin_approved, 0) != 0 THEN admin_approved
        WHEN COALESCE(assigned_to, '') != '' OR intake_status IN ('Approved', 'Review', 'Assigned', 'Scheduled') THEN 1
        ELSE 0
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
      admin_reviewed_at = CASE
        WHEN admin_reviewed_at IS NOT NULL THEN admin_reviewed_at
        WHEN lifecycle_stage IN ('Admin Reviewed', 'Closed') THEN created_at
        ELSE NULL
      END
  `);
  db.exec(`
    UPDATE job_updates
    SET
      attachment_name = COALESCE(attachment_name, ''),
      attachment_path = COALESCE(attachment_path, ''),
      attachment_mime = COALESCE(attachment_mime, '')
  `);
  db.exec(`
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

function listCrewsWithUtilization(db) {
  const crews = db.prepare("SELECT id, name, type, capacity, note, contact_name, contact_email, contact_phone, coverage_area, office_address FROM crews ORDER BY name").all();
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
      note: crew.note,
      contactName: crew.contact_name,
      contactEmail: crew.contact_email,
      contactPhone: crew.contact_phone,
      coverageArea: crew.coverage_area,
      officeAddress: crew.office_address
    };
  });
}

function safeParseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
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
      phone TEXT NOT NULL DEFAULT '',
      office_address TEXT NOT NULL DEFAULT '',
      zone_of_work TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
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
      note TEXT NOT NULL,
      contact_name TEXT NOT NULL DEFAULT '',
      contact_email TEXT NOT NULL DEFAULT '',
      contact_phone TEXT NOT NULL DEFAULT '',
      coverage_area TEXT NOT NULL DEFAULT '',
      office_address TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      market TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      job_address TEXT NOT NULL DEFAULT '',
      job_type TEXT NOT NULL,
      job_description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL,
      intake_status TEXT NOT NULL,
      due_at TEXT,
      assignment_at TEXT,
      scheduled_start_at TEXT NOT NULL,
      assigned_to TEXT,
      dispatcher_name TEXT NOT NULL DEFAULT '',
      dispatcher_phone TEXT NOT NULL DEFAULT '',
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
      admin_approved INTEGER NOT NULL DEFAULT 0,
      accepted_at TEXT,
      dispatched_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      admin_reviewed_at TEXT,
      rejected_at TEXT,
      rejection_reason TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      job_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS job_updates (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      update_type TEXT NOT NULL DEFAULT '',
      work_done TEXT NOT NULL DEFAULT '',
      codes_used TEXT NOT NULL DEFAULT '[]',
      note TEXT NOT NULL DEFAULT '',
      attachment_name TEXT NOT NULL DEFAULT '',
      attachment_path TEXT NOT NULL DEFAULT '',
      attachment_mime TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_update_attachments (
      id INTEGER PRIMARY KEY,
      job_update_id INTEGER NOT NULL REFERENCES job_updates(id) ON DELETE CASCADE,
      attachment_name TEXT NOT NULL DEFAULT '',
      attachment_path TEXT NOT NULL DEFAULT '',
      attachment_mime TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_stage_events (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      entered_at TEXT NOT NULL,
      exited_at TEXT,
      actor_role TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS job_audit_events (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      actor_role TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      device_time TEXT,
      server_time TEXT NOT NULL,
      previous_state TEXT NOT NULL DEFAULT '{}',
      next_state TEXT NOT NULL DEFAULT '{}',
      changed_fields TEXT NOT NULL DEFAULT '[]'
    );
  `);

  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN job_value REAL NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN labor_cost REAL NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN planned_hours REAL NOT NULL DEFAULT 8");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN actual_hours REAL NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN job_address TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN job_description TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN dispatcher_name TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN dispatcher_phone TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN due_at TEXT");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN assignment_at TEXT");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN blocker_reason TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN blocker_stage TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN lifecycle_stage TEXT NOT NULL DEFAULT 'Uploaded'");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN admin_approved INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN accepted_at TEXT");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN dispatched_at TEXT");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN started_at TEXT");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN completed_at TEXT");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN admin_reviewed_at TEXT");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN rejected_at TEXT");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN rejection_reason TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE jobs ADD COLUMN job_version INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing(db, "ALTER TABLE crews ADD COLUMN contact_name TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE crews ADD COLUMN contact_email TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE crews ADD COLUMN contact_phone TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE crews ADD COLUMN coverage_area TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE crews ADD COLUMN office_address TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE users ADD COLUMN office_address TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE users ADD COLUMN zone_of_work TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE users ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE job_updates ADD COLUMN update_type TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE job_updates ADD COLUMN work_done TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE job_updates ADD COLUMN codes_used TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "ALTER TABLE job_updates ADD COLUMN attachment_name TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE job_updates ADD COLUMN attachment_path TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "ALTER TABLE job_updates ADD COLUMN attachment_mime TEXT NOT NULL DEFAULT ''");
  db.exec(`
    UPDATE jobs
    SET
      updated_at = CASE
        WHEN COALESCE(updated_at, '') = '' THEN created_at
        ELSE updated_at
      END,
      job_version = CASE
        WHEN COALESCE(job_version, 0) <= 0 THEN 1
        ELSE job_version
      END
  `);
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
    const insertCrew = db.prepare("INSERT INTO crews (name, type, capacity, note, contact_name, contact_email, contact_phone, coverage_area) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    seedCrews.forEach((crew) => insertCrew.run(...crew));
  }

  const jobCount = db.prepare("SELECT COUNT(*) AS count FROM jobs").get().count;
  if (!jobCount) {
    const admin = db.prepare("SELECT id FROM users WHERE email = ?").get(seedUsers[0].email);
    const insertJob = db.prepare(`
      INSERT INTO jobs (
        title, market, requested_by, job_address, job_type, job_description, priority, intake_status, due_at, assignment_at, scheduled_start_at,
        assigned_to, field_status, completion, budget, job_value, labor_cost, planned_hours,
        actual_hours, blocker_reason, blocker_stage, lifecycle_stage, admin_approved, accepted_at, dispatched_at, started_at, completed_at, admin_reviewed_at, rejected_at, rejection_reason, dispatcher_name, dispatcher_phone, issue, quality_score, duration_variance, updated_at, job_version, created_at, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    seedJobs.forEach((job) => {
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
      const result = insertJob.run(
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
        lifecycleStage !== "Uploaded" ? 1 : 0,
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
        admin.id
      );
      db.prepare(`
        INSERT INTO job_stage_events (job_id, stage, entered_at, exited_at, actor_role, actor_name)
        VALUES (?, ?, ?, NULL, ?, ?)
      `).run(Number(result.lastInsertRowid), lifecycleStage, createdAt, "system", "Seed import");
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
      return db.prepare(`
        SELECT
          id, email, name, role, status,
          COALESCE(phone, '') AS phone,
          COALESCE(office_address, '') AS officeAddress,
          COALESCE(zone_of_work, '') AS zoneOfWork,
          COALESCE(note, '') AS note
        FROM users WHERE id = ?
      `).get(id);
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
        SELECT
          id, email, name, role, status,
          COALESCE(phone, '') AS phone,
          COALESCE(office_address, '') AS officeAddress,
          COALESCE(zone_of_work, '') AS zoneOfWork,
          COALESCE(note, '') AS note,
          created_at AS createdAt
        FROM users
        ORDER BY id DESC
      `).all();
    },
    async updateUser(userId, next) {
      db.prepare(`
        UPDATE users
        SET name = ?, status = ?, phone = ?, office_address = ?, zone_of_work = ?, note = ?
        WHERE id = ?
      `).run(
        next.name || "",
        next.status || "active",
        next.phone || "",
        next.officeAddress || "",
        next.zoneOfWork || "",
        next.note || "",
        userId
      );
    },
    async updateCrew(crewId, next) {
      db.prepare(`
        UPDATE crews
        SET contact_name = ?, contact_email = ?, contact_phone = ?, coverage_area = ?, office_address = ?, note = ?
        WHERE id = ?
      `).run(
        next.contactName || "",
        next.contactEmail || "",
        next.contactPhone || "",
        next.coverageArea || "",
        next.officeAddress || "",
        next.note || "",
        crewId
      );
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
          COALESCE(job_address, '') AS jobAddress,
          job_type AS jobType,
          COALESCE(job_description, '') AS jobDescription,
          priority,
          intake_status AS intakeStatus,
          due_at AS dueAt,
          assignment_at AS assignmentAt,
          scheduled_start_at AS scheduledStartAt,
          COALESCE(assigned_to, '') AS assignedTo,
          COALESCE(dispatcher_name, '') AS dispatcherName,
          COALESCE(dispatcher_phone, '') AS dispatcherPhone,
          field_status AS fieldStatus,
          completion,
          COALESCE(job_value, budget * 1000000) AS jobValue,
          COALESCE(labor_cost, 0) AS laborCost,
          COALESCE(planned_hours, 8) AS plannedHours,
          COALESCE(actual_hours, 0) AS actualHours,
          COALESCE(blocker_reason, '') AS blockerReason,
          COALESCE(blocker_stage, '') AS blockerStage,
          COALESCE(lifecycle_stage, 'Uploaded') AS lifecycleStage,
          admin_approved AS adminApproved,
          accepted_at AS acceptedAt,
          dispatched_at AS dispatchedAt,
          started_at AS startedAt,
          completed_at AS completedAt,
           admin_reviewed_at AS adminReviewedAt,
           rejected_at AS rejectedAt,
           COALESCE(rejection_reason, '') AS rejectionReason,
           issue,
           quality_score AS qualityScore,
           duration_variance AS durationVariance,
           updated_at AS updatedAt,
           job_version AS jobVersion,
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
          COALESCE(job_address, '') AS jobAddress,
          job_type AS jobType,
          COALESCE(job_description, '') AS jobDescription,
          priority,
          intake_status AS intakeStatus,
          due_at AS dueAt,
          assignment_at AS assignmentAt,
          scheduled_start_at AS scheduledStartAt,
          COALESCE(assigned_to, '') AS assignedTo,
          COALESCE(dispatcher_name, '') AS dispatcherName,
          COALESCE(dispatcher_phone, '') AS dispatcherPhone,
          field_status AS fieldStatus,
          completion,
          COALESCE(job_value, budget * 1000000) AS jobValue,
          COALESCE(labor_cost, 0) AS laborCost,
          COALESCE(planned_hours, 8) AS plannedHours,
          COALESCE(actual_hours, 0) AS actualHours,
          COALESCE(blocker_reason, '') AS blockerReason,
          COALESCE(blocker_stage, '') AS blockerStage,
          COALESCE(lifecycle_stage, 'Uploaded') AS lifecycleStage,
          admin_approved AS adminApproved,
          accepted_at AS acceptedAt,
          dispatched_at AS dispatchedAt,
          started_at AS startedAt,
          completed_at AS completedAt,
           admin_reviewed_at AS adminReviewedAt,
           rejected_at AS rejectedAt,
           COALESCE(rejection_reason, '') AS rejectionReason,
           issue,
           quality_score AS qualityScore,
           duration_variance AS durationVariance,
           updated_at AS updatedAt,
           job_version AS jobVersion,
           created_at AS createdAt
         FROM jobs WHERE id = ?
      `).get(jobId);
    },
    async createJob({ title, market, requestedBy, jobAddress, jobType, jobDescription, priority, dueAt, assignmentAt, scheduledStartAt, assignedTo, dispatcherName, dispatcherPhone, jobValue, laborCost, plannedHours, blockerReason, createdByUserId }) {
      const normalizedJobValue = Number(jobValue || 0);
      const normalizedLaborCost = Number(laborCost || 0);
      const normalizedPlannedHours = Number(plannedHours || 0) || 8;
      const lifecycleStage = assignedTo ? "Assigned" : "Uploaded";
      const result = db.prepare(`
        INSERT INTO jobs (
          title, market, requested_by, job_address, job_type, job_description, priority, intake_status, due_at, assignment_at, scheduled_start_at,
          assigned_to, dispatcher_name, dispatcher_phone, field_status, completion, budget, job_value, labor_cost, planned_hours,
          actual_hours, blocker_reason, blocker_stage, lifecycle_stage, admin_approved, accepted_at, dispatched_at, started_at, completed_at, admin_reviewed_at, issue, quality_score, duration_variance, updated_at, job_version, created_at, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
        0,
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
      );
      const jobId = Number(result.lastInsertRowid);
      db.prepare(`
        INSERT INTO job_stage_events (job_id, stage, entered_at, exited_at, actor_role, actor_name)
        VALUES (?, ?, ?, NULL, ?, ?)
      `).run(jobId, lifecycleStage, nowIso(), "admin", "Job created");
      return jobId;
    },
    async updateJob(jobId, next, expectedJobVersion) {
      const result = db.prepare(`
        UPDATE jobs
        SET intake_status = ?, assigned_to = ?, scheduled_start_at = ?, priority = ?,
            requested_by = ?, job_address = ?, job_description = ?, dispatcher_name = ?, dispatcher_phone = ?, due_at = ?, assignment_at = ?,
            field_status = ?, completion = ?, issue = ?, job_value = ?, labor_cost = ?,
            planned_hours = ?, actual_hours = ?, blocker_reason = ?, blocker_stage = ?, lifecycle_stage = ?, admin_approved = ?, accepted_at = ?, dispatched_at = ?, started_at = ?, completed_at = ?, admin_reviewed_at = ?, rejected_at = ?, rejection_reason = ?, duration_variance = ?,
            budget = ?, updated_at = ?, job_version = ?
        WHERE id = ? AND job_version = ?
      `).run(
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
        next.adminApproved ? 1 : 0,
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
      );
      return result.changes > 0;
    },
    async listStageEvents(jobIds) {
      if (!jobIds.length) {
        return [];
      }
      const placeholders = jobIds.map(() => "?").join(", ");
      return db.prepare(`
        SELECT
          id,
          job_id AS jobId,
          stage,
          entered_at AS enteredAt,
          exited_at AS exitedAt,
          actor_role AS actorRole,
          actor_name AS actorName
        FROM job_stage_events
        WHERE job_id IN (${placeholders})
        ORDER BY datetime(entered_at) DESC, id DESC
      `).all(...jobIds);
    },
    async recordStageTransition({ jobId, toStage, actorRole, actorName, changedAt }) {
      const timestamp = changedAt || nowIso();
      db.prepare(`
        UPDATE job_stage_events
        SET exited_at = ?
        WHERE job_id = ? AND exited_at IS NULL
      `).run(timestamp, jobId);
      db.prepare(`
        INSERT INTO job_stage_events (job_id, stage, entered_at, exited_at, actor_role, actor_name)
        VALUES (?, ?, ?, NULL, ?, ?)
      `).run(jobId, toStage, timestamp, actorRole || "", actorName || "");
    },
    async listCrewsWithUtilization() {
      return listCrewsWithUtilization(db);
    },
    async listJobUpdates(jobIds) {
      if (!jobIds.length) {
        return [];
      }
      const placeholders = jobIds.map(() => "?").join(", ");
      const updates = db.prepare(`
        SELECT
          id,
          job_id AS jobId,
          author_name AS authorName,
          author_role AS authorRole,
          update_type AS updateType,
          work_done AS workDone,
          codes_used AS codesUsed,
          note,
          attachment_name AS attachmentName,
          attachment_path AS attachmentPath,
          attachment_mime AS attachmentMime,
          created_at AS createdAt
        FROM job_updates
        WHERE job_id IN (${placeholders})
        ORDER BY datetime(created_at) DESC, id DESC
      `).all(...jobIds);
      const updateIds = updates.map((update) => update.id);
      const attachmentPlaceholders = updateIds.map(() => "?").join(", ");
      const attachments = updateIds.length
        ? db.prepare(`
          SELECT
            id,
            job_update_id AS jobUpdateId,
            attachment_name AS attachmentName,
            attachment_path AS attachmentPath,
            attachment_mime AS attachmentMime,
            created_at AS createdAt
          FROM job_update_attachments
          WHERE job_update_id IN (${attachmentPlaceholders})
          ORDER BY id ASC
        `).all(...updateIds)
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
      const result = db.prepare(`
        INSERT INTO job_updates (job_id, author_name, author_role, update_type, work_done, codes_used, note, attachment_name, attachment_path, attachment_mime, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(jobId, authorName, authorRole, updateType || "", workDone || "", JSON.stringify(Array.isArray(codesUsed) ? codesUsed : []), note || "", "", "", "", nowIso());
      const updateId = Number(result.lastInsertRowid);
      const insertAttachment = db.prepare(`
        INSERT INTO job_update_attachments (job_update_id, attachment_name, attachment_path, attachment_mime, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      (attachments || []).forEach((attachment) => {
        insertAttachment.run(
          updateId,
          attachment.attachmentName || "",
          attachment.attachmentPath || "",
          attachment.attachmentMime || "",
          nowIso()
        );
      });
      return Number(result.lastInsertRowid);
    },
    async resetDemoData() {
      const adminSeed = seedUsers[0];
      const fieldSeed = seedUsers[1];
      const [crewName, crewType, crewCapacity, crewNote, crewContactName, crewContactEmail, crewContactPhone, crewCoverageArea] = seedCrews[0];

      db.exec("BEGIN");
      try {
        db.prepare("DELETE FROM job_update_attachments").run();
        db.prepare("DELETE FROM job_updates").run();
        db.prepare("DELETE FROM job_stage_events").run();
        db.prepare("DELETE FROM job_audit_events").run();
        db.prepare("DELETE FROM jobs").run();
        db.prepare("DELETE FROM sessions").run();
        db.prepare("DELETE FROM invites").run();

        const existingAdmin = db.prepare("SELECT id FROM users WHERE email = ?").get(adminSeed.email);
        if (existingAdmin) {
          db.prepare(`
            UPDATE users
            SET name = ?, role = 'admin', status = 'active', phone = ?, office_address = ?, zone_of_work = ?, note = ?
            WHERE email = ?
          `).run(adminSeed.name, "(305) 555-0100", "Miami, FL", "Dispatch", "Primary admin login for the Miami demo environment.", adminSeed.email);
        } else {
          db.prepare(`
            INSERT INTO users (email, password_hash, name, role, status, phone, office_address, zone_of_work, note, created_at)
            VALUES (?, ?, ?, 'admin', 'active', ?, ?, ?, ?, ?)
          `).run(adminSeed.email, hashPassword(adminSeed.password), adminSeed.name, "(305) 555-0100", "Miami, FL", "Dispatch", "Primary admin login for the Miami demo environment.", nowIso());
        }

        const existingField = db.prepare("SELECT id FROM users WHERE email = ?").get(fieldSeed.email);
        if (existingField) {
          db.prepare(`
            UPDATE users
            SET name = ?, role = 'field', status = 'active', phone = ?, office_address = ?, zone_of_work = ?, note = ?
            WHERE email = ?
          `).run(fieldSeed.name, "(305) 555-0142", "Miami, FL", "Miami-Dade County", "Only field account kept in this demo environment.", fieldSeed.email);
        } else {
          db.prepare(`
            INSERT INTO users (email, password_hash, name, role, status, phone, office_address, zone_of_work, note, created_at)
            VALUES (?, ?, ?, 'field', 'active', ?, ?, ?, ?, ?)
          `).run(fieldSeed.email, hashPassword(fieldSeed.password), fieldSeed.name, "(305) 555-0142", "Miami, FL", "Miami-Dade County", "Only field account kept in this demo environment.", nowIso());
        }
        db.prepare("DELETE FROM users WHERE role = 'field' AND email != ?").run(fieldSeed.email);

        db.prepare("DELETE FROM crews WHERE name != ?").run(crewName);
        const existingCrew = db.prepare("SELECT id FROM crews WHERE name = ?").get(crewName);
        if (existingCrew) {
          db.prepare(`
            UPDATE crews
            SET type = ?, capacity = ?, note = ?, contact_name = ?, contact_email = ?, contact_phone = ?, coverage_area = ?, office_address = ?
            WHERE id = ?
          `).run(crewType, crewCapacity, crewNote, crewContactName, crewContactEmail, crewContactPhone, crewCoverageArea, "Miami, FL", existingCrew.id);
        } else {
          db.prepare(`
            INSERT INTO crews (name, type, capacity, note, contact_name, contact_email, contact_phone, coverage_area, office_address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(crewName, crewType, crewCapacity, crewNote, crewContactName, crewContactEmail, crewContactPhone, crewCoverageArea, "Miami, FL");
        }

        const admin = db.prepare("SELECT id FROM users WHERE email = ?").get(adminSeed.email);
        const insertJob = db.prepare(`
          INSERT INTO jobs (
            title, market, requested_by, job_address, job_type, job_description, priority, intake_status, due_at, assignment_at, scheduled_start_at,
            assigned_to, dispatcher_name, dispatcher_phone, field_status, completion, budget, job_value, labor_cost, planned_hours,
            actual_hours, blocker_reason, blocker_stage, lifecycle_stage, admin_approved, accepted_at, dispatched_at, started_at, completed_at, admin_reviewed_at, rejected_at, rejection_reason, issue, quality_score, duration_variance, updated_at, job_version, created_at, created_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertStage = db.prepare(`
          INSERT INTO job_stage_events (job_id, stage, entered_at, exited_at, actor_role, actor_name)
          VALUES (?, ?, ?, NULL, ?, ?)
        `);
        seedJobs.forEach((job) => {
          const createdAt = nowIso();
          const result = insertJob.run(
            job.title,
            job.market,
            job.requestedBy,
            job.jobAddress || "",
            job.jobType,
            job.jobDescription || "",
            job.priority,
            "Uploaded",
            job.scheduledStartAt,
            createdAt,
            job.scheduledStartAt,
            null,
            job.dispatcherName || job.requestedBy || "",
            job.dispatcherPhone || "",
            "Uploaded",
            0,
            Number(job.jobValue || 0) / 1000000,
            Number(job.jobValue || 0),
            Number(job.laborCost || 0),
            Number(job.plannedHours || 8),
            0,
            "",
            "",
            "Uploaded",
            0,
            null,
            null,
            null,
            null,
            null,
            null,
            "",
            "Job uploaded and waiting for dispatcher review and assignment.",
            Number(job.qualityScore || 90),
            0,
            createdAt,
            1,
            createdAt,
            admin.id
          );
          insertStage.run(Number(result.lastInsertRowid), "Uploaded", createdAt, "admin", adminSeed.name);
        });

        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async recordJobAuditEvent({ jobId, action, actorRole, actorName, source, deviceTime, serverTime, previousState, nextState, changedFields }) {
      db.prepare(`
        INSERT INTO job_audit_events (job_id, action, actor_role, actor_name, source, device_time, server_time, previous_state, next_state, changed_fields)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
      );
    },
    async listJobAuditEvents(jobIds) {
      if (!jobIds.length) {
        return [];
      }
      const placeholders = jobIds.map(() => "?").join(", ");
      return db.prepare(`
        SELECT
          id,
          job_id AS jobId,
          action,
          actor_role AS actorRole,
          actor_name AS actorName,
          source,
          device_time AS deviceTime,
          server_time AS serverTime,
          previous_state AS previousState,
          next_state AS nextState,
          changed_fields AS changedFields
        FROM job_audit_events
        WHERE job_id IN (${placeholders})
        ORDER BY datetime(server_time) DESC, id DESC
      `).all(...jobIds).map((event) => ({
        ...event,
        previousState: safeParseJson(event.previousState, {}),
        nextState: safeParseJson(event.nextState, {}),
        changedFields: safeParseJson(event.changedFields, [])
      }));
    }
  };
}
