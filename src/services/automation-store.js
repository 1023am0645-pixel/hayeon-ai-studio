(() => {
const adminTokenKey = "hayeon-admin-token";

class AutomationStoreError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "AutomationStoreError";
    this.status = details.status ?? 0;
    this.code = details.code ?? message;
    this.detail = details.detail ?? "";
    this.requestId = details.requestId ?? "";
  }
}

function getAdminHeaders(hasBody = false) {
  const token = localStorage.getItem(adminTokenKey) ?? "";
  const headers = hasBody ? { "content-type": "application/json" } : {};
  if (token) headers["X-Admin-Token"] = token;
  return headers;
}

async function requestAutomation(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: getAdminHeaders(Boolean(body)),
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new AutomationStoreError(payload.error || `automation api ${response.status}`, {
      status: response.status,
      code: payload.error,
      detail: payload.detail,
      requestId: payload.requestId,
    });
  }

  return payload.data ?? {};
}

function getHealth() {
  return requestAutomation("/api/automation/health");
}

function listRuns({ limit = 8 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 30);
  return requestAutomation(`/api/automation/runs?limit=${safeLimit}`);
}

function createRun({ goal, source = "orchestration", status = "running", metadata = {} }) {
  return requestAutomation("/api/automation/runs", {
    method: "POST",
    body: { goal, source, status, metadata },
  });
}

function updateRun(runId, patch) {
  if (!runId) return Promise.resolve(null);
  return requestAutomation(`/api/automation/runs/${encodeURIComponent(runId)}`, {
    method: "PATCH",
    body: patch,
  });
}

function getRun(runId) {
  if (!runId) return Promise.resolve(null);
  return requestAutomation(`/api/automation/runs/${encodeURIComponent(runId)}`);
}

function upsertRunItem(runId, item) {
  if (!runId || !item) return Promise.resolve(null);
  return requestAutomation(`/api/automation/runs/${encodeURIComponent(runId)}/items`, {
    method: "POST",
    body: item,
  });
}

function upsertArtifact(runId, artifact) {
  if (!runId || !artifact) return Promise.resolve(null);
  return requestAutomation(`/api/automation/runs/${encodeURIComponent(runId)}/artifacts`, {
    method: "POST",
    body: artifact,
  });
}

function listArtifacts({ limit = 40, employeeId = "", taskId = "", runId = "" } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(Math.max(Number(limit) || 40, 1), 100)));
  if (employeeId) params.set("employeeId", employeeId);
  if (taskId) params.set("taskId", taskId);
  if (runId) params.set("runId", runId);
  return requestAutomation(`/api/automation/artifacts?${params.toString()}`);
}

function upsertTask(task) {
  if (!task) return Promise.resolve(null);
  return requestAutomation("/api/automation/tasks", {
    method: "POST",
    body: task,
  });
}

function listTasks({ limit = 100, status = "all", employeeId = "", sourceRunId = "" } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(Math.max(Number(limit) || 100, 1), 200)));
  if (status && status !== "all") params.set("status", status);
  if (employeeId) params.set("employeeId", employeeId);
  if (sourceRunId) params.set("sourceRunId", sourceRunId);
  return requestAutomation(`/api/automation/tasks?${params.toString()}`);
}

function deleteTask(taskId) {
  if (!taskId) return Promise.resolve(null);
  return requestAutomation(`/api/automation/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
}

function listChatMessages(employeeId, { limit = 40 } = {}) {
  if (!employeeId) return Promise.resolve({ messages: [] });
  const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 100);
  return requestAutomation(`/api/automation/chat/${encodeURIComponent(employeeId)}?limit=${safeLimit}`);
}

function createChatMessage(employeeId, message) {
  if (!employeeId || !message) return Promise.resolve(null);
  return requestAutomation(`/api/automation/chat/${encodeURIComponent(employeeId)}`, {
    method: "POST",
    body: message,
  });
}

function isStorageMissing(error) {
  return error?.code === "agent_db_missing" || error?.message === "agent_db_missing";
}

window.HayeonAutomationStore = {
  AutomationStoreError,
  requestAutomation,
  getHealth,
  listRuns,
  createRun,
  updateRun,
  getRun,
  upsertRunItem,
  upsertArtifact,
  listArtifacts,
  upsertTask,
  listTasks,
  deleteTask,
  listChatMessages,
  createChatMessage,
  isStorageMissing,
};
})();
