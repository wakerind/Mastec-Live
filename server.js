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
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const intakeStages = ["Uploaded", "Review", "Approved", "Scheduled", "Assigned"];
const fieldStages = ["Assigned", "Acknowledged", "En Route", "In Progress", "Blocked", "Completed", "Closed"];

function nowIso() {
  return new Date().toISOString();
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function createToken(prefix = "fs") {
  return `${prefix}_${crypto.randomBytes(18).toString("hex")}`;
}

function currentLifecycle(job) {
  if (job.blockerReason && !["Completed", "Closed"].includes(job.fieldStatus)) {
    return "Blocked";
  }
  if (job.assignedTo) {
    return job.fieldStatus || "Assigned";
  }
  return job.intakeStatus || "Uploaded";
}

function calculateDurationVariance(plannedHours, actualHours) {
  return Math.round((Number(actualHours || 0) - Number(plannedHours || 0)) * 10) / 10;
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

async function getAppState(forUser) {
  const crews = await db.listCrewsWithUtilization();
  const allJobs = await db.listJobs();
  const jobs = forUser.role === "field" ? allJobs.filter((job) => job.assignedTo === forUser.name) : allJobs;
  const updates = await db.listJobUpdates(jobs.map((job) => job.id));
  const updatesByJob = Object.fromEntries(jobs.map((job) => [job.id, []]));
  updates.forEach((update) => {
    if (!updatesByJob[update.jobId]) {
      updatesByJob[update.jobId] = [];
    }
    updatesByJob[update.jobId].push(update);
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
    crews,
    stageOptions: {
      intake: intakeStages,
      field: fieldStages
    },
    kpis: computeKpis(allJobs, crews)
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
      if (user.role === "admin") {
        next.intakeStatus = body.intakeStatus ?? next.intakeStatus;
        next.assignedTo = body.assignedTo ?? next.assignedTo;
        next.scheduledStartAt = body.scheduledStartAt ?? next.scheduledStartAt;
        next.priority = body.priority ?? next.priority;
        next.jobValue = body.jobValue ?? next.jobValue;
        next.laborCost = body.laborCost ?? next.laborCost;
        next.plannedHours = body.plannedHours ?? next.plannedHours;
      }

      next.fieldStatus = body.fieldStatus ?? next.fieldStatus;
      next.completion = body.completion ?? next.completion;
      next.actualHours = body.actualHours ?? next.actualHours;
      next.blockerReason = body.blockerReason ?? next.blockerReason;
      next.issue = body.issue ?? next.issue;
      next.durationVariance = calculateDurationVariance(next.plannedHours, next.actualHours);

      if (!next.assignedTo) {
        next.fieldStatus = "Assigned";
      }

      if (next.assignedTo && intakeStages.indexOf(next.intakeStatus) < intakeStages.indexOf("Assigned")) {
        next.intakeStatus = "Assigned";
      }

      if (next.blockerReason && !["Completed", "Closed"].includes(next.fieldStatus)) {
        next.fieldStatus = "Blocked";
      } else if (!next.blockerReason && next.fieldStatus === "Blocked") {
        next.fieldStatus = body.resumeFieldStatus || "In Progress";
      }

      if (["Completed", "Closed"].includes(next.fieldStatus)) {
        next.blockerReason = "";
        next.completion = 100;
      }

      await db.updateJob(jobId, next);
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
      await db.createJobUpdate({
        jobId,
        authorName: user.name,
        authorRole: user.role,
        note: String(body.note || ""),
        photoUrl: String(body.photoUrl || "")
      });
      sendJson(res, 201, { ok: true });
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
