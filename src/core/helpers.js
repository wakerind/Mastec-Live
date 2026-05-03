export function getStatusClass(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function formatDateTime(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function hoursUntil(value) {
  const diffMs = new Date(value).getTime() - Date.now();
  return Math.round(diffMs / (1000 * 60 * 60));
}

export function getAssignmentWindow(job) {
  const hours = hoursUntil(job.scheduledStartAt);

  if (hours < 24 && !job.assignedTo) {
    return { label: "Past Due", className: "window-past-due" };
  }

  if (hours <= 24) {
    return { label: "Due Soon", className: "window-due-soon" };
  }

  return { label: "Open", className: "window-open" };
}

export function formatCurrencyMillions(value) {
  return `$${Number(value).toFixed(1)}M`;
}
