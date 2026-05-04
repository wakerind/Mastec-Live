(function () {
  const authStorageKey = "fieldsight-auth-token";
  const visibleLifecycleStages = ["Uploaded", "Assigned", "Scheduled", "In Progress", "Completed", "Closed"];
  const editableLifecycleStages = ["Uploaded", "Assigned", "Scheduled", "In Progress", "Completed", "Closed"];
  const maxAttachmentBatchBytes = 30 * 1024 * 1024;
  const dragMimeType = "application/x-fieldsight-job-id";

  let authToken = localStorage.getItem(authStorageKey) || "";
  let currentScreen = "overview";
  let intakeSort = { key: "scheduledStartAt", direction: "asc" };
  let appState = {
    session: null,
    jobs: [],
    updatesByJob: {},
    stageEventsByJob: {},
    crews: [],
    kpis: { teams: [], contractors: [], cycleRows: [] }
  };

  const elements = {
    loginShell: document.getElementById("loginShell"),
    appContent: document.getElementById("appContent"),
    loginForm: document.getElementById("loginForm"),
    redeemInviteForm: document.getElementById("redeemInviteForm"),
    sessionRoleLabel: document.getElementById("sessionRoleLabel"),
    sessionUserLabel: document.getElementById("sessionUserLabel"),
    signOutButton: document.getElementById("signOutButton"),
    metricGrid: document.getElementById("metricGrid"),
    deadlineList: document.getElementById("deadlineList"),
    alertList: document.getElementById("alertList"),
    dashboardShortcuts: document.getElementById("dashboardShortcuts"),
    historyPreview: document.getElementById("historyPreview"),
    dashboardBreakdown: document.getElementById("dashboardBreakdown"),
    masterGrid: document.getElementById("masterGrid"),
    stageBoard: document.getElementById("stageBoard"),
    crewList: document.getElementById("crewList"),
    fieldList: document.getElementById("fieldList"),
    historyList: document.getElementById("historyList"),
    kpiList: document.getElementById("kpiList"),
    usersList: document.getElementById("usersList"),
    invitesList: document.getElementById("invitesList"),
    inviteForm: document.getElementById("inviteForm"),
    intakeStatusFilter: document.getElementById("intakeStatusFilter"),
    intakeSearch: document.getElementById("intakeSearch"),
    assignmentWindowFilter: document.getElementById("assignmentWindowFilter"),
    assignmentSearch: document.getElementById("assignmentSearch"),
    fieldStatusFilter: document.getElementById("fieldStatusFilter"),
    fieldSearch: document.getElementById("fieldSearch"),
    historyTypeFilter: document.getElementById("historyTypeFilter"),
    historySearch: document.getElementById("historySearch"),
    kpiGroupFilter: document.getElementById("kpiGroupFilter"),
    kpiEntityFilter: document.getElementById("kpiEntityFilter"),
    kpiDateFrom: document.getElementById("kpiDateFrom"),
    kpiDateTo: document.getElementById("kpiDateTo"),
    navLinks: document.querySelectorAll(".nav-link"),
    screens: document.querySelectorAll(".screen"),
    openJobDialog: document.getElementById("openJobDialog"),
    exportDateFrom: document.getElementById("exportDateFrom"),
    exportDateTo: document.getElementById("exportDateTo"),
    exportCsvButton: document.getElementById("exportCsvButton"),
    refreshDataButton: document.getElementById("refreshDataButton"),
    jobDialog: document.getElementById("jobDialog"),
    jobForm: document.getElementById("jobForm"),
    closeJobDialog: document.getElementById("closeJobDialog"),
    cancelJobDialog: document.getElementById("cancelJobDialog"),
    assignDialog: document.getElementById("assignDialog"),
    assignForm: document.getElementById("assignForm"),
    assignCrewSelect: document.getElementById("assignCrewSelect"),
    closeAssignDialog: document.getElementById("closeAssignDialog"),
    cancelAssignDialog: document.getElementById("cancelAssignDialog"),
    updateDialog: document.getElementById("updateDialog"),
    updateForm: document.getElementById("updateForm"),
    closeUpdateDialog: document.getElementById("closeUpdateDialog"),
    cancelUpdateDialog: document.getElementById("cancelUpdateDialog"),
    rejectDialog: document.getElementById("rejectDialog"),
    rejectForm: document.getElementById("rejectForm"),
    closeRejectDialog: document.getElementById("closeRejectDialog"),
    rejectError: document.getElementById("rejectError"),
    jobDetailDialog: document.getElementById("jobDetailDialog"),
    jobDetailForm: document.getElementById("jobDetailForm"),
    closeJobDetailDialog: document.getElementById("closeJobDetailDialog"),
    cancelJobDetailDialog: document.getElementById("cancelJobDetailDialog"),
    jobDetailSummary: document.getElementById("jobDetailSummary"),
    jobDetailQuickLinks: document.getElementById("jobDetailQuickLinks"),
    jobDetailUpdates: document.getElementById("jobDetailUpdates"),
    jobDetailStageSelect: document.getElementById("jobDetailStageSelect"),
    jobDetailAssigneeSelect: document.getElementById("jobDetailAssigneeSelect"),
    jobWorkflowControls: document.getElementById("jobWorkflowControls"),
    jobFieldActions: document.getElementById("jobFieldActions"),
    jobFieldActionsList: document.getElementById("jobFieldActionsList"),
    saveJobDetailButton: document.getElementById("saveJobDetailButton"),
    demoAdminCreds: document.getElementById("demoAdminCreds"),
    demoFieldCreds: document.getElementById("demoFieldCreds"),
    loginError: document.getElementById("loginError"),
    inviteError: document.getElementById("inviteError")
  };

  function emptyState(message) {
    return `<div class="empty-state">${message}</div>`;
  }

  function getStatusClass(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
  }

  function formatDateTime(value) {
    const date = new Date(value);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function formatPhone(value) {
    const digits = String(value || "").replace(/\D+/g, "");
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return value || "Phone not listed";
  }

  function getMapsUrl(job) {
    const query = encodeURIComponent([job.jobAddress, job.market].filter(Boolean).join(", "));
    return query ? `https://www.google.com/maps/search/?api=1&query=${query}` : "";
  }

  function hoursUntil(value) {
    return Math.round((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60));
  }

  function getAssignmentWindow(job) {
    const hours = hoursUntil(job.scheduledStartAt);
    if (hours < 24 && !job.assignedTo) {
      return { label: "Past Due", className: "window-past-due" };
    }
    if (hours <= 24) {
      return { label: "Due Soon", className: "window-due-soon" };
    }
    return { label: "Open", className: "window-open" };
  }

  function getOperationalStatus(job) {
    if (job.activityStatus) {
      return job.activityStatus;
    }
    const rawStage = job.lifecycleStage || "Uploaded";
    if (rawStage === "Uploaded" && job.rejectedAt) {
      return "Rejected";
    }
    if (rawStage === "Accepted") {
      return "Assigned";
    }
    if (rawStage === "Admin Approved") {
      return "Uploaded";
    }
    if (rawStage === "Admin Reviewed") {
      return "Completed";
    }
    return rawStage;
  }

  function getLifecycleStage(job) {
    if (job.displayStage) {
      return job.displayStage;
    }
    const status = getOperationalStatus(job);
    if (status === "Rejected") {
      return "Uploaded";
    }
    if (["Scheduled", "Not Started"].includes(status)) {
      return "Scheduled";
    }
    if (status === "In Progress") {
      return "In Progress";
    }
    if (status === "Admin Reviewed") {
      return "Completed";
    }
    return status;
  }

  function getStoredLifecycleStage(job) {
    return job.lifecycleStage || "Uploaded";
  }

  function isAdminApproved(job) {
    return Boolean(job.adminApproved || ["Assigned", "Accepted", "Scheduled", "In Progress", "Completed", "Admin Reviewed", "Closed"].includes(getStoredLifecycleStage(job)));
  }

  function isAccepted(job) {
    return Boolean(job.acceptedAt || ["Accepted", "Scheduled", "In Progress", "Completed", "Admin Reviewed", "Closed"].includes(getStoredLifecycleStage(job)));
  }

  function hasStarted(job) {
    return Boolean(job.startedAt || ["In Progress", "Completed", "Admin Reviewed", "Closed"].includes(getStoredLifecycleStage(job)));
  }

  function isAdminReviewed(job) {
    return Boolean(job.adminReviewedAt || ["Admin Reviewed", "Closed"].includes(getStoredLifecycleStage(job)));
  }

  function getDefaultScreen() {
    return appState.session?.role === "field" ? "field" : "overview";
  }

  function getAllowedScreens() {
    if (!appState.session) {
      return [];
    }
    return appState.session.role === "field"
      ? ["overview", "admin", "assignment", "field", "history"]
      : ["overview", "admin", "assignment", "history", "accounts", "leadership"];
  }

  function getSafeScreen(screenName) {
    const allowed = getAllowedScreens();
    if (!allowed.length) {
      return "overview";
    }
    return allowed.includes(screenName) ? screenName : getDefaultScreen();
  }

  function mapUiStageToStoredStage(stage) {
    return stage;
  }

  function buildStageUpdatePayload(job, stage, sourceLabel) {
    const storedStage = mapUiStageToStoredStage(stage);
    const payload = {
      lifecycleStage: storedStage,
      issue: `Stage moved to ${stage} from ${sourceLabel}.`
    };
    if (stage === "Assigned") {
      payload.resetStarted = true;
    }
    if (stage === "Scheduled") {
      payload.resetStarted = true;
    }
    if (stage === "In Progress") {
      payload.started = true;
    }
    if (["Completed", "Closed"].includes(stage) && !hasStarted(job)) {
      payload.started = true;
    }
    if (stage === "Completed" || stage === "Closed") {
      payload.completion = 100;
    }
    return payload;
  }

  function canFieldComplete(job) {
    return appState.session?.role === "field"
      && isAccepted(job)
      && hasStarted(job)
      && getOperationalStatus(job) === "In Progress";
  }

  function canFieldStart(job) {
    return appState.session?.role === "field"
      && isAccepted(job)
      && !hasStarted(job)
      && ["Scheduled", "Not Started"].includes(getOperationalStatus(job));
  }

  function canFieldAccept(job) {
    return appState.session?.role === "field"
      && Boolean(job.assignedTo)
      && !isAccepted(job)
      && getLifecycleStage(job) === "Assigned";
  }

  function canFieldReject(job) {
    return appState.session?.role === "field"
      && ["Assigned", "Scheduled"].includes(getLifecycleStage(job))
      && !hasStarted(job)
      && !["Completed", "Closed"].includes(getLifecycleStage(job));
  }

  function buildRequirementBadges(job) {
    const badges = [];
    badges.push(`<span class="pill ${isAdminApproved(job) ? "requirement-ready" : "requirement-pending"}">Admin signoff ${isAdminApproved(job) ? "done" : "pending"}</span>`);
    if (job.assignedTo) {
      badges.push(`<span class="pill ${isAccepted(job) ? "requirement-ready" : "requirement-pending"}">Team accepted ${isAccepted(job) ? "done" : "pending"}</span>`);
    }
    if (["Completed", "Closed"].includes(getLifecycleStage(job))) {
      badges.push(`<span class="pill ${isAdminReviewed(job) ? "requirement-ready" : "requirement-pending"}">Final review ${isAdminReviewed(job) ? "done" : "pending"}</span>`);
    }
    return badges.join("");
  }

  function getMargin(job) {
    return Number(job.jobValue || 0) - Number(job.laborCost || 0);
  }

  function getStageSummary(job) {
    const lifecycle = getLifecycleStage(job);
    return `${lifecycle}${job.blockerReason ? ` | Blocked at ${job.blockerStage || lifecycle}` : ""}`;
  }

  function getJobUpdates(jobId) {
    return appState.updatesByJob?.[jobId] || [];
  }

  function getJobStageEvents(jobId) {
    return appState.stageEventsByJob?.[jobId] || [];
  }

  function getJobWindow(job, overrides = {}) {
    const startValue = overrides.scheduledStartAt || job.scheduledStartAt;
    const start = new Date(startValue).getTime();
    const plannedHours = Number(overrides.plannedHours ?? job.plannedHours ?? 0);
    const durationMs = Math.max(plannedHours, 1) * 60 * 60 * 1000;
    return {
      start,
      end: start + durationMs
    };
  }

  function jobsOverlap(leftJob, rightJob, leftOverrides = {}, rightOverrides = {}) {
    const left = getJobWindow(leftJob, leftOverrides);
    const right = getJobWindow(rightJob, rightOverrides);
    if (Number.isNaN(left.start) || Number.isNaN(right.start)) {
      return false;
    }
    return left.start < right.end && right.start < left.end;
  }

  function getCrewScheduleConflicts(targetJob, crewName, overrides = {}) {
    if (!crewName) {
      return [];
    }
    return appState.jobs.filter((job) => {
      if (String(job.id) === String(targetJob.id)) {
        return false;
      }
      if ((job.assignedTo || "") !== crewName) {
        return false;
      }
      if (["Completed", "Closed"].includes(getOperationalStatus(job))) {
        return false;
      }
      return jobsOverlap(targetJob, job, overrides);
    });
  }

  function getAvailableCrewsForJob(targetJob, overrides = {}) {
    return appState.crews
      .map((crew) => ({
        ...crew,
        conflicts: getCrewScheduleConflicts(targetJob, crew.name, overrides)
      }))
      .filter((crew) => crew.conflicts.length === 0);
  }

  function getLatestUpdate(jobId) {
    return getJobUpdates(jobId)[0] || null;
  }

  function getClosedAt(job) {
    const closedEvent = getJobStageEvents(job.id).find((event) => event.stage === "Closed");
    return closedEvent?.enteredAt || job.adminReviewedAt || "";
  }

  function collectUpdateValues(jobId, key) {
    return [...new Set(getJobUpdates(jobId).flatMap((update) => {
      if (Array.isArray(update[key])) {
        return update[key];
      }
      return update[key] ? [update[key]] : [];
    }).filter(Boolean))];
  }

  function renderValuePills(values, emptyLabel) {
    return values.length
      ? values.map((value) => `<span class="pill">${value}</span>`).join("")
      : `<span class="muted">${emptyLabel}</span>`;
  }

  function summarizeUpdate(update) {
    if (!update) {
      return "No updates yet";
    }
    const note = String(update.note || "").trim();
    return note.length > 72 ? `${note.slice(0, 69)}...` : note || "Update logged";
  }

  function csvEscape(value) {
    const stringValue = value === null || value === undefined ? "" : String(value);
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, "\"\"")}"`;
    }
    return stringValue;
  }

  function formatDurationHours(fromValue, toValue) {
    if (!fromValue || !toValue) {
      return "";
    }
    const from = new Date(fromValue).getTime();
    const to = new Date(toValue).getTime();
    if (Number.isNaN(from) || Number.isNaN(to) || to < from) {
      return "";
    }
    return ((to - from) / (1000 * 60 * 60)).toFixed(2);
  }

  function normalizeRangeStart(value) {
    if (!value) {
      return null;
    }
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }

  function normalizeRangeEnd(value) {
    if (!value) {
      return null;
    }
    const date = new Date(`${value}T23:59:59.999`);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }

  function isWithinDateRange(value, fromValue, toValue) {
    if (!value) {
      return false;
    }
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) {
      return false;
    }
    const from = normalizeRangeStart(fromValue);
    const to = normalizeRangeEnd(toValue);
    if (from !== null && timestamp < from) {
      return false;
    }
    if (to !== null && timestamp > to) {
      return false;
    }
    return true;
  }

  function fallbackStageEntries(job) {
    return [
      { stage: "Uploaded", enteredAt: job.createdAt || job.scheduledStartAt, actorRole: "system", actorName: "System" },
      { stage: "Assigned", enteredAt: job.assignedAt || job.adminApprovedAt || job.acceptedAt, actorRole: "admin", actorName: "Administrator" },
      { stage: "Scheduled", enteredAt: job.acceptedAt || job.startedAt || job.scheduledStartAt, actorRole: "field", actorName: job.assignedTo || "Field team" },
      { stage: "Completed", enteredAt: job.completedAt, actorRole: "field", actorName: job.assignedTo || "Field team" },
      { stage: "Closed", enteredAt: job.closedAt || job.adminReviewedAt, actorRole: "admin", actorName: "Administrator" }
    ].filter((entry) => entry.enteredAt);
  }

  function buildCycleExportRows({ fromDate = "", toDate = "" } = {}) {
    const stageOrder = ["Uploaded", "Assigned", "Scheduled", "In Progress", "Completed", "Closed"];
    return appState.jobs.flatMap((job) => {
      if ((fromDate || toDate) && !isWithinDateRange(job.scheduledStartAt, fromDate, toDate)) {
        return [];
      }
      const updates = getJobUpdates(job.id);
      const latestUpdate = getLatestUpdate(job.id);
      const sourceEvents = getJobStageEvents(job.id).length ? getJobStageEvents(job.id) : fallbackStageEntries(job);
      const events = [...sourceEvents]
        .filter((event) => stageOrder.includes(event.stage))
        .sort((left, right) => new Date(left.enteredAt) - new Date(right.enteredAt));
      const latestEventByStage = new Map();
      events.forEach((event) => {
        latestEventByStage.set(event.stage, event);
      });
      let previousEvent = null;
      return stageOrder.flatMap((stage) => {
        const event = latestEventByStage.get(stage);
        if (!event) {
          return [];
        }
        const row = {
          jobId: job.id,
          jobTitle: job.title,
          market: job.market,
          jobAddress: job.jobAddress || "",
          requestedBy: job.requestedBy,
          jobType: job.jobType,
          priority: job.priority,
          teamName: job.assignedTo || "",
          dispatcherName: job.dispatcherName || "",
          dispatcherPhone: job.dispatcherPhone || "",
          currentCycle: getLifecycleStage(job),
          currentStatus: getOperationalStatus(job),
          lastProcessedCycle: stage,
          cycleTimestamp: event.enteredAt,
          previousCycle: previousEvent?.stage || "",
          previousCycleTimestamp: previousEvent?.enteredAt || "",
          durationHours: formatDurationHours(previousEvent?.enteredAt, event.enteredAt),
          scheduledStartAt: job.scheduledStartAt,
          jobValue: Number(job.jobValue || 0),
          laborCost: Number(job.laborCost || 0),
          plannedHours: Number(job.plannedHours || 0),
          actualHours: Number(job.actualHours || 0),
          completionPercent: Number(job.completion || 0),
          blockerStage: job.blockerStage || "",
          blockerReason: job.blockerReason || "",
          rejectionReason: job.rejectionReason || "",
          adminApprovedAt: job.adminApprovedAt || "",
          acceptedAt: job.acceptedAt || "",
          startedAt: job.startedAt || "",
          completedAt: job.completedAt || "",
          adminReviewedAt: job.adminReviewedAt || "",
          closedAt: job.closedAt || "",
          lastUpdateAt: latestUpdate?.createdAt || "",
          lastUpdateNote: summarizeUpdate(latestUpdate),
          totalUpdates: updates.length
        };
        previousEvent = event;
        return [row];
      });
    });
  }

  function downloadCycleExport() {
    const rows = buildCycleExportRows({
      fromDate: elements.exportDateFrom.value,
      toDate: elements.exportDateTo.value
    });
    if (!rows.length) {
      window.alert("No cycle data is available for the selected dates.");
      return;
    }
    const columns = [
      "jobId",
      "jobTitle",
      "market",
      "jobAddress",
      "requestedBy",
      "jobType",
      "priority",
      "teamName",
      "dispatcherName",
      "dispatcherPhone",
      "currentCycle",
      "currentStatus",
      "lastProcessedCycle",
      "cycleTimestamp",
      "previousCycle",
      "previousCycleTimestamp",
      "durationHours",
      "scheduledStartAt",
      "jobValue",
      "laborCost",
      "plannedHours",
      "actualHours",
      "completionPercent",
      "blockerStage",
      "blockerReason",
      "rejectionReason",
      "adminApprovedAt",
      "acceptedAt",
      "startedAt",
      "completedAt",
      "adminReviewedAt",
      "closedAt",
      "lastUpdateAt",
      "lastUpdateNote",
      "totalUpdates"
    ];
    const csv = [
      columns.join(","),
      ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fieldsight-cycle-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function compareValues(left, right, direction) {
    if (left === right) {
      return 0;
    }
    if (left === null || left === undefined || left === "") {
      return direction === "asc" ? 1 : -1;
    }
    if (right === null || right === undefined || right === "") {
      return direction === "asc" ? -1 : 1;
    }
    if (typeof left === "number" && typeof right === "number") {
      return direction === "asc" ? left - right : right - left;
    }
    return direction === "asc"
      ? String(left).localeCompare(String(right))
      : String(right).localeCompare(String(left));
  }

  function sortJobs(items) {
    const { key, direction } = intakeSort;
    return [...items].sort((left, right) => {
      const leftRejected = getOperationalStatus(left) === "Rejected" ? 1 : 0;
      const rightRejected = getOperationalStatus(right) === "Rejected" ? 1 : 0;
      if (leftRejected !== rightRejected) {
        return rightRejected - leftRejected;
      }
      const leftUpdate = getLatestUpdate(left.id);
      const rightUpdate = getLatestUpdate(right.id);
      const valueMap = {
        title: [left.title, right.title],
        market: [left.market, right.market],
        jobType: [left.jobType, right.jobType],
        lifecycle: [getLifecycleStage(left), getLifecycleStage(right)],
        lastUpdatedAt: [leftUpdate?.createdAt ? new Date(leftUpdate.createdAt).getTime() : 0, rightUpdate?.createdAt ? new Date(rightUpdate.createdAt).getTime() : 0],
        lastUpdateNote: [summarizeUpdate(leftUpdate), summarizeUpdate(rightUpdate)],
        assignedTo: [left.assignedTo || "", right.assignedTo || ""],
        scheduledStartAt: [new Date(left.scheduledStartAt).getTime(), new Date(right.scheduledStartAt).getTime()],
        jobValue: [Number(left.jobValue || 0), Number(right.jobValue || 0)],
        laborCost: [Number(left.laborCost || 0), Number(right.laborCost || 0)],
        plannedHours: [Number(left.plannedHours || 0), Number(right.plannedHours || 0)],
        actualHours: [Number(left.actualHours || 0), Number(right.actualHours || 0)],
        blockerReason: [left.blockerReason || "", right.blockerReason || ""]
      };
      const [leftValue, rightValue] = valueMap[key] || valueMap.scheduledStartAt;
      return compareValues(leftValue, rightValue, direction);
    });
  }

  function toggleSort(key) {
    intakeSort = {
      key,
      direction: intakeSort.key === key && intakeSort.direction === "asc" ? "desc" : "asc"
    };
    renderApp();
  }

  function renderSortableHeader(label, key) {
    const isActive = intakeSort.key === key;
    const marker = isActive ? (intakeSort.direction === "asc" ? "↑" : "↓") : "";
    return `<button class="sort-btn ${isActive ? "active" : ""}" type="button" data-sort-key="${key}">${label}${marker ? ` <span>${marker}</span>` : ""}</button>`;
  }

  function renderUpdatesPreview(jobId) {
    const updates = getJobUpdates(jobId).slice(0, 2);
    if (!updates.length) {
      return `<div class="update-list"><p class="muted">No field updates logged yet.</p></div>`;
    }
    return `
      <div class="update-list">
        ${updates.map((update) => `
          <article class="update-card">
            <div class="update-card-header">
              <strong>${update.authorName}</strong>
              <span class="muted">${formatDateTime(update.createdAt)}</span>
            </div>
            <div class="job-tags">
              ${update.updateType ? `<span class="pill">${update.updateType}</span>` : ""}
              ${update.workDone ? `<span class="pill">${update.workDone}</span>` : ""}
              ${(update.codesUsed || []).map((code) => `<span class="pill">${code}</span>`).join("")}
            </div>
            <p>${update.note}</p>
            ${(update.attachments || []).length ? `
              <div class="attachment-list">
                ${(update.attachments || []).map((attachment) => `
                  <a class="update-link" href="${attachment.attachmentPath}" target="_blank" rel="noreferrer">Open ${attachment.attachmentName || "attachment"}</a>
                `).join("")}
              </div>
            ` : (update.attachmentPath ? `<a class="update-link" href="${update.attachmentPath}" target="_blank" rel="noreferrer">Open ${update.attachmentName || "attachment"}</a>` : "")}
          </article>
        `).join("")}
      </div>
    `;
  }

  function renderStageHistoryPreview(jobId) {
    const events = getJobStageEvents(jobId).slice(0, 8);
    if (!events.length) {
      return `<div class="update-list"><p class="muted">No stage history recorded yet.</p></div>`;
    }
    return `
      <div class="update-list">
        ${events.map((event) => `
          <article class="update-card">
            <div class="update-card-header">
              <strong>${event.stage}</strong>
              <span class="muted">${formatDateTime(event.enteredAt)}</span>
            </div>
            <p class="muted">${event.actorName || "System"} | ${event.actorRole || "workflow"}</p>
          </article>
        `).join("")}
      </div>
    `;
  }

  async function filesToPayload(fileList) {
    const files = Array.from(fileList || []);
    const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (totalBytes > maxAttachmentBatchBytes) {
      throw new Error("Combined attachments exceed 30MB. Please split them into smaller batches.");
    }
    const payloads = [];
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(arrayBuffer);
      for (let index = 0; index < bytes.length; index += 1) {
        binary += String.fromCharCode(bytes[index]);
      }
      payloads.push({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        contentBase64: btoa(binary)
      });
    }
    return payloads;
  }

  function setToken(token) {
    authToken = token || "";
    if (authToken) {
      localStorage.setItem(authStorageKey, authToken);
    } else {
      localStorage.removeItem(authStorageKey);
    }
  }

  async function api(path, options) {
    const headers = {
      "Content-Type": "application/json",
      ...(options && options.headers ? options.headers : {})
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(path, { ...options, headers });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || `Request failed with ${response.status}`);
    }

    return payload;
  }

  function getFilters() {
    return {
      intake: {
        status: elements.intakeStatusFilter.value,
        query: elements.intakeSearch.value.trim().toLowerCase()
      },
      assignment: {
        window: elements.assignmentWindowFilter.value,
        query: elements.assignmentSearch.value.trim().toLowerCase()
      },
      field: {
        status: elements.fieldStatusFilter.value,
        query: elements.fieldSearch.value.trim().toLowerCase()
      },
      history: {
        type: elements.historyTypeFilter.value,
        query: elements.historySearch.value.trim().toLowerCase()
      },
      kpiGroup: elements.kpiGroupFilter.value,
      kpiEntity: elements.kpiEntityFilter.value,
      kpiDateFrom: elements.kpiDateFrom.value,
      kpiDateTo: elements.kpiDateTo.value
    };
  }

  function populateHistoryTypeFilter() {
    const currentValue = elements.historyTypeFilter.value;
    const options = [...new Set(appState.jobs.map((job) => job.jobType).filter(Boolean))].sort((left, right) => left.localeCompare(right));
    elements.historyTypeFilter.innerHTML = [`<option value="all">All job types</option>`]
      .concat(options.map((option) => `<option value="${option}">${option}</option>`))
      .join("");
    elements.historyTypeFilter.value = options.includes(currentValue) ? currentValue : "all";
  }

  function populateKpiEntityFilter() {
    const group = elements.kpiGroupFilter.value;
    let options = [];
    if (group === "jobs") {
      options = appState.jobs.map((job) => ({
        value: String(job.id),
        label: `${job.title} | ${job.market}`
      }));
    } else if (group === "contractors") {
      options = (appState.kpis.contractors || []).map((item) => ({
        value: item.name,
        label: item.name
      }));
    } else {
      options = (appState.kpis.teams || []).map((item) => ({
        value: item.name,
        label: item.name
      }));
    }
    const currentValue = elements.kpiEntityFilter.value;
    const defaultLabel = group === "jobs"
      ? "All jobs"
      : group === "contractors"
        ? "All contractors"
        : "All teams";
    elements.kpiEntityFilter.innerHTML = [`<option value="all">${defaultLabel}</option>`]
      .concat(options.map((option) => `<option value="${option.value}">${option.label}</option>`))
      .join("");
    if (currentValue && options.some((option) => option.value === currentValue)) {
      elements.kpiEntityFilter.value = currentValue;
    } else {
      elements.kpiEntityFilter.value = "all";
    }
  }

  function showLoginState() {
    const loggedIn = Boolean(appState.session);
    elements.loginShell.classList.toggle("hidden", loggedIn);
    elements.appContent.classList.toggle("hidden", !loggedIn);

    document.querySelectorAll(".admin-only").forEach((node) => {
      node.classList.toggle("hidden", !loggedIn || appState.session.role !== "admin");
    });
    document.querySelectorAll(".field-only").forEach((node) => {
      node.classList.toggle("hidden", !loggedIn || appState.session.role !== "field");
    });

    if (!loggedIn) {
      elements.sessionRoleLabel.textContent = "Guest mode";
      elements.sessionUserLabel.textContent = "Sign in or redeem an invite to continue.";
      currentScreen = "overview";
      return;
    }

    elements.sessionRoleLabel.textContent = appState.session.role === "admin" ? "Administrator portal" : "Field portal";
    elements.sessionUserLabel.textContent = `${appState.session.name} | ${appState.session.email}`;
    setScreen(getSafeScreen(currentScreen));
  }

  function setScreen(screenName) {
    currentScreen = getSafeScreen(screenName);
    elements.navLinks.forEach((link) => {
      link.classList.toggle("active", link.dataset.screen === currentScreen);
    });
    elements.screens.forEach((screen) => {
      screen.classList.toggle("active", screen.dataset.screenPanel === currentScreen);
    });
  }

  function renderMetrics() {
    const jobs = appState.jobs;
    const assigned = jobs.filter((job) => ["Assigned", "Scheduled", "In Progress"].includes(getLifecycleStage(job))).length;
    const blocked = jobs.filter((job) => Boolean(job.blockerReason)).length;
    const closed = jobs.filter((job) => getLifecycleStage(job) === "Closed").length;
    const totalValue = jobs.reduce((sum, job) => sum + Number(job.jobValue || 0), 0);
    const margin = jobs.reduce((sum, job) => sum + getMargin(job), 0);

    elements.metricGrid.innerHTML = [
      { label: "Tracked jobs", value: jobs.length, note: "Across upload, assignment, field execution, closeout, and history" },
      { label: "Assigned jobs", value: assigned, note: "Visible by team or contractor for dispatching" },
      { label: "Blocked jobs", value: blocked, note: "Active jobs with permit, staffing, access, or material blockers" },
      { label: "Closed jobs", value: closed, note: `${formatCurrency(totalValue)} in tracked value and ${formatCurrency(margin)} estimated margin` }
    ].map((metric) => `
      <article class="metric-card">
        <p class="eyebrow">${metric.label}</p>
        <strong>${metric.value}</strong>
        <p class="metric-note">${metric.note}</p>
      </article>
    `).join("");
  }

  function renderDeadlineList() {
    const items = [...appState.jobs]
      .filter((job) => !["Completed", "Closed"].includes(getLifecycleStage(job)))
      .sort((a, b) => new Date(a.scheduledStartAt) - new Date(b.scheduledStartAt))
      .slice(0, 5);

    elements.deadlineList.innerHTML = items.length ? items.map((job) => {
      const window = getAssignmentWindow(job);
      return `
        <article class="job-card compact-card">
          <div class="job-card-header">
            <div>
              <p class="eyebrow">${job.market}</p>
              <h4>${job.title}</h4>
            </div>
            <span class="window-pill ${window.className}">${window.label}</span>
          </div>
          <div class="job-meta">
            <span class="pill">${getLifecycleStage(job)}</span>
            <span class="pill">${getOperationalStatus(job)}</span>
            <span class="pill">${job.jobType}</span>
            <span class="pill">${job.assignedTo || "Unassigned"}</span>
          </div>
          <p class="muted">Starts ${formatDateTime(job.scheduledStartAt)} | ${formatCurrency(job.jobValue)}</p>
        </article>
      `;
    }).join("") : emptyState("No jobs available.");
  }

  function renderAlerts() {
    const items = appState.jobs.filter((job) => {
      if (["Completed", "Closed"].includes(getLifecycleStage(job))) {
        return false;
      }
      const window = getAssignmentWindow(job);
      return window.label !== "Open" || Boolean(job.blockerReason) || getMargin(job) < 0;
    }).slice(0, 6);

    elements.alertList.innerHTML = items.length ? items.map((job) => {
      const window = getAssignmentWindow(job);
      return `
        <article class="alert-card">
          <div class="alert-card-header">
            <strong>${job.title}</strong>
            <span class="status ${getStatusClass(getOperationalStatus(job))}">${getOperationalStatus(job)}</span>
          </div>
          <p class="muted">${job.blockerReason ? `${job.blockerStage || job.lifecycleStage} | ${job.blockerReason}` : job.issue}</p>
          <div class="job-tags">
            <span class="pill">${window.label}</span>
            <span class="pill">${formatCurrency(job.jobValue)}</span>
          </div>
        </article>
      `;
    }).join("") : emptyState("No active alerts.");
  }

  function renderDashboardShortcuts() {
    const activeJobs = appState.jobs.filter((job) => !["Completed", "Closed"].includes(getLifecycleStage(job))).length;
    const readyToStart = appState.jobs.filter((job) => ["Scheduled", "Not Started"].includes(getOperationalStatus(job)) && isAccepted(job) && !hasStarted(job)).length;
    const readyToClose = appState.jobs.filter((job) => getLifecycleStage(job) === "Completed").length;
    const shortcuts = [
      { label: "Dispatch jobs", note: `${activeJobs} active jobs in circulation`, screen: "admin" },
      { label: "Start-ready crews", note: `${readyToStart} scheduled jobs waiting on crew start`, screen: "field" },
      { label: "Closeout queue", note: `${readyToClose} jobs waiting on final review`, screen: "history" }
    ];
    elements.dashboardShortcuts.innerHTML = shortcuts.map((shortcut) => `
      <button class="shortcut-card" type="button" data-nav-screen="${shortcut.screen}">
        <strong>${shortcut.label}</strong>
        <span>${shortcut.note}</span>
      </button>
    `).join("");
  }

  function renderHistoryPreview() {
    const items = [...appState.jobs]
      .filter((job) => getLifecycleStage(job) === "Closed")
      .sort((left, right) => new Date(getClosedAt(right) || 0) - new Date(getClosedAt(left) || 0))
      .slice(0, 3);
    elements.historyPreview.innerHTML = items.length ? items.map((job) => `
      <article class="job-card compact-card">
        <div class="job-card-header">
          <div>
            <p class="eyebrow">${job.jobType}</p>
            <h4>${job.title}</h4>
          </div>
          <span class="status closed">Closed</span>
        </div>
        <div class="job-tags">
          <span class="pill">${job.jobAddress || job.market}</span>
          <span class="pill">${formatDateTime(getClosedAt(job) || job.adminReviewedAt)}</span>
        </div>
      </article>
    `).join("") : emptyState("No closed jobs yet.");
  }

  function renderDashboardBreakdown() {
    const closedJobs = appState.jobs.filter((job) => getLifecycleStage(job) === "Closed");
    const typeCounts = new Map();
    const codeCounts = new Map();
    closedJobs.forEach((job) => {
      typeCounts.set(job.jobType, (typeCounts.get(job.jobType) || 0) + 1);
      collectUpdateValues(job.id, "codesUsed").forEach((code) => {
        codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
      });
    });
    const topTypes = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const topCodes = [...codeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    elements.dashboardBreakdown.innerHTML = `
      <article class="info-card">
        <p class="eyebrow">Top job types</p>
        <div class="job-tags">${renderValuePills(topTypes.map(([name, count]) => `${name} (${count})`), "No closed job types yet.")}</div>
      </article>
      <article class="info-card">
        <p class="eyebrow">Top codes used</p>
        <div class="job-tags">${renderValuePills(topCodes.map(([name, count]) => `${name} (${count})`), "No closeout codes logged yet.")}</div>
      </article>
    `;
  }

  function renderMasterGrid(filters) {
    const filteredItems = appState.jobs.filter((job) => {
      const lifecycle = getLifecycleStage(job);
      const statusMatch = filters.status === "all" || lifecycle === filters.status;
      const haystack = `${job.title} ${job.requestedBy} ${job.market} ${job.jobAddress} ${job.jobType} ${job.assignedTo} ${job.dispatcherName} ${job.blockerReason}`.toLowerCase();
      return statusMatch && (!filters.query || haystack.includes(filters.query));
    });
    const items = sortJobs(filteredItems);

    elements.masterGrid.innerHTML = items.length ? `
      <table class="sheet-table">
        <thead>
          <tr>
            <th>${renderSortableHeader("Job", "title")}</th>
            <th>${renderSortableHeader("Market", "market")}</th>
            <th>${renderSortableHeader("Type", "jobType")}</th>
            <th>${renderSortableHeader("Lifecycle", "lifecycle")}</th>
            <th>${renderSortableHeader("Last Update", "lastUpdatedAt")}</th>
            <th>${renderSortableHeader("Assigned", "assignedTo")}</th>
            <th>${renderSortableHeader("Start", "scheduledStartAt")}</th>
            <th>${renderSortableHeader("Value", "jobValue")}</th>
            <th>${renderSortableHeader("Labor", "laborCost")}</th>
            <th>${renderSortableHeader("Planned", "plannedHours")}</th>
            <th>${renderSortableHeader("Actual", "actualHours")}</th>
            <th>${renderSortableHeader("Blocker", "blockerReason")}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((job) => {
            const latestUpdate = getLatestUpdate(job.id);
            const lifecycle = getLifecycleStage(job);
            return `
            <tr class="sheet-data-row">
              <td class="sheet-primary-cell">
                <strong>${job.title}</strong>
                <span>${job.requestedBy}</span>
                <span>${job.jobAddress || job.market}</span>
              </td>
              <td>
                <div>${job.market}</div>
              </td>
              <td>
                <div>${job.jobType}</div>
              </td>
              <td>
                <span class="sheet-stage ${getStatusClass(getLifecycleStage(job))}">${getLifecycleStage(job)}</span>
                <div class="sheet-substatus">${getOperationalStatus(job)}</div>
              </td>
              <td class="sheet-update-cell">
                <div>${latestUpdate ? formatDateTime(latestUpdate.createdAt) : "No updates yet"}</div>
                <span>${summarizeUpdate(latestUpdate)}</span>
              </td>
              <td>${job.assignedTo || "Unassigned"}<div class="sheet-substatus">${job.dispatcherName || "No dispatcher listed"}</div></td>
              <td>${formatDateTime(job.scheduledStartAt)}</td>
              <td>${formatCurrency(job.jobValue)}</td>
              <td>${formatCurrency(job.laborCost)}</td>
              <td>${Number(job.plannedHours || 0)}h</td>
              <td>${Number(job.actualHours || 0)}h</td>
              <td class="sheet-blocker-cell">${job.blockerReason ? `${job.blockerStage || getLifecycleStage(job)} | ${job.blockerReason}` : "<span class=\"muted\">Clear</span>"}</td>
            </tr>
            <tr class="sheet-action-row">
              <td><button class="sheet-inline-action" data-action="open-job" data-id="${job.id}">Open job</button></td>
              <td>${appState.session?.role === "admin" && !["Completed", "Closed"].includes(lifecycle) ? `<button class="sheet-inline-action" data-action="assign-job" data-id="${job.id}">Assign to</button>` : ""}</td>
              <td>${appState.session?.role === "admin" && !["Completed", "Closed"].includes(lifecycle) ? `<button class="sheet-inline-action" data-action="assign-fast" data-id="${job.id}">Quick assign</button>` : ""}</td>
              <td><button class="sheet-inline-action" data-action="log-update" data-id="${job.id}">Add update</button></td>
              <td>${appState.session?.role === "admin" && !isAdminApproved(job) ? `<button class="sheet-inline-action" data-action="admin-signoff" data-id="${job.id}">Admin signoff</button>` : ""}</td>
              <td><button class="sheet-inline-action" data-action="${job.blockerReason ? "clear-blocker" : "add-blocker"}" data-id="${job.id}">${job.blockerReason ? "Clear blocker" : "Add blocker"}</button></td>
              <td>${canFieldStart(job) ? `<button class="sheet-inline-action" data-action="start-job" data-id="${job.id}">Start job</button>` : canFieldComplete(job) ? `<button class="sheet-inline-action" data-action="complete-job" data-id="${job.id}">Complete job</button>` : ""}</td>
              <td></td>
              <td></td>
              <td></td>
              <td>${appState.session?.role === "admin" && getLifecycleStage(job) === "Completed" && !isAdminReviewed(job) ? `<button class="sheet-inline-action" data-action="review-job" data-id="${job.id}">Admin review</button>` : ""}</td>
              <td>${appState.session?.role === "admin" && getLifecycleStage(job) === "Completed" && isAdminReviewed(job) ? `<button class="sheet-inline-action" data-action="close-job" data-id="${job.id}">Close job</button>` : ""}</td>
            </tr>
          `;}).join("")}
        </tbody>
      </table>
    ` : emptyState("No jobs match the current filters.");
  }

  function renderStageBoard(filters) {
    const isAdmin = appState.session?.role === "admin";
    const items = appState.jobs.filter((job) => {
      const window = getAssignmentWindow(job);
      const statusMatch = filters.window === "all" || window.label === filters.window;
      const haystack = `${job.title} ${job.market} ${job.jobAddress} ${job.assignedTo} ${job.requestedBy} ${job.dispatcherName}`.toLowerCase();
      return statusMatch && (!filters.query || haystack.includes(filters.query));
    });

    const columns = visibleLifecycleStages.map((stage) => {
      const stageItems = items
        .filter((job) => getLifecycleStage(job) === stage)
        .sort((left, right) => {
          const leftRejected = getOperationalStatus(left) === "Rejected" ? 1 : 0;
          const rightRejected = getOperationalStatus(right) === "Rejected" ? 1 : 0;
          if (leftRejected !== rightRejected) {
            return rightRejected - leftRejected;
          }
          return new Date(left.scheduledStartAt) - new Date(right.scheduledStartAt);
        });
      return `
        <section class="stage-column" data-stage="${stage}">
          <header class="stage-column-header">
            <strong>${stage}</strong>
            <span class="pill">${stageItems.length}</span>
          </header>
          <div class="stage-column-body" data-stage-drop="${stage}">
            ${stageItems.map((job) => {
              const window = getAssignmentWindow(job);
              return `
                <article class="job-card board-card" draggable="${isAdmin ? "true" : "false"}" data-drag-job-id="${job.id}">
                  <div class="board-card-top">
                    <div>
                      <h4>${job.title}</h4>
                      <p class="board-card-status status ${getStatusClass(getOperationalStatus(job))}">${getOperationalStatus(job)}</p>
                    </div>
                  </div>
                  <div class="board-card-meta">
                    <span class="pill">${job.jobAddress || job.market}</span>
                    <span class="pill">${job.dispatcherName || "Dispatcher not set"}</span>
                  </div>
                  <div class="job-actions compact-actions">
                    <button class="action-btn" data-action="open-job" data-id="${job.id}">Open job</button>
                  </div>
                </article>
              `;
            }).join("") || `<div class="empty-stage">Drop jobs here</div>`}
          </div>
        </section>
      `;
    });

    elements.stageBoard.innerHTML = columns.join("");
  }

  function renderFieldJobs(filters) {
    const items = appState.jobs.filter((job) => {
      const status = getOperationalStatus(job);
      const statusMatch = filters.status === "all" || status === filters.status;
      const haystack = `${job.title} ${job.market} ${job.jobAddress} ${job.assignedTo} ${job.dispatcherName} ${job.blockerReason}`.toLowerCase();
      return statusMatch && (!filters.query || haystack.includes(filters.query));
    });

    elements.fieldList.innerHTML = items.length ? items.map((job) => {
      const needsUpdateBeforeComplete = isAccepted(job) && getOperationalStatus(job) === "In Progress" && getJobUpdates(job.id).length === 0;
      return `
      <article class="job-card">
        <div class="job-card-header">
          <div>
            <p class="eyebrow">${job.market}</p>
            <h4>${job.title}</h4>
          </div>
          <span class="status ${getStatusClass(getOperationalStatus(job))}">${getOperationalStatus(job)}</span>
        </div>
        <div class="job-tags">
          <span class="pill">${job.jobType}</span>
          <span class="pill">${job.jobAddress || job.market}</span>
          <span class="pill">Start ${formatDateTime(job.scheduledStartAt)}</span>
          <span class="pill">Planned ${Number(job.plannedHours || 0)}h</span>
          <span class="pill">Actual ${Number(job.actualHours || 0)}h</span>
        </div>
        <div class="job-progress">
          <div class="progress-bar"><span style="width:${job.completion}%"></span></div>
          <p class="muted">${job.completion}% complete | ${formatCurrency(job.jobValue)} value | ${formatCurrency(job.laborCost)} labor</p>
          <p class="muted">${job.blockerReason || job.issue}</p>
          <p class="muted">Dispatcher: ${job.dispatcherName || "Not listed"} | ${formatPhone(job.dispatcherPhone)}</p>
        </div>
        <div class="job-actions">
          <button class="action-btn" data-action="open-job" data-id="${job.id}">Open job</button>
          ${getMapsUrl(job) ? `<a class="action-btn action-link" href="${getMapsUrl(job)}" target="_blank" rel="noreferrer">Open in Maps</a>` : ""}
          ${job.dispatcherPhone ? `<a class="action-btn action-link" href="tel:${job.dispatcherPhone}">Call dispatcher</a>` : ""}
          ${canFieldAccept(job) ? `<button class="action-btn" data-action="accept-job" data-id="${job.id}">Accept job</button>` : ""}
          ${canFieldStart(job) ? `<button class="action-btn" data-action="start-job" data-id="${job.id}">Start job</button>` : ""}
          ${canFieldReject(job) ? `<button class="action-btn" data-action="reject-job" data-id="${job.id}">Reject job</button>` : ""}
          ${canFieldComplete(job) ? `<button class="action-btn" data-action="complete-job" data-id="${job.id}">Complete job</button>` : ""}
          <button class="action-btn" data-action="log-update" data-id="${job.id}">Add update</button>
          ${job.blockerReason
            ? `<button class="action-btn" data-action="clear-blocker" data-id="${job.id}">Clear blocker</button>`
            : `<button class="action-btn" data-action="add-blocker" data-id="${job.id}">Report blocker</button>`}
        </div>
        ${needsUpdateBeforeComplete ? `<p class="completion-hint">Add at least one update before completing this job.</p>` : ""}
        ${renderUpdatesPreview(job.id)}
        <div class="job-tags requirement-row">
          ${buildRequirementBadges(job)}
        </div>
      </article>
    `;}).join("") : emptyState("No assigned field jobs match the current filters.");
  }

  function renderHistoryList(filters) {
    const items = [...appState.jobs]
      .filter((job) => getLifecycleStage(job) === "Closed")
      .filter((job) => {
        const typeMatch = filters.type === "all" || job.jobType === filters.type;
        const haystack = `${job.title} ${job.market} ${job.jobAddress} ${job.jobType} ${job.dispatcherName}`.toLowerCase();
        return typeMatch && (!filters.query || haystack.includes(filters.query));
      })
      .sort((left, right) => new Date(getClosedAt(right) || 0) - new Date(getClosedAt(left) || 0));

    elements.historyList.innerHTML = items.length ? items.map((job) => `
      <article class="job-card">
        <div class="job-card-header">
          <div>
            <p class="eyebrow">${job.jobType}</p>
            <h4>${job.title}</h4>
          </div>
          <span class="status closed">Closed</span>
        </div>
        <div class="job-tags">
          <span class="pill">${job.jobAddress || job.market}</span>
          <span class="pill">Closed ${formatDateTime(getClosedAt(job) || job.adminReviewedAt)}</span>
          <span class="pill">Dispatcher: ${job.dispatcherName || "Not listed"}</span>
        </div>
        <div class="detail-stack">
          <div>
            <p class="eyebrow">Work done</p>
            <div class="job-tags">${renderValuePills(collectUpdateValues(job.id, "workDone"), "No work-done selections logged.")}</div>
          </div>
          <div>
            <p class="eyebrow">Codes used</p>
            <div class="job-tags">${renderValuePills(collectUpdateValues(job.id, "codesUsed"), "No codes logged.")}</div>
          </div>
        </div>
        <div class="job-actions">
          <button class="action-btn" data-action="open-job" data-id="${job.id}">Open job</button>
          ${getMapsUrl(job) ? `<a class="action-btn action-link" href="${getMapsUrl(job)}" target="_blank" rel="noreferrer">Open in Maps</a>` : ""}
        </div>
      </article>
    `).join("") : emptyState("No closed jobs match the current filters.");
  }

  function renderCrews() {
    elements.crewList.innerHTML = appState.crews.map((crew) => `
      <article class="crew-card">
        <div class="crew-card-header">
          <div>
            <p class="eyebrow">${crew.type}</p>
            <h4>${crew.name}</h4>
          </div>
          <span class="pill">${crew.utilization}% utilized</span>
        </div>
        <div class="crew-meta">
          <span class="pill">Available: ${crew.available}</span>
          <span class="pill">Assigned: ${crew.assigned}</span>
          <span class="pill">Capacity: ${crew.capacity}</span>
        </div>
        <div class="crew-meta">
          <span class="pill">Contact: ${crew.contactName || "Dispatch team"}</span>
          <span class="pill">${crew.contactPhone || "Phone not listed"}</span>
        </div>
        <p class="muted">${crew.contactEmail || "Email not listed"}</p>
        <p class="muted">${crew.coverageArea || "Availability is based on current schedule conflicts, not location restrictions."}</p>
        <p class="muted">${crew.note}</p>
      </article>
    `).join("");
  }

  function matchesTimeframe(value, timeframe) {
    if (!value) {
      return false;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return false;
    }
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const days = diffMs / (1000 * 60 * 60 * 24);
    if (timeframe === "day") {
      return days <= 1;
    }
    if (timeframe === "week") {
      return days <= 7;
    }
    if (timeframe === "month") {
      return days <= 31;
    }
    return days <= 366;
  }

  function average(values) {
    const valid = values.filter((value) => typeof value === "number" && !Number.isNaN(value));
    if (!valid.length) {
      return null;
    }
    return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2));
  }

  function buildCycleSeries({ assignmentHours, scheduleHours, completionHours, closeHours }) {
    return [
      { label: "Uploaded", value: 0 },
      { label: "Assigned", value: Number(assignmentHours || 0) },
      { label: "Scheduled", value: Number(scheduleHours || 0) },
      { label: "Completed", value: Number(completionHours || 0) },
      { label: "Closed", value: Number(closeHours || 0) }
    ];
  }

  function computeCycleBaseline(rows) {
    return {
      assignmentHours: average(rows.map((row) => row.adminAssignmentHours)) || 0,
      scheduleHours: average(rows.map((row) => row.assignedToScheduleHours)) || 0,
      completionHours: average(rows.map((row) => row.expectedHours)) || 0,
      closeHours: average(rows.map((row) => row.adminCloseHours)) || 0
    };
  }

  function renderCycleLineChart(label, actualSeries, expectedSeries) {
    const allValues = [...actualSeries, ...expectedSeries].map((point) => Number(point.value || 0));
    const max = Math.max(...allValues, 1);
    const width = 320;
    const height = 170;
    const leftPad = 34;
    const rightPad = 12;
    const topPad = 14;
    const bottomPad = 38;
    const usableWidth = width - leftPad - rightPad;
    const usableHeight = height - topPad - bottomPad;

    const buildPoints = (series) => series.map((point, index) => {
      const x = leftPad + (usableWidth * index) / Math.max(series.length - 1, 1);
      const normalized = Number(point.value || 0) / max;
      const y = topPad + usableHeight - normalized * usableHeight;
      return {
        ...point,
        x,
        y,
        display: `${Number(point.value || 0).toFixed(1)}h`
      };
    });

    const actualPoints = buildPoints(actualSeries);
    const expectedPoints = buildPoints(expectedSeries);
    const actualPolyline = actualPoints.map((point) => `${point.x},${point.y}`).join(" ");
    const expectedPolyline = expectedPoints.map((point) => `${point.x},${point.y}`).join(" ");
    const yTicks = [0, max / 2, max].map((value) => Number(value.toFixed(1)));

    return `
      <div class="kpi-chart-card">
        <div class="kpi-bar-label">
          <strong>${label}</strong>
          <span class="muted">Actual vs expected hours by workflow stage</span>
        </div>
        <div class="kpi-line-chart">
          <svg viewBox="0 0 ${width} ${height}" class="kpi-line-svg" aria-hidden="true">
            ${yTicks.map((tick) => {
              const y = topPad + usableHeight - (tick / max) * usableHeight;
              return `<line class="kpi-grid-line" x1="${leftPad}" y1="${y}" x2="${width - rightPad}" y2="${y}"></line>
                <text class="kpi-grid-label" x="2" y="${y + 4}">${tick.toFixed(1)}h</text>`;
            }).join("")}
            <polyline class="kpi-line-path expected" points="${expectedPolyline}"></polyline>
            <polyline class="kpi-line-path actual" points="${actualPolyline}"></polyline>
            ${expectedPoints.map((point) => `<circle class="kpi-line-dot expected" cx="${point.x}" cy="${point.y}" r="3.5"></circle>`).join("")}
            ${actualPoints.map((point) => `<circle class="kpi-line-dot actual" cx="${point.x}" cy="${point.y}" r="4"></circle>`).join("")}
          </svg>
          <div class="kpi-line-labels">
            ${actualPoints.map((point, index) => `
              <div class="kpi-line-label">
                <strong>${point.display}</strong>
                <small>Expected ${expectedPoints[index].display}</small>
                <span>${point.label}</span>
              </div>
            `).join("")}
          </div>
          <div class="kpi-line-legend">
            <span class="legend-item"><span class="legend-swatch actual"></span>Actual</span>
            <span class="legend-item"><span class="legend-swatch expected"></span>Expected</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderKpis(group, entity, fromDate, toDate) {
    const cycleRows = (appState.kpis.cycleRows || []).filter((row) => {
      const matchesDate = !fromDate && !toDate
        ? true
        : isWithinDateRange(row.scheduledStartAt, fromDate, toDate);
      if (!matchesDate) {
        return false;
      }
      if (group === "jobs") {
        return entity === "all" || String(row.jobId) === String(entity);
      }
      return true;
    });
    const poolBaseline = computeCycleBaseline(cycleRows);

    if (group === "jobs") {
      elements.kpiList.innerHTML = cycleRows.length ? cycleRows.map((row) => `
        <article class="kpi-card">
          <div class="kpi-card-header">
            <h4>${row.title}</h4>
            <span class="pill">${row.assignedTo}</span>
          </div>
          <div class="kpi-row">
            <span class="pill">${row.market}</span>
            <span class="pill">${row.status}</span>
            <span class="pill">Last move ${formatDateTime(row.latestStageAt)}</span>
          </div>
          ${renderCycleLineChart(
            "Cycle timing",
            buildCycleSeries({
              assignmentHours: row.adminAssignmentHours,
              scheduleHours: row.assignedToScheduleHours,
              completionHours: row.fieldExecutionHours,
              closeHours: row.adminCloseHours
            }),
            buildCycleSeries(poolBaseline)
          )}
          <div class="kpi-row">
            <span class="pill">Admin assignment: ${row.adminAssignmentHours ?? "n/a"}h</span>
            <span class="pill">Team accept/schedule: ${row.assignedToScheduleHours ?? "n/a"}h</span>
            <span class="pill">Field completion: ${row.fieldExecutionHours ?? "n/a"}h</span>
            <span class="pill">Admin close: ${row.adminCloseHours ?? "n/a"}h</span>
          </div>
        </article>
      `).join("") : emptyState("No KPI timing rows match the current filters.");
      return;
    }

    const allowedNames = new Set(
      (group === "contractors" ? (appState.kpis.contractors || []) : (appState.kpis.teams || [])).map((item) => item.name)
    );
    const grouped = new Map();
    cycleRows.forEach((row) => {
      const key = row.assignedTo || "Unassigned";
      if (!allowedNames.has(key)) {
        return;
      }
      if (entity !== "all" && key !== entity) {
        return;
      }
      const current = grouped.get(key) || [];
      current.push(row);
      grouped.set(key, current);
    });

    const summaryRows = [...grouped.entries()].map(([name, rows]) => ({
      name,
      sampleSize: rows.length,
      avgExpectedHours: average(rows.map((row) => row.expectedHours)),
      avgActualHours: average(rows.map((row) => row.actualHours)),
      avgAdminAssignmentHours: average(rows.map((row) => row.adminAssignmentHours)),
      avgAssignedToScheduleHours: average(rows.map((row) => row.assignedToScheduleHours)),
      avgFieldExecutionHours: average(rows.map((row) => row.fieldExecutionHours)),
      avgAdminCloseHours: average(rows.map((row) => row.adminCloseHours)),
      avgClosedLoopHours: average(rows.map((row) => row.closedLoopHours))
    }));

    const summaryItems = group === "contractors"
      ? (appState.kpis.contractors || [])
      : (appState.kpis.teams || []);

    elements.kpiList.innerHTML = summaryRows.length ? summaryRows.map((row) => {
      const summary = summaryItems.find((item) => item.name === row.name);
      return `
        <article class="kpi-card">
          <div class="kpi-card-header">
            <h4>${row.name}</h4>
            <span class="pill">Sample size: ${row.sampleSize}</span>
          </div>
          <div class="kpi-row">
            ${summary ? `<span class="pill">Jobs/week: ${summary.jobsPerWeek}</span>` : ""}
            ${summary ? `<span class="pill">On-time: ${summary.onTimeStartRate}%</span>` : ""}
            ${summary ? `<span class="pill">Blocked: ${summary.blockedRate}%</span>` : ""}
            ${summary ? `<span class="pill">Margin/job: ${formatCurrency(summary.avgMargin)}</span>` : ""}
          </div>
          ${renderCycleLineChart(
            "Cycle timing average",
            buildCycleSeries({
              assignmentHours: row.avgAdminAssignmentHours,
              scheduleHours: row.avgAssignedToScheduleHours,
              completionHours: row.avgFieldExecutionHours,
              closeHours: row.avgAdminCloseHours
            }),
            buildCycleSeries(poolBaseline)
          )}
          <div class="kpi-row">
            <span class="pill">Admin assignment: ${row.avgAdminAssignmentHours ?? "n/a"}h</span>
            <span class="pill">Team accept/schedule: ${row.avgAssignedToScheduleHours ?? "n/a"}h</span>
            <span class="pill">Field completion: ${row.avgFieldExecutionHours ?? "n/a"}h</span>
            <span class="pill">Admin close: ${row.avgAdminCloseHours ?? "n/a"}h</span>
            <span class="pill">Pool average actual: ${row.avgActualHours ?? "n/a"}h</span>
          </div>
        </article>
      `;
    }).join("") : emptyState("No KPI data yet for the selected filters.");
  }

  async function loadAdminData() {
    if (!appState.session || appState.session.role !== "admin") {
      return;
    }
    const [usersPayload, invitesPayload] = await Promise.all([
      api("/api/admin/users"),
      api("/api/admin/invites")
    ]);

    elements.usersList.innerHTML = usersPayload.users.length ? usersPayload.users.map((user) => `
      <article class="info-card">
        <strong>${user.name}</strong><br>
        <span class="muted">${user.email} | ${user.role} | ${user.status}</span>
      </article>
    `).join("") : emptyState("No users found.");

    elements.invitesList.innerHTML = invitesPayload.invites.length ? invitesPayload.invites.map((invite) => `
      <article class="info-card">
        <strong>${invite.email}</strong><br>
        <span class="muted">${invite.role} invite</span><br>
        <span class="mono">${invite.token}</span>
      </article>
    `).join("") : emptyState("No invites created yet.");
  }

  async function refreshApp() {
    if (!authToken) {
      appState.session = null;
      showLoginState();
      return;
    }

    try {
      appState = await api("/api/app-state");
      showLoginState();
      renderApp();
      await loadAdminData();
    } catch (error) {
      setToken("");
      appState.session = null;
      showLoginState();
    }
  }

  function renderApp() {
    const filters = getFilters();
    renderMetrics();
    renderDashboardShortcuts();
    renderHistoryPreview();
    renderDashboardBreakdown();
    renderDeadlineList();
    renderAlerts();
    renderMasterGrid(filters.intake);
    renderStageBoard(filters.assignment);
    renderCrews();
    populateHistoryTypeFilter();
    populateKpiEntityFilter();
    renderFieldJobs(filters.field);
    renderHistoryList(filters.history);
    renderKpis(filters.kpiGroup, filters.kpiEntity, filters.kpiDateFrom, filters.kpiDateTo);
  }

  async function login(email, password) {
    const payload = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setToken(payload.token);
    await refreshApp();
  }

  async function redeemInvite(token, name, password) {
    const payload = await api("/api/auth/redeem-invite", {
      method: "POST",
      body: JSON.stringify({ token, name, password })
    });
    setToken(payload.token);
    await refreshApp();
  }

  function nextLifecycleStage(currentStatus) {
    const currentIndex = visibleLifecycleStages.indexOf(currentStatus);
    return visibleLifecycleStages[Math.min(currentIndex + 1, visibleLifecycleStages.length - 1)] || visibleLifecycleStages[0];
  }

  async function updateJob(jobId, payload) {
    await api(`/api/jobs/${jobId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    await refreshApp();
  }

  function openAssignDialog(jobId) {
    const job = appState.jobs.find((item) => String(item.id) === String(jobId));
    if (!job) {
      return;
    }
    elements.assignForm.elements.jobId.value = String(jobId);
    fillAssigneeSelect(elements.assignCrewSelect, job.assignedTo, job);
    elements.assignDialog.showModal();
  }

  function openUpdateDialog(jobId) {
    const job = appState.jobs.find((item) => String(item.id) === String(jobId));
    elements.updateForm.elements.jobId.value = String(jobId);
    elements.updateForm.elements.note.value = "";
    elements.updateForm.elements.attachment.value = "";
    elements.updateForm.elements.updateType.value = "Work performed";
    elements.updateForm.elements.workDone.value = "";
    Array.from(elements.updateForm.elements.codesUsed.options).forEach((option) => {
      option.selected = false;
    });
    if (job && canFieldStart(job)) {
      elements.updateForm.elements.updateType.value = "Crew started job";
    }
    elements.updateDialog.showModal();
  }

  function openRejectDialog(jobId, currentReason = "") {
    elements.rejectForm.elements.jobId.value = String(jobId);
    elements.rejectForm.elements.reason.value = currentReason;
    elements.rejectError.textContent = "";
    elements.rejectDialog.showModal();
    elements.rejectForm.elements.reason.focus();
  }

  function fillAssigneeSelect(selectElement, currentValue, job) {
    const allCrewOptions = job
      ? appState.crews.map((crew) => ({
          ...crew,
          conflicts: getCrewScheduleConflicts(job, crew.name)
        }))
      : appState.crews.map((crew) => ({ ...crew, conflicts: [] }));
    const crewOptions = allCrewOptions.filter((crew) => crew.conflicts.length === 0);
    selectElement.innerHTML = [`<option value="">Unassigned</option>`]
      .concat(crewOptions.map((crew) => `<option value="${crew.name}">${crew.name} | ${crew.available} available | ${crew.contactName || "Dispatch contact"}</option>`))
      .join("");
    if (currentValue && !crewOptions.some((crew) => crew.name === currentValue)) {
      const currentCrew = allCrewOptions.find((crew) => crew.name === currentValue);
      const reason = currentCrew?.conflicts?.length ? `Schedule conflict with ${currentCrew.conflicts.map((conflict) => conflict.title).join(", ")}` : "Currently unavailable";
      selectElement.innerHTML += `<option value="${currentValue}">${currentValue} | ${reason}</option>`;
    }
    selectElement.value = currentValue || "";
  }

  function openJobDetailDialog(jobId) {
    const job = appState.jobs.find((item) => String(item.id) === String(jobId));
    if (!job) {
      return;
    }
    const isAdmin = appState.session?.role === "admin";
    elements.jobDetailForm.elements.jobId.value = String(job.id);
    elements.jobDetailSummary.innerHTML = `
      <article class="info-card">
        <strong>${job.title}</strong><br>
        <span class="muted">${job.market} | ${job.jobType}</span><br>
        <span class="muted">Address: ${job.jobAddress || job.market}</span><br>
        <span class="muted">Dispatcher: ${job.dispatcherName || "Not listed"} | ${formatPhone(job.dispatcherPhone)}</span><br>
        <span class="muted">Workflow step: ${getLifecycleStage(job)}</span><br>
        <span class="muted">Live status: ${getOperationalStatus(job)}</span><br>
        <span class="muted">Admin signoff: ${isAdminApproved(job) ? "Complete" : "Pending"}</span><br>
        <span class="muted">Team accepted: ${isAccepted(job) ? "Complete" : "Pending"}</span><br>
        <span class="muted">Final admin review: ${isAdminReviewed(job) ? "Complete" : "Pending"}</span><br>
        <span class="muted">Started: ${hasStarted(job) ? "Yes" : "No"}</span><br>
        <span class="muted">Blocker: ${job.blockerReason ? `${job.blockerStage || job.lifecycleStage} | ${job.blockerReason}` : "None"}</span><br>
        <span class="muted">Assignment note: Vendor availability is currently based on schedule conflicts, not location restrictions.</span>
      </article>
    `;
    elements.jobDetailQuickLinks.innerHTML = `
      ${getMapsUrl(job) ? `<a class="action-btn action-link" href="${getMapsUrl(job)}" target="_blank" rel="noreferrer">Open in Maps</a>` : ""}
      ${job.dispatcherPhone ? `<a class="action-btn action-link" href="tel:${job.dispatcherPhone}">Call dispatcher</a>` : ""}
    `;
    elements.jobDetailStageSelect.innerHTML = editableLifecycleStages.map((stage) => `<option value="${stage}">${stage}</option>`).join("");
    elements.jobDetailStageSelect.value = mapUiStageToStoredStage(getLifecycleStage(job));
    fillAssigneeSelect(elements.jobDetailAssigneeSelect, job.assignedTo, job);
    elements.jobDetailForm.elements.scheduledStartAt.value = String(job.scheduledStartAt || "").slice(0, 16);
    elements.jobDetailForm.elements.priority.value = job.priority || "Medium";
    elements.jobDetailForm.elements.adminApproved.checked = isAdminApproved(job);
    elements.jobDetailForm.elements.adminReviewed.checked = isAdminReviewed(job);
    elements.jobWorkflowControls.classList.toggle("hidden", !isAdmin);
    elements.jobFieldActions.classList.toggle("hidden", isAdmin);
    elements.saveJobDetailButton.classList.toggle("hidden", !isAdmin);
    elements.jobDetailStageSelect.disabled = !isAdmin;
    elements.jobDetailAssigneeSelect.disabled = !isAdmin;
    elements.jobDetailForm.elements.scheduledStartAt.disabled = !isAdmin;
    elements.jobDetailForm.elements.priority.disabled = !isAdmin;
    elements.jobDetailForm.elements.adminApproved.disabled = !isAdmin;
    elements.jobDetailForm.elements.adminReviewed.disabled = !isAdmin;
    elements.jobDetailUpdates.innerHTML = `
      <div class="detail-stack">
        <p class="eyebrow">Cycle history</p>
        ${renderStageHistoryPreview(job.id)}
      </div>
      <div class="detail-stack">
        <p class="eyebrow">Updates</p>
        ${renderUpdatesPreview(job.id)}
      </div>
    `;
    const needsUpdateBeforeComplete = isAccepted(job) && getOperationalStatus(job) === "In Progress" && getJobUpdates(job.id).length === 0;
    elements.jobFieldActionsList.innerHTML = isAdmin ? "" : `
      ${canFieldAccept(job) ? `<button class="action-btn" type="button" data-action="accept-job" data-id="${job.id}">Accept job</button>` : ""}
      ${canFieldStart(job) ? `<button class="action-btn" type="button" data-action="start-job" data-id="${job.id}">Start job</button>` : ""}
      ${canFieldReject(job) ? `<button class="action-btn" type="button" data-action="reject-job" data-id="${job.id}">Reject job</button>` : ""}
      ${canFieldComplete(job) ? `<button class="action-btn" type="button" data-action="complete-job" data-id="${job.id}">Complete job</button>` : ""}
      <button class="action-btn" type="button" data-action="log-update" data-id="${job.id}">Add update</button>
      ${job.blockerReason
        ? `<button class="action-btn" type="button" data-action="clear-blocker" data-id="${job.id}">Clear blocker</button>`
        : `<button class="action-btn" type="button" data-action="add-blocker" data-id="${job.id}">Report blocker</button>`}
      ${needsUpdateBeforeComplete ? `<p class="completion-hint">Add at least one update before completing this job.</p>` : ""}
    `;
    elements.jobDetailDialog.showModal();
  }

  function refreshJobDetailAssignees() {
    if (!elements.jobDetailDialog.open || appState.session?.role !== "admin") {
      return;
    }
    const jobId = Number(elements.jobDetailForm.elements.jobId.value || 0);
    const job = appState.jobs.find((item) => Number(item.id) === jobId);
    if (!job) {
      return;
    }
    const overrideStart = elements.jobDetailForm.elements.scheduledStartAt.value;
    const currentAssignee = elements.jobDetailAssigneeSelect.value || job.assignedTo;
    fillAssigneeSelect(elements.jobDetailAssigneeSelect, currentAssignee, {
      ...job,
      scheduledStartAt: overrideStart || job.scheduledStartAt
    });
  }

  async function handleActionClick(event) {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.action;
    const jobId = Number(actionButton.dataset.id);
    const job = appState.jobs.find((item) => String(item.id) === String(jobId));
    if (!job) {
      return;
    }

    if (action === "assign-fast") {
      if (appState.session?.role !== "admin") {
        window.alert("Only administrators can assign jobs.");
        return;
      }
      const availableCrew = getAvailableCrewsForJob(job)
        .sort((a, b) => {
          if (b.available !== a.available) {
            return b.available - a.available;
          }
          return a.assigned - b.assigned;
        })
        .find((crew) => crew.available > 0);
      if (!availableCrew) {
        window.alert("No crews are currently available without a schedule conflict for this job.");
        return;
      }
      await updateJob(jobId, {
        assignedTo: availableCrew.name,
        lifecycleStage: "Assigned",
        issue: `Assigned to ${availableCrew.name}. Waiting on acknowledgement.`
      });
      return;
    }

    if (action === "open-job") {
      openJobDetailDialog(jobId);
      return;
    }

    if (action === "assign-job") {
      if (appState.session?.role !== "admin") {
        window.alert("Only administrators can assign jobs.");
        return;
      }
      openAssignDialog(jobId);
      return;
    }

    if (action === "advance-stage") {
      const nextStatus = nextLifecycleStage(getLifecycleStage(job));
      const nextCompletion = nextStatus === "Closed"
        ? 100
        : Math.min(job.completion + (nextStatus === "Completed" ? 35 : 20), 100);
      const nextHours = Number(job.actualHours || 0) + 4;
      await updateJob(jobId, {
        ...buildStageUpdatePayload(job, nextStatus, "the workflow controls"),
        completion: nextCompletion,
        actualHours: nextHours,
        blockerReason: nextStatus === "Completed" || nextStatus === "Closed" ? "" : job.blockerReason,
        issue: `Stage moved to ${nextStatus}.`
      });
      return;
    }

    if (action === "admin-signoff") {
      await updateJob(jobId, {
        adminApproved: true,
        issue: "Admin signoff completed."
      });
      window.alert("Job was approved and is ready for assignment.");
      return;
    }

    if (action === "accept-job") {
      await updateJob(jobId, {
        accepted: true,
        issue: "Assigned team accepted the job."
      });
      window.alert("Job was accepted.");
      return;
    }

    if (action === "start-job") {
      await updateJob(jobId, {
        started: true,
        accepted: true,
        lifecycleStage: "In Progress",
        issue: "Crew officially started work and moved the job into progress."
      });
      window.alert("Job was started and is now in progress.");
      return;
    }

    if (action === "reject-job") {
      openRejectDialog(jobId, job.rejectionReason || "");
      return;
    }

    if (action === "complete-job") {
      await updateJob(jobId, {
        lifecycleStage: "Completed",
        completion: 100,
        accepted: true,
        issue: "Field crew marked the job complete."
      });
      if (elements.jobDetailDialog.open) {
        elements.jobDetailDialog.close();
      }
      window.alert("Job was completed.");
      return;
    }

    if (action === "review-job") {
      await updateJob(jobId, {
        adminReviewed: true,
        lifecycleStage: "Completed",
        issue: "Final admin review completed. Job closed."
      });
      window.alert("Final admin review completed. Job was closed.");
      return;
    }

    if (action === "close-job") {
      await updateJob(jobId, {
        lifecycleStage: "Closed",
        issue: "Job closed after admin review."
      });
      return;
    }

    if (action === "add-blocker") {
      const blockerReason = window.prompt("Enter blocker reason", job.blockerReason || "");
      if (!blockerReason) {
        return;
      }
      await updateJob(jobId, {
        blockerReason,
        blockerStage: getLifecycleStage(job),
        issue: blockerReason
      });
      return;
    }

    if (action === "log-update") {
      openUpdateDialog(jobId);
      return;
    }

    if (action === "clear-blocker") {
      await updateJob(jobId, {
        blockerReason: "",
        blockerStage: "",
        issue: "Blocker cleared. Work resumed."
      });
      return;
    }

  }

  function registerEvents() {
    elements.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      elements.loginError.textContent = "";
      try {
        const form = new FormData(elements.loginForm);
        await login(form.get("email"), form.get("password"));
        elements.loginForm.reset();
      } catch (error) {
        elements.loginError.textContent = error.message;
      }
    });

    elements.redeemInviteForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      elements.inviteError.textContent = "";
      try {
        const form = new FormData(elements.redeemInviteForm);
        await redeemInvite(form.get("token"), form.get("name"), form.get("password"));
        elements.redeemInviteForm.reset();
      } catch (error) {
        elements.inviteError.textContent = error.message;
      }
    });

    elements.signOutButton.addEventListener("click", async () => {
      try {
        await api("/api/auth/logout", { method: "POST" });
      } catch {}
      setToken("");
      appState.session = null;
      showLoginState();
    });

    elements.navLinks.forEach((link) => {
      link.addEventListener("click", () => setScreen(link.dataset.screen));
    });

    [
      elements.intakeStatusFilter,
      elements.intakeSearch,
      elements.assignmentWindowFilter,
      elements.assignmentSearch,
      elements.fieldStatusFilter,
      elements.fieldSearch,
      elements.historyTypeFilter,
      elements.historySearch,
      elements.kpiGroupFilter,
      elements.kpiEntityFilter,
      elements.kpiDateFrom,
      elements.kpiDateTo
    ].forEach((control) => control.addEventListener("input", renderApp));

    elements.kpiGroupFilter.addEventListener("change", () => {
      populateKpiEntityFilter();
      renderApp();
    });

    elements.openJobDialog.addEventListener("click", () => {
      if (appState.session?.name) {
        elements.jobForm.elements.dispatcherName.value = appState.session.name;
      }
      elements.jobDialog.showModal();
    });
    elements.exportCsvButton.addEventListener("click", downloadCycleExport);
    elements.refreshDataButton.addEventListener("click", refreshApp);
    elements.closeJobDialog.addEventListener("click", () => elements.jobDialog.close());
    elements.cancelJobDialog.addEventListener("click", () => elements.jobDialog.close());
    elements.closeAssignDialog.addEventListener("click", () => elements.assignDialog.close());
    elements.cancelAssignDialog.addEventListener("click", () => elements.assignDialog.close());
    elements.closeUpdateDialog.addEventListener("click", () => elements.updateDialog.close());
    elements.cancelUpdateDialog.addEventListener("click", () => elements.updateDialog.close());
    elements.closeRejectDialog.addEventListener("click", () => {
      elements.rejectError.textContent = "";
      elements.rejectDialog.close();
    });
    elements.closeJobDetailDialog.addEventListener("click", () => elements.jobDetailDialog.close());
    elements.cancelJobDetailDialog.addEventListener("click", () => elements.jobDetailDialog.close());

    elements.rejectDialog.addEventListener("cancel", () => {
      elements.rejectError.textContent = "";
    });
    elements.rejectDialog.addEventListener("click", (event) => {
      if (event.target === elements.rejectDialog) {
        elements.rejectError.textContent = "";
        elements.rejectDialog.close();
      }
    });

    elements.jobForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(elements.jobForm);
      await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          market: form.get("market"),
          requestedBy: form.get("requestedBy"),
          jobAddress: form.get("jobAddress"),
          jobType: form.get("jobType"),
          scheduledStartAt: form.get("scheduledStartAt"),
          priority: form.get("priority"),
          assignedTo: form.get("assignedTo"),
          dispatcherName: form.get("dispatcherName"),
          dispatcherPhone: form.get("dispatcherPhone"),
          jobValue: Number(form.get("jobValue") || 0),
          laborCost: Number(form.get("laborCost") || 0),
          plannedHours: Number(form.get("plannedHours") || 0),
          blockerReason: form.get("blockerReason")
        })
      });
      elements.jobForm.reset();
      elements.jobDialog.close();
      setScreen("admin");
      await refreshApp();
      window.alert("Job was uploaded.");
    });

    elements.inviteForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(elements.inviteForm);
      await api("/api/admin/invites", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          role: form.get("role")
        })
      });
      elements.inviteForm.reset();
      await loadAdminData();
    });

    elements.assignForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(elements.assignForm);
      const jobId = Number(form.get("jobId"));
      const assignedTo = String(form.get("assignedTo") || "");
      const job = appState.jobs.find((item) => String(item.id) === String(jobId));
      if (!job) {
        return;
      }
      const conflicts = getCrewScheduleConflicts(job, assignedTo);
      if (assignedTo && conflicts.length) {
        window.alert(`That crew already has overlapping work scheduled: ${conflicts.map((conflict) => conflict.title).join(", ")}`);
        return;
      }
      await updateJob(jobId, {
        assignedTo,
        lifecycleStage: assignedTo ? "Assigned" : "Uploaded",
        issue: `Assigned to ${assignedTo}. Waiting on acknowledgement.`
      });
      elements.assignDialog.close();
    });

    elements.updateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(elements.updateForm);
      const jobId = Number(form.get("jobId"));
      const attachments = await filesToPayload(elements.updateForm.elements.attachment.files);
      await api(`/api/jobs/${jobId}/updates`, {
        method: "POST",
        body: JSON.stringify({
          updateType: form.get("updateType"),
          workDone: form.get("workDone"),
          codesUsed: Array.from(elements.updateForm.elements.codesUsed.selectedOptions).map((option) => option.value),
          note: form.get("note"),
          attachments
        })
      });
      elements.updateDialog.close();
      await refreshApp();
    });

    elements.rejectForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(elements.rejectForm);
      const jobId = Number(form.get("jobId"));
      const rejectionReason = String(form.get("reason") || "").trim();
      if (!rejectionReason) {
        elements.rejectError.textContent = "A reason is required.";
        elements.rejectForm.elements.reason.focus();
        return;
      }
      elements.rejectError.textContent = "";
      await updateJob(jobId, {
        rejected: true,
        rejectionReason,
        issue: `Rejected by field team: ${rejectionReason}`
      });
      elements.rejectDialog.close();
      window.alert("Job was rejected and returned for immediate admin review.");
    });

    elements.jobDetailForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(elements.jobDetailForm);
      const assignedTo = String(form.get("assignedTo") || "");
      await updateJob(Number(form.get("jobId")), {
        lifecycleStage: mapUiStageToStoredStage(String(form.get("lifecycleStage") || "Uploaded")),
        assignedTo,
        scheduledStartAt: form.get("scheduledStartAt"),
        priority: form.get("priority"),
        adminApproved: form.get("adminApproved") === "on",
        adminReviewed: form.get("adminReviewed") === "on",
        issue: assignedTo ? `Updated in job workspace. Assigned to ${assignedTo}.` : "Updated in job workspace."
      });
      const adminReviewed = form.get("adminReviewed") === "on";
      elements.jobDetailDialog.close();
      if (adminReviewed) {
        window.alert("Final admin review completed. Job was closed.");
      }
    });

    elements.jobDetailForm.elements.scheduledStartAt.addEventListener("input", refreshJobDetailAssignees);
    elements.jobDetailForm.elements.scheduledStartAt.addEventListener("change", refreshJobDetailAssignees);

    elements.demoAdminCreds.addEventListener("click", () => {
      elements.loginForm.elements.email.value = "admin@fieldsight.local";
      elements.loginForm.elements.password.value = "Admin123!";
    });

    elements.demoFieldCreds.addEventListener("click", () => {
      elements.loginForm.elements.email.value = "crew1@fieldsight.local";
      elements.loginForm.elements.password.value = "Field123!";
    });

    document.body.addEventListener("dragstart", (event) => {
      const card = event.target.closest("[data-drag-job-id]");
      if (!card || !appState.session || appState.session.role !== "admin") {
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(dragMimeType, card.dataset.dragJobId);
    });

    document.body.addEventListener("dragover", (event) => {
      const dropZone = event.target.closest("[data-stage-drop]");
      if (dropZone && appState.session?.role === "admin") {
        event.preventDefault();
      }
    });

    document.body.addEventListener("drop", (event) => {
      const dropZone = event.target.closest("[data-stage-drop]");
      if (!dropZone || appState.session?.role !== "admin") {
        return;
      }
      event.preventDefault();
      const jobId = Number(event.dataTransfer.getData(dragMimeType));
      const stage = dropZone.dataset.stageDrop;
      if (!jobId || !stage) {
        return;
      }
      const job = appState.jobs.find((item) => Number(item.id) === jobId);
      if (!job) {
        return;
      }
      updateJob(jobId, buildStageUpdatePayload(job, stage, "the admin board")).catch((error) => {
        window.alert(error.message);
      });
    });

    document.body.addEventListener("click", (event) => {
      const navButton = event.target.closest("[data-nav-screen]");
      if (navButton) {
        setScreen(navButton.dataset.navScreen);
        return;
      }
      const sortButton = event.target.closest("[data-sort-key]");
      if (sortButton) {
        toggleSort(sortButton.dataset.sortKey);
        return;
      }
      handleActionClick(event).catch((error) => {
        window.alert(error.message);
      });
    });
  }

  registerEvents();
  showLoginState();
  refreshApp().catch(console.error);
})();
