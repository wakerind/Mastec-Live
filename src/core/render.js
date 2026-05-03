import {
  formatCurrencyMillions,
  formatDateTime,
  getAssignmentWindow,
  getStatusClass,
  hoursUntil
} from "./helpers.js";

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

export function renderMetrics(state) {
  const jobs = state.jobs;
  const assigned = jobs.filter((job) => job.assignedTo).length;
  const dueSoon = jobs.filter((job) => hoursUntil(job.scheduledStartAt) <= 24).length;
  const totalBudget = jobs.reduce((sum, job) => sum + job.budget, 0);
  const avgCompletion = Math.round(jobs.reduce((sum, job) => sum + job.completion, 0) / jobs.length);

  return [
    { label: "Tracked jobs", value: jobs.length, note: "Across intake, assignment, and field execution" },
    { label: "Assigned jobs", value: assigned, note: "Visible by team or contractor" },
    { label: "Start window risk", value: dueSoon, note: "Jobs inside the 24-hour assignment window" },
    { label: "Tracked budget", value: formatCurrencyMillions(totalBudget), note: `${avgCompletion}% average completion across active work` }
  ].map((metric) => `
    <article class="metric-card">
      <p class="eyebrow">${metric.label}</p>
      <strong>${metric.value}</strong>
      <p class="metric-note">${metric.note}</p>
    </article>
  `).join("");
}

export function renderDeadlineList(state) {
  const items = [...state.jobs]
    .sort((a, b) => new Date(a.scheduledStartAt) - new Date(b.scheduledStartAt))
    .slice(0, 4);

  if (!items.length) {
    return emptyState("No jobs available.");
  }

  return items.map((job) => {
    const window = getAssignmentWindow(job);
    return `
      <article class="job-card">
        <div class="job-card-header">
          <div>
            <p class="eyebrow">${job.market}</p>
            <h4>${job.title}</h4>
          </div>
          <span class="window-pill ${window.className}">${window.label}</span>
        </div>
        <div class="job-meta">
          <span class="pill">${job.jobType}</span>
          <span class="pill">Start: ${formatDateTime(job.scheduledStartAt)}</span>
          <span class="pill">Assigned: ${job.assignedTo || "Unassigned"}</span>
          <span class="pill">Priority: ${job.priority}</span>
        </div>
        <p class="muted">${job.issue}</p>
      </article>
    `;
  }).join("");
}

export function renderAlerts(state) {
  const alerts = state.jobs.filter((job) => {
    const window = getAssignmentWindow(job);
    return window.label !== "Open" || job.completion < 50;
  }).slice(0, 5);

  if (!alerts.length) {
    return emptyState("No active alerts. The portfolio is in good shape.");
  }

  return alerts.map((job) => {
    const window = getAssignmentWindow(job);
    return `
      <article class="alert-card">
        <div class="alert-card-header">
          <strong>${job.title}</strong>
          <span class="status ${getStatusClass(window.label)}">${window.label}</span>
        </div>
        <p class="muted">${job.issue}</p>
      </article>
    `;
  }).join("");
}

export function renderIntakeList(state, filters) {
  const filtered = state.jobs.filter((job) => {
    const statusMatch = filters.status === "all" || job.intakeStatus === filters.status;
    const haystack = `${job.title} ${job.requestedBy} ${job.market} ${job.jobType}`.toLowerCase();
    const searchMatch = !filters.query || haystack.includes(filters.query);
    return statusMatch && searchMatch;
  });

  if (!filtered.length) {
    return emptyState("No intake jobs match the current filters.");
  }

  return filtered.map((job) => `
    <article class="job-card">
      <div class="job-card-header">
        <div>
          <p class="eyebrow">${job.requestedBy}</p>
          <h4>${job.title}</h4>
        </div>
        <span class="status ${getStatusClass(job.intakeStatus)}">${job.intakeStatus}</span>
      </div>
      <div class="job-tags">
        <span class="pill">${job.market}</span>
        <span class="pill">${job.jobType}</span>
        <span class="pill">Priority: ${job.priority}</span>
        <span class="pill">Start: ${formatDateTime(job.scheduledStartAt)}</span>
      </div>
      <p class="muted">${job.issue}</p>
    </article>
  `).join("");
}

export function renderIntakeNotes() {
  return [
    "Requests should be reviewed for scope, required details, and target start date.",
    "Approved work can move into the assignment board before the 24-hour start window is missed.",
    "Later we can add attachments, customer forms, and approval routing."
  ].map((note) => `<article class="info-card">${note}</article>`).join("");
}

export function renderAssignmentList(state, filters) {
  const filtered = state.jobs.filter((job) => {
    const window = getAssignmentWindow(job);
    const statusMatch = filters.window === "all" || window.label === filters.window;
    const haystack = `${job.title} ${job.market} ${job.assignedTo} ${job.requestedBy}`.toLowerCase();
    const searchMatch = !filters.query || haystack.includes(filters.query);
    return statusMatch && searchMatch;
  });

  if (!filtered.length) {
    return emptyState("No assignment items match the current filters.");
  }

  return filtered.map((job) => {
    const window = getAssignmentWindow(job);
    return `
      <article class="job-card">
        <div class="job-card-header">
          <div>
            <p class="eyebrow">${job.market}</p>
            <h4>${job.title}</h4>
          </div>
          <span class="window-pill ${window.className}">${window.label}</span>
        </div>
        <div class="job-tags">
          <span class="pill">${job.jobType}</span>
          <span class="pill">Assigned: ${job.assignedTo || "Unassigned"}</span>
          <span class="pill">Start: ${formatDateTime(job.scheduledStartAt)}</span>
          <span class="pill">Budget: ${formatCurrencyMillions(job.budget)}</span>
        </div>
        <div class="job-actions">
          <button class="action-btn" data-action="assign-fast" data-id="${job.id}">Quick assign</button>
          <button class="action-btn" data-action="toggle-progress" data-id="${job.id}">Advance status</button>
        </div>
      </article>
    `;
  }).join("");
}

export function renderCrews(state) {
  return state.crews.map((crew) => `
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
      </div>
      <p class="muted">${crew.note}</p>
    </article>
  `).join("");
}

export function renderFieldList(state, filters) {
  const filtered = state.jobs.filter((job) => {
    const statusMatch = filters.status === "all" || job.fieldStatus === filters.status;
    const haystack = `${job.title} ${job.market} ${job.assignedTo}`.toLowerCase();
    const searchMatch = !filters.query || haystack.includes(filters.query);
    return statusMatch && searchMatch && job.assignedTo;
  });

  if (!filtered.length) {
    return emptyState("No assigned field jobs match the current filters.");
  }

  return filtered.map((job) => `
    <article class="job-card">
      <div class="job-card-header">
        <div>
          <p class="eyebrow">${job.assignedTo}</p>
          <h4>${job.title}</h4>
        </div>
        <span class="status ${getStatusClass(job.fieldStatus)}">${job.fieldStatus}</span>
      </div>
      <div class="job-tags">
        <span class="pill">${job.market}</span>
        <span class="pill">${job.jobType}</span>
        <span class="pill">Start: ${formatDateTime(job.scheduledStartAt)}</span>
      </div>
      <div class="job-progress">
        <div class="progress-bar"><span style="width:${job.completion}%"></span></div>
        <p class="muted">${job.completion}% complete. ${job.issue}</p>
      </div>
      <div class="job-actions">
        <button class="action-btn" data-action="toggle-progress" data-id="${job.id}">Advance status</button>
      </div>
    </article>
  `).join("");
}

export function renderWorkerSummary(state) {
  const assigned = state.jobs.filter((job) => job.assignedTo).length;
  const inProgress = state.jobs.filter((job) => job.fieldStatus === "In Progress").length;
  const completed = state.jobs.filter((job) => job.fieldStatus === "Completed").length;

  return [
    `Assigned today: ${assigned} jobs visible to crews and contractors.`,
    `In progress now: ${inProgress} jobs need active updates from the field.`,
    `Completed: ${completed} jobs are ready for closeout and KPI reporting.`
  ].map((item) => `<article class="info-card">${item}</article>`).join("");
}

export function renderKpis(state, group) {
  const list = state.kpis[group];

  return list.map((item) => `
    <article class="kpi-card">
      <div class="kpi-card-header">
        <h4>${item.name}</h4>
        <span class="pill">Sample size: ${item.sampleSize}</span>
      </div>
      <div class="kpi-row">
        <span class="pill">Jobs/week: ${item.jobsPerWeek}</span>
        <span class="pill">Avg hours: ${item.avgCompletionHours}</span>
        <span class="pill">On-time starts: ${item.onTimeStartRate}%</span>
        <span class="pill">Rework: ${item.reworkRate}%</span>
      </div>
    </article>
  `).join("");
}

export function renderKpiNotes() {
  return [
    "Compare similar job types before judging completion speed.",
    "Include blockers like permits, weather, materials, and reassignment history.",
    "Use these scorecards as management support, not as blind automatic ranking."
  ].map((item) => `<article class="info-card">${item}</article>`).join("");
}
