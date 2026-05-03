import { renderAlerts, renderAssignmentList, renderCrews, renderDeadlineList, renderFieldList, renderIntakeList, renderIntakeNotes, renderKpiNotes, renderKpis, renderMetrics, renderWorkerSummary } from "./core/render.js";
import { loadState, resetState, saveState } from "./core/store.js";

let state = loadState();

const elements = {
  metricGrid: document.getElementById("metricGrid"),
  deadlineList: document.getElementById("deadlineList"),
  alertList: document.getElementById("alertList"),
  intakeList: document.getElementById("intakeList"),
  intakeNotes: document.getElementById("intakeNotes"),
  assignmentList: document.getElementById("assignmentList"),
  crewList: document.getElementById("crewList"),
  fieldList: document.getElementById("fieldList"),
  workerSummary: document.getElementById("workerSummary"),
  kpiList: document.getElementById("kpiList"),
  kpiNotes: document.getElementById("kpiNotes"),
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
  resetDemoData: document.getElementById("resetDemoData"),
  jobDialog: document.getElementById("jobDialog"),
  jobForm: document.getElementById("jobForm"),
  closeJobDialog: document.getElementById("closeJobDialog"),
  cancelJobDialog: document.getElementById("cancelJobDialog")
};

const fieldStatusOrder = ["Assigned", "En Route", "In Progress", "Completed"];

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

function renderApp() {
  const filters = getFilters();

  elements.metricGrid.innerHTML = renderMetrics(state);
  elements.deadlineList.innerHTML = renderDeadlineList(state);
  elements.alertList.innerHTML = renderAlerts(state);
  elements.intakeList.innerHTML = renderIntakeList(state, filters.intake);
  elements.intakeNotes.innerHTML = renderIntakeNotes();
  elements.assignmentList.innerHTML = renderAssignmentList(state, filters.assignment);
  elements.crewList.innerHTML = renderCrews(state);
  elements.fieldList.innerHTML = renderFieldList(state, filters.field);
  elements.workerSummary.innerHTML = renderWorkerSummary(state);
  elements.kpiList.innerHTML = renderKpis(state, filters.kpiGroup);
  elements.kpiNotes.innerHTML = renderKpiNotes();
}

function persistAndRender() {
  saveState(state);
  renderApp();
}

function setScreen(screenName) {
  elements.navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.screen === screenName);
  });

  elements.screens.forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screenPanel === screenName);
  });
}

function addJob(formData) {
  state.jobs.unshift({
    id: Date.now(),
    title: formData.get("title"),
    market: formData.get("market"),
    requestedBy: formData.get("requestedBy"),
    jobType: formData.get("jobType"),
    priority: formData.get("priority"),
    intakeStatus: "Submitted",
    scheduledStartAt: formData.get("scheduledStartAt"),
    assignedTo: formData.get("assignedTo"),
    fieldStatus: formData.get("assignedTo") ? "Assigned" : "Assigned",
    completion: 0,
    budget: 1.5,
    issue: "Newly submitted job. Review scope, confirm resources, and assign before the 24-hour window closes.",
    qualityScore: 90,
    durationVariance: 0
  });
}

function quickAssignJob(jobId) {
  const job = state.jobs.find((item) => item.id === Number(jobId));
  if (!job || job.assignedTo) {
    return;
  }

  const availableCrew = state.crews.find((crew) => crew.available > 0);
  if (!availableCrew) {
    return;
  }

  job.assignedTo = availableCrew.name;
  job.intakeStatus = "Approved";
  job.fieldStatus = "Assigned";
}

function advanceJobStatus(jobId) {
  const job = state.jobs.find((item) => item.id === Number(jobId));
  if (!job) {
    return;
  }

  const currentIndex = fieldStatusOrder.indexOf(job.fieldStatus);
  const nextIndex = Math.min(currentIndex + 1, fieldStatusOrder.length - 1);
  job.fieldStatus = fieldStatusOrder[nextIndex];
  job.completion = Math.min(job.completion + 25, 100);
}

function handleActionClick(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  const { action, id } = actionButton.dataset;

  if (action === "assign-fast") {
    quickAssignJob(id);
    persistAndRender();
  }

  if (action === "toggle-progress") {
    advanceJobStatus(id);
    persistAndRender();
  }
}

function registerEvents() {
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
  elements.closeJobDialog.addEventListener("click", () => elements.jobDialog.close());
  elements.cancelJobDialog.addEventListener("click", () => elements.jobDialog.close());

  elements.resetDemoData.addEventListener("click", () => {
    state = resetState();
    persistAndRender();
  });

  elements.jobForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addJob(new FormData(elements.jobForm));
    elements.jobForm.reset();
    elements.jobDialog.close();
    setScreen("intake");
    persistAndRender();
  });

  document.body.addEventListener("click", handleActionClick);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

setScreen("overview");
registerEvents();
renderApp();
registerServiceWorker();
