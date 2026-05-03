(function () {
  const authStorageKey = "fieldsight-auth-token";
  const intakeStages = ["Uploaded", "Review", "Approved", "Scheduled", "Assigned"];
  const fieldStages = ["Assigned", "Acknowledged", "En Route", "In Progress", "Blocked", "Completed", "Closed"];

  let authToken = localStorage.getItem(authStorageKey) || "";
  let appState = {
    session: null,
    jobs: [],
    updatesByJob: {},
    crews: [],
    kpis: { teams: [], contractors: [] }
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
    masterGrid: document.getElementById("masterGrid"),
    assignmentList: document.getElementById("assignmentList"),
    crewList: document.getElementById("crewList"),
    fieldList: document.getElementById("fieldList"),
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
    kpiGroupFilter: document.getElementById("kpiGroupFilter"),
    navLinks: document.querySelectorAll(".nav-link"),
    screens: document.querySelectorAll(".screen"),
    openJobDialog: document.getElementById("openJobDialog"),
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
    demoCreds: document.getElementById("demoCreds"),
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

  function getLifecycleStage(job) {
    if (job.blockerReason && !["Completed", "Closed"].includes(job.fieldStatus)) {
      return "Blocked";
    }
    if (job.assignedTo) {
      return job.fieldStatus || "Assigned";
    }
    return job.intakeStatus || "Uploaded";
  }

  function getMargin(job) {
    return Number(job.jobValue || 0) - Number(job.laborCost || 0);
  }

  function getStageSummary(job) {
    const lifecycle = getLifecycleStage(job);
    return `${lifecycle}${job.blockerReason ? " | Blocker active" : ""}`;
  }

  function getJobUpdates(jobId) {
    return appState.updatesByJob?.[jobId] || [];
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
            <p>${update.note}</p>
            ${update.photoUrl ? `<a class="update-link" href="${update.photoUrl}" target="_blank" rel="noreferrer">Open photo</a>` : ""}
          </article>
        `).join("")}
      </div>
    `;
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
      kpiGroup: elements.kpiGroupFilter.value
    };
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
      return;
    }

    elements.sessionRoleLabel.textContent = appState.session.role === "admin" ? "Administrator portal" : "Field portal";
    elements.sessionUserLabel.textContent = `${appState.session.name} | ${appState.session.email}`;
    setScreen(appState.session.role === "field" ? "field" : "overview");
  }

  function setScreen(screenName) {
    elements.navLinks.forEach((link) => {
      link.classList.toggle("active", link.dataset.screen === screenName);
    });
    elements.screens.forEach((screen) => {
      screen.classList.toggle("active", screen.dataset.screenPanel === screenName);
    });
  }

  function renderMetrics() {
    const jobs = appState.jobs;
    const assigned = jobs.filter((job) => job.assignedTo).length;
    const blocked = jobs.filter((job) => getLifecycleStage(job) === "Blocked").length;
    const totalValue = jobs.reduce((sum, job) => sum + Number(job.jobValue || 0), 0);
    const margin = jobs.reduce((sum, job) => sum + getMargin(job), 0);

    elements.metricGrid.innerHTML = [
      { label: "Tracked jobs", value: jobs.length, note: "Across upload, assignment, field execution, and closeout" },
      { label: "Assigned jobs", value: assigned, note: "Visible by team or contractor for dispatching" },
      { label: "Blocked jobs", value: blocked, note: "Active jobs with permit, staffing, access, or material blockers" },
      { label: "Portfolio value", value: formatCurrency(totalValue), note: `${formatCurrency(margin)} estimated gross margin across visible work` }
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
      const window = getAssignmentWindow(job);
      return window.label !== "Open" || getLifecycleStage(job) === "Blocked" || getMargin(job) < 0;
    }).slice(0, 6);

    elements.alertList.innerHTML = items.length ? items.map((job) => {
      const window = getAssignmentWindow(job);
      return `
        <article class="alert-card">
          <div class="alert-card-header">
            <strong>${job.title}</strong>
            <span class="status ${getStatusClass(getLifecycleStage(job))}">${getLifecycleStage(job)}</span>
          </div>
          <p class="muted">${job.blockerReason || job.issue}</p>
          <div class="job-tags">
            <span class="pill">${window.label}</span>
            <span class="pill">${formatCurrency(job.jobValue)}</span>
          </div>
        </article>
      `;
    }).join("") : emptyState("No active alerts.");
  }

  function buildGridRowActions(job) {
    const actions = [];
    const lifecycle = getLifecycleStage(job);

    if (intakeStages.includes(lifecycle) && lifecycle !== "Assigned" && lifecycle !== "Blocked") {
      actions.push(`<button class="action-btn" data-action="advance-admin-stage" data-id="${job.id}">Advance</button>`);
    }
    if (!job.assignedTo) {
      actions.push(`<button class="action-btn" data-action="assign-fast" data-id="${job.id}">Quick assign</button>`);
      actions.push(`<button class="action-btn" data-action="assign-job" data-id="${job.id}">Choose assignee</button>`);
    }
    if (job.assignedTo && !["Completed", "Closed"].includes(lifecycle)) {
      actions.push(`<button class="action-btn" data-action="advance-status" data-id="${job.id}">Next field stage</button>`);
    }
    if (job.blockerReason) {
      actions.push(`<button class="action-btn" data-action="clear-blocker" data-id="${job.id}">Clear blocker</button>`);
    } else {
      actions.push(`<button class="action-btn" data-action="add-blocker" data-id="${job.id}">Add blocker</button>`);
    }
    actions.push(`<button class="action-btn" data-action="log-update" data-id="${job.id}">Add update</button>`);

    return actions.join("");
  }

  function renderMasterGrid(filters) {
    const items = appState.jobs.filter((job) => {
      const lifecycle = getLifecycleStage(job);
      const statusMatch = filters.status === "all" || lifecycle === filters.status;
      const haystack = `${job.title} ${job.requestedBy} ${job.market} ${job.jobType} ${job.assignedTo} ${job.blockerReason}`.toLowerCase();
      return statusMatch && (!filters.query || haystack.includes(filters.query));
    });

    elements.masterGrid.innerHTML = items.length ? `
      <table class="sheet-table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Market</th>
            <th>Type</th>
            <th>Lifecycle</th>
            <th>Assigned</th>
            <th>Start</th>
            <th>Value</th>
            <th>Labor</th>
            <th>Planned</th>
            <th>Actual</th>
            <th>Blocker</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((job) => `
            <tr>
              <td class="sheet-primary-cell">
                <strong>${job.title}</strong>
                <span>${job.requestedBy}</span>
              </td>
              <td>${job.market}</td>
              <td>${job.jobType}</td>
              <td><span class="sheet-stage ${getStatusClass(getLifecycleStage(job))}">${getLifecycleStage(job)}</span></td>
              <td>${job.assignedTo || "Unassigned"}</td>
              <td>${formatDateTime(job.scheduledStartAt)}</td>
              <td>${formatCurrency(job.jobValue)}</td>
              <td>${formatCurrency(job.laborCost)}</td>
              <td>${Number(job.plannedHours || 0)}h</td>
              <td>${Number(job.actualHours || 0)}h</td>
              <td class="sheet-blocker-cell">${job.blockerReason || "<span class=\"muted\">Clear</span>"}</td>
              <td>
                <div class="sheet-actions">
                  ${buildGridRowActions(job)}
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    ` : emptyState("No jobs match the current filters.");
  }

  function renderAssignmentBoard(filters) {
    const items = appState.jobs.filter((job) => {
      const window = getAssignmentWindow(job);
      const statusMatch = filters.window === "all" || window.label === filters.window;
      const haystack = `${job.title} ${job.market} ${job.assignedTo} ${job.requestedBy}`.toLowerCase();
      return statusMatch && (!filters.query || haystack.includes(filters.query));
    });

    elements.assignmentList.innerHTML = items.length ? items.map((job) => {
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
            <span class="pill">${getLifecycleStage(job)}</span>
            <span class="pill">${job.jobType}</span>
            <span class="pill">${job.assignedTo || "Unassigned"}</span>
            <span class="pill">${formatCurrency(job.jobValue)}</span>
          </div>
          <p class="muted">${job.blockerReason || job.issue}</p>
          <div class="job-actions">
            ${!job.assignedTo ? `<button class="action-btn" data-action="assign-fast" data-id="${job.id}">Quick assign</button>` : ""}
            ${!job.assignedTo ? `<button class="action-btn" data-action="assign-job" data-id="${job.id}">Choose assignee</button>` : ""}
            <button class="action-btn" data-action="advance-status" data-id="${job.id}">Advance stage</button>
            <button class="action-btn" data-action="log-update" data-id="${job.id}">Add update</button>
          </div>
          ${renderUpdatesPreview(job.id)}
        </article>
      `;
    }).join("") : emptyState("No assignment items match the current filters.");
  }

  function renderFieldJobs(filters) {
    const items = appState.jobs.filter((job) => {
      const lifecycle = getLifecycleStage(job);
      const statusMatch = filters.status === "all" || lifecycle === filters.status;
      const haystack = `${job.title} ${job.market} ${job.assignedTo} ${job.blockerReason}`.toLowerCase();
      return statusMatch && (!filters.query || haystack.includes(filters.query));
    });

    elements.fieldList.innerHTML = items.length ? items.map((job) => `
      <article class="job-card">
        <div class="job-card-header">
          <div>
            <p class="eyebrow">${job.market}</p>
            <h4>${job.title}</h4>
          </div>
          <span class="status ${getStatusClass(getLifecycleStage(job))}">${getLifecycleStage(job)}</span>
        </div>
        <div class="job-tags">
          <span class="pill">${job.jobType}</span>
          <span class="pill">Start ${formatDateTime(job.scheduledStartAt)}</span>
          <span class="pill">Planned ${Number(job.plannedHours || 0)}h</span>
          <span class="pill">Actual ${Number(job.actualHours || 0)}h</span>
        </div>
        <div class="job-progress">
          <div class="progress-bar"><span style="width:${job.completion}%"></span></div>
          <p class="muted">${job.completion}% complete | ${formatCurrency(job.jobValue)} value | ${formatCurrency(job.laborCost)} labor</p>
          <p class="muted">${job.blockerReason || job.issue}</p>
        </div>
        <div class="job-actions">
          <button class="action-btn" data-action="advance-status" data-id="${job.id}">Advance stage</button>
          <button class="action-btn" data-action="update-hours" data-id="${job.id}">Log hours</button>
          <button class="action-btn" data-action="log-update" data-id="${job.id}">Add update</button>
          ${job.blockerReason
            ? `<button class="action-btn" data-action="clear-blocker" data-id="${job.id}">Clear blocker</button>`
            : `<button class="action-btn" data-action="add-blocker" data-id="${job.id}">Report blocker</button>`}
        </div>
        ${renderUpdatesPreview(job.id)}
      </article>
    `).join("") : emptyState("No assigned field jobs match the current filters.");
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
        <p class="muted">${crew.note}</p>
      </article>
    `).join("");
  }

  function renderKpis(group) {
    const items = appState.kpis[group] || [];
    elements.kpiList.innerHTML = items.length ? items.map((item) => `
      <article class="kpi-card">
        <div class="kpi-card-header">
          <h4>${item.name}</h4>
          <span class="pill">Sample size: ${item.sampleSize}</span>
        </div>
        <div class="kpi-row">
          <span class="pill">Jobs/week: ${item.jobsPerWeek}</span>
          <span class="pill">Avg hours: ${item.avgCompletionHours}</span>
          <span class="pill">On-time: ${item.onTimeStartRate}%</span>
          <span class="pill">Blocked: ${item.blockedRate}%</span>
          <span class="pill">Margin/job: ${formatCurrency(item.avgMargin)}</span>
        </div>
      </article>
    `).join("") : emptyState("No KPI data yet.");
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
    renderDeadlineList();
    renderAlerts();
    renderMasterGrid(filters.intake);
    renderAssignmentBoard(filters.assignment);
    renderCrews();
    renderFieldJobs(filters.field);
    renderKpis(filters.kpiGroup);
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

  function nextAdminStage(currentStatus) {
    const currentIndex = intakeStages.indexOf(currentStatus);
    return intakeStages[Math.min(currentIndex + 1, intakeStages.length - 1)] || intakeStages[0];
  }

  function nextFieldStage(currentStatus) {
    const movableStages = fieldStages.filter((stage) => stage !== "Blocked");
    const currentIndex = movableStages.indexOf(currentStatus);
    return movableStages[Math.min(currentIndex + 1, movableStages.length - 1)] || movableStages[0];
  }

  async function updateJob(jobId, payload) {
    await api(`/api/jobs/${jobId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    await refreshApp();
  }

  function openAssignDialog(jobId) {
    elements.assignForm.elements.jobId.value = String(jobId);
    elements.assignCrewSelect.innerHTML = appState.crews
      .map((crew) => `<option value="${crew.name}">${crew.name} | ${crew.available} available | ${crew.type}</option>`)
      .join("");
    elements.assignDialog.showModal();
  }

  function openUpdateDialog(jobId) {
    elements.updateForm.elements.jobId.value = String(jobId);
    elements.updateForm.elements.note.value = "";
    elements.updateForm.elements.photoUrl.value = "";
    elements.updateDialog.showModal();
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

    if (action === "advance-admin-stage") {
      await updateJob(jobId, {
        intakeStatus: nextAdminStage(job.intakeStatus)
      });
      return;
    }

    if (action === "assign-fast") {
      const availableCrew = [...appState.crews].sort((a, b) => b.available - a.available).find((crew) => crew.available > 0);
      if (!availableCrew) {
        window.alert("No crews show available capacity right now.");
        return;
      }
      await updateJob(jobId, {
        assignedTo: availableCrew.name,
        intakeStatus: "Assigned",
        fieldStatus: "Assigned",
        issue: `Assigned to ${availableCrew.name}. Waiting on acknowledgement.`
      });
      return;
    }

    if (action === "assign-job") {
      openAssignDialog(jobId);
      return;
    }

    if (action === "advance-status") {
      const nextStatus = nextFieldStage(job.fieldStatus === "Blocked" ? "In Progress" : job.fieldStatus);
      const nextCompletion = nextStatus === "Closed"
        ? 100
        : Math.min(job.completion + (nextStatus === "Completed" ? 35 : 20), 100);
      const nextHours = Number(job.actualHours || 0) + 4;
      await updateJob(jobId, {
        fieldStatus: nextStatus,
        completion: nextCompletion,
        actualHours: nextHours,
        blockerReason: nextStatus === "Completed" || nextStatus === "Closed" ? "" : job.blockerReason,
        issue: `Stage moved to ${nextStatus}.`
      });
      return;
    }

    if (action === "add-blocker") {
      const blockerReason = window.prompt("Enter blocker reason", job.blockerReason || "");
      if (!blockerReason) {
        return;
      }
      await updateJob(jobId, {
        fieldStatus: "Blocked",
        blockerReason,
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
        fieldStatus: "In Progress",
        resumeFieldStatus: "In Progress",
        blockerReason: "",
        issue: "Blocker cleared. Work resumed."
      });
      return;
    }

    if (action === "update-hours") {
      const input = window.prompt("Enter actual hours worked", String(job.actualHours || 0));
      if (input === null) {
        return;
      }
      const actualHours = Number(input);
      if (Number.isNaN(actualHours) || actualHours < 0) {
        window.alert("Please enter a valid hour value.");
        return;
      }
      await updateJob(jobId, {
        actualHours,
        issue: `Hours updated to ${actualHours}.`
      });
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
      elements.kpiGroupFilter
    ].forEach((control) => control.addEventListener("input", renderApp));

    elements.openJobDialog.addEventListener("click", () => elements.jobDialog.showModal());
    elements.refreshDataButton.addEventListener("click", refreshApp);
    elements.closeJobDialog.addEventListener("click", () => elements.jobDialog.close());
    elements.cancelJobDialog.addEventListener("click", () => elements.jobDialog.close());
    elements.closeAssignDialog.addEventListener("click", () => elements.assignDialog.close());
    elements.cancelAssignDialog.addEventListener("click", () => elements.assignDialog.close());
    elements.closeUpdateDialog.addEventListener("click", () => elements.updateDialog.close());
    elements.cancelUpdateDialog.addEventListener("click", () => elements.updateDialog.close());

    elements.jobForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(elements.jobForm);
      await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          market: form.get("market"),
          requestedBy: form.get("requestedBy"),
          jobType: form.get("jobType"),
          scheduledStartAt: form.get("scheduledStartAt"),
          priority: form.get("priority"),
          assignedTo: form.get("assignedTo"),
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
      await updateJob(jobId, {
        assignedTo,
        intakeStatus: "Assigned",
        fieldStatus: "Assigned",
        issue: `Assigned to ${assignedTo}. Waiting on acknowledgement.`
      });
      elements.assignDialog.close();
    });

    elements.updateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(elements.updateForm);
      const jobId = Number(form.get("jobId"));
      await api(`/api/jobs/${jobId}/updates`, {
        method: "POST",
        body: JSON.stringify({
          note: form.get("note"),
          photoUrl: form.get("photoUrl")
        })
      });
      elements.updateDialog.close();
      await refreshApp();
    });

    elements.demoCreds.addEventListener("click", () => {
      elements.loginForm.elements.email.value = "admin@fieldsight.local";
      elements.loginForm.elements.password.value = "Admin123!";
    });

    document.body.addEventListener("click", (event) => {
      handleActionClick(event).catch((error) => {
        window.alert(error.message);
      });
    });
  }

  registerEvents();
  showLoginState();
  refreshApp().catch(console.error);
})();
