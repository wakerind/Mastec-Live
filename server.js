import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./db/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, "data");
const uploadsDir = path.join(dataDir, "uploads");
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain; charset=utf-8"
};

const lifecycleStages = ["Uploaded", "Assigned", "Scheduled", "Completed", "Closed"];
const maxAttachmentBatchBytes = 30 * 1024 * 1024;
const allowedAttachmentMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain"
]);

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function isScheduledPastDue(value) {
  const timestamp = new Date(value).getTime();
  return !Number.isNaN(timestamp) && timestamp <= Date.now();
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function createToken(prefix = "fs") {
  return `${prefix}_${crypto.randomBytes(18).toString("hex")}`;
}

function getOperationalStatus(job) {
  const rawStage = job.lifecycleStage || "Uploaded";
  if (rawStage === "Uploaded" && job.rejectedAt) {
    return "Rejected";
  }
  if (rawStage === "Accepted") {
    return "Assigned";
  }
  if (rawStage === "Admin Approved") {
    return job.assignedTo ? "Assigned" : "Uploaded";
  }
  if (rawStage === "Assigned" && job.acceptedAt) {
    if (job.startedAt) {
      return "In Progress";
    }
    if (isScheduledPastDue(job.scheduledStartAt)) {
      return "Not Started";
    }
    return "Scheduled";
  }
  if (rawStage === "Scheduled" && !job.startedAt && new Date(job.scheduledStartAt).getTime() <= Date.now()) {
    return "Not Started";
  }
  return rawStage;
}

function currentLifecycle(job) {
  const status = getOperationalStatus(job);
  if (status === "Rejected") {
    return "Uploaded";
  }
  if (["Scheduled", "Not Started", "In Progress"].includes(status)) {
    return "Scheduled";
  }
  if (status === "Admin Reviewed") {
    return "Completed";
  }
  return status;
}

function calculateDurationVariance(plannedHours, actualHours) {
  return Math.round(Number(actualHours || 0) - Number(plannedHours || 0));
}

function sanitizeFileSegment(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

function saveAttachment({ jobId, fileName, mimeType, contentBase64 }) {
  if (!allowedAttachmentMimeTypes.has(mimeType)) {
    throw new Error("File type not supported");
  }
  const buffer = Buffer.from(String(contentBase64 || ""), "base64");
  if (!buffer.length) {
    throw new Error("Attachment is empty");
  }
  const jobDir = path.join(uploadsDir, `job-${jobId}`);
  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }

  const safeName = sanitizeFileSegment(fileName);
  const finalName = `${Date.now()}-${safeName}`;
  const filePath = path.join(jobDir, finalName);
  fs.writeFileSync(filePath, buffer);

  return {
    attachmentName: fileName,
    attachmentPath: `/uploads/job-${jobId}/${finalName}`,
    attachmentMime: mimeType
  };
}

function saveAttachments({ jobId, attachments }) {
  const normalizedAttachments = Array.isArray(attachments) ? attachments : [];
  let totalBytes = 0;
  normalizedAttachments.forEach((attachment) => {
    const buffer = Buffer.from(String(attachment.contentBase64 || ""), "base64");
    totalBytes += buffer.length;
  });
  if (totalBytes > maxAttachmentBatchBytes) {
    throw new Error("Combined attachments exceed 30MB limit");
  }
  const saved = normalizedAttachments.map((attachment) => saveAttachment({
    jobId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    contentBase64: attachment.contentBase64
  }));
  return saved;
}

const db = await createDatabase({ rootDir, dataDir, hashPassword, nowIso });

console.log(`Using database backend: ${db.kind}`);
console.log(`Using data storage: ${db.storagePath}`);

function sendJson(res, code, payload) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function resolveStaticFile(urlPath) {
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(rootDir, requested));
  if (!filePath.startsWith(rootDir)) {
    return null;
  }
  return filePath;
}

function getSessionToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return null;
  }
  return auth.slice("Bearer ".length);
}

async function getAuthUser(req) {
  const token = getSessionToken(req);
  if (!token) {
    return null;
  }
  return db.findSessionUser(token);
}

async function requireUser(req, res) {
  const user = await getAuthUser(req);
  if (!user || user.status !== "active") {
    sendJson(res, 401, { error: "Authentication required" });
    return null;
  }
  return user;
}

async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return null;
  }
  if (user.role !== "admin") {
    sendJson(res, 403, { error: "Admin access required" });
    return null;
  }
  return user;
}

function computeKpis(jobs, crews) {
  const contractorNames = new Set(crews.filter((crew) => crew.type === "Contractor").map((crew) => crew.name));
  const buckets = new Map();

  jobs.forEach((job) => {
    if (!job.assignedTo) {
      return;
    }

    const current = buckets.get(job.assignedTo) || {
      name: job.assignedTo,
      jobsPerWeek: 0,
      totalHours: 0,
      onTimePoints: 0,
      blockedJobs: 0,
      margin: 0,
      sampleSize: 0
    };

    const cycleHours = Number(job.actualHours || 0) > 0 ? Number(job.actualHours) : Number(job.plannedHours || 0);
    const plannedHours = Number(job.plannedHours || 0);
    const onTime = plannedHours === 0 || cycleHours <= plannedHours * 1.1;
    const isBlocked = Boolean(job.blockerReason) && !["Completed", "Closed"].includes(job.fieldStatus);

    current.jobsPerWeek += 1;
    current.totalHours += cycleHours;
    current.onTimePoints += onTime ? 100 : 0;
    current.blockedJobs += isBlocked ? 1 : 0;
    current.margin += Number(job.jobValue || 0) - Number(job.laborCost || 0);
    current.sampleSize += 1;
    buckets.set(job.assignedTo, current);
  });

  const teams = [];
  const contractors = [];
  buckets.forEach((value) => {
    const normalized = {
      name: value.name,
      jobsPerWeek: value.jobsPerWeek,
      avgCompletionHours: Number((value.totalHours / value.sampleSize).toFixed(1)),
      onTimeStartRate: Math.round(value.onTimePoints / value.sampleSize),
      blockedRate: Math.round((value.blockedJobs / value.sampleSize) * 100),
      avgMargin: Math.round(value.margin / value.sampleSize),
      sampleSize: value.sampleSize
    };
    if (contractorNames.has(value.name)) {
      contractors.push(normalized);
    } else {
      teams.push(normalized);
    }
  });

  return { teams, contractors };
}

function diffHours(startValue, endValue) {
  if (!startValue || !endValue) {
    return null;
  }
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }
  return Number(((end - start) / (1000 * 60 * 60)).toFixed(2));
}

function buildCycleAnalytics(jobs, stageEvents) {
  const eventsByJob = new Map();
  stageEvents.forEach((event) => {
    if (!eventsByJob.has(event.jobId)) {
      eventsByJob.set(event.jobId, []);
    }
    eventsByJob.get(event.jobId).push(event);
  });

  const rows = jobs.map((job) => {
    const ordered = [...(eventsByJob.get(job.id) || [])].sort((left, right) => new Date(left.enteredAt) - new Date(right.enteredAt));
    const lastAssigned = [...ordered].reverse().find((event) => event.stage === "Assigned");
    const lastScheduled = [...ordered].reverse().find((event) => event.stage === "Scheduled");
    const lastCompleted = [...ordered].reverse().find((event) => event.stage === "Completed");
    const lastClosed = [...ordered].reverse().find((event) => event.stage === "Closed");

    const adminAssignmentHours = diffHours(job.createdAt, lastAssigned?.enteredAt);
    const fieldExecutionHours = diffHours(lastScheduled?.enteredAt, lastCompleted?.enteredAt);
    const adminCloseHours = diffHours(lastCompleted?.enteredAt, lastClosed?.enteredAt);
    const expectedHours = Number(job.plannedHours || 0);
    const actualHours = Number(job.actualHours || 0);

    return {
      jobId: job.id,
      title: job.title,
      market: job.market,
      assignedTo: job.assignedTo || "Unassigned",
      status: getOperationalStatus(job),
      expectedHours,
      actualHours,
      adminAssignmentHours,
      fieldExecutionHours,
      adminCloseHours,
      latestStageAt: ordered.length ? ordered[ordered.length - 1].enteredAt : job.createdAt
    };
  });

  return rows;
}

async function getAppState(forUser) {
  const crews = await db.listCrewsWithUtilization();
  const allJobs = await db.listJobs();
  const jobs = forUser.role === "field" ? allJobs.filter((job) => job.assignedTo === forUser.name) : allJobs;
  jobs.forEach((job) => {
    job.displayStage = currentLifecycle(job);
    job.activityStatus = getOperationalStatus(job);
  });
  const updates = await db.listJobUpdates(jobs.map((job) => job.id));
  const stageEvents = await db.listStageEvents(jobs.map((job) => job.id));
  const updatesByJob = Object.fromEntries(jobs.map((job) => [job.id, []]));
  const stageEventsByJob = Object.fromEntries(jobs.map((job) => [job.id, []]));
  updates.forEach((update) => {
    if (!updatesByJob[update.jobId]) {
      updatesByJob[update.jobId] = [];
    }
    updatesByJob[update.jobId].push(update);
  });
  stageEvents.forEach((event) => {
    if (!stageEventsByJob[event.jobId]) {
      stageEventsByJob[event.jobId] = [];
    }
    stageEventsByJob[event.jobId].push(event);
  });
  return {
    session: {
      id: forUser.id,
      email: forUser.email,
      name: forUser.name,
      role: forUser.role
    },
    jobs,
    updatesByJob,
    stageEventsByJob,
    crews,
    stageOptions: {
      lifecycle: lifecycleStages
    },
    kpis: {
      ...computeKpis(allJobs, crews),
      cycleRows: buildCycleAnalytics(jobs, stageEvents)
    }
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readBody(req);
      const user = await db.findUserByEmail(String(body.email || "").toLowerCase());
      if (!user || user.passwordHash !== hashPassword(String(body.password || ""))) {
        sendJson(res, 401, { error: "Invalid email or password" });
        return;
      }
      const token = createToken("session");
      await db.createSession(token, user.id);
      sendJson(res, 200, {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status }
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/redeem-invite") {
      const body = await readBody(req);
      const invite = await db.findInviteByToken(String(body.token || "").trim());
      if (!invite || invite.redeemedAt) {
        sendJson(res, 400, { error: "Invite is invalid or already redeemed" });
        return;
      }
      const existingUser = await db.findUserByEmail(invite.email);
      if (existingUser) {
        sendJson(res, 400, { error: "A user with this email already exists" });
        return;
      }
      const user = await db.createUser({
        email: invite.email,
        passwordHash: hashPassword(String(body.password || "")),
        name: String(body.name || invite.email),
        role: invite.role
      });
      await db.redeemInvite(invite.id);
      const token = createToken("session");
      await db.createSession(token, user.id);
      sendJson(res, 200, { token, user });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const user = await requireUser(req, res);
      if (!user) {
        return;
      }
      sendJson(res, 200, { user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status } });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const token = getSessionToken(req);
      if (token) {
        await db.deleteSession(token);
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/app-state") {
      const user = await requireUser(req, res);
      if (!user) {
        return;
      }
      sendJson(res, 200, await getAppState(user));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/users") {
      const user = await requireAdmin(req, res);
      if (!user) {
        return;
      }
      sendJson(res, 200, { users: await db.listUsers() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/invites") {
      const user = await requireAdmin(req, res);
      if (!user) {
        return;
      }
      sendJson(res, 200, { invites: await db.listInvites() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/invites") {
      const user = await requireAdmin(req, res);
      if (!user) {
        return;
      }
      const body = await readBody(req);
      const token = createToken("invite");
      await db.createInvite({
        email: String(body.email || "").toLowerCase(),
        role: String(body.role || "field"),
        token,
        invitedByUserId: user.id
      });
      sendJson(res, 201, { invite: { email: String(body.email || "").toLowerCase(), role: String(body.role || "field"), token } });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs") {
      const user = await requireAdmin(req, res);
      if (!user) {
        return;
      }
      const body = await readBody(req);
      const jobId = await db.createJob({
        title: String(body.title || ""),
        market: String(body.market || ""),
        requestedBy: String(body.requestedBy || ""),
        jobType: String(body.jobType || ""),
        priority: String(body.priority || "Medium"),
        scheduledStartAt: String(body.scheduledStartAt || ""),
        assignedTo: body.assignedTo || "",
        jobValue: Number(body.jobValue || 0),
        laborCost: Number(body.laborCost || 0),
        plannedHours: Number(body.plannedHours || 8),
        blockerReason: String(body.blockerReason || ""),
        createdByUserId: user.id
      });
      sendJson(res, 201, { jobId });
      return;
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/jobs/")) {
      const user = await requireUser(req, res);
      if (!user) {
        return;
      }
      const jobId = Number(url.pathname.split("/").pop());
      const body = await readBody(req);
      const existing = await db.findJobById(jobId);
      if (!existing) {
        sendJson(res, 404, { error: "Job not found" });
        return;
      }
      if (user.role === "field" && existing.assignedTo !== user.name) {
        sendJson(res, 403, { error: "Field users can only update their assigned jobs" });
        return;
      }

      const next = { ...existing };
      const previousLifecycleStage = existing.lifecycleStage || "Uploaded";
      if (user.role === "admin") {
        const previousAssignedTo = next.assignedTo;
        next.assignedTo = body.assignedTo ?? next.assignedTo;
        next.scheduledStartAt = body.scheduledStartAt ?? next.scheduledStartAt;
        next.priority = body.priority ?? next.priority;
        next.jobValue = body.jobValue ?? next.jobValue;
        next.laborCost = body.laborCost ?? next.laborCost;
        next.plannedHours = body.plannedHours ?? next.plannedHours;
        next.lifecycleStage = body.lifecycleStage ?? next.lifecycleStage;
        next.adminApproved = body.adminApproved ?? next.adminApproved;
        if (body.adminReviewed === true) {
          next.adminReviewedAt = next.adminReviewedAt || nowIso();
        }
        if (body.adminReviewed === false) {
          next.adminReviewedAt = null;
          if (next.lifecycleStage === "Closed") {
            next.lifecycleStage = "Completed";
            next.issue = "Final admin review removed. Job moved back to completed.";
          }
        }
        if (body.adminReviewed === true && ["Completed", "Admin Reviewed"].includes(next.lifecycleStage)) {
          next.lifecycleStage = "Closed";
          next.issue = "Final admin review completed. Job closed.";
        }

        if (next.assignedTo && next.assignedTo !== previousAssignedTo) {
          next.rejectedAt = null;
          next.rejectionReason = "";
          if (next.adminApproved) {
            if (next.scheduledStartAt) {
              next.lifecycleStage = "Assigned";
            } else {
              next.lifecycleStage = "Assigned";
            }
          } else if (next.lifecycleStage === "Uploaded") {
            next.lifecycleStage = "Uploaded";
          }
        }
      }

      if (user.role === "field" && body.lifecycleStage === "Completed") {
        next.lifecycleStage = "Completed";
      }

      if (user.role === "field" && body.rejected === true) {
        next.rejectedAt = nowIso();
        next.rejectionReason = String(body.rejectionReason || "").trim();
        next.assignedTo = "";
        next.acceptedAt = null;
        next.startedAt = null;
        next.lifecycleStage = "Uploaded";
        next.issue = next.rejectionReason
          ? `Rejected by field team: ${next.rejectionReason}`
          : "Rejected by field team for immediate admin review.";
      }

      if (body.accepted === true && next.assignedTo) {
        next.acceptedAt = next.acceptedAt || nowIso();
        next.rejectedAt = null;
        next.rejectionReason = "";
        if (next.scheduledStartAt && !["Completed", "Closed"].includes(next.lifecycleStage)) {
          next.lifecycleStage = "Scheduled";
        }
      }
      if (body.started === true) {
        next.startedAt = next.startedAt || nowIso();
        if (!["Completed", "Closed"].includes(next.lifecycleStage)) {
          next.lifecycleStage = "In Progress";
        }
      }
      if (body.resetStarted === true) {
        next.startedAt = null;
        if (next.lifecycleStage === "In Progress") {
          next.lifecycleStage = "Scheduled";
        }
      }

      next.completion = body.completion ?? next.completion;
      next.actualHours = body.actualHours ?? next.actualHours;
      next.blockerReason = body.blockerReason ?? next.blockerReason;
      next.blockerStage = body.blockerStage ?? next.blockerStage;
      next.issue = body.issue ?? next.issue;
      next.durationVariance = calculateDurationVariance(next.plannedHours, next.actualHours);

      if (!next.assignedTo && next.lifecycleStage !== "Uploaded") {
        next.lifecycleStage = "Uploaded";
      }

      if (next.assignedTo && next.adminApproved && next.lifecycleStage === "Uploaded") {
        next.lifecycleStage = "Assigned";
      }

      if (!["Completed", "Closed"].includes(next.lifecycleStage) && next.assignedTo && next.acceptedAt) {
        if (next.startedAt) {
          next.lifecycleStage = "In Progress";
        } else if (isScheduledPastDue(next.scheduledStartAt)) {
          next.lifecycleStage = "Scheduled";
        } else if (next.lifecycleStage === "Assigned") {
          next.lifecycleStage = "Scheduled";
        }
      }

      if (next.lifecycleStage !== "Uploaded" && !next.adminApproved) {
        sendJson(res, 400, { error: "Admin signoff is required before moving the job forward" });
        return;
      }

      if (next.lifecycleStage === "Scheduled" && !next.acceptedAt) {
        sendJson(res, 400, { error: "Assigned team must accept the job before it can be scheduled" });
        return;
      }

      if (["In Progress", "Completed", "Admin Reviewed", "Closed"].includes(next.lifecycleStage) && !next.startedAt) {
        next.startedAt = nowIso();
      }

      if (next.lifecycleStage === "Scheduled" && next.startedAt) {
        next.lifecycleStage = "In Progress";
      }

      if (user.role === "field" && next.lifecycleStage === "Completed") {
        const existingUpdates = await db.listJobUpdates([jobId]);
        if (!existingUpdates.length) {
          sendJson(res, 400, { error: "Add at least one update before completing the job." });
          return;
        }
      }

      if (next.lifecycleStage === "Closed" && !next.adminReviewedAt) {
        sendJson(res, 400, { error: "Final admin review is required before closing the job" });
        return;
      }

      if (next.blockerReason && !next.blockerStage) {
        next.blockerStage = next.lifecycleStage;
      } else if (!next.blockerReason) {
        next.blockerStage = "";
      }

      if (next.lifecycleStage !== "Uploaded") {
        next.rejectedAt = null;
        next.rejectionReason = "";
      }

      if (["Completed", "Closed"].includes(next.lifecycleStage)) {
        next.blockerReason = "";
        next.blockerStage = "";
        next.completion = 100;
      }

      next.intakeStatus = currentLifecycle(next);
      next.fieldStatus = getOperationalStatus(next);

      await db.updateJob(jobId, next);
      if (next.lifecycleStage !== previousLifecycleStage) {
        await db.recordStageTransition({
          jobId,
          toStage: next.lifecycleStage,
          actorRole: user.role,
          actorName: user.name,
          changedAt: nowIso()
        });
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/jobs\/\d+\/updates$/)) {
      const user = await requireUser(req, res);
      if (!user) {
        return;
      }
      const jobId = Number(url.pathname.split("/")[3]);
      const body = await readBody(req);
      const existing = await db.findJobById(jobId);
      if (!existing) {
        sendJson(res, 404, { error: "Job not found" });
        return;
      }
      if (user.role === "field" && existing.assignedTo !== user.name) {
        sendJson(res, 403, { error: "Field users can only update their assigned jobs" });
        return;
      }
      const normalizedAttachments = Array.isArray(body.attachments) && body.attachments.length
        ? body.attachments
        : (body.fileName && body.mimeType && body.contentBase64
          ? [{ fileName: body.fileName, mimeType: body.mimeType, contentBase64: body.contentBase64 }]
          : []);
      const attachments = saveAttachments({ jobId, attachments: normalizedAttachments });
      await db.createJobUpdate({
        jobId,
        authorName: user.name,
        authorRole: user.role,
        note: String(body.note || ""),
        attachments
      });
      sendJson(res, 201, { ok: true });
      return;
    }

    if (url.pathname.startsWith("/uploads/")) {
      const uploadFilePath = path.normalize(path.join(uploadsDir, url.pathname.replace("/uploads/", "")));
      if (!uploadFilePath.startsWith(uploadsDir) || !fs.existsSync(uploadFilePath) || fs.statSync(uploadFilePath).isDirectory()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      const ext = path.extname(uploadFilePath).toLowerCase();
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      fs.createReadStream(uploadFilePath).pipe(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/healthz") {
      sendJson(res, 200, { ok: true, databaseBackend: db.kind, storage: db.storagePath });
      return;
    }

    const filePath = resolveStaticFile(url.pathname);
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`FieldSight server running on http://localhost:${port}`);
  console.log("Demo admin login: admin@fieldsight.local / Admin123!");
});
