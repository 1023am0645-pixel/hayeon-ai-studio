export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/agent")) {
      return handleAgentRoute(request, env, url);
    }
    if (url.pathname.startsWith("/api/automation")) {
      return handleAutomationRoute(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};

const agentModel = "@cf/meta/llama-3.1-8b-instruct-fp8";

async function handleAgentRoute(request, env, url) {
  if (request.method !== "POST") {
    return agentError("method_not_allowed", 405);
  }

  const context = validateApiRequest(request, env);
  if (context.error) return context.error;

  let body;
  try { body = await request.json(); } catch { return agentError("bad_json", 400, context.requestId); }

  const routeModes = {
    "/api/agent": "auto",
    "/api/agent/reply": "reply",
    "/api/agent/plan": "plan",
    "/api/agent/summarize": "summarize",
  };
  const mode = routeModes[url.pathname];
  if (!mode) return agentError("not_found", 404, context.requestId);

  return runAgent(body, env, { mode, requestId: context.requestId });
}

async function handleAutomationRoute(request, env, url) {
  const context = validateApiRequest(request, env);
  if (context.error) return context.error;

  if (url.pathname === "/api/automation/health" && request.method === "GET") {
    return json({
      ok: true,
      text: "",
      data: {
        storage: env.AGENT_DB ? "d1" : "missing",
        binding: "AGENT_DB",
        schema: "migrations/0001_agent_automation.sql",
      },
      requestId: context.requestId,
    });
  }

  if (!env.AGENT_DB) {
    return agentError("agent_db_missing", 503, context.requestId, "Cloudflare D1 binding AGENT_DB is not configured.");
  }

  try {
    if (url.pathname === "/api/automation/runs" && request.method === "POST") {
      const body = await parseJsonBody(request, context.requestId);
      if (body instanceof Response) return body;
      return createAutomationRun(env.AGENT_DB, body, context.requestId);
    }

    const runItemMatch = url.pathname.match(/^\/api\/automation\/runs\/([^/]+)\/items$/);
    if (runItemMatch && request.method === "POST") {
      const body = await parseJsonBody(request, context.requestId);
      if (body instanceof Response) return body;
      return upsertAutomationRunItem(env.AGENT_DB, runItemMatch[1], body, context.requestId);
    }

    const runMatch = url.pathname.match(/^\/api\/automation\/runs\/([^/]+)$/);
    if (runMatch) {
      if (request.method === "GET") {
        return getAutomationRun(env.AGENT_DB, runMatch[1], context.requestId);
      }
      if (request.method === "PATCH") {
        const body = await parseJsonBody(request, context.requestId);
        if (body instanceof Response) return body;
        return updateAutomationRun(env.AGENT_DB, runMatch[1], body, context.requestId);
      }
    }
  } catch (error) {
    return agentError("automation_failed", 500, context.requestId, String(error).slice(0, 240));
  }

  return agentError(request.method === "GET" || request.method === "POST" ? "not_found" : "method_not_allowed", request.method === "GET" || request.method === "POST" ? 404 : 405, context.requestId);
}

function validateApiRequest(request, env) {
  const requestId = crypto.randomUUID();
  const host = new URL(request.url).host;
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).host !== host) {
        return { requestId, error: agentError("forbidden", 403, requestId) };
      }
    } catch {
      return { requestId, error: agentError("bad_origin", 403, requestId) };
    }
  }
  if (env.ADMIN_TOKEN) {
    const provided = request.headers.get("X-Admin-Token") ?? "";
    if (provided !== env.ADMIN_TOKEN) {
      return { requestId, error: agentError("unauthorized", 401, requestId) };
    }
  }

  return { requestId };
}

async function parseJsonBody(request, requestId) {
  try {
    return await request.json();
  } catch {
    return agentError("bad_json", 400, requestId);
  }
}

async function runAgent(body, env, { mode, requestId }) {
  const system = typeof body.system === "string" ? body.system.slice(0, 4000) : "";
  const user = typeof body.user === "string" ? body.user.trim() : "";
  if (!user || user.length > inputLimitForMode(mode)) {
    return agentError("bad_input", 400, requestId);
  }
  if (!env.AI) {
    return agentError("ai_binding_missing", 500, requestId);
  }

  const effectiveMode = mode === "auto" ? detectAgentMode(system) : mode;
  const effectiveSystem = buildEffectiveSystem(system, effectiveMode);

  try {
    const r = await env.AI.run(agentModel, {
      messages: [
        ...(effectiveSystem ? [{ role: "system", content: effectiveSystem }] : []),
        { role: "user", content: user },
      ],
      max_tokens: maxTokensForMode(effectiveMode),
    });
    return json({ ok: true, text: r.response ?? "", data: null, requestId });
  } catch (e) {
    return agentError("ai_failed", 502, requestId, String(e).slice(0, 200));
  }
}

function detectAgentMode(system) {
  if (system.includes("반드시 JSON 배열만 출력") || system.includes('"employeeId"')) return "plan";
  if (system.includes("직원별 산출물을 종합")) return "summarize";
  return "reply";
}

function buildEffectiveSystem(system, mode) {
  if (mode === "plan") return system;

  const replyBrevityRule = [
    "",
    "",
    "[출력 형식 규칙]",
    "한국어로 핵심만 답한다.",
    "불릿 3~5개, 각 항목은 한 줄과 최대 한 문장으로 제한한다.",
    "서론·결론·일반론·표·장문 설명은 쓰지 않는다.",
    "전체 8줄 이내로 작성한다.",
  ].join("\n");

  const summaryRule = [
    "",
    "",
    "[요약 출력 규칙]",
    "전체 10줄 이내로 제한한다.",
    "누락 위험, 다음 액션, 검토 필요 항목을 우선한다.",
  ].join("\n");

  if (mode === "summarize") return `${system}${summaryRule}`;
  return `${system}${replyBrevityRule}`;
}

function maxTokensForMode(mode) {
  if (mode === "plan") return 700;
  if (mode === "summarize") return 520;
  return 380;
}

function inputLimitForMode(mode) {
  if (mode === "summarize") return 7000;
  return 2000;
}

async function createAutomationRun(db, body, requestId) {
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  if (!goal || goal.length > 2000) return agentError("bad_goal", 400, requestId);

  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim().slice(0, 120) : crypto.randomUUID();
  const source = typeof body.source === "string" && body.source.trim() ? body.source.trim().slice(0, 80) : "manual";
  const status = normalizeRunStatus(body.status, "queued");
  const metadata = stringifyMetadata(body.metadata);
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO agent_runs (id, goal, status, source, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, goal, status, source, metadata, now, now).run();

  return json({
    ok: true,
    text: "",
    data: {
      run: { id, goal, status, source, metadata: JSON.parse(metadata), createdAt: now, updatedAt: now },
    },
    requestId,
  }, 201);
}

async function updateAutomationRun(db, runId, body, requestId) {
  const id = normalizeId(runId, 120);
  if (!id) return agentError("bad_run_id", 400, requestId);

  const current = await db.prepare("SELECT * FROM agent_runs WHERE id = ?").bind(id).first();
  if (!current) return agentError("run_not_found", 404, requestId);

  const status = normalizeRunStatus(body.status, current.status);
  const summary = nullableString(body.summary, current.summary, 50000);
  const summaryError = nullableString(body.summaryError, current.summary_error, 12000);
  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
    ? stringifyMetadata(body.metadata)
    : current.metadata_json;
  const now = new Date().toISOString();
  const startedAt = nullableString(body.startedAt, current.started_at, 80);
  const completedAt = nullableString(body.completedAt, current.completed_at, 80);

  await db.prepare(`
    UPDATE agent_runs
    SET status = ?, summary = ?, summary_error = ?, metadata_json = ?, updated_at = ?, started_at = ?, completed_at = ?
    WHERE id = ?
  `).bind(status, summary, summaryError, metadata, now, startedAt, completedAt, id).run();

  return json({
    ok: true,
    text: "",
    data: {
      run: { id, status, summary, summaryError, metadata: safeJsonParse(metadata), updatedAt: now, startedAt, completedAt },
    },
    requestId,
  });
}

async function upsertAutomationRunItem(db, runId, body, requestId) {
  const normalizedRunId = normalizeId(runId, 120);
  if (!normalizedRunId) return agentError("bad_run_id", 400, requestId);

  const key = normalizeId(body.id ?? body.key, 120) || crypto.randomUUID();
  const id = `${normalizedRunId}:${key}`.slice(0, 180);
  const employeeId = normalizeId(body.employeeId, 120);
  const subtask = typeof body.subtask === "string" ? body.subtask.trim().slice(0, 4000) : "";
  if (!employeeId || !subtask) return agentError("bad_item", 400, requestId);

  const employeeName = nullableString(body.employeeName ?? body.name, "", 200);
  const role = nullableString(body.role, "", 400);
  const status = normalizeItemStatus(body.status, "queued");
  const needsReview = body.needsReview === true ? 1 : 0;
  const resultText = nullableString(body.resultText ?? body.text, "", 50000);
  const errorText = nullableString(body.errorText ?? body.error, "", 12000);
  const reviewNote = nullableString(body.reviewNote, "", 12000);
  const sortOrder = Number.isFinite(Number(body.sortOrder ?? body.order)) ? Number(body.sortOrder ?? body.order) : 0;
  const metadata = stringifyMetadata(body.metadata);
  const now = new Date().toISOString();
  const startedAt = nullableString(body.startedAt, null, 80);
  const completedAt = nullableString(body.completedAt, null, 80);

  await db.prepare(`
    INSERT INTO agent_run_items (
      id, run_id, employee_id, employee_name, role, subtask, status, needs_review,
      result_text, error_text, review_note, sort_order, metadata_json, created_at,
      updated_at, started_at, completed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      employee_id = excluded.employee_id,
      employee_name = excluded.employee_name,
      role = excluded.role,
      subtask = excluded.subtask,
      status = excluded.status,
      needs_review = excluded.needs_review,
      result_text = excluded.result_text,
      error_text = excluded.error_text,
      review_note = excluded.review_note,
      sort_order = excluded.sort_order,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at,
      started_at = COALESCE(excluded.started_at, agent_run_items.started_at),
      completed_at = COALESCE(excluded.completed_at, agent_run_items.completed_at)
  `).bind(
    id,
    normalizedRunId,
    employeeId,
    employeeName,
    role,
    subtask,
    status,
    needsReview,
    resultText,
    errorText,
    reviewNote,
    sortOrder,
    metadata,
    now,
    now,
    startedAt,
    completedAt,
  ).run();

  return json({
    ok: true,
    text: "",
    data: { item: { id, runId: normalizedRunId, key, employeeId, status, needsReview: Boolean(needsReview), updatedAt: now } },
    requestId,
  });
}

async function getAutomationRun(db, runId, requestId) {
  const id = String(runId ?? "").trim().slice(0, 120);
  if (!id) return agentError("bad_run_id", 400, requestId);

  const run = await db.prepare("SELECT * FROM agent_runs WHERE id = ?").bind(id).first();
  if (!run) return agentError("run_not_found", 404, requestId);

  const items = await db.prepare(`
    SELECT * FROM agent_run_items
    WHERE run_id = ?
    ORDER BY sort_order ASC, created_at ASC
  `).bind(id).all();
  const artifacts = await db.prepare(`
    SELECT * FROM artifacts
    WHERE run_id = ?
    ORDER BY created_at ASC
  `).bind(id).all();

  return json({
    ok: true,
    text: "",
    data: {
      run,
      items: items.results ?? [],
      artifacts: artifacts.results ?? [],
    },
    requestId,
  });
}

function stringifyMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "{}";
  const text = JSON.stringify(metadata);
  if (text.length <= 4000) return text;
  return JSON.stringify({ truncated: true });
}

function normalizeId(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function nullableString(value, fallback = "", maxLength = 4000) {
  if (value === null) return null;
  if (typeof value === "undefined") return fallback;
  return String(value).slice(0, maxLength);
}

function normalizeRunStatus(value, fallback = "queued") {
  const allowed = new Set(["queued", "running", "review", "done", "error", "cancelled"]);
  const status = String(value ?? "").trim();
  return allowed.has(status) ? status : fallback;
}

function normalizeItemStatus(value, fallback = "queued") {
  const allowed = new Set(["queued", "running", "review", "done", "error", "skipped"]);
  const status = String(value ?? "").trim();
  return allowed.has(status) ? status : fallback;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

function agentError(error, status, requestId = crypto.randomUUID(), detail = "") {
  return json({ ok: false, text: "", data: null, error, detail, requestId }, status);
}
