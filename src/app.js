(() => {
const {
  appConfig,
  floors = [],
  rooms,
  corridors = [],
  employees: seedEmployees,
  statusMeta,
  taskColumns,
  tasks: seedTasks,
} = window.HayeonOfficeData;

const {
  createSimulatedReply,
  planTasks,
  requestEmployeeReply,
  summarizeOrchestration,
} = window.HayeonAiAdapter;

const $ = (selector) => document.querySelector(selector);

const refs = {
  workspace: $(".workspace-stage"),
  clock: $("#officeClock"),
  departments: $("#departmentGrid"),
  employeeDetail: $("#employeeDetail"),
  kanban: $("#kanbanBoard"),
  taskDrawer: $("#taskDrawer"),
  taskDrawerBackdrop: $("#taskDrawerBackdrop"),
  taskForm: $("#taskForm"),
  taskAssigneeSelect: $("#taskAssigneeSelect"),
  toggleTaskFormButton: $("#toggleTaskFormButton"),
  openTaskBoardButton: $("#openTaskBoardButton"),
  closeTaskBoardButton: $("#closeTaskBoardButton"),
  openOrgChartButton: $("#openOrgChartButton"),
  themeToggleButton: $("#themeToggleButton"),
  fullscreenButton: $("#fullscreenButton"),
  openOrchestrationButton: $("#openOrchestrationButton"),
  taskDetailBackdrop: $("#taskDetailBackdrop"),
  taskDetailModal: $("#taskDetailModal"),
  orgChartBackdrop: $("#orgChartBackdrop"),
  orgChartPanel: $("#orgChartPanel"),
  staffCardBackdrop: $("#staffCardBackdrop"),
  staffCardModal: $("#staffCardModal"),
  orchestrationBackdrop: $("#orchestrationBackdrop"),
  orchestrationPanel: $("#orchestrationPanel"),
  closeOrchestrationButton: $("#closeOrchestrationButton"),
  orchestrationForm: $("#orchestrationForm"),
  orchestrationGoal: $("#orchestrationGoal"),
  orchestrationProgress: $("#orchestrationProgress"),
  orchestrationResults: $("#orchestrationResults"),
  orchestrationDetail: $("#orchestrationDetail"),
  orchestrationDetailContent: $("#orchestrationDetailContent"),
  closeOrchestrationDetailButton: $("#closeOrchestrationDetailButton"),
  taskPillCount: $("#taskPillCount"),
  toastStack: $("#toastStack"),
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });

function getLucideIcon(name, className = "") {
  const icons = {
    building2: `
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"></path>
      <path d="M6 12H4a2 2 0 0 0-2 2v8"></path>
      <path d="M18 9h2a2 2 0 0 1 2 2v11"></path>
      <path d="M10 6h4"></path>
      <path d="M10 10h4"></path>
      <path d="M10 14h4"></path>
      <path d="M10 18h4"></path>
    `,
    maximize2: `
      <path d="M15 3h6v6"></path>
      <path d="m21 3-7 7"></path>
      <path d="M9 21H3v-6"></path>
      <path d="m3 21 7-7"></path>
    `,
    minimize2: `
      <path d="M4 14h6v6"></path>
      <path d="m10 14-7 7"></path>
      <path d="M20 10h-6V4"></path>
      <path d="m14 10 7-7"></path>
    `,
    send: `
      <path d="m22 2-7 20-4-9-9-4Z"></path>
      <path d="M22 2 11 13"></path>
    `,
    loaderCircle: `
      <path d="M21 12a9 9 0 1 1-6.2-8.56"></path>
    `,
    triangleAlert: `
      <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path>
      <path d="M12 9v4"></path>
      <path d="M12 17h.01"></path>
    `,
    check: `
      <path d="M20 6 9 17l-5-5"></path>
    `,
  };
  const body = icons[name] ?? icons.send;
  return `
    <svg class="lucide-icon ${className}" aria-hidden="true" viewBox="0 0 24 24">
      ${body}
    </svg>
  `;
}

const uiThemeKey = "hayeon-ui-theme";
const uiThemes = ["aurora", "light", "dark"];
const boardFilters = ["all", "todo", "doing", "review", "done"];
let state = loadState();
let bubbleTick = 0;
let orgViewMode = "card";
const pendingTimers = new Map();
const failedAvatarSrcs = new Set();
const orchestrationUi = {
  isRunning: false,
};

boot();

function boot() {
  document.body.classList.add("v2-active");
  applyTheme(state.theme);
  setupViewContainers();
  bindEvents();
  fillAssigneeOptions();
  updateClock();
  render();
  setInterval(updateClock, 30_000);
  setInterval(() => {
    bubbleTick += 1;
    if (state.currentView === "building") {
      updateLiveActivityBar();
      return;
    }
    renderActiveView();
  }, 7_000);
  window.HayeonAvatarLoadFailed = (src) => {
    if (src) failedAvatarSrcs.add(src);
  };
  window.HayeonOrchestration = {
    runToBoard: runOrchestrationToBoard,
  };
}

function getInitialState() {
  return {
    employees: clone(seedEmployees),
    tasks: clone(seedTasks),
    orch: getInitialOrchState(),
    currentView: "building",
    selectedFloorId: null,
    selectedEmployeeId: null,
    detailMode: "summary",
    boardFilter: "all",
    selectedTaskId: null,
    theme: getStoredTheme(),
  };
}

function loadState() {
  const saved = window.localStorage.getItem(appConfig.localStorageKey);
  if (!saved) return getInitialState();

  try {
    const parsed = JSON.parse(saved);
    return {
      ...getInitialState(),
      ...parsed,
      currentView: "building",
      selectedFloorId: null,
      selectedEmployeeId: null,
      detailMode: "summary",
      boardFilter: normalizeBoardFilter(parsed.boardFilter),
      selectedTaskId: null,
      theme: normalizeTheme(parsed.theme ?? getStoredTheme()),
      employees: hydrateEmployees(parsed.employees),
      tasks: hydrateTasks(parsed.tasks),
      orch: hydrateOrch(parsed.orch),
    };
  } catch {
    return getInitialState();
  }
}

function getInitialOrchState() {
  return {
    running: false,
    goal: "",
    items: [],
    summary: "",
    summaryError: "",
    tasks: [],
    startedAt: 0,
    completedAt: 0,
  };
}

function hydrateOrch(savedOrch = {}) {
  const base = getInitialOrchState();
  if (!savedOrch || typeof savedOrch !== "object") return base;
  return {
    ...base,
    ...savedOrch,
    running: false,
    items: Array.isArray(savedOrch.items) ? savedOrch.items : [],
    tasks: Array.isArray(savedOrch.tasks) ? savedOrch.tasks : [],
  };
}

function hydrateEmployees(savedEmployees = []) {
  const savedById = new Map(savedEmployees.map((employee) => [employee.id, employee]));
  return seedEmployees.map((seedEmployee) => {
    const saved = savedById.get(seedEmployee.id);
    return {
      ...clone(seedEmployee),
      status: saved?.status ?? seedEmployee.status,
      currentTaskId: saved?.currentTaskId ?? seedEmployee.currentTaskId,
      recentCompleted: saved?.recentCompleted ?? clone(seedEmployee.recentCompleted),
    };
  });
}

function hydrateTasks(savedTasks = []) {
  const savedIds = new Set(savedTasks.map((task) => task.id));
  return [...savedTasks, ...clone(seedTasks).filter((task) => !savedIds.has(task.id))];
}

function saveState() {
  window.localStorage.setItem(appConfig.localStorageKey, JSON.stringify(state));
}

function normalizeTheme(theme) {
  return uiThemes.includes(theme) ? theme : "aurora";
}

function getStoredTheme() {
  return normalizeTheme(window.localStorage.getItem(uiThemeKey) || "aurora");
}

function applyTheme(theme) {
  const nextTheme = normalizeTheme(theme);
  state.theme = nextTheme;
  document.documentElement.dataset.theme = nextTheme;
  window.localStorage.setItem(uiThemeKey, nextTheme);
  if (refs.themeToggleButton) {
    const label = {
      aurora: "Aurora Glass",
      light: "Light Blue",
      dark: "Dark Studio",
    }[nextTheme];
    refs.themeToggleButton.setAttribute("aria-label", `테마 전환: ${label}`);
    refs.themeToggleButton.setAttribute("title", `테마: ${label}`);
  }
}

function cycleTheme() {
  const currentIndex = uiThemes.indexOf(normalizeTheme(state.theme));
  const nextTheme = uiThemes[(currentIndex + 1) % uiThemes.length];
  applyTheme(nextTheme);
  saveState();
  showToast(`테마: ${nextTheme}`);
}

function normalizeBoardFilter(filter) {
  return boardFilters.includes(filter) ? filter : "all";
}

function setupViewContainers() {
  refs.floorDetailView = $(".office-frame");
  refs.backToBuildingButton = $(".dashboard-nav-button");
  refs.buildingView = document.createElement("section");
  refs.buildingView.id = "buildingView";
  refs.buildingView.className = "building-view";
  refs.buildingView.setAttribute("aria-label", "2.5D 건물형 HA:YEON AI STUDIO");
  refs.workspace.insertBefore(refs.buildingView, refs.floorDetailView);
  refs.floorDetailView.classList.add("floor-detail-view");
  refs.backToBuildingButton.innerHTML = getLucideIcon("building2");
  refs.backToBuildingButton.setAttribute("aria-label", "2.5D 건물 메인으로 돌아가기");
  refs.backToBuildingButton.setAttribute("title", "건물 보기");
}

function bindEvents() {
  refs.buildingView.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-building-action]");
    if (actionButton?.dataset.buildingAction === "tasks") {
      openTaskDrawer();
      return;
    }

    const employeeButton = event.target.closest("[data-employee-id]");
    if (employeeButton) {
      state.selectedEmployeeId = employeeButton.dataset.employeeId;
      state.detailMode = "summary";
      saveState();
      render();
      return;
    }

    const floorButton = event.target.closest("[data-floor-id]");
    if (!floorButton) return;
    openFloorDetail(floorButton.dataset.floorId);
  });

  refs.departments.addEventListener("click", (event) => {
    const employeeButton = event.target.closest("[data-employee-id]");
    if (!employeeButton) return;
    state.selectedEmployeeId = employeeButton.dataset.employeeId;
    state.detailMode = "summary";
    saveState();
    render();
  });

  refs.employeeDetail.addEventListener("click", (event) => {
    const action = event.target.closest("[data-detail-action]")?.dataset.detailAction;
    if (!action) return;

    if (action === "assign") state.detailMode = state.detailMode === "assign" ? "summary" : "assign";
    if (action === "chat") state.detailMode = state.detailMode === "chat" ? "summary" : "chat";
    if (action === "history") state.detailMode = state.detailMode === "history" ? "summary" : "history";
    if (action === "close") {
      state.selectedEmployeeId = null;
      state.detailMode = "summary";
      saveState();
      render();
      return;
    }
    if (action === "status") {
      const nextStatus = event.target.closest("[data-status]")?.dataset.status;
      if (nextStatus) setEmployeeStatus(getSelectedEmployee().id, nextStatus);
    }
    renderEmployeeDetail();
  });

  refs.employeeDetail.addEventListener("submit", async (event) => {
    if (event.target.id === "assignTaskForm") {
      event.preventDefault();
      const formData = new FormData(event.target);
      createDirectedTask(getSelectedEmployee().id, formData);
      event.target.reset();
    }

    if (event.target.id === "chatForm") {
      event.preventDefault();
      const formData = new FormData(event.target);
      const message = String(formData.get("message") ?? "").trim();
      if (!message) return;
      const employee = getSelectedEmployee();
      state.chat = state.chat || {};
      const log = (state.chat[employee.id] = state.chat[employee.id] || []);
      log.push({ role: "user", text: message });
      log.push({ role: "ai", text: "", pending: true });
      renderEmployeeDetail();
      scrollChatBottom();
      try {
        const text = await window.HayeonAiAdapter.requestEmployeeReply(employee, message);
        log[log.length - 1] = { role: "ai", text };
      } catch (err) {
        console.error("agent error:", err);
        const reply = createSimulatedReply(employee, message);
        log[log.length - 1] = { role: "ai", text: `${reply.text} (오프라인)` };
      }
      saveState();
      renderEmployeeDetail();
      scrollChatBottom();
    }
  });

  refs.kanban.addEventListener("click", (event) => {
    const card = event.target.closest("[data-task-id]");
    if (!card) return;

    const taskId = card.dataset.taskId;
    const action = event.target.closest("[data-task-action]")?.dataset.taskAction;
    if (!action) {
      openTaskDetailModal(taskId);
      return;
    }

    if (action === "open-result") {
      openTaskDetailModal(taskId);
      return;
    }

    if (action === "move") {
      const status = event.target.closest("[data-status]")?.dataset.status;
      updateTaskStatus(taskId, status);
      if (status === "done") launchConfetti();
    }

    if (action === "edit") {
      const task = getTask(taskId);
      const title = window.prompt("업무명을 수정하세요.", task.title);
      if (title?.trim()) {
        task.title = title.trim();
        saveState();
        render();
        showToast("업무명이 수정되었습니다.");
      }
    }

    if (action === "delete") {
      const task = getTask(taskId);
      const ok = window.confirm(`"${task.title}" 업무를 삭제할까요?`);
      if (ok) deleteTask(taskId);
    }
  });

  refs.kanban.addEventListener("change", (event) => {
    const filter = event.target.closest("[name='boardFilter']")?.value;
    if (!filter) return;
    state.boardFilter = normalizeBoardFilter(filter);
    saveState();
    renderKanban();
  });

  refs.taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    createBoardTask(formData);
    event.target.reset();
    refs.taskForm.classList.add("is-hidden");
    refs.toggleTaskFormButton.textContent = "업무 추가";
  });

  refs.toggleTaskFormButton.addEventListener("click", () => {
    const willShow = refs.taskForm.classList.contains("is-hidden");
    refs.taskForm.classList.toggle("is-hidden", !willShow);
    refs.toggleTaskFormButton.textContent = willShow ? "닫기" : "업무 추가";
  });

  refs.openTaskBoardButton.addEventListener("click", () => {
    openTaskDrawer();
  });

  refs.openOrgChartButton.addEventListener("click", openOrgChartPanel);
  refs.themeToggleButton.addEventListener("click", cycleTheme);
  document.querySelector(".topbar-wordmark")?.addEventListener("click", openStaffCardModal);
  document.querySelector(".topbar-wordmark")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openStaffCardModal();
  });

  refs.fullscreenButton.addEventListener("click", toggleFullscreenView);
  document.addEventListener("fullscreenchange", updateFullscreenButton);

  refs.openOrchestrationButton.addEventListener("click", () => {
    openOrchestrationPanel();
  });

  refs.backToBuildingButton.addEventListener("click", () => {
    openBuildingView();
  });

  refs.closeTaskBoardButton.addEventListener("click", () => {
    closeTaskDrawer();
  });

  refs.taskDrawerBackdrop.addEventListener("click", () => {
    closeTaskDrawer();
  });

  refs.taskDetailBackdrop.addEventListener("click", closeTaskDetailModal);
  refs.taskDetailModal.addEventListener("click", handleTaskDetailClick);
  refs.orgChartBackdrop.addEventListener("click", closeOrgChartPanel);
  refs.orgChartPanel.addEventListener("click", handleOrgChartClick);
  refs.staffCardBackdrop.addEventListener("click", closeStaffCardModal);
  refs.staffCardModal.addEventListener("click", handleStaffCardClick);

  refs.closeOrchestrationButton.addEventListener("click", () => {
    closeOrchestrationPanel();
  });

  refs.orchestrationBackdrop.addEventListener("click", () => {
    closeOrchestrationPanel();
  });

  refs.orchestrationForm.addEventListener("submit", handleOrchestrationSubmit);
  refs.orchestrationProgress.addEventListener("click", handleOrchestrationReviewAction);
  refs.orchestrationProgress.addEventListener("click", handleOrchestrationDetailClick);
  refs.orchestrationResults.addEventListener("click", handleOrchestrationDetailClick);
  refs.orchestrationProgress.addEventListener("keydown", handleOrchestrationDetailKeydown);
  refs.orchestrationResults.addEventListener("keydown", handleOrchestrationDetailKeydown);
  refs.closeOrchestrationDetailButton.addEventListener("click", closeOrchestrationDetail);

}

function openTaskForm() {
  openTaskDrawer();
  refs.taskForm.classList.remove("is-hidden");
  refs.toggleTaskFormButton.textContent = "닫기";
  refs.taskForm.querySelector("input[name='title']").focus();
}

function openTaskDrawer() {
  refs.taskDrawer.classList.remove("is-hidden");
  refs.taskDrawerBackdrop.classList.remove("is-hidden");
  refs.taskDrawer.setAttribute("aria-hidden", "false");
}

function closeTaskDrawer() {
  refs.taskDrawer.classList.add("is-hidden");
  refs.taskDrawerBackdrop.classList.add("is-hidden");
  refs.taskDrawer.setAttribute("aria-hidden", "true");
}

async function toggleFullscreenView() {
  const isCssExpanded = document.body.classList.contains("is-app-expanded");

  if (document.fullscreenElement) {
    await document.exitFullscreen?.();
    document.body.classList.remove("is-app-expanded");
    updateFullscreenButton();
    return;
  }

  if (isCssExpanded) {
    document.body.classList.remove("is-app-expanded");
    updateFullscreenButton();
    return;
  }

  const target = getFullscreenTarget();
  try {
    if (target?.requestFullscreen) {
      await target.requestFullscreen();
    } else {
      document.body.classList.add("is-app-expanded");
    }
  } catch (err) {
    console.warn("fullscreen fallback:", err);
    document.body.classList.add("is-app-expanded");
  }
  updateFullscreenButton();
}

function getFullscreenTarget() {
  const buildingShell = refs.buildingView?.querySelector(".building-shell");
  if (state.currentView === "building" && buildingShell) return buildingShell;
  return refs.workspace
    ?? document.documentElement;
}

function updateFullscreenButton() {
  const isExpanded = Boolean(document.fullscreenElement) || document.body.classList.contains("is-app-expanded");
  refs.fullscreenButton.innerHTML = getLucideIcon(isExpanded ? "minimize2" : "maximize2");
  refs.fullscreenButton.setAttribute("aria-label", isExpanded ? "전체화면 닫기" : "전체화면");
  refs.fullscreenButton.setAttribute("title", isExpanded ? "전체화면 닫기" : "전체화면");
  refs.fullscreenButton.setAttribute("aria-pressed", String(isExpanded));
}

function openOrchestrationPanel() {
  refs.orchestrationBackdrop.classList.remove("is-hidden");
  refs.orchestrationPanel.classList.remove("is-hidden");
  refs.orchestrationPanel.setAttribute("aria-hidden", "false");
  renderStoredOrchestrationPanel();
  refs.orchestrationGoal.focus();
}

function closeOrchestrationPanel() {
  if (state.orch.running) showToast("분배는 백그라운드에서 계속 진행됩니다.");
  refs.orchestrationPanel.classList.add("is-hidden");
  refs.orchestrationBackdrop.classList.add("is-hidden");
  refs.orchestrationPanel.setAttribute("aria-hidden", "true");
}

async function handleOrchestrationSubmit(event) {
  event.preventDefault();
  if (orchestrationUi.isRunning) return;

  const goal = String(new FormData(event.target).get("goal") ?? "").trim();
  if (!goal) return;

  orchestrationUi.isRunning = true;
  state.orch = {
    ...getInitialOrchState(),
    running: true,
    goal,
    startedAt: Date.now(),
  };
  saveState();
  refs.orchestrationResults.innerHTML = "";
  closeOrchestrationDetail();
  renderOrchestrationProgress();
  renderOrchestrationBadge();

  const submitButton = refs.orchestrationForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  refs.orchestrationGoal.disabled = true;

  try {
    const result = await runOrchestrationToBoard(goal, {
      onUpdate: (update) => {
        upsertOrchestrationItem(update);
        saveState();
        renderOrchestrationProgress();
        renderOrchestrationBadge();
      },
    });
    syncOrchestrationResult(result);
    renderOrchestrationProgress(result);
    renderOrchestrationResults(result);
    showToast(result.pendingReview ? "검토가 필요한 업무를 확인하세요." : "분배 완료 — 결과를 확인하세요.");
  } catch (err) {
    console.error("orchestration error:", err);
    const message = err && err.message ? err.message : String(err);
    state.orch.running = false;
    state.orch.summaryError = message;
    state.orch.completedAt = Date.now();
    saveState();
    refs.orchestrationProgress.innerHTML = `
      <strong>실행 실패</strong>
      <span>${escapeHtml(message)}</span>
    `;
    renderOrchestrationBadge();
  } finally {
    orchestrationUi.isRunning = false;
    submitButton.disabled = false;
    refs.orchestrationGoal.disabled = false;
    renderOrchestrationBadge();
  }
}

function upsertOrchestrationItem(update) {
  const employeeName = update.employee?.name ?? "직원";
  const key = update.key ?? `${update.employee?.id ?? employeeName}#${update.subtask ?? ""}`;
  const statusByPhase = {
    queued: "queued",
    review: "review",
    start: "running",
    done: "done",
    error: "error",
    skipped: "skipped",
    "summary-start": "running",
    "summary-done": "done",
    "summary-error": "error",
  };
  const nextStatus = statusByPhase[update.phase] ?? "queued";
  state.orch.items = Array.isArray(state.orch.items) ? state.orch.items : [];
  const index = state.orch.items.findIndex((item) => item.key === key);
  const patch = {
    key,
    employeeId: update.employee?.id ?? "",
    name: employeeName,
    subtask: update.subtask ?? "",
    order: Number.isFinite(update.order) ? update.order : (index >= 0 ? state.orch.items[index].order : state.orch.items.length),
    status: nextStatus,
    phase: update.phase,
    text: update.text ?? "",
    error: update.error ?? "",
    needsReview: Boolean(update.needsReview),
    taskId: update.taskId ?? "",
    isSummary: key === "summary" || String(update.phase).startsWith("summary-"),
  };

  if (index >= 0) {
    state.orch.items[index] = {
      ...state.orch.items[index],
      ...patch,
      text: patch.text || state.orch.items[index].text,
      error: patch.error || state.orch.items[index].error,
      needsReview: patch.needsReview || Boolean(state.orch.items[index].needsReview),
      taskId: patch.taskId || state.orch.items[index].taskId,
      order: Number.isFinite(patch.order) ? patch.order : state.orch.items[index].order,
    };
    return;
  }

  state.orch.items.push(patch);
}

function handleOrchestrationReviewAction(event) {
  const actionButton = event.target.closest("[data-orch-action]");
  if (!actionButton) return;
  event.preventDefault();
  event.stopPropagation();

  const itemNode = actionButton.closest("[data-orch-key]");
  const key = itemNode?.dataset.orchKey;
  if (!key) return;

  const action = actionButton.dataset.orchAction;
  if (action === "approve") {
    approveOrchestrationItem(key);
    return;
  }
  if (action === "edit") {
    editOrchestrationItem(key);
    return;
  }
  if (action === "skip") {
    skipOrchestrationItem(key);
  }
}

function handleOrchestrationDetailClick(event) {
  if (event.target.closest("[data-orch-action]")) return;
  const itemNode = event.target.closest("[data-orch-key]");
  if (!itemNode) return;
  openOrchestrationDetail(itemNode.dataset.orchKey);
}

function handleOrchestrationDetailKeydown(event) {
  if (event.target.closest("[data-orch-action]")) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  const itemNode = event.target.closest("[data-orch-key]");
  if (!itemNode) return;
  event.preventDefault();
  openOrchestrationDetail(itemNode.dataset.orchKey);
}

function findOrchestrationItem(key) {
  return state.orch.items.find((item) => item.key === key) ?? null;
}

async function approveOrchestrationItem(key) {
  const item = findOrchestrationItem(key);
  if (!item || item.status !== "review" || orchestrationUi.isRunning) return;

  orchestrationUi.isRunning = true;
  state.orch.running = true;
  saveState();
  renderOrchestrationProgress();
  renderOrchestrationBadge();

  try {
    await executeOrchestrationItem(item, { onUpdate: applyOrchestrationUpdate });
    await runQueuedOrchestrationItems({ onUpdate: applyOrchestrationUpdate });
    await finishOrchestrationIfReady({ onUpdate: applyOrchestrationUpdate });
  } finally {
    orchestrationUi.isRunning = false;
    renderOrchestrationBadge();
  }
}

function editOrchestrationItem(key) {
  const item = findOrchestrationItem(key);
  if (!item || item.status !== "review") return;
  const nextSubtask = window.prompt("검토 후 실행할 지시문을 수정하세요.", item.subtask);
  if (!nextSubtask?.trim()) return;

  item.subtask = nextSubtask.trim();
  item.text = "";
  item.error = "";
  item.phase = "review";
  saveState();
  renderOrchestrationProgress();
  openOrchestrationDetail(key);
  showToast("검토 지시문을 수정했습니다.");
}

async function skipOrchestrationItem(key) {
  const item = findOrchestrationItem(key);
  if (!item || item.status !== "review" || orchestrationUi.isRunning) return;

  orchestrationUi.isRunning = true;
  state.orch.running = true;
  item.status = "skipped";
  item.phase = "skipped";
  item.text = "";
  item.error = "";
  saveState();
  renderOrchestrationProgress();
  renderOrchestrationBadge();
  showToast(`${item.name} 업무를 건너뛰었습니다.`);
  try {
    await runQueuedOrchestrationItems({ onUpdate: applyOrchestrationUpdate });
    await finishOrchestrationIfReady({ onUpdate: applyOrchestrationUpdate });
  } finally {
    orchestrationUi.isRunning = false;
    renderOrchestrationBadge();
  }
}

function openOrchestrationDetail(key) {
  const item = findOrchestrationItem(key);
  if (!item) return;

  const statusLabels = {
    queued: "대기",
    running: item.isSummary ? "요약 중" : "처리 중",
    done: item.isSummary ? "요약 완료" : "완료",
    error: item.isSummary ? "요약 오류" : "오류",
    skipped: "건너뜀",
    review: "검토 필요",
  };
  const statusClass = String(item.status || "queued").replace(/[^a-z0-9-]/gi, "-");
  const answer = item.error || item.text || "아직 결과가 도착하지 않았습니다.";
  refs.orchestrationDetailContent.innerHTML = `
    <div class="orch-detail-meta">
      <span class="orch-detail-status is-${escapeHtml(statusClass)}">${escapeHtml(statusLabels[item.status] ?? "진행")}</span>
      <strong>${escapeHtml(item.name)}</strong>
    </div>
    <section>
      <span>지시</span>
      <p>${escapeHtml(item.subtask || "등록된 지시가 없습니다.")}</p>
    </section>
    <section>
      <span>${item.error ? "오류" : "전체 답변"}</span>
      <p>${escapeHtml(answer)}</p>
    </section>
  `;
  refs.orchestrationDetail.classList.remove("is-hidden");
}

function closeOrchestrationDetail() {
  refs.orchestrationDetail.classList.add("is-hidden");
  refs.orchestrationDetailContent.innerHTML = "";
}

function renderOrchestrationProgress(result = null) {
  const items = Array.isArray(state.orch.items) ? state.orch.items : [];
  const taskItems = items.filter((item) => !item.isSummary);
  const doneCount = taskItems.filter((item) => item.status === "done").length;
  const errorCount = taskItems.filter((item) => item.status === "error").length;
  const activeCount = taskItems.filter((item) => item.status === "running" || item.status === "queued").length;
  const reviewCount = taskItems.filter((item) => item.status === "review").length;
  const skippedCount = taskItems.filter((item) => item.status === "skipped").length;
  const progressRows = items.map((item) => {
    const statusLabels = {
      queued: "대기",
      review: "검토 필요",
      running: item.isSummary ? "요약 중" : "처리 중",
      done: item.isSummary ? "요약 완료" : "완료",
      error: item.isSummary ? "요약 오류" : "오류",
      skipped: "건너뜀",
    };
    const statusLabel = statusLabels[item.status] ?? "진행";
    const statusClass = String(item.status).replace(/[^a-z0-9-]/gi, "-");
    const reviewActions = item.status === "review"
      ? `
        <div class="orch-review-actions" aria-label="${escapeHtml(item.name)} 검토 액션">
          <button type="button" data-orch-action="approve">승인</button>
          <button type="button" data-orch-action="edit">수정</button>
          <button type="button" data-orch-action="skip">건너뛰기</button>
        </div>
      `
      : "";
    return `
      <li
        class="orch-progress-item is-${escapeHtml(statusClass)} ${item.isSummary ? "is-summary" : ""}"
        data-orch-key="${escapeHtml(item.key)}"
        role="button"
        tabindex="0"
      >
        <span>${escapeHtml(statusLabel)}</span>
        <strong>${escapeHtml(item.name)}</strong>
        <em>${escapeHtml(item.subtask ?? "")}</em>
        ${reviewActions}
      </li>
    `;
  }).join("");

  if (reviewCount) {
    refs.orchestrationProgress.innerHTML = `
      <strong>검토 대기</strong>
      <span>${reviewCount}개 업무는 승인 후 실행됩니다. 완료 ${doneCount}명 · 처리 중 ${activeCount}명 · 오류 ${errorCount}명 · 건너뜀 ${skippedCount}명</span>
      ${progressRows ? `<ul>${progressRows}</ul>` : ""}
    `;
    return;
  }

  if (result) {
    refs.orchestrationProgress.innerHTML = `
      <strong>분배 완료</strong>
      <span>${result.tasks.length}개 업무가 할 일판에 등록되었습니다.</span>
      ${progressRows ? `<ul>${progressRows}</ul>` : ""}
    `;
    return;
  }

  refs.orchestrationProgress.innerHTML = `
    <strong>분배 진행 중</strong>
    <span>완료 ${doneCount}명 · 처리 중 ${Math.max(activeCount, 0)}명 · 오류 ${errorCount}명</span>
    ${progressRows ? `<ul>${progressRows}</ul>` : "<p>매니저가 필요한 직원을 선정하고 있습니다.</p>"}
  `;
}

function renderStoredOrchestrationPanel() {
  if (!state.orch.items.length && !state.orch.goal) {
    refs.orchestrationProgress.textContent =
      "목표를 입력하면 매니저가 필요한 직원을 선정하고, 각 직원의 결과를 취합합니다.";
    refs.orchestrationResults.innerHTML = "";
    closeOrchestrationDetail();
    return;
  }

  const result = buildStoredOrchestrationResult();
  renderOrchestrationProgress(state.orch.running ? null : result);
  if (state.orch.running) {
    refs.orchestrationResults.innerHTML = "";
    return;
  }
  renderOrchestrationResults(result);
}

function buildStoredOrchestrationResult() {
  const taskItems = (state.orch.items ?? []).filter((item) => !item.isSummary);
  const resultItems = taskItems.filter((item) => item.status === "done" || item.status === "error");
  return {
    goal: state.orch.goal,
    plan: taskItems.map((item) => ({ employeeId: item.employeeId, subtask: item.subtask, needsReview: Boolean(item.needsReview) })),
    tasks: state.orch.tasks ?? [],
    results: resultItems.map((item) => {
      const employee = getEmployee(item.employeeId);
      return {
        key: item.key,
        employeeId: item.employeeId,
        employeeName: item.name || employee?.name || item.employeeId,
        role: employee?.role ?? "",
        subtask: item.subtask,
        text: item.text,
        error: item.error,
      };
    }),
    summary: state.orch.summary,
    summaryError: state.orch.summaryError,
  };
}

function syncOrchestrationResult(result) {
  state.orch.running = false;
  state.orch.summary = result.summary ?? "";
  state.orch.summaryError = result.summaryError ?? "";
  state.orch.tasks = (result.tasks ?? []).map((task) => ({
    id: task.id,
    title: task.title,
    assigneeId: task.assigneeId,
    status: task.status,
  }));
  state.orch.completedAt = result.pendingReview ? 0 : Date.now();
  saveState();
}

function renderOrchestrationResults(result) {
  const summaryBlock = result.summary
    ? `
      <section class="orch-summary-card" data-orch-key="summary" role="button" tabindex="0">
        <span>관제봇 종합요약</span>
        <p>${escapeHtml(result.summary)}</p>
      </section>
    `
    : result.summaryError
      ? `
        <section class="orch-summary-card has-error" data-orch-key="summary" role="button" tabindex="0">
          <span>관제봇 요약 오류</span>
          <p>${escapeHtml(result.summaryError)}</p>
        </section>
      `
      : "";
  const rows = result.results.map((item) => {
    const employee = getEmployee(item.employeeId);
    const isError = Boolean(item.error);
    return `
      <article
        class="orch-result-card ${isError ? "has-error" : ""}"
        data-orch-key="${escapeHtml(item.key ?? `${item.employeeId}#${item.subtask}`)}"
        role="button"
        tabindex="0"
      >
        <div class="orch-result-head">
          <span class="orch-result-avatar" aria-hidden="true">
            ${employee ? renderAvatarVisual(employee) : ""}
          </span>
          <div>
            <strong>${escapeHtml(item.employeeName)}</strong>
            <span>${escapeHtml(item.role)}</span>
          </div>
        </div>
        <p class="orch-result-task">${escapeHtml(item.subtask)}</p>
        <p class="orch-result-answer">${escapeHtml(isError ? item.error : item.text)}</p>
      </article>
    `;
  }).join("");

  refs.orchestrationResults.innerHTML = `
    <div class="orch-result-summary">
      <strong>${escapeHtml(result.goal)}</strong>
      <span>${result.plan.length}명에게 분배 · ${result.tasks.length}개 업무 등록</span>
    </div>
    ${summaryBlock}
    ${rows || "<p class=\"orch-empty\">선정된 직원이 없습니다.</p>"}
  `;
}

function openFloorDetail(floorId) {
  if (!getFloor(floorId)) return;
  state.currentView = "floor-detail";
  state.selectedFloorId = floorId;
  state.selectedEmployeeId = null;
  state.detailMode = "summary";
  saveState();
  render();
  scrollAppToTop();
}

function openBuildingView() {
  state.currentView = "building";
  state.selectedFloorId = null;
  state.selectedEmployeeId = null;
  state.detailMode = "summary";
  saveState();
  render();
  scrollAppToTop();
}

function scrollChatBottom() {
  window.requestAnimationFrame(() => {
    const el = document.getElementById("chatLog");
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function scrollAppToTop() {
  window.requestAnimationFrame(() => {
    window.scrollTo(0, 0);
  });
}

function render() {
  renderStats();
  renderViewChrome();
  renderActiveView();
  renderEmployeeDetail();
  renderKanban();
  renderOrchestrationBadge();
}

function renderOrchestrationBadge() {
  const items = (state.orch.items ?? []).filter((item) => !item.isSummary);
  const doneCount = items.filter((item) => item.status === "done" || item.status === "error" || item.status === "skipped").length;
  const reviewCount = items.filter((item) => item.status === "review").length;
  const totalCount = items.length;

  if (state.orch.running) {
    refs.openOrchestrationButton.classList.add("has-orch-progress");
    refs.openOrchestrationButton.classList.remove("is-complete");
    refs.openOrchestrationButton.innerHTML = `
      ${getLucideIcon("loaderCircle", "is-spinning")}
      <strong class="orch-nav-count">${doneCount}/${Math.max(totalCount, 1)}</strong>
    `;
    refs.openOrchestrationButton.setAttribute("aria-label", `오케스트레이션 진행 ${doneCount}/${Math.max(totalCount, 1)}`);
    refs.openOrchestrationButton.setAttribute("title", `오케스트레이션 진행 ${doneCount}/${Math.max(totalCount, 1)}`);
    return;
  }

  if (reviewCount) {
    refs.openOrchestrationButton.classList.add("has-orch-progress");
    refs.openOrchestrationButton.classList.remove("is-complete");
    refs.openOrchestrationButton.innerHTML = `
      ${getLucideIcon("triangleAlert")}
      <strong class="orch-nav-count">${reviewCount}</strong>
    `;
    refs.openOrchestrationButton.setAttribute("aria-label", `오케스트레이션 검토 대기 ${reviewCount}건`);
    refs.openOrchestrationButton.setAttribute("title", `오케스트레이션 검토 대기 ${reviewCount}건`);
    return;
  }

  if (totalCount || state.orch.summary || state.orch.summaryError) {
    refs.openOrchestrationButton.classList.add("has-orch-progress", "is-complete");
    refs.openOrchestrationButton.innerHTML = getLucideIcon("check");
    refs.openOrchestrationButton.setAttribute("aria-label", "오케스트레이션 결과 보기");
    refs.openOrchestrationButton.setAttribute("title", "오케스트레이션 결과 보기");
    return;
  }

  refs.openOrchestrationButton.classList.remove("has-orch-progress", "is-complete");
  refs.openOrchestrationButton.innerHTML = getLucideIcon("send");
  refs.openOrchestrationButton.setAttribute("aria-label", "전 직원에게 지시");
  refs.openOrchestrationButton.setAttribute("title", "전 직원에게 지시");
}

function renderActiveView() {
  if (state.currentView === "floor-detail") {
    renderDepartments();
    return;
  }
  renderBuildingView();
}

function renderViewChrome() {
  const isBuildingView = state.currentView === "building";
  refs.buildingView.classList.toggle("is-hidden", !isBuildingView);
  refs.floorDetailView.classList.toggle("is-hidden", isBuildingView);
  refs.backToBuildingButton.classList.remove("is-hidden");
  document.body.classList.toggle("building-view-active", isBuildingView);
  document.body.classList.toggle("floor-detail-active", !isBuildingView);

  const floor = getSelectedFloor();
  const floorStatus = refs.floorDetailView.querySelector(".office-status");
  if (floorStatus) {
    if (floor) {
      const floorEmployees = getFloorEmployees(floor.id);
      const floorTaskCount = getFloorTaskCount(floor.id);
      floorStatus.textContent = `${floor.name} 내부 사무실 · ${floorEmployees.length}명 · ${floorTaskCount}개 업무`;
    } else {
      floorStatus.textContent = "사내 강사 활동 · 강의 아카이브 · AX-서포터즈 활동 운영 중";
    }
  }
}

function renderBuildingView() {
  const activity = getLiveActivityItems();
  const activeActivity = activity[bubbleTick % activity.length];
  const orderedFloors = [...floors].sort((a, b) => b.level - a.level);
  refs.buildingView.innerHTML = `
    <div class="building-shell building-layered-shell">
      <div class="building-live-board" aria-live="polite">
        <div class="live-activity-bar">
          <span aria-hidden="true">📡</span>
          <strong>실시간 활동</strong>
          <span>${escapeHtml(activeActivity)}</span>
        </div>
      </div>
      <div class="building-stage building-cutaway" aria-label="층별 라이브 오피스">
        <div class="building-illustration-layer" aria-hidden="true">
          <img
            class="building-bg-image"
            src="./assets/building/hayeon-building-bg.jpeg"
            alt=""
            loading="eager"
            decoding="async"
            onload="var layer = this.closest('.building-illustration-layer'); if (layer) { layer.style.setProperty('--building-bg-image', 'url(' + this.currentSrc + ')'); layer.classList.add('has-bg-image'); }"
            onerror="if (!this.dataset.fallbackSrc) { this.dataset.fallbackSrc = 'jpge'; this.src = './assets/building/hayeon-building-bg.jpge'; } else if (this.dataset.fallbackSrc === 'jpge') { this.dataset.fallbackSrc = 'webp'; this.src = './assets/building/hayeon-building-bg.webp'; } else if (this.dataset.fallbackSrc === 'webp') { this.dataset.fallbackSrc = 'png'; this.src = './assets/building/hayeon-building-bg.png'; } else { this.remove(); }"
          />
          <span class="building-bg-css-illustration">
            <span class="building-roof" aria-hidden="true"></span>
            <span class="building-skyline" aria-hidden="true"></span>
            <span class="building-elevator-shaft" aria-hidden="true">
              ${orderedFloors.map((floor) => `<span>${floor.level}F</span>`).join("")}
            </span>
            <span class="building-exterior-wall building-exterior-left"></span>
            <span class="building-exterior-wall building-exterior-right"></span>
            <span class="building-stack illustration-floor-stack">
              ${orderedFloors.map(renderBuildingIllustrationFloor).join("")}
            </span>
            <span class="building-foundation" aria-hidden="true"></span>
          </span>
        </div>

        <div class="agent-overlay-layer">
          ${orderedFloors
            .map((floor) => getFloorEmployees(floor.id).map((employee, index) => renderLayeredBuildingAgent(employee, index, floor)).join(""))
            .join("")}
        </div>

        <div class="ui-overlay-layer">
          <div class="floor-hit-layer" aria-label="층 선택">
            ${orderedFloors.map(renderBuildingFloorHitZone).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

function updateLiveActivityBar() {
  const activity = getLiveActivityItems();
  const activeActivity = activity[bubbleTick % activity.length];
  const textTarget = refs.buildingView.querySelector(".live-activity-bar span:last-child");
  if (textTarget) textTarget.textContent = activeActivity;
}

function renderBuildingIllustrationFloor(floor) {
  const floorRooms = floor.roomIds.map(getRoom).filter(Boolean);

  return `
    <span
      class="illustration-floor illustration-floor-${floor.id} theme-${floor.theme}"
      style="${getBuildingFloorLayerStyle(floor.id)}"
    >
      <span class="floor-back-wall" aria-hidden="true"></span>
      <span class="floor-window-view panorama-window daytime-window-view city-day-view" aria-hidden="true">
        <img
          class="daytime-window-bg-image"
          src="./assets/building/daytime-city-view.webp"
          alt=""
          loading="lazy"
          onload="var windowView = this.closest('.floor-window-view'); if (windowView) { windowView.style.setProperty('--day-window-bg-image', 'url(' + this.currentSrc + ')'); windowView.classList.add('has-day-bg'); }"
          onerror="if (!this.dataset.fallbackSrc) { this.dataset.fallbackSrc = 'png'; this.src = './assets/building/daytime-city-view.png'; } else { this.remove(); }"
        />
        <span class="city-skyline distant-buildings skyline-back"></span>
        <span class="city-skyline distant-buildings skyline-mid"></span>
        <span class="city-skyline skyline-front"></span>
        <span class="window-horizon"></span>
        <span class="window-grid"></span>
        <span class="glass-reflection window-reflection"></span>
      </span>
      <span class="floor-light-glow floor-ambient-light"></span>
      <span class="floor-light-strip"></span>
      <span class="floor-service-bay" aria-hidden="true"></span>
      <span class="floor-wall-panel" aria-hidden="true"></span>
      <span class="floor-plane" aria-hidden="true"></span>
      <span class="building-room-row">
        ${floorRooms.map(renderBuildingRoomPill).join("")}
        ${floor.id === "floor-1" ? '<span class="building-room-pill lobby-pill">리셉션</span>' : ""}
      </span>
      <span class="building-prop-layer" aria-hidden="true">
        ${renderBuildingProps(floor)}
      </span>
      ${floor.id === "floor-1" ? '<span class="lobby-brand-sign">HA:YEON AI STUDIO</span>' : ""}
    </span>
  `;
}

function renderBuildingFloorHitZone(floor) {
  const floorEmployees = getFloorEmployees(floor.id);
  const floorTaskCount = getFloorTaskCount(floor.id);

  return `
    <button
      class="building-floor building-floor-hit floor-hit-${floor.id} theme-${floor.theme}"
      data-floor-id="${floor.id}"
      type="button"
      style="${getBuildingFloorLayerStyle(floor.id)}"
      aria-label="${floor.name} 상세 보기"
    >
      <span class="floor-hit-title">
        <strong>${floor.level}F</strong>
        ${escapeHtml(floor.shortName)}
      </span>
      <span class="floor-hit-badge">${floorEmployees.length}명 · ${floorTaskCount}업무</span>
    </button>
  `;
}

function renderLayeredBuildingAgent(employee, index, floor) {
  const meta = statusMeta[employee.status] ?? statusMeta.idle;
  const position = getLayeredBuildingAgentPosition(floor.id, index, employee);
  const showBubble = employee.status === "review" || (bubbleTick + index) % 6 === 0;
  const stance = index % 3 === 0 ? "standing" : index % 3 === 1 ? "working" : "walking";

  return `
    <button
      class="building-agent layered-building-agent building-agent-${floor.theme} agent-slot-${index % 5} agent-stance-${stance} agent-motion-${employee.status} status-${meta.color}"
      data-employee-id="${employee.id}"
      type="button"
      title="${escapeHtml(employee.name)} · ${meta.label}"
      style="--agent-x: ${position.x}%; --agent-bottom: ${position.bottom}%; --agent-scale: ${position.scale}; --agent-z: ${position.z}; --agent-delay: ${index * 0.22}s"
      aria-label="${employee.name} 상세 보기"
    >
      ${showBubble ? `<span class="building-agent-bubble">${escapeHtml(getStatusMessage(employee))}</span>` : ""}
      <span class="building-agent-avatar">${renderAvatarVisual(employee)}</span>
      <span class="building-agent-name">${escapeHtml(employee.name)}</span>
    </button>
  `;
}

function renderBuildingFloor(floor) {
  const floorRooms = floor.roomIds.map(getRoom).filter(Boolean);
  const floorEmployees = getFloorEmployees(floor.id);
  const floorTaskCount = state.tasks.filter((task) =>
    floorEmployees.some((employee) => employee.id === task.assigneeId),
  ).length;

  return `
    <button
      class="building-floor building-floor-${floor.id} theme-${floor.theme}"
      data-floor-id="${floor.id}"
      type="button"
      aria-label="${floor.name} 상세 보기"
    >
      <span class="floor-slab floor-slab-top" aria-hidden="true"></span>
      <span class="building-floor-side">
        <strong>${floor.level}F</strong>
        <small>${escapeHtml(floor.shortName)}</small>
        <span class="elevator-door" aria-hidden="true"></span>
      </span>
      <span class="building-floor-main">
        <span class="building-floor-copy">
          <span class="building-floor-title">${escapeHtml(floor.name)}</span>
          <span class="building-floor-mission">${escapeHtml(floor.mission)}</span>
          <span class="building-floor-stat">
            <strong>${floorEmployees.length}</strong> STAFF · ${floorTaskCount} TASK
          </span>
        </span>
        <span class="building-floor-roomscape">
          <span class="floor-depth-backdrop" aria-hidden="true"></span>
          <span class="floor-ambient-light" aria-hidden="true"></span>
          <span class="floor-light-strip" aria-hidden="true"></span>
          <span class="floor-window-view building-window-wall" aria-hidden="true">
            <span class="city-layer city-back"></span>
            <span class="city-layer city-mid"></span>
            <span class="city-layer city-front"></span>
            <span class="window-horizon"></span>
            <span class="window-grid"></span>
            <span class="window-reflection"></span>
          </span>
          <span class="floor-wall-panel" aria-hidden="true"></span>
          <span class="floor-plane" aria-hidden="true"></span>
          <span class="building-room-row">
            ${floorRooms.map(renderBuildingRoomPill).join("")}
            ${floor.id === "floor-1" ? '<span class="building-room-pill lobby-pill">리셉션</span>' : ""}
          </span>
          <span class="building-prop-layer" aria-hidden="true">
            ${renderBuildingProps(floor)}
          </span>
          <span class="building-agent-row">
            ${floorEmployees.map((employee, index) => renderBuildingAgent(employee, index, floor)).join("")}
          </span>
        </span>
      </span>
      <span class="floor-slab floor-slab-bottom" aria-hidden="true"></span>
    </button>
  `;
}

function renderBuildingRoomPill(room, index) {
  return `<span class="building-room-pill room-zone-${index}">${escapeHtml(room.shortName ?? room.name)}</span>`;
}

function renderBuildingAgent(employee, index, floor) {
  const meta = statusMeta[employee.status] ?? statusMeta.idle;
  const position = getBuildingAgentPosition(floor.id, index);
  const showBubble = employee.status === "review" || (bubbleTick + index) % 6 === 0;
  const stance = index % 3 === 0 ? "standing" : index % 3 === 1 ? "working" : "walking";
  return `
    <span
      class="building-agent building-agent-${floor.theme} agent-slot-${index % 5} agent-stance-${stance} agent-motion-${employee.status} status-${meta.color}"
      title="${escapeHtml(employee.name)} · ${meta.label}"
      style="--agent-x: ${position.x}%; --agent-y: ${position.y}%; --agent-delay: ${index * 0.22}s"
    >
      ${showBubble ? `<span class="building-agent-bubble">${escapeHtml(getStatusMessage(employee))}</span>` : ""}
      <span class="building-agent-avatar">${renderAvatarVisual(employee)}</span>
      <span class="building-agent-name">${escapeHtml(employee.name)}</span>
    </span>
  `;
}

function renderBuildingProps(floor) {
  const propsByTheme = {
    executive: ["executiveDesk", "controlWall", "statusWall", "plant", "standingLamp"],
    lecture: ["whiteboard", "stickyBoard", "slideBoard", "laptopDesk", "lectureNotes", "plant"],
    tech: ["codeWall", "dualMonitor", "serverRack", "pipeline", "miniBot", "plant"],
    archive: ["bookshelf", "fileCabinet", "recordBoard", "reportTable", "outputBox", "plant"],
    lounge: ["receptionDesk", "glassDoor", "meetingTable", "sofa", "coffeeTable", "plant"],
  };
  return (propsByTheme[floor.theme] ?? ["deskCluster", "plant"])
    .map((type, index) => `<span class="building-prop prop-${type} prop-${index}"></span>`)
    .join("");
}

function getBuildingFloorLayerStyle(floorId) {
  const band = getBuildingFloorBand(floorId);
  return `--floor-top: ${band.top}%; --floor-height: ${band.height}%`;
}

function getBuildingFloorBand(floorId) {
  // Pixel-precise calibration from hayeon-building-bg.jpeg (1376x768).
  // The .building-stage has aspect-ratio 1376/768 and the image is background-size:contain,
  // so the image fills the stage 1:1 with NO margins → image y% maps directly to container y%.
  // Measured dark floor-slab rows (standing surfaces): 5F→31.6%, 4F→46.4%, 3F→62.0%, 2F→76.6%, 1F→95.3%.
  // Each band's bottom edge (top + height) is set to that floor's standing surface so agents
  // with bottom:0 rest their feet exactly on the floor.
  const bands = {
    "floor-5": { top: 14.5, height: 17.1 },  // floorBottom=68.4%
    "floor-4": { top: 33.0, height: 13.4 },  // floorBottom=53.6%
    "floor-3": { top: 48.0, height: 14.0 },  // floorBottom=38.0%
    "floor-2": { top: 63.0, height: 13.6 },  // floorBottom=23.4%
    "floor-1": { top: 78.0, height: 17.3 },  // floorBottom=4.7%
  };
  return bands[floorId] ?? { top: 8, height: 16 };
}

function getLayeredBuildingAgentPosition(floorId, index, employee) {
  const customPosition = employee?.buildingPosition;
  const roomPosition = customPosition?.floorId === floorId ? customPosition : getBuildingAgentPosition(floorId, index);
  const band = getBuildingFloorBand(floorId);
  const floorBottom = 100 - (band.top + band.height);
  const floorBottomOffset = typeof roomPosition.bottom === "number" ? roomPosition.bottom : 100 - (roomPosition.y ?? 70);

  return {
    x: roomPosition.x,
    bottom: floorBottom + (band.height * floorBottomOffset) / 100,
    scale: roomPosition.scale ?? (employee?.avatar?.src ? 0.9 : 0.82),
    z: roomPosition.z ?? Math.round(100 - floorBottomOffset),
  };
}

function getBuildingAgentPosition(floorId, index) {
  const positions = {
    "floor-5": [
      { x: 22, bottom: 2, scale: 0.8 },
      { x: 42, bottom: 4, scale: 0.78 },
      { x: 56, bottom: 2, scale: 0.82 },
      { x: 73, bottom: 2, scale: 0.82 },
    ],
    "floor-4": [
      { x: 22, bottom: 2, scale: 0.84 },
      { x: 33, bottom: 3, scale: 0.8 },
      { x: 45, bottom: 2, scale: 0.82 },
      { x: 64, bottom: 2, scale: 0.84 },
      { x: 73, bottom: 3, scale: 0.76 },
      { x: 55, bottom: 4, scale: 0.74 },
      { x: 74, bottom: 2, scale: 0.8 },   // was x:88 (outside building), moved inside
    ],
    "floor-3": [
      { x: 25, bottom: 2, scale: 0.82 },
      { x: 38, bottom: 3, scale: 0.8 },
      { x: 52, bottom: 2, scale: 0.82 },
      { x: 65, bottom: 3, scale: 0.8 },
      { x: 74, bottom: 2, scale: 0.82 },  // extended positions for extra employees
      { x: 44, bottom: 4, scale: 0.78 },
      { x: 59, bottom: 2, scale: 0.80 },
      { x: 30, bottom: 3, scale: 0.78 },
    ],
    "floor-2": [
      { x: 23, bottom: 2, scale: 0.82 },
      { x: 36, bottom: 3, scale: 0.8 },
      { x: 59, bottom: 2, scale: 0.84 },
      { x: 70, bottom: 3, scale: 0.8 },
      { x: 82, bottom: 2, scale: 0.8 },
    ],
    "floor-1": [
      { x: 76, bottom: 2, scale: 0.82 },
      { x: 54, bottom: 2, scale: 0.84 },
    ],
  };
  const floorPositions = positions[floorId] ?? [];
  return floorPositions[index] ?? { x: 28 + index * 12, bottom: index % 2 === 0 ? 12 : 18, scale: 0.8 };
}

function getLiveActivityItems() {
  const taskItems = state.tasks
    .filter((task) => ["doing", "review"].includes(task.status))
    .map((task) => {
      const employee = getEmployee(task.assigneeId);
      if (!employee) return null;
      return `${employee.name} · ${getActivitySummary(task.title, employee)}`;
    })
    .filter(Boolean);

  if (taskItems.length) return taskItems;

  const employeeItems = state.employees
    .filter((employee) => ["working", "preparing"].includes(employee.status))
    .map((employee) => `${employee.name} · ${getStatusMessage(employee)}`);

  return employeeItems.length ? employeeItems : ["하비서 · 오늘의 우선순위 점검 중"];
}

function getActivitySummary(title, employee) {
  if (title.includes("보고서")) return "보고서 초안 작성 중";
  if (title.includes("후기") || title.includes("아카이브")) return "강의 후기 기록 정리 중";
  if (title.includes("PPT") || title.includes("문구")) return "PPT 문구 압축 중";
  if (title.includes("자동화") || title.includes("템플릿")) return "반복 업무 템플릿 정리 중";
  if (title.includes("강의") || employee.role.includes("강의")) return "신입직원 강의 흐름 정리 중";
  return title.length > 26 ? `${title.slice(0, 26)}…` : title;
}

function updateClock() {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
  refs.clock.textContent = formatter.format(new Date());
}

function renderStats() {
  const total = state.tasks.length;
  refs.taskPillCount.textContent = total;
  renderOfficeCensus();
}

function renderOfficeCensus() {
  const el = document.getElementById("officeCensus");
  if (!el) return;
  const floorCount = floors.length;
  const deptCount = rooms.filter((room) =>
    state.employees.some((emp) => getEmployeeRoomId(emp) === room.id),
  ).length;
  const staffCount = state.employees.length;
  const workingCount = state.employees.filter((emp) => emp.status === "working").length;
  el.textContent =
    "\u{1F3E2} " + floorCount + "\uAC1C \uCE35 \u00B7 \u{1F4BC} " + deptCount + "\uAC1C \uBD80\uC11C \u00B7 " +
    "\u{1F465} AI \uC9C1\uC6D0 " + staffCount + "\uBA85 (\uADFC\uBB34 \uC911 " + workingCount + "\uBA85)";
}

function renderDepartments() {
  if (state.currentView === "floor-detail" && state.selectedFloorId) {
    renderFloorDetailDepartments();
    return;
  }
  renderDepartmentsV2();
}

function renderDepartmentsLegacy() {
  refs.departments.innerHTML = `${corridors.map(renderCorridor).join("")}${rooms.map(renderRoom).join("")}`;
}

function renderCorridor(corridor) {
  return `
    <span
      class="corridor corridor-${corridor.id}"
      style="--corridor-x: ${corridor.x}%; --corridor-y: ${corridor.y}%; --corridor-w: ${corridor.w}%; --corridor-h: ${corridor.h}%"
      aria-hidden="true"
    >
      <span>${escapeHtml(corridor.label ?? "")}</span>
    </span>
  `;
}

function renderRoom(room) {
  const roomEmployees = state.employees.filter((employee) => getEmployeeRoomId(employee) === room.id);
  const roomTaskCount = state.tasks.filter((task) =>
    roomEmployees.some((employee) => employee.id === task.assigneeId),
  ).length;
  const style = `--room-x: ${room.x}%; --room-y: ${room.y}%; --room-w: ${room.w}%; --room-h: ${room.h}%`;

  return `
    <article
      class="room room-${room.id} room-size-${room.size} door-${room.doorPosition ?? "bottom-left"} accent-${room.accent}"
      style="${style}"
    >
      <header class="room-header">
        <div>
          <p class="room-kicker">${escapeHtml(room.shortName)}</p>
          <h3>${escapeHtml(room.name)}</h3>
        </div>
        <div class="room-meta">
          <span class="room-task-count">${getRoomBadge(room, roomEmployees, roomTaskCount)}</span>
          <span class="room-light" aria-hidden="true"></span>
        </div>
      </header>
      <p class="room-mission">${escapeHtml(room.mission)}</p>
      <span class="room-window" aria-hidden="true"></span>
      ${renderRoomDecor(room)}
      <span class="room-short-desc">${escapeHtml(room.shortDesc)}</span>
      <span class="room-door door-${room.doorPosition ?? "bottom-left"}" aria-hidden="true"></span>
      <div class="room-interior">
        ${roomEmployees.map((employee, index) => renderEmployeeToken(employee, index)).join("")}
      </div>
    </article>
  `;
}

function getRoomBadge(room, roomEmployees, roomTaskCount) {
  if (room.id === "lobby") return "리셉션";
  if (room.id === "meeting") return `${roomEmployees.length}명 회의`;
  if (room.id === "lounge") return `${roomEmployees.length}명 대기`;
  return `${roomTaskCount} TASK`;
}

function renderRoomDecor(room) {
  const decorItems = room.decorItems?.length
    ? room.decorItems
    : (room.decor ?? ["desk", "plant"]).map((type, index) => ({
        type,
        x: 18 + index * 12,
        y: index % 2 === 0 ? 38 : 72,
        size: "small",
      }));

  return `
    <div class="room-decor" aria-hidden="true">
      ${decorItems
        .map((decor, index) => {
          const scale = getDecorScale(decor.size);
          return `<span class="decor decor-${decor.type} decor-size-${decor.size ?? "small"}" style="--decor-x: ${decor.x}%; --decor-y: ${decor.y}%; --decor-scale: ${scale}; --decor-index: ${index}"></span>`;
        })
        .join("")}
    </div>
  `;
}

function getDecorScale(size = "small") {
  const scales = {
    tiny: 0.72,
    small: 0.86,
    medium: 1,
    wide: 1.08,
    large: 1.12,
  };
  return scales[size] ?? scales.small;
}

function renderEmployeeToken(employee, index, options = {}) {
  const isSelected = !options.isPreview && state.selectedEmployeeId === employee.id;
  const meta = statusMeta[employee.status] ?? statusMeta.idle;
  const message = getStatusMessage(employee);
  const showBubble =
    !options.hideBubble && (isSelected || employee.status === "review" || (bubbleTick + index) % 4 === 0);
  const positionStyle = options.isPreview
    ? ""
    : `--employee-x: ${employee.roomX ?? 50}%; --employee-y: ${employee.roomY ?? 70}%;`;

  return `
    <button
      class="employee-token status-${meta.color} ${isSelected ? "is-selected" : ""} ${options.isPreview ? "is-preview" : ""}"
      data-employee-id="${employee.id}"
      type="button"
      style="--bob-delay: ${index * 0.18}s; ${positionStyle}"
      aria-label="${employee.name} 상세 보기"
    >
      ${showBubble ? `<span class="speech-bubble">${escapeHtml(message)}</span>` : ""}
      <span class="avatar-sprite" aria-hidden="true">
        ${renderAvatarVisual(employee)}
        <span class="employee-status-dot"></span>
      </span>
      <span class="desk-plate" title="${escapeHtml(employee.name)}">${escapeHtml(employee.name)}</span>
    </button>
  `;
}

function renderAvatarVisual(employee) {
  const avatarSrc = employee.avatar?.src;
  const avatarScale = Number(employee.avatar?.scale);
  const safeAvatarScale = Number.isFinite(avatarScale) && avatarScale > 0 ? avatarScale : 1;
  const missingAvatar = renderMissingAvatar(employee, avatarSrc);
  const resolvedAvatarSrc = avatarSrc ? new URL(avatarSrc, window.location.href).href : "";
  if (!avatarSrc || failedAvatarSrcs.has(avatarSrc) || failedAvatarSrcs.has(resolvedAvatarSrc)) return missingAvatar;

  return `
    <span class="avatar-image-wrap is-actual-avatar" style="--avatar-scale: ${safeAvatarScale}">
      <span class="avatar-image-fallback">${missingAvatar}</span>
      <img
        class="avatar-image agent-avatar-image"
        src="${escapeHtml(avatarSrc)}"
        alt="${escapeHtml(employee.name)}"
        loading="lazy"
        onload="this.parentElement.classList.add('has-image')"
        onerror="window.HayeonAvatarLoadFailed?.(this.currentSrc || this.src); this.remove()"
      />
    </span>
  `;
}

function renderMissingAvatar(employee, avatarSrc = "") {
  const missingText = avatarSrc ? `이미지 경로 확인: ${avatarSrc}` : `${employee.name} 이미지 경로 없음`;
  return `
    <span
      class="agent-avatar-missing"
      title="${escapeHtml(missingText)}"
      data-missing-avatar="${escapeHtml(avatarSrc || employee.id)}"
    >
      <span class="avatar-missing-mark" aria-hidden="true">!</span>
      <span class="avatar-missing-label">${escapeHtml(employee.name)}</span>
    </span>
  `;
}

function renderDetailAvatarPhoto(employee) {
  const avatarSrc = employee.avatar?.src;
  const avatarScale = Number(employee.avatar?.scale);
  const safeAvatarScale = Number.isFinite(avatarScale) && avatarScale > 0 ? avatarScale : 1;
  const missingAvatar = renderMissingAvatar(employee, avatarSrc);
  const resolvedAvatarSrc = avatarSrc ? new URL(avatarSrc, window.location.href).href : "";

  if (!avatarSrc || failedAvatarSrcs.has(avatarSrc) || failedAvatarSrcs.has(resolvedAvatarSrc)) {
    return `<div class="staff-id-photo is-missing">${missingAvatar}</div>`;
  }

  return `
    <div class="staff-id-photo" style="--staff-photo-scale: ${safeAvatarScale}">
      <span class="staff-id-photo-placeholder">${missingAvatar}</span>
      <img
        class="staff-id-photo-image"
        src="${escapeHtml(avatarSrc)}"
        alt="${escapeHtml(employee.name)} 사원증 사진"
        loading="lazy"
        onload="this.parentElement.classList.add('has-image')"
        onerror="window.HayeonAvatarLoadFailed?.(this.currentSrc || this.src); this.parentElement.classList.add('is-missing'); this.remove()"
      />
    </div>
  `;
}

function renderEmployeeAvatar(employee) {
  const avatar = getAvatarConfig(employee.avatar);
  const colors = getAvatarColors(avatar);
  return `
    <svg
      class="employee-svg accessory-${avatar.accessory} expression-${avatar.expression}"
      viewBox="0 0 48 56"
      focusable="false"
    >
      <ellipse class="sprite-shadow" cx="24" cy="52" rx="12" ry="3"></ellipse>
      <path class="sprite-arm sprite-arm-left" d="M15 35 C9 39 9 45 13 47" fill="none" stroke="${colors.suit}" stroke-width="5" stroke-linecap="round"></path>
      <path class="sprite-arm sprite-arm-right" d="M33 35 C39 39 39 45 35 47" fill="none" stroke="${colors.suit}" stroke-width="5" stroke-linecap="round"></path>
      <rect class="sprite-body" x="13" y="31" width="22" height="19" rx="7" fill="${colors.suit}"></rect>
      <path class="sprite-shirt" d="M18 32 L24 43 L30 32 Z" fill="${colors.shirt}"></path>
      <path class="sprite-lapel" d="M14.5 32 L22 39 L18 44 L13.5 38 Z" fill="${colors.suitDark}"></path>
      <path class="sprite-lapel" d="M33.5 32 L26 39 L30 44 L34.5 38 Z" fill="${colors.suitDark}"></path>
      <path class="sprite-tie" d="M24 33 L27 38 L24 47 L21 38 Z" fill="${colors.tie}"></path>
      ${
        avatar.hasBadge
          ? `<path class="sprite-lanyard" d="M18 32 L24 39 L30 32"></path>
             <rect class="sprite-id-card" x="27.5" y="40" width="7" height="6" rx="1.3" fill="#f8f1d2"></rect>
             <circle cx="30" cy="42.2" r="0.9" fill="${colors.tie}"></circle>
             <path d="M29 44.4 L33 44.4" stroke="#6d604d" stroke-width="0.8" stroke-linecap="round"></path>`
          : ""
      }
      ${renderAccessory(avatar.accessory, colors, "body")}
      ${renderHairBack(avatar.hairStyle, colors)}
      <circle class="sprite-face" cx="24" cy="21" r="13" fill="${colors.skin}"></circle>
      ${renderHairFront(avatar.hairStyle, colors)}
      ${renderFace(avatar.expression)}
      ${renderAccessory(avatar.accessory, colors, "face")}
    </svg>
  `;
}

function getAvatarConfig(avatar = {}) {
  const legacyHairMap = {
    bob: "bob",
    short: "short",
    wave: "sidePart",
    bun: "ponytail",
    cap: "short",
  };
  const legacyOutfitMap = {
    coral: "coral",
    sky: "blue",
    mint: "mint",
    lavender: "lavender",
    sun: "yellow",
    lime: "green",
  };

  return {
    hairStyle: avatar.hairStyle ?? legacyHairMap[avatar.hair] ?? "short",
    hairColor: avatar.hairColor ?? "dark",
    suitColor: avatar.suitColor ?? avatar.outfitColor ?? legacyOutfitMap[avatar.outfit] ?? "navy",
    tieColor: avatar.tieColor ?? "gold",
    hasBadge: avatar.hasBadge ?? true,
    accessory: avatar.accessory ?? "none",
    expression: avatar.expression ?? "smile",
    skinTone: avatar.skinTone ?? avatar.skin ?? "warm",
  };
}

function getAvatarColors(avatar) {
  const hair = {
    dark: "#2d2631",
    brown: "#6b3f2e",
    ash: "#7c8390",
    purple: "#65427e",
  };
  const suit = {
    navy: "#28365d",
    darkGray: "#3b3d4a",
    brown: "#6a4632",
    lavender: "#7d66b6",
    mint: "#346e5f",
    coral: "#8a4b49",
    blue: "#315e8d",
    green: "#416c43",
    yellow: "#8a6b2e",
  };
  const tie = {
    gold: "#e9c36a",
    mint: "#62dda0",
    blue: "#5ea8ff",
    lavender: "#ad9cff",
    coral: "#ff756d",
    green: "#83cf58",
  };
  const skin = {
    warm: "#efb07f",
    neutral: "#ddb894",
    light: "#f2c9ab",
  };

  return {
    hair: hair[avatar.hairColor] ?? hair.dark,
    suit: suit[avatar.suitColor] ?? suit.navy,
    suitDark: shadeColor(suit[avatar.suitColor] ?? suit.navy, -18),
    tie: tie[avatar.tieColor] ?? tie.gold,
    shirt: "#fff5df",
    skin: skin[avatar.skinTone] ?? skin.warm,
    ink: "#221b1c",
  };
}

function shadeColor(hex, percent) {
  const value = hex.replace("#", "");
  const number = parseInt(value, 16);
  const amount = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (number >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((number >> 8) & 0x00ff) + amount));
  const b = Math.max(0, Math.min(255, (number & 0x0000ff) + amount));
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

function renderHairBack(style, colors) {
  if (style === "bob") {
    return `<path class="sprite-hair-back" d="M10 21 C10 9 16 4 24 4 C33 4 39 10 39 22 L39 30 C36 32 33 32 30 30 L18 30 C15 32 12 32 10 29 Z" fill="${colors.hair}"></path>`;
  }
  if (style === "ponytail") {
    return `<ellipse class="sprite-pony" cx="38" cy="23" rx="7" ry="10" fill="${colors.hair}"></ellipse>`;
  }
  return "";
}

function renderHairFront(style, colors) {
  const hair = colors.hair;
  const styles = {
    short: `<path class="sprite-hair-front" d="M11 19 C12 9 18 5 25 6 C33 7 37 13 37 21 C31 19 26 15 22 11 C19 15 16 18 11 19 Z" fill="${hair}"></path>`,
    bob: `<path class="sprite-hair-front" d="M11 20 C11 10 17 5 24 5 C32 5 38 11 38 21 C33 19 30 16 27 12 C23 17 18 20 11 20 Z" fill="${hair}"></path>`,
    bangs: `<path class="sprite-hair-front" d="M11 20 C12 10 18 5 25 6 C33 7 37 13 37 21 C31 20 28 16 26 12 C25 17 23 20 20 22 C20 17 18 14 15 12 C15 17 14 19 11 20 Z" fill="${hair}"></path>`,
    ponytail: `<path class="sprite-hair-front" d="M12 19 C14 9 20 5 27 6 C34 8 37 14 36 21 C31 19 28 15 25 11 C22 15 18 18 12 19 Z" fill="${hair}"></path>`,
    sidePart: `<path class="sprite-hair-front" d="M11 20 C12 10 18 5 26 6 C34 7 38 14 37 22 C31 20 26 15 21 10 C20 16 17 20 11 20 Z" fill="${hair}"></path>
      <path class="sprite-part" d="M22 8 C24 12 27 15 33 17" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1.4" stroke-linecap="round"></path>`,
  };
  return styles[style] ?? styles.short;
}

function renderFace(expression) {
  const eyes =
    expression === "calm"
      ? `<path d="M17 21 Q19 19.5 21 21" class="sprite-eye-arc"></path>
         <path d="M27 21 Q29 19.5 31 21" class="sprite-eye-arc"></path>`
      : expression === "focused"
        ? `<circle class="sprite-eye" cx="19" cy="21" r="1.7"></circle>
           <circle class="sprite-eye" cx="29" cy="21" r="1.7"></circle>
           <path d="M16.5 18.4 L21 17.8" class="sprite-brow"></path>
           <path d="M27 17.8 L31.5 18.4" class="sprite-brow"></path>`
        : `<circle class="sprite-eye" cx="19" cy="21" r="1.8"></circle>
           <circle class="sprite-eye" cx="29" cy="21" r="1.8"></circle>`;

  const mouth =
    expression === "focused"
      ? `<path class="sprite-mouth" d="M21 27 Q24 28.5 27 27"></path>`
      : `<path class="sprite-mouth" d="M20 26 Q24 30 28 26"></path>`;

  return `
    ${eyes}
    <circle class="sprite-blush" cx="15.5" cy="25.2" r="2.1"></circle>
    <circle class="sprite-blush" cx="32.5" cy="25.2" r="2.1"></circle>
    ${mouth}
  `;
}

function renderAccessory(accessory, colors, layer) {
  if (accessory === "none") return "";

  if (layer === "body" && accessory === "badge") {
    return `<circle class="sprite-badge" cx="30" cy="37" r="3.2" fill="#fff0bd"></circle>
      <path d="M30 34.7 L31 37 L33.2 37.2 L31.5 38.6 L32 40.8 L30 39.6 L28 40.8 L28.5 38.6 L26.8 37.2 L29 37 Z" fill="#3b2b1f"></path>`;
  }

  if (layer !== "face") return "";

  const accessories = {
    glasses: `<circle class="sprite-glasses" cx="18.7" cy="21.4" r="4.1"></circle>
      <circle class="sprite-glasses" cx="29.3" cy="21.4" r="4.1"></circle>
      <path class="sprite-glasses-line" d="M22.8 21.4 L25.2 21.4"></path>`,
    headset: `<path class="sprite-headset" d="M13 20 C13 11 19 7 24 7 C30 7 35 11 35 20"></path>
      <rect class="sprite-headset-pad" x="10.8" y="18" width="4" height="7" rx="2"></rect>
      <rect class="sprite-headset-pad" x="33.2" y="18" width="4" height="7" rx="2"></rect>
      <path class="sprite-headset" d="M35 24 C34 29 30 30 27 29"></path>`,
    ribbon: `<path class="sprite-ribbon" d="M30 8 L36 5 L36 13 Z" fill="#ff8fb8"></path>
      <path class="sprite-ribbon" d="M30 8 L25 5 L25 13 Z" fill="#ff8fb8"></path>
      <circle cx="30.2" cy="8.7" r="2.2" fill="#f05f9a"></circle>`,
    star: `<path class="sprite-star" d="M35 6 L36.8 10 L41 10.2 L37.7 12.8 L38.8 17 L35 14.7 L31.3 17 L32.3 12.8 L29 10.2 L33.2 10 Z" fill="#ffe66f"></path>`,
  };

  return accessories[accessory] ?? "";
}

function renderEmployeeDetail() {
  const employee = getSelectedEmployee();
  refs.workspace.classList.toggle("has-detail", Boolean(employee));
  if (!employee) {
    refs.employeeDetail.innerHTML = "";
    refs.employeeDetail.classList.add("is-hidden");
    return;
  }
  refs.employeeDetail.classList.remove("is-hidden");

  const departmentName = getDepartmentName(getEmployeeRoomId(employee));
  const currentTask = employee.currentTaskId ? getTask(employee.currentTaskId) : null;
  const status = statusMeta[employee.status] ?? statusMeta.idle;

  refs.employeeDetail.innerHTML = `
    <div class="detail-heading">
      <div>
        <p class="eyebrow">AI STAFF</p>
        <h2>${employee.name}</h2>
        <p>${employee.role}</p>
      </div>
      <div class="detail-heading-side">
        <button class="detail-close" data-detail-action="close" type="button" aria-label="직원 상세 닫기">×</button>
        <span class="detail-status status-${status.color}">${status.label}</span>
      </div>
    </div>

    <div class="detail-body">
      <div class="detail-avatar-wrap">
        ${renderDetailAvatarPhoto(employee)}
      </div>
      <dl class="detail-list">
        <div>
          <dt>소속</dt>
          <dd>${departmentName}</dd>
        </div>
        <div>
          <dt>현재 업무</dt>
          <dd>${currentTask?.title ?? "배정된 업무 없음"}</dd>
        </div>
        <div>
          <dt>최근 완료</dt>
          <dd>${employee.recentCompleted[0] ?? "아직 기록 없음"}</dd>
        </div>
      </dl>
    </div>

    <div class="detail-actions">
      <button class="primary-button" data-detail-action="assign" type="button">업무 지시하기</button>
      <button class="ghost-button" data-detail-action="chat" type="button">대화하기</button>
      <button class="ghost-button" data-detail-action="history" type="button">업무 히스토리</button>
    </div>

    <div class="status-controls" aria-label="직원 상태 변경">
      ${Object.entries(statusMeta)
        .map(
          ([statusId, meta]) => `
            <button
              class="status-chip ${employee.status === statusId ? "is-active" : ""}"
              data-detail-action="status"
              data-status="${statusId}"
              type="button"
            >
              <span class="status-dot ${meta.color}" aria-hidden="true"></span>
              ${meta.shortLabel}
            </button>
          `,
        )
        .join("")}
    </div>

    ${renderDetailMode(employee)}
  `;
}

function renderDetailMode(employee) {
  if (state.detailMode === "assign") {
    return `
      <form class="inline-panel" id="assignTaskForm">
        <label>
          지시할 업무
          <textarea name="title" rows="4" placeholder="예: 지사 AI 특강 후기를 강의 기록 형식으로 정리해줘" required></textarea>
        </label>
        <div class="form-row">
          <label>
            우선순위
            <select name="priority">
              <option value="high">높음</option>
              <option value="medium" selected>보통</option>
              <option value="low">낮음</option>
            </select>
          </label>
          <label>
            태그
            <input name="tags" type="text" placeholder="#강의 #아카이브" />
          </label>
        </div>
        <button class="primary-button full-width" type="submit">이 직원에게 배정</button>
      </form>
    `;
  }

  if (state.detailMode === "chat") {
    const log = (state.chat && state.chat[employee.id]) || [];
    const msgs = log.map((m) => {
      if (m.pending) return `<div class="chat-msg ai is-pending"><span class="chat-typing"><i></i><i></i><i></i></span></div>`;
      return `<div class="chat-msg ${m.role === "user" ? "user" : "ai"}">${escapeHtml(m.text)}</div>`;
    }).join("");
    return `
      <div class="chat-panel">
        <div class="chat-log" id="chatLog">${msgs || `<div class="chat-empty">${escapeHtml(employee.name)}에게 무엇이든 물어보세요 \u{1F4AC}</div>`}</div>
        <form class="chat-input-row" id="chatForm">
          <textarea name="message" rows="1" placeholder="${escapeHtml(employee.name)}에게 메시지…" required></textarea>
          <button class="primary-button chat-send" type="submit">전송</button>
        </form>
      </div>
    `;
  }

  if (state.detailMode === "history") {
    return `
      <div class="inline-panel">
        <p class="mode-note">최근 완료 업무</p>
        <ul class="history-list">
          ${employee.recentCompleted.map((item) => `<li>${item}</li>`).join("") || "<li>아직 완료 기록이 없습니다.</li>"}
        </ul>
      </div>
    `;
  }

  return `
    <div class="inline-panel prompt-preview compact-note">
      <p class="mode-note">직원에게 업무를 지시하면 오늘의 업무 보드에 바로 반영됩니다.</p>
    </div>
  `;
}

function renderKanban() {
  const activeFilter = normalizeBoardFilter(state.boardFilter);
  const visibleColumns = activeFilter === "all"
    ? taskColumns
    : taskColumns.filter((column) => column.id === activeFilter);

  refs.kanban.innerHTML = `
    <div class="board-filter-tabs" aria-label="업무 상태 필터">
      ${renderBoardFilterTab("all", "전체")}
      ${renderBoardFilterTab("todo", "할 일")}
      ${renderBoardFilterTab("doing", "진행 중")}
      ${renderBoardFilterTab("review", "검토")}
      ${renderBoardFilterTab("done", "완료")}
    </div>
    <div class="kanban-board-columns">
      ${visibleColumns
    .map((column) => {
      const tasks = state.tasks.filter((task) => task.status === column.id);
      return `
        <section class="kanban-column">
          <header>
            <div>
              <h3>${column.title}</h3>
              <p>${column.helper}</p>
            </div>
            <span>${tasks.length}</span>
          </header>
          <div class="task-list">
            ${tasks.map(renderTaskCard).join("") || `<p class="empty-column">아직 업무가 없습니다.</p>`}
          </div>
        </section>
      `;
    })
    .join("")}
    </div>
  `;
}

function renderBoardFilterTab(value, label) {
  const checked = normalizeBoardFilter(state.boardFilter) === value ? "checked" : "";
  return `
    <label class="board-filter-tab ${checked ? "is-active" : ""}">
      <input type="radio" name="boardFilter" value="${value}" ${checked} />
      <span>${label}</span>
    </label>
  `;
}

function dDayLabel(dueDate) {
  if (!dueDate) return "";
  const due = new Date(`${dueDate}T00:00:00`);
  if (isNaN(due.getTime())) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = Math.round((due - today) / 86400000);
  if (d === 0) return `<span class="dday is-today">D-DAY</span>`;
  if (d < 0) return `<span class="dday is-over">D+${-d}</span>`;
  if (d <= 3) return `<span class="dday is-soon">D-${d}</span>`;
  return `<span class="dday">D-${d}</span>`;
}

function launchConfetti() {
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  const colors = ["#ff8a63", "#4f9bd0", "#7bb98b", "#f4c64e", "#b07fe0"];
  for (let i = 0; i < 80; i += 1) {
    const bit = document.createElement("div");
    bit.className = "confetti-bit";
    bit.style.left = `${Math.random() * 100}vw`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    bit.style.animationDelay = `${Math.random() * 0.3}s`;
    bit.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(bit);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3200);
}

function renderTaskCard(task) {
  const employee = state.employees.find((item) => item.id === task.assigneeId);
  const priorityLabel = {
    high: "높음",
    medium: "보통",
    low: "낮음",
  }[task.priority];

  return `
    <article class="task-card priority-${task.priority}" data-task-id="${task.id}">
      <div class="task-card-top">
        <strong>${task.title}</strong>
        <button class="mini-button" data-task-action="edit" type="button" title="업무 수정">수정</button>
      </div>
      <p>${employee?.name ?? "미지정"} · ${employee?.role ?? ""}</p>
      <div class="task-meta">
        <span>${priorityLabel}</span>
        <span>${task.dueDate || "마감일 없음"}</span>${dDayLabel(task.dueDate)}
      </div>
      <div class="tag-row">
        ${(task.tags ?? []).map((tag) => `<span>${tag}</span>`).join("")}
      </div>
      <div class="task-actions">
        ${(task.resultText || task.resultError) ? '<button class="mini-button" data-task-action="open-result" type="button">문서</button>' : ""}
        ${taskColumns
          .filter((column) => column.id !== task.status)
          .map(
            (column) => `
              <button class="mini-button" data-task-action="move" data-status="${column.id}" type="button">
                ${column.title}
              </button>
            `,
          )
          .join("")}
        <button class="mini-button danger" data-task-action="delete" type="button">삭제</button>
      </div>
    </article>
  `;
}

function openTaskDetailModal(taskId) {
  const task = getTask(taskId);
  if (!task) return;
  state.selectedTaskId = taskId;
  saveState();
  renderTaskDetailModal(task);
  refs.taskDetailBackdrop.classList.remove("is-hidden");
  refs.taskDetailModal.classList.remove("is-hidden");
  refs.taskDetailModal.setAttribute("aria-hidden", "false");
}

function closeTaskDetailModal() {
  state.selectedTaskId = null;
  saveState();
  refs.taskDetailBackdrop.classList.add("is-hidden");
  refs.taskDetailModal.classList.add("is-hidden");
  refs.taskDetailModal.setAttribute("aria-hidden", "true");
  refs.taskDetailModal.innerHTML = "";
}

function handleTaskDetailClick(event) {
  const action = event.target.closest("[data-task-detail-action]")?.dataset.taskDetailAction;
  if (!action) return;
  const task = getTask(state.selectedTaskId);

  if (action === "close") {
    closeTaskDetailModal();
    return;
  }

  if (action === "employee" && task) {
    closeTaskDetailModal();
    selectTaskAssignee(task.id);
    return;
  }

  if (action === "download" && task) {
    downloadTaskDocument(task);
  }
}

function renderTaskDetailModal(task) {
  const employee = getEmployee(task.assigneeId);
  const status = taskColumns.find((column) => column.id === task.status);
  const priorityLabel = { high: "높음", medium: "보통", low: "낮음" }[task.priority] ?? "보통";
  const resultText = task.resultText || task.resultError || "";
  refs.taskDetailModal.innerHTML = `
    <div class="task-detail-header">
      <div>
        <p class="eyebrow">TASK DETAIL</p>
        <h2 id="taskDetailTitle">${escapeHtml(task.title)}</h2>
      </div>
      <button class="detail-close" data-task-detail-action="close" type="button" aria-label="업무 상세 닫기">×</button>
    </div>
    <div class="task-detail-meta">
      <span>${escapeHtml(status?.title ?? task.status)}</span>
      <span>담당 ${escapeHtml(employee?.name ?? "미지정")}</span>
      <span>우선순위 ${escapeHtml(priorityLabel)}</span>
      <span>${task.dueDate ? `마감 ${escapeHtml(task.dueDate)}` : "마감일 없음"}</span>
    </div>
    <section class="task-detail-section">
      <strong>진행상황</strong>
      <p>${escapeHtml(getTaskProgressText(task, employee))}</p>
    </section>
    <section class="task-detail-section">
      <strong>저장된 산출물</strong>
      ${
        resultText
          ? `<pre>${escapeHtml(resultText)}</pre>`
          : `<p>아직 이 업무에 연결된 산출물이 없습니다.</p>`
      }
    </section>
    <div class="task-detail-actions">
      <button class="ghost-button" data-task-detail-action="employee" type="button">담당자 보기</button>
      <button class="primary-button" data-task-detail-action="download" type="button" ${resultText ? "" : "disabled"}>문서 열기</button>
    </div>
  `;
}

function getTaskProgressText(task, employee) {
  if (task.resultError) return `처리 중 오류가 있었습니다: ${task.resultError}`;
  if (task.resultText) return `${employee?.name ?? "직원"} 산출물이 저장되었습니다.`;
  if (task.status === "done") return "완료된 업무입니다.";
  if (task.status === "review") return "운영자 검토가 필요한 상태입니다.";
  if (task.status === "doing") return `${employee?.name ?? "직원"}이 처리 중입니다.`;
  return "아직 시작 전입니다.";
}

function downloadTaskDocument(task) {
  const body = [
    `# ${task.title}`,
    "",
    `- 담당자: ${getEmployee(task.assigneeId)?.name ?? "미지정"}`,
    `- 상태: ${taskColumns.find((column) => column.id === task.status)?.title ?? task.status}`,
    `- 생성일: ${task.createdAt ?? ""}`,
    "",
    "## 산출물",
    "",
    task.resultText || task.resultError || "저장된 산출물이 없습니다.",
  ].join("\n");
  const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${task.title.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 50) || "task"}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function openOrgChartPanel() {
  renderOrgChartPanel();
  refs.orgChartBackdrop.classList.remove("is-hidden");
  refs.orgChartPanel.classList.remove("is-hidden");
  refs.orgChartPanel.setAttribute("aria-hidden", "false");
}

function closeOrgChartPanel() {
  refs.orgChartBackdrop.classList.add("is-hidden");
  refs.orgChartPanel.classList.add("is-hidden");
  refs.orgChartPanel.setAttribute("aria-hidden", "true");
}

function handleOrgChartClick(event) {
  const action = event.target.closest("[data-org-action]")?.dataset.orgAction;
  if (action === "close") {
    closeOrgChartPanel();
    return;
  }
  if (action === "ceo-card") {
    closeOrgChartPanel();
    openStaffCardModal();
    return;
  }
  if (action === "set-view") {
    const view = event.target.closest("[data-view]")?.dataset.view;
    if (view && view !== orgViewMode) {
      orgViewMode = view;
      renderOrgChartPanel();
    }
    return;
  }

  const employeeButton = event.target.closest("[data-org-employee-id]");
  if (!employeeButton) return;
  state.selectedEmployeeId = employeeButton.dataset.orgEmployeeId;
  state.detailMode = "summary";
  saveState();
  renderEmployeeDetail();
  closeOrgChartPanel();
}

function renderOrgChartPanel() {
  const ordered = floors.slice().sort((a, b) => b.level - a.level);
  const body = orgViewMode === "tree"
    ? renderOrgTree(ordered)
    : ordered.map(renderOrgFloorRow).join("");

  refs.orgChartPanel.innerHTML = `
    <div class="org-chart-header">
      <div>
        <p class="eyebrow">ORGANIZATION</p>
        <h2 id="orgChartTitle">LIVE OFFICE 조직도</h2>
      </div>
      <button class="detail-close" data-org-action="close" type="button" aria-label="조직도 닫기">×</button>
    </div>
    <div class="org-view-toggle">
      <button class="org-view-btn ${orgViewMode === "card" ? "is-active" : ""}" data-org-action="set-view" data-view="card" type="button">카드형</button>
      <button class="org-view-btn ${orgViewMode === "tree" ? "is-active" : ""}" data-org-action="set-view" data-view="tree" type="button">계층형</button>
    </div>
    <button class="org-ceo-card" data-org-action="ceo-card" type="button">
      <span class="org-ceo-photo"><img src="./assets/avatars/ceo.jpg" alt="HAYEON 대표"></span>
      <span>
        <strong>HAYEON</strong>
        <em>대표 · Founder · 5F 대표실</em>
      </span>
    </button>
    <div class="${orgViewMode === "tree" ? "org-chart-tree-wrap" : "org-chart-floors"}">
      ${body}
    </div>
  `;
}

function renderOrgTree(orderedFloors) {
  const deptCount = floors
    .flatMap((f) => f.roomIds).map(getRoom).filter(Boolean)
    .filter((room) => state.employees.some((e) => getEmployeeRoomId(e) === room.id)).length;
  const cols = orderedFloors.map((floor) => {
    const rooms = floor.roomIds.map(getRoom).filter(Boolean);
    const deps = rooms.map((room) => {
      const emps = state.employees.filter((e) => getEmployeeRoomId(e) === room.id);
      const chips = emps.map((e) => `
        <button class="org-tree-emp" data-org-employee-id="${escapeHtml(e.id)}" type="button" title="${escapeHtml(e.name)} · ${escapeHtml(e.role)}">
          <span class="org-tree-emp-av" aria-hidden="true">${renderAvatarVisual(e)}</span>
          <span class="org-tree-emp-nm">${escapeHtml(e.name)}</span>
        </button>`).join("");
      return `
        <div class="org-tree-dep">
          <div class="org-tree-dep-name">${escapeHtml(room.shortName ?? room.name)}<span>${emps.length}</span></div>
          <div class="org-tree-emps">${chips || '<em class="org-tree-none">없음</em>'}</div>
        </div>`;
    }).join("");
    return `
      <div class="org-tree-col">
        <span class="org-tree-stub"></span>
        <div class="org-tree-div">${escapeHtml(floor.shortName)}</div>
        <div class="org-tree-deps">${deps}</div>
      </div>`;
  }).join("");
  return `
    <div class="org-tree">
      <div class="org-tree-top">대표실</div>
      <div class="org-tree-trunk"></div>
      <div class="org-tree-cap">5개 층 · ${deptCount}개 부서 · AI 직원 ${state.employees.length}명</div>
      <div class="org-tree-trunk"></div>
      <div class="org-tree-hbar"></div>
      <div class="org-tree-cols">${cols}</div>
    </div>`;
}

function renderOrgFloorRow(floor) {
  const roomsInFloor = floor.roomIds.map(getRoom).filter(Boolean);
  const roomRows = roomsInFloor.map((room) => {
    const roomEmployees = state.employees.filter((employee) => getEmployeeRoomId(employee) === room.id);
    return `
      <section class="org-room-card">
        <div class="org-room-title">
          <strong>${escapeHtml(room.name)}</strong>
          <span>${roomEmployees.length}명</span>
        </div>
        <div class="org-employee-grid">
          ${roomEmployees.map(renderOrgEmployeeCard).join("") || "<p>배치된 직원이 없습니다.</p>"}
        </div>
      </section>
    `;
  }).join("");

  return `
    <article class="org-floor-row">
      <header>
        <strong>${escapeHtml(floor.name)}</strong>
        <span>${escapeHtml(floor.mission)}</span>
      </header>
      <div class="org-room-grid">${roomRows}</div>
    </article>
  `;
}

function renderOrgEmployeeCard(employee) {
  const taskCount = state.tasks.filter((task) => task.assigneeId === employee.id).length;
  return `
    <button class="org-employee-card" data-org-employee-id="${escapeHtml(employee.id)}" type="button">
      <span class="org-employee-avatar" aria-hidden="true">${renderAvatarVisual(employee)}</span>
      <span>
        <strong>${escapeHtml(employee.name)}</strong>
        <em>${escapeHtml(employee.role)}</em>
        <small>${taskCount}개 업무 · ${escapeHtml(statusMeta[employee.status]?.label ?? employee.status)}</small>
      </span>
    </button>
  `;
}

function openStaffCardModal() {
  renderStaffCardModal();
  refs.staffCardBackdrop.classList.remove("is-hidden");
  refs.staffCardModal.classList.remove("is-hidden");
  refs.staffCardModal.setAttribute("aria-hidden", "false");
}

function closeStaffCardModal() {
  refs.staffCardBackdrop.classList.add("is-hidden");
  refs.staffCardModal.classList.add("is-hidden");
  refs.staffCardModal.setAttribute("aria-hidden", "true");
}

function handleStaffCardClick(event) {
  const action = event.target.closest("[data-staff-card-action]")?.dataset.staffCardAction;
  if (action === "close") closeStaffCardModal();
}

function renderStaffCardModal() {
  refs.staffCardModal.innerHTML = `
    <div class="staff-card-header">
      <div>
        <p class="eyebrow">REPRESENTATIVE ID</p>
        <h2 id="staffCardTitle">대표 사원증</h2>
      </div>
      <button class="detail-close" data-staff-card-action="close" type="button" aria-label="사원증 닫기">×</button>
    </div>
    <div class="staff-card-layout">
      <article class="staff-id-card staff-id-vertical">
        <div class="staff-id-photo">
          <img src="./assets/avatars/ceo.jpg" alt="HAYEON 대표 사원증 사진">
        </div>
        <div class="staff-id-copy">
          <span>HA:YEON AI STUDIO</span>
          <strong>HAYEON</strong>
          <em>대표 · Founder</em>
          <p>AI 러닝 디렉터 / 신입직원 입문교육 사내강사 / 대학생 취업특강 강사</p>
          <small>HY-0001 · Since 2026</small>
        </div>
      </article>
      <article class="staff-id-card staff-id-horizontal">
        <div class="staff-id-photo">
          <img src="./assets/avatars/ceo.jpg" alt="HAYEON 대표 사원증 사진">
        </div>
        <div class="staff-id-copy">
          <span>5F 대표/관제 · 대표실</span>
          <strong>HAYEON</strong>
          <em>Founder</em>
          <p>사내 강사 활동, 강의 아카이브, AX-서포터즈 운영을 총괄합니다.</p>
          <small>AI Learning Director</small>
        </div>
      </article>
    </div>
  `;
}

function fillAssigneeOptions() {
  refs.taskAssigneeSelect.innerHTML = state.employees
    .map((employee) => `<option value="${employee.id}">${employee.name} · ${employee.role}</option>`)
    .join("");
}

function createDirectedTask(employeeId, formData, extra = {}) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return null;

  const task = makeTask({
    title,
    assigneeId: employeeId,
    status: "doing",
    priority: String(formData.get("priority") ?? "medium"),
    tags: normalizeTags(String(formData.get("tags") ?? "")),
    resultText: extra.resultText ?? "",
    resultError: extra.resultError ?? "",
  });

  state.tasks.unshift(task);
  setEmployeeForTask(employeeId, task.id, "working");
  state.detailMode = "summary";
  saveState();
  render();
  scheduleTaskSimulation(task.id);
  showToast(`${getEmployee(employeeId).name}에게 업무를 배정했습니다.`);
  return task;
}

function createBoardTask(formData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const assigneeId = String(formData.get("assigneeId") ?? state.employees[0].id);
  const task = makeTask({
    title,
    assigneeId,
    status: "todo",
    priority: String(formData.get("priority") ?? "medium"),
    dueDate: String(formData.get("dueDate") ?? ""),
    tags: normalizeTags(String(formData.get("tags") ?? "")),
  });

  state.tasks.unshift(task);
  setEmployeeForTask(assigneeId, null, "preparing");
  saveState();
  render();
  showToast("새 업무를 할 일판에 추가했습니다.");
}

function makeOrchestrationTaskForm(title) {
  const formData = new FormData();
  formData.set("title", title);
  formData.set("priority", "medium");
  formData.set("tags", "#오케스트레이션");
  return formData;
}

function createOrchestrationTask(employeeId, title, resultText = "", resultError = "") {
  const beforeCount = state.tasks.length;
  const task = createDirectedTask(employeeId, makeOrchestrationTaskForm(title), { resultText, resultError });
  return state.tasks.length > beforeCount ? task : null;
}

function applyOrchestrationUpdate(update) {
  upsertOrchestrationItem(update);
  saveState();
  renderOrchestrationProgress();
  renderOrchestrationBadge();
}

function rememberOrchestrationTask(task) {
  if (!task) return;
  state.orch.tasks = Array.isArray(state.orch.tasks) ? state.orch.tasks : [];
  if (state.orch.tasks.some((item) => item.id === task.id)) return;
  state.orch.tasks.push({
    id: task.id,
    title: task.title,
    assigneeId: task.assigneeId,
    status: task.status,
  });
}

function getOrderedOrchestrationItems() {
  return (state.orch.items ?? [])
    .filter((item) => !item.isSummary)
    .slice()
    .sort((a, b) => {
      const orderA = Number.isFinite(a.order) ? a.order : 999;
      const orderB = Number.isFinite(b.order) ? b.order : 999;
      return orderA - orderB;
    });
}

function buildOrchestrationContextBefore(key) {
  const rows = [];
  for (const item of getOrderedOrchestrationItems()) {
    if (item.key === key) break;
    if (item.status === "skipped") {
      rows.push(`- ${item.name}: 건너뜀`);
      continue;
    }
    if (item.status === "done" && item.text) {
      rows.push(`- ${item.name} / ${item.subtask}\n${item.text}`);
    }
    if (item.status === "error" && item.error) {
      rows.push(`- ${item.name} / ${item.subtask}\n오류: ${item.error}`);
    }
  }
  return rows.join("\n\n");
}

function buildSequentialOrchestrationPrompt(item) {
  const context = buildOrchestrationContextBefore(item.key);
  if (!context) return item.subtask;
  return [
    item.subtask,
    "",
    "[이전 단계 산출물]",
    context,
    "",
    "위 산출물을 참고하되, 당신의 역할에 맞는 결과만 정리해 주세요.",
  ].join("\n");
}

async function runQueuedOrchestrationItems({ onUpdate } = {}) {
  const orderedItems = getOrderedOrchestrationItems();
  for (const item of orderedItems) {
    if (item.status === "review") break;
    if (item.status !== "queued") continue;
    await executeOrchestrationItem(item, { onUpdate });
  }
}

async function executeOrchestrationItem(item, { onUpdate } = {}) {
  const employee = getEmployee(item.employeeId);
  if (!employee) return null;

  onUpdate?.({
    phase: "start",
    key: item.key,
    employee,
    subtask: item.subtask,
    needsReview: Boolean(item.needsReview),
  });
  setEmployeeForTask(employee.id, employee.currentTaskId ?? null, "working");
  saveState();
  render();
  showToast(`${employee.name}: 세부 업무 처리 중…`);

  try {
    const text = await requestEmployeeReply(employee, buildSequentialOrchestrationPrompt(item));
    const task = createOrchestrationTask(employee.id, item.subtask, text, "");
    rememberOrchestrationTask(task);
    onUpdate?.({
      phase: "done",
      key: item.key,
      employee,
      subtask: item.subtask,
      text,
      taskId: task?.id,
      needsReview: Boolean(item.needsReview),
    });
    return {
      key: item.key,
      employeeId: employee.id,
      employeeName: employee.name,
      role: employee.role,
      subtask: item.subtask,
      text,
    };
  } catch (err) {
    const error = err && err.message ? err.message : String(err);
    const task = createOrchestrationTask(employee.id, item.subtask, "", error);
    rememberOrchestrationTask(task);
    onUpdate?.({
      phase: "error",
      key: item.key,
      employee,
      subtask: item.subtask,
      error,
      taskId: task?.id,
      needsReview: Boolean(item.needsReview),
    });
    return {
      key: item.key,
      employeeId: employee.id,
      employeeName: employee.name,
      role: employee.role,
      subtask: item.subtask,
      text: "",
      error,
    };
  }
}

function hasPendingOrchestrationWork() {
  return (state.orch.items ?? [])
    .filter((item) => !item.isSummary)
    .some((item) => item.status === "review" || item.status === "queued" || item.status === "running");
}

function getSummaryEmployee() {
  return getEmployee("control-bot") ?? getEmployee("chief-assistant") ?? state.employees[0];
}

async function finishOrchestrationIfReady({ onUpdate } = {}) {
  const pendingReview = (state.orch.items ?? []).some((item) => !item.isSummary && item.status === "review");
  if (hasPendingOrchestrationWork()) {
    state.orch.running = false;
    saveState();
    renderOrchestrationProgress({ ...buildStoredOrchestrationResult(), pendingReview });
    renderOrchestrationResults({ ...buildStoredOrchestrationResult(), pendingReview });
    renderOrchestrationBadge();
    return { ...buildStoredOrchestrationResult(), pendingReview };
  }

  const baseResult = buildStoredOrchestrationResult();
  const summaryEmployee = getSummaryEmployee();
  let summary = state.orch.summary ?? "";
  let summaryError = state.orch.summaryError ?? "";

  if (!state.orch.completedAt && !summary && !summaryError && baseResult.results.length && summaryEmployee) {
    onUpdate?.({
      phase: "summary-start",
      key: "summary",
      employee: summaryEmployee,
      subtask: "직원별 산출물 종합 요약",
    });

    try {
      summary = await summarizeOrchestration(state.orch.goal, baseResult.results, state.employees);
      onUpdate?.({
        phase: "summary-done",
        key: "summary",
        employee: summaryEmployee,
        subtask: "직원별 산출물 종합 요약",
        text: summary,
      });
    } catch (err) {
      summaryError = err && err.message ? err.message : String(err);
      onUpdate?.({
        phase: "summary-error",
        key: "summary",
        employee: summaryEmployee,
        subtask: "직원별 산출물 종합 요약",
        error: summaryError,
      });
    }
  }

  const result = {
    ...buildStoredOrchestrationResult(),
    summary,
    summaryError,
  };
  syncOrchestrationResult(result);
  renderOrchestrationProgress(result);
  renderOrchestrationResults(result);
  renderOrchestrationBadge();
  return result;
}

async function runOrchestrationToBoard(goal, { onUpdate } = {}) {
  const cleanGoal = String(goal ?? "").trim();
  if (!cleanGoal) return { goal: cleanGoal, plan: [], results: [], tasks: [] };

  showToast("오케스트레이션 분배를 시작합니다.");
  const plan = await planTasks(cleanGoal, state.employees);

  plan.forEach((item, index) => {
    const employee = getEmployee(item.employeeId);
    if (!employee) return;
    onUpdate?.({
      phase: item.needsReview ? "review" : "queued",
      key: `${item.employeeId}#${index}`,
      employee,
      subtask: item.subtask,
      order: index,
      needsReview: Boolean(item.needsReview),
    });
  });

  await runQueuedOrchestrationItems({ onUpdate });

  const result = await finishOrchestrationIfReady({ onUpdate });
  const reviewCount = (state.orch.items ?? []).filter((item) => !item.isSummary && item.status === "review").length;
  if (reviewCount) {
    showToast(`검토 필요 업무 ${reviewCount}개가 대기 중입니다.`);
  } else {
    showToast(`오케스트레이션 업무 ${(result.tasks ?? []).length}개를 할 일판에 등록했습니다.`);
  }
  return { ...result, plan };
}

function makeTask({ title, assigneeId, status, priority, dueDate = "", tags = [], resultText = "", resultError = "" }) {
  return {
    id: `task-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    title,
    assigneeId,
    status,
    priority,
    dueDate,
    tags,
    resultText,
    resultError,
    createdAt: new Date().toISOString(),
  };
}

function updateTaskStatus(taskId, status) {
  if (!taskColumns.some((column) => column.id === status)) return;
  const task = getTask(taskId);
  if (!task) return;

  task.status = status;
  const employee = getEmployee(task.assigneeId);
  if (employee) {
    if (status === "doing") setEmployeeForTask(employee.id, task.id, "working");
    if (status === "todo") setEmployeeForTask(employee.id, null, "preparing");
    if (status === "review") setEmployeeForTask(employee.id, task.id, "review");
    if (status === "done") completeEmployeeTask(employee.id, task);
  }

  if (status === "doing") scheduleTaskSimulation(task.id);
  saveState();
  render();
}

function deleteTask(taskId) {
  const task = getTask(taskId);
  state.tasks = state.tasks.filter((item) => item.id !== taskId);
  pendingTimers.delete(taskId);

  const employee = task ? getEmployee(task.assigneeId) : null;
  if (employee?.currentTaskId === taskId) {
    employee.currentTaskId = null;
    employee.status = "idle";
  }

  saveState();
  render();
  showToast("업무를 삭제했습니다.");
}

function selectTaskAssignee(taskId) {
  const task = getTask(taskId);
  if (!task) return;
  state.selectedEmployeeId = task.assigneeId;
  state.detailMode = "summary";
  saveState();
  renderEmployeeDetail();
}

function scheduleTaskSimulation(taskId) {
  if (pendingTimers.has(taskId)) clearTimeout(pendingTimers.get(taskId));
  const delay = 9_000 + Math.floor(Math.random() * 6_000);
  const timerId = setTimeout(() => {
    const task = getTask(taskId);
    if (!task || task.status !== "doing") return;

    const shouldReview = task.priority === "high" || Math.random() > 0.55;
    updateTaskStatus(taskId, shouldReview ? "review" : "done");
    showToast(
      shouldReview
        ? `"${task.title}" 업무가 검토 단계로 이동했습니다.`
        : `"${task.title}" 업무가 완료되었습니다.`,
    );
    pendingTimers.delete(taskId);
  }, delay);
  pendingTimers.set(taskId, timerId);
}

function setEmployeeForTask(employeeId, taskId, status) {
  const employee = getEmployee(employeeId);
  if (!employee) return;
  employee.currentTaskId = taskId;
  employee.status = status;
}

function setEmployeeStatus(employeeId, status) {
  const employee = getEmployee(employeeId);
  if (!employee || !statusMeta[status]) return;
  employee.status = status;
  if (status === "idle") employee.currentTaskId = null;
  saveState();
  render();
}

function completeEmployeeTask(employeeId, task) {
  const employee = getEmployee(employeeId);
  if (!employee) return;
  employee.currentTaskId = null;
  employee.status = "idle";
  employee.recentCompleted = [task.title, ...(employee.recentCompleted ?? [])].slice(0, 5);
}

function normalizeTags(input) {
  return input
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .slice(0, 4);
}

function getSelectedEmployee() {
  return getEmployee(state.selectedEmployeeId);
}

function getEmployee(employeeId) {
  return state.employees.find((employee) => employee.id === employeeId);
}

function getDepartmentName(departmentId) {
  return rooms.find((item) => item.id === departmentId)?.name ?? "-";
}

function getFloor(floorId) {
  return floors.find((floor) => floor.id === floorId);
}

function getSelectedFloor() {
  return getFloor(state.selectedFloorId);
}

function getRoom(roomId) {
  return rooms.find((room) => room.id === roomId);
}

function getEmployeeRoomId(employee) {
  return employee.roomId ?? employee.departmentId;
}

function getEmployeeFloorId(employee) {
  return employee.floorId ?? getRoom(getEmployeeRoomId(employee))?.floorId ?? "floor-1";
}

function getFloorEmployees(floorId) {
  return state.employees.filter((employee) => getEmployeeFloorId(employee) === floorId);
}

function getFloorTaskCount(floorId) {
  const floorEmployeeIds = new Set(getFloorEmployees(floorId).map((employee) => employee.id));
  return state.tasks.filter((task) => floorEmployeeIds.has(task.assigneeId)).length;
}

function getFloorDetailRooms(floorId) {
  const floor = getFloor(floorId);
  if (!floor) return [];

  const floorRooms = floor.roomIds.map(getRoom).filter(Boolean);
  if (floor.id !== "floor-1") return floorRooms;

  return [...floorRooms, getLobbyDetailRoom()];
}

function getLobbyDetailRoom() {
  return {
    id: "lobby",
    name: "HA:YEON AI STUDIO 로비",
    category: "로비",
    shortName: "로비",
    mission: "방문자 안내와 층별 이동을 돕는 공용 입구입니다.",
    shortDesc: "리셉션 · 안내",
    layoutArea: "lobby",
    size: "lounge",
    accent: "gold",
    floorId: "floor-1",
    doorPosition: "top-left",
    decorItems: [
      { type: "desk", x: 30, y: 68, size: "medium" },
      { type: "namePlate", x: 33, y: 42, size: "small" },
      { type: "sofa", x: 70, y: 63, size: "medium" },
      { type: "roundTable", x: 62, y: 76, size: "small" },
      { type: "plant", x: 88, y: 74, size: "small" },
    ],
  };
}

function getTask(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function getStatusMessage(employee) {
  const customMessages = employee.messages?.[employee.status];
  if (customMessages?.length) return customMessages[bubbleTick % customMessages.length];

  const currentTask = employee.currentTaskId ? getTask(employee.currentTaskId) : null;
  const taskText = `${currentTask?.title ?? ""} ${employee.role}`;

  const roleMessage =
    taskText.includes("PPT") || taskText.includes("슬라이드")
      ? "PPT 정리 중"
      : taskText.includes("AX")
        ? "보고서 초안"
        : taskText.includes("후기") || taskText.includes("아카이브")
          ? "기록 정리 중"
          : taskText.includes("강의")
            ? "흐름 정리"
            : "정리 중";

  const messagesByStatus = {
    working: [roleMessage, "처리 중…", "초안 작성 중"],
    preparing: ["준비 중", "검토할게요", "자료 보는 중"],
    idle: ["대기 중", "다음 업무?", "커피 타임"],
    review: ["확인 필요", "검토 요청", "점검 중"],
  };

  const messages = messagesByStatus[employee.status] ?? ["정리 중"];
  return messages[bubbleTick % messages.length];
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  refs.toastStack.append(toast);
  setTimeout(() => toast.remove(), 4_000);
}

// ── OfficeMapV2 ─────────────────────────────────────────────
// CSS Grid 기반 세로형 오피스 보드 렌더러
// 기존 .room 대신 .v2-room 클래스를 사용해 styles-v2.css 와 연동

function renderDepartmentsV2() {
  const V2_ROOM_ORDER = [
    "ceo", "lecture-planning", "operation",
    "control", "ax-supporters", "app-dev",
    "content", "archive", "automation",
    "meeting", "lounge",
  ];
  const orderedRooms = V2_ROOM_ORDER
    .map((id) => rooms.find((r) => r.id === id))
    .filter(Boolean);
  refs.departments.className = "department-grid";
  refs.departments.removeAttribute("data-floor-id");
  refs.departments.setAttribute("aria-label", "전체 AI 오피스 맵");
  refs.departments.innerHTML = orderedRooms.map(renderRoomV2).join("");
}

function renderFloorDetailDepartments() {
  const floor = getSelectedFloor();
  const floorRooms = getFloorDetailRooms(floor?.id);
  if (!floor || !floorRooms.length) {
    renderDepartmentsV2();
    return;
  }

  refs.departments.className = `department-grid floor-detail-grid floor-detail-${floor.id}`;
  refs.departments.dataset.floorId = floor.id;
  refs.departments.setAttribute("aria-label", `${floor.name} 내부 사무실`);
  refs.departments.innerHTML = floorRooms
    .map((room, index) => renderRoomV2(room, { isFloorDetail: true, detailIndex: index }))
    .join("");
}

function renderRoomV2(room, options = {}) {
  const roomEmployees = state.employees.filter(
    (emp) => getEmployeeRoomId(emp) === room.id,
  );
  const roomTaskCount = state.tasks.filter((task) =>
    roomEmployees.some((emp) => emp.id === task.assigneeId),
  ).length;
  const detailClass = options.isFloorDetail ? "floor-detail-room is-floor-active" : "";

  return `
    <article
      class="v2-room v2-room-${room.id} accent-${room.accent} ${detailClass}"
      data-floor-id="${room.floorId}"
      style="--detail-index: ${options.detailIndex ?? 0}"
    >
      <header class="room-header">
        <div>
          <p class="room-kicker">${escapeHtml(room.shortName)}</p>
          <h3>${escapeHtml(room.name)}</h3>
        </div>
        <div class="room-meta">
          <span class="room-task-count">${getRoomBadge(room, roomEmployees, roomTaskCount)}</span>
          <span class="room-light" aria-hidden="true"></span>
        </div>
      </header>
      ${renderRoomDecor(room)}
      <span class="room-short-desc">${escapeHtml(room.shortDesc)}</span>
      <span class="room-door door-${room.doorPosition ?? "bottom-left"}" aria-hidden="true"></span>
      <div class="room-interior">
        ${roomEmployees.map((emp, i) => renderEmployeeToken(emp, i)).join("")}
      </div>
    </article>
  `;
}
})();
