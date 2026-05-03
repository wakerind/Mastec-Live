(function () {
  const authStorageKey = "fieldsight-auth-token";
  const lifecycleStages = ["Uploaded", "Admin Approved", "Assigned", "Accepted", "Scheduled", "In Progress", "Completed", "Admin Reviewed", "Closed"];
  const maxAttachmentBatchBytes = 30 * 1024 * 1024;

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
    stageBoard: document.getElementById("stageBoard"),
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
    jobDetailDialog: document.getElementById("jobDetailDialog"),
    jobDetailForm: document.getElementById("jobDetailForm"),
    closeJobDetailDialog: document.getElementById("closeJobDetailDialog"),
    cancelJobDetailDialog: document.getElementById("cancelJobDetailDialog"),
    jobDetailSummary: document.getElementById("jobDetailSummary"),
    jobDetailUpdates: document.getElementById("jobDetailUpdates"),
    jobDetailStageSelect: document.getElementById("jobDetailStageSelect"),
    jobDetailAssigneeSelect: document.getElementById("jobDetailAssigneeSelect"),
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
    return job.lifecycleStage || "Uploaded";
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
    const blocked = jobs.filter((job) => Boolean(job.blockerReason)).length;
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
      return window.label !== "Open" || Boolean(job.blockerReason) || getMargin(job) < 0;
    }).slice(0, 6);

    elements.alertList.innerHTML = items.length ? items.map((job) => {
      const window = getAssignmentWindow(job);
      return `
        <article class="alert-card">
          <div class="alert-card-header">
            <strong>${job.title}</strong>
            <span class="status ${getStatusClass(getLifecycleStage(job))}">${getLifecycleStage(job)}</span>
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

  function buildGridRowActions(job) {
    const actions = [];
    const lifecycle = getLifecycleStage(job);

    actions.push(`<button class="action-btn" data-action="open-job" data-id="${job.id}">Open job</button>`);
    if (!["Closed"].includes(lifecycle)) {
      actions.push(`<button class="action-btn" data-action="advance-stage" data-id="${job.id}">Advance</button>`);
    }
    if (!job.assignedTo) {
      actions.push(`<button class="action-btn" data-action="assign-fast" data-id="${job.id}">Quick assign</button>`);
      actions.push(`<button class="action-btn" data-action="assign-job" data-id="${job.id}">Choose assignee</button>`);
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
              <td class="sheet-blocker-cell">${job.blockerReason ? `${job.blockerStage || getLifecycleStage(job)} | ${job.blockerReason}` : "<span class=\"muted\">Clear</span>"}</td>
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

  function renderStageBoard(filters) {
    const isAdmin = appState.session?.role === "admin";
    const items = appState.jobs.filter((job) => {
      const window = getAssignmentWindow(job);
      const statusMatch = filters.window === "all" || window.label === filters.window;
      const haystack = `${job.title} ${job.market} ${job.assignedTo} ${job.requestedBy}`.toLowerCase();
      return statusMatch && (!filters.query || haystack.includes(filters.query));
    });

    const columns = lifecycleStages.map((stage) => {
      const stageItems = items.filter((job) => getLifecycleStage(job) === stage);
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
                  <div class="job-card-header">
                    <div>
                      <p class="eyebrow">${job.market}</p>
                      <h4>${job.title}</h4>
                    </div>
                    <span class="window-pill ${window.className}">${window.label}</span>
                  </div>
                  <div class="job-tags">
                    <span class="pill">${job.assignedTo || "Unassigned"}</span>
                    <span class="pill">${formatCurrency(job.jobValue)}</span>
                  </div>
                  <p class="muted">${job.blockerReason ? `${job.blockerStage || stage} | ${job.blockerReason}` : job.issue}</p>
                  <div class="job-actions">
                    <button class="action-btn" data-action="open-job" data-id="${job.id}">Open job</button>
                    ${!job.assignedTo ? `<button class="action-btn" data-action="assign-job" data-id="${job.id}">Assign</button>` : ""}
                    <button class="action-btn" data-action="log-update" data-id="${job.id}">Add update</button>
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
          <button class="action-btn" data-action="open-job" data-id="${job.id}">Open job</button>
          <button class="action-btn" data-action="advance-stage" data-id="${job.id}">Advance stage</button>
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
    renderStageBoard(filters.assignment);
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

  function nextLifecycleStage(currentStatus) {
    const currentIndex = lifecycleStages.indexOf(currentStatus);
    return lifecycleStages[Math.min(currentIndex + 1, lifecycleStages.length - 1)] || lifecycleStages[0];
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
    fillAssigneeSelect(elements.assignCrewSelect, "");
    elements.assignDialog.showModal();
  }

  function openUpdateDialog(jobId) {
    elements.updateForm.elements.jobId.value = String(jobId);
    elements.updateForm.elements.note.value = "";
    elements.updateForm.elements.attachment.value = "";
    elements.updateDialog.showModal();
  }

  function fillAssigneeSelect(selectElement, currentValue) {
    selectElement.innerHTML = [`<option value="">Unassigned</option>`]
      .concat(appState.crews.map((crew) => `<option value="${crew.name}">${crew.name} | ${crew.available} available</option>`))
      .join("");
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
        <span class="muted">Current stage: ${job.lifecycleStage}</span><br>
        <span class="muted">Blocker: ${job.blockerReason ? `${job.blockerStage || job.lifecycleStage} | ${job.blockerReason}` : "None"}</span>
      </article>
    `;
    elements.jobDetailStageSelect.innerHTML = lifecycleStages.map((stage) => `<option value="${stage}">${stage}</option>`).join("");
    elements.jobDetailStageSelect.value = job.lifecycleStage || "Uploaded";
    fillAssigneeSelect(elements.jobDetailAssigneeSelect, job.assignedTo);
    elements.jobDetailForm.elements.scheduledStartAt.value = String(job.scheduledStartAt || "").slice(0, 16);
    elements.jobDetailForm.elements.priority.value = job.priority || "Medium";
    elements.jobDetailStageSelect.disabled = !isAdmin;
    elements.jobDetailAssigneeSelect.disabled = !isAdmin;
    elements.jobDetailForm.elements.scheduledStartAt.disabled = !isAdmin;
    elements.jobDetailForm.elements.priority.disabled = !isAdmin;
    elements.jobDetailUpdates.innerHTML = renderUpdatesPreview(job.id);
    elements.jobDetailDialog.showModal();
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
      const availableCrew = [...appState.crews].sort((a, b) => b.available - a.available).find((crew) => crew.available > 0);
      if (!availableCrew) {
        window.alert("No crews show available capacity right now.");
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
      openAssignDialog(jobId);
      return;
    }

    if (action === "advance-stage") {
      const nextStatus = nextLifecycleStage(job.lifecycleStage);
      const nextCompletion = nextStatus === "Closed"
        ? 100
        : Math.min(job.completion + (nextStatus === "Completed" ? 35 : 20), 100);
      const nextHours = Number(job.actualHours || 0) + 4;
      await updateJob(jobId, {
        lifecycleStage: nextStatus,
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
        blockerReason,
        blockerStage: job.lifecycleStage,
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
    elements.closeJobDetailDialog.addEventListener("click", () => elements.jobDetailDialog.close());
    elements.cancelJobDetailDialog.addEventListener("click", () => elements.jobDetailDialog.close());

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
          note: form.get("note"),
          attachments
        })
      });
      elements.updateDialog.close();
      await refreshApp();
    });

    elements.jobDetailForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(elements.jobDetailForm);
      const assignedTo = String(form.get("assignedTo") || "");
      await updateJob(Number(form.get("jobId")), {
        lifecycleStage: String(form.get("lifecycleStage") || "Uploaded"),
        assignedTo,
        scheduledStartAt: form.get("scheduledStartAt"),
        priority: form.get("priority"),
        issue: assignedTo ? `Updated in job workspace. Assigned to ${assignedTo}.` : "Updated in job workspace."
      });
      elements.jobDetailDialog.close();
    });

    elements.demoCreds.addEventListener("click", () => {
      elements.loginForm.elements.email.value = "admin@fieldsight.local";
      elements.loginForm.elements.password.value = "Admin123!";
    });

    document.body.addEventListener("dragstart", (event) => {
      const card = event.target.closest("[data-drag-job-id]");
      if (!card || !appState.session || appState.session.role !== "admin") {
        return;
      }
      event.dataTransfer.setData("text/plain", card.dataset.dragJobId);
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
      const jobId = Number(event.dataTransfer.getData("text/plain"));
      const stage = dropZone.dataset.stageDrop;
      if (!jobId || !stage) {
        return;
      }
      updateJob(jobId, { lifecycleStage: stage, issue: `Stage moved to ${stage} from the admin board.` }).catch((error) => {
        window.alert(error.message);
      });
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
