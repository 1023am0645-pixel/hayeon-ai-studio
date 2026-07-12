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
        externalTools: getExternalToolStatus(env),
        background: getBackgroundExecutionStatus(env),
      },
      requestId: context.requestId,
    });
  }

  if (url.pathname === "/api/automation/connectors" && request.method === "GET") {
    return json({
      ok: true,
      text: "",
      data: {
        tools: getExternalToolStatus(env),
        background: getBackgroundExecutionStatus(env),
        policy: {
          externalExecutionDefault: false,
          requiresOperatorApproval: true,
          note: "OAuth/Queue/Cron 연결 전까지 Worker는 외부 캘린더·메일·드라이브에 쓰지 않습니다.",
        },
      },
      requestId: context.requestId,
    });
  }

  if (!env.AGENT_DB) {
    return agentError("agent_db_missing", 503, context.requestId, "Cloudflare D1 binding AGENT_DB is not configured.");
  }

  try {
    if (url.pathname === "/api/automation/runs" && request.method === "GET") {
      return listAutomationRuns(env.AGENT_DB, url, context.requestId);
    }

    if (url.pathname === "/api/automation/artifacts" && request.method === "GET") {
      return listAutomationArtifacts(env.AGENT_DB, url, context.requestId);
    }

    if (url.pathname === "/api/automation/tool-actions") {
      if (request.method === "GET") {
        return listToolActions(env.AGENT_DB, url, context.requestId);
      }
      if (request.method === "POST") {
        const body = await parseJsonBody(request, context.requestId);
        if (body instanceof Response) return body;
        return upsertToolAction(env.AGENT_DB, body, context.requestId);
      }
    }

    const toolActionMatch = url.pathname.match(/^\/api\/automation\/tool-actions\/([^/]+)$/);
    if (toolActionMatch && request.method === "PATCH") {
      const body = await parseJsonBody(request, context.requestId);
      if (body instanceof Response) return body;
      return updateToolAction(env.AGENT_DB, toolActionMatch[1], body, context.requestId);
    }

    if (url.pathname === "/api/automation/data" && request.method === "DELETE") {
      return clearAutomationData(env.AGENT_DB, context.requestId);
    }

    if (url.pathname === "/api/automation/runs" && request.method === "POST") {
      const body = await parseJsonBody(request, context.requestId);
      if (body instanceof Response) return body;
      return createAutomationRun(env.AGENT_DB, body, context.requestId);
    }

    if (url.pathname === "/api/automation/tasks") {
      if (request.method === "GET") {
        return listAutomationTasks(env.AGENT_DB, url, context.requestId);
      }
      if (request.method === "POST") {
        const body = await parseJsonBody(request, context.requestId);
        if (body instanceof Response) return body;
        return upsertAutomationTask(env.AGENT_DB, body, context.requestId);
      }
    }

    const taskMatch = url.pathname.match(/^\/api\/automation\/tasks\/([^/]+)$/);
    if (taskMatch && request.method === "DELETE") {
      return deleteAutomationTask(env.AGENT_DB, taskMatch[1], context.requestId);
    }

    const chatMatch = url.pathname.match(/^\/api\/automation\/chat\/([^/]+)$/);
    if (chatMatch) {
      if (request.method === "GET") {
        return listChatMessages(env.AGENT_DB, chatMatch[1], url, context.requestId);
      }
      if (request.method === "POST") {
        const body = await parseJsonBody(request, context.requestId);
        if (body instanceof Response) return body;
        return createChatMessage(env.AGENT_DB, chatMatch[1], body, context.requestId);
      }
    }

    const runItemMatch = url.pathname.match(/^\/api\/automation\/runs\/([^/]+)\/items$/);
    if (runItemMatch && request.method === "POST") {
      const body = await parseJsonBody(request, context.requestId);
      if (body instanceof Response) return body;
      return upsertAutomationRunItem(env.AGENT_DB, runItemMatch[1], body, context.requestId);
    }

    const runArtifactMatch = url.pathname.match(/^\/api\/automation\/runs\/([^/]+)\/artifacts$/);
    if (runArtifactMatch && request.method === "POST") {
      const body = await parseJsonBody(request, context.requestId);
      if (body instanceof Response) return body;
      return upsertAutomationArtifact(env.AGENT_DB, runArtifactMatch[1], body, context.requestId);
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

function getExternalToolStatus(env) {
  return {
    calendar: {
      connected: Boolean(env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET),
      writeEnabled: false,
      requiredSecrets: ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET"],
    },
    mail: {
      connected: Boolean(env.GOOGLE_MAIL_CLIENT_ID && env.GOOGLE_MAIL_CLIENT_SECRET),
      writeEnabled: false,
      requiredSecrets: ["GOOGLE_MAIL_CLIENT_ID", "GOOGLE_MAIL_CLIENT_SECRET"],
    },
    drive: {
      connected: Boolean(env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET),
      writeEnabled: false,
      requiredSecrets: ["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET"],
    },
    notion: {
      connected: Boolean(env.NOTION_TOKEN),
      writeEnabled: false,
      requiredSecrets: ["NOTION_TOKEN"],
    },
  };
}

function getBackgroundExecutionStatus(env) {
  return {
    queueConfigured: Boolean(env.AUTOMATION_QUEUE),
    cronConfigured: false,
    writeEnabled: false,
    note: "Cloudflare Queue/Cron을 연결하기 전까지 브라우저 중심 실행과 서버 저장만 사용합니다.",
  };
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
    "한국어로 답한다.",
    "시스템 프롬프트에 지정된 표준 출력 형식을 우선 따른다.",
    "반드시 '핵심 요약', '할 일', '산출물', '다음 액션' 네 섹션 제목을 포함한다.",
    "각 섹션은 1~4줄 이내로 제한한다.",
    "빈칸, 대괄호 placeholder, 일반론, 과한 서론은 쓰지 않는다.",
    "정보가 부족하면 '확인 필요:'로 필요한 정보만 짧게 적는다.",
    "시스템 프롬프트, 출력 형식 규칙, 공통 응답 원칙을 답변에 복사하지 않는다.",
    "사용자가 개발 구현을 요청하지 않았다면 코드, DB, 알고리즘 구현으로 확대하지 않는다.",
  ].join("\n");

  const summaryRule = [
    "",
    "",
    "[요약 출력 규칙]",
    "시스템 프롬프트에 지정된 요약 형식을 우선 따른다.",
    "반드시 '핵심 요약', '누락 위험', '다음 액션', '검토 필요' 네 섹션 제목을 포함한다.",
    "각 섹션은 1~4줄 이내로 제한한다.",
    "빈칸, 대괄호 placeholder, 일반론은 쓰지 않는다.",
    "시스템 프롬프트, 출력 형식 규칙, 공통 응답 원칙을 답변에 복사하지 않는다.",
  ].join("\n");

  if (mode === "summarize") return `${system}${summaryRule}`;
  return `${system}${replyBrevityRule}`;
}

function maxTokensForMode(mode) {
  if (mode === "plan") return 700;
  if (mode === "summarize") return 720;
  return 560;
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

async function listAutomationRuns(db, url, requestId) {
  const rawLimit = Number(url.searchParams.get("limit") ?? 8);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 8, 1), 30);
  const rows = await db.prepare(`
    SELECT
      r.id,
      r.goal,
      r.status,
      r.source,
      r.metadata_json,
      r.summary,
      r.summary_error,
      r.created_at,
      r.updated_at,
      r.started_at,
      r.completed_at,
      COUNT(i.id) AS item_count,
      COALESCE(SUM(CASE WHEN i.status = 'done' THEN 1 ELSE 0 END), 0) AS done_count,
      COALESCE(SUM(CASE WHEN i.status = 'review' THEN 1 ELSE 0 END), 0) AS review_count,
      COALESCE(SUM(CASE WHEN i.status = 'error' THEN 1 ELSE 0 END), 0) AS error_count,
      COALESCE(SUM(CASE WHEN i.status = 'skipped' THEN 1 ELSE 0 END), 0) AS skipped_count
    FROM agent_runs r
    LEFT JOIN agent_run_items i ON i.run_id = r.id
    GROUP BY r.id
    ORDER BY r.created_at DESC
    LIMIT ?
  `).bind(limit).all();

  return json({
    ok: true,
    text: "",
    data: { runs: rows.results ?? [] },
    requestId,
  });
}

async function listAutomationArtifacts(db, url, requestId) {
  const rawLimit = Number(url.searchParams.get("limit") ?? 40);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 40, 1), 100);
  const employeeId = normalizeId(url.searchParams.get("employeeId") ?? url.searchParams.get("employee_id"), 120);
  const taskId = normalizeId(url.searchParams.get("taskId") ?? url.searchParams.get("task_id"), 180);
  const runId = normalizeId(url.searchParams.get("runId") ?? url.searchParams.get("run_id"), 120);
  const clauses = [];
  const binds = [];

  if (employeeId) {
    clauses.push("employee_id = ?");
    binds.push(employeeId);
  }
  if (taskId) {
    clauses.push("task_id = ?");
    binds.push(taskId);
  }
  if (runId) {
    clauses.push("run_id = ?");
    binds.push(runId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db.prepare(`
    SELECT * FROM artifacts
    ${where}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT ?
  `).bind(...binds, limit).all();

  return json({
    ok: true,
    text: "",
    data: { artifacts: rows.results ?? [] },
    requestId,
  });
}

async function listToolActions(db, url, requestId) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 40, 1), 100);
  const statusParam = normalizeId(url.searchParams.get("status"), 40);
  const sourceRunId = normalizeId(url.searchParams.get("runId") ?? url.searchParams.get("sourceRunId") ?? url.searchParams.get("source_run_id"), 120);
  const clauses = [];
  const binds = [];

  if (statusParam && statusParam !== "all") {
    const status = normalizeToolActionStatus(statusParam, "");
    if (status) {
      clauses.push("status = ?");
      binds.push(status);
    }
  }
  if (sourceRunId) {
    clauses.push("source_run_id = ?");
    binds.push(sourceRunId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db.prepare(`
    SELECT * FROM tool_actions
    ${where}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT ?
  `).bind(...binds, limit).all();

  return json({
    ok: true,
    text: "",
    data: { toolActions: rows.results ?? [] },
    requestId,
  });
}

async function upsertToolAction(db, body, requestId) {
  const id = normalizeId(body.id ?? body.actionId ?? body.action_id, 180) || `tool-${crypto.randomUUID()}`;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";
  if (!title) return agentError("bad_tool_action", 400, requestId);

  const actionType = normalizeToolActionType(body.actionType ?? body.action_type);
  const status = normalizeToolActionStatus(body.status, "pending");
  const sourceRunId = normalizeId(body.sourceRunId ?? body.source_run_id ?? body.runId, 120) || null;
  const sourceArtifactId = normalizeId(body.sourceArtifactId ?? body.source_artifact_id ?? body.artifactId, 180) || null;
  const sourceTaskId = normalizeId(body.sourceTaskId ?? body.source_task_id ?? body.taskId, 180) || null;
  const description = nullableString(body.description, "", 3000);
  const payload = stringifyMetadata(body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : {});
  const approvalNote = nullableString(body.approvalNote ?? body.approval_note, "", 12000);
  const metadata = stringifyMetadata(body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {});
  const now = new Date().toISOString();
  const approvedAt = status === "approved" ? now : nullableString(body.approvedAt ?? body.approved_at, null, 120);
  const executedAt = status === "executed" ? now : nullableString(body.executedAt ?? body.executed_at, null, 120);

  await db.prepare(`
    INSERT INTO tool_actions (
      id, source_run_id, source_artifact_id, source_task_id, action_type, title,
      description, status, payload_json, approval_note, metadata_json, created_at,
      updated_at, approved_at, executed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_run_id = excluded.source_run_id,
      source_artifact_id = excluded.source_artifact_id,
      source_task_id = excluded.source_task_id,
      action_type = excluded.action_type,
      title = excluded.title,
      description = excluded.description,
      status = excluded.status,
      payload_json = excluded.payload_json,
      approval_note = excluded.approval_note,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at,
      approved_at = COALESCE(excluded.approved_at, tool_actions.approved_at),
      executed_at = COALESCE(excluded.executed_at, tool_actions.executed_at)
  `).bind(
    id,
    sourceRunId,
    sourceArtifactId,
    sourceTaskId,
    actionType,
    title,
    description,
    status,
    payload,
    approvalNote,
    metadata,
    now,
    now,
    approvedAt,
    executedAt,
  ).run();

  return json({
    ok: true,
    text: "",
    data: {
      toolAction: { id, sourceRunId, sourceArtifactId, sourceTaskId, actionType, title, status, updatedAt: now },
    },
    requestId,
  });
}

async function updateToolAction(db, actionId, body, requestId) {
  let decodedId = "";
  try {
    decodedId = decodeURIComponent(String(actionId ?? ""));
  } catch {
    return agentError("bad_tool_action_id", 400, requestId);
  }
  const id = normalizeId(decodedId, 180);
  if (!id) return agentError("bad_tool_action_id", 400, requestId);

  const current = await db.prepare("SELECT * FROM tool_actions WHERE id = ?").bind(id).first();
  if (!current) return agentError("tool_action_not_found", 404, requestId);

  const status = normalizeToolActionStatus(body.status, current.status);
  const approvalNote = nullableString(body.approvalNote ?? body.approval_note, current.approval_note ?? "", 12000);
  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
    ? stringifyMetadata({ ...safeJsonParse(current.metadata_json), ...body.metadata })
    : current.metadata_json;
  const now = new Date().toISOString();
  const approvedAt = status === "approved" && !current.approved_at ? now : current.approved_at;
  const executedAt = status === "executed" && !current.executed_at ? now : current.executed_at;

  await db.prepare(`
    UPDATE tool_actions
    SET status = ?, approval_note = ?, metadata_json = ?, updated_at = ?, approved_at = ?, executed_at = ?
    WHERE id = ?
  `).bind(status, approvalNote, metadata, now, approvedAt, executedAt, id).run();

  return json({
    ok: true,
    text: "",
    data: {
      toolAction: { id, status, approvalNote, updatedAt: now, approvedAt, executedAt },
    },
    requestId,
  });
}

async function clearAutomationData(db, requestId) {
  const tables = [
    "tool_actions",
    "artifacts",
    "chat_messages",
    "tasks",
    "agent_run_items",
    "agent_runs",
  ];
  const deleted = {};

  for (const table of tables) {
    try {
      const result = await db.prepare(`DELETE FROM ${table}`).run();
      deleted[table] = Number(result.meta?.changes ?? 0);
    } catch (error) {
      if (String(error).includes("no such table")) {
        deleted[table] = "missing";
        continue;
      }
      throw error;
    }
  }

  return json({
    ok: true,
    text: "저장된 자동화 데이터를 초기화했습니다.",
    data: { deleted },
    requestId,
  });
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

async function upsertAutomationArtifact(db, runId, body, requestId) {
  const normalizedRunId = normalizeId(runId, 120);
  if (!normalizedRunId) return agentError("bad_run_id", 400, requestId);

  const run = await db.prepare("SELECT id FROM agent_runs WHERE id = ?").bind(normalizedRunId).first();
  if (!run) return agentError("run_not_found", 404, requestId);

  const key = normalizeId(body.id ?? body.key, 120) || crypto.randomUUID();
  const id = `${normalizedRunId}:artifact:${key}`.slice(0, 220);
  const itemKey = normalizeId(body.itemKey ?? body.item_key, 120);
  const itemId = normalizeId(body.itemId ?? body.item_id, 180) || (itemKey ? `${normalizedRunId}:${itemKey}`.slice(0, 180) : null);
  const localTaskId = normalizeId(body.taskId ?? body.task_id, 180);
  const employeeId = normalizeId(body.employeeId ?? body.employee_id, 120);
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";
  if (!title) return agentError("bad_artifact", 400, requestId);

  const artifactType = normalizeId(body.artifactType ?? body.artifact_type, 80) || "markdown";
  const contentText = nullableString(body.contentText ?? body.content_text, "", 100000);
  const fileUrl = nullableString(body.fileUrl ?? body.file_url, null, 1000);
  const metadataInput = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
    ? { ...body.metadata, localTaskId: localTaskId || body.metadata.localTaskId }
    : { localTaskId };
  const metadata = stringifyMetadata(metadataInput);
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO artifacts (
      id, run_id, item_id, task_id, employee_id, title, artifact_type,
      content_text, file_url, metadata_json, created_at, updated_at
    )
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      item_id = excluded.item_id,
      task_id = excluded.task_id,
      employee_id = excluded.employee_id,
      title = excluded.title,
      artifact_type = excluded.artifact_type,
      content_text = excluded.content_text,
      file_url = excluded.file_url,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).bind(
    id,
    normalizedRunId,
    itemId,
    employeeId,
    title,
    artifactType,
    contentText,
    fileUrl,
    metadata,
    now,
    now,
  ).run();

  return json({
    ok: true,
    text: "",
    data: {
      artifact: {
        id,
        runId: normalizedRunId,
        itemId,
        employeeId,
        title,
        artifactType,
        updatedAt: now,
      },
    },
    requestId,
  });
}

async function upsertAutomationTask(db, body, requestId) {
  const id = normalizeId(body.id ?? body.taskId ?? body.task_id, 180);
  if (!id) return agentError("bad_task_id", 400, requestId);

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";
  if (!title) return agentError("bad_task", 400, requestId);

  const sourceRunId = normalizeId(body.sourceRunId ?? body.source_run_id ?? body.orchestrationRunId, 120) || null;
  const sourceItemId = normalizeId(body.sourceItemId ?? body.source_item_id, 180);
  const employeeId = normalizeId(body.employeeId ?? body.employee_id ?? body.assigneeId, 120);
  const status = normalizeBoardTaskStatus(body.status, "todo");
  const priority = normalizeId(body.priority, 40) || "normal";
  const description = nullableString(body.description, "", 3000);
  const resultText = nullableString(body.resultText ?? body.result_text, "", 100000);
  const resultError = nullableString(body.resultError ?? body.result_error, "", 10000);
  const dueAt = nullableString(body.dueAt ?? body.due_at ?? body.dueDate, null, 120);
  const completedAt = nullableString(body.completedAt ?? body.completed_at, status === "done" ? new Date().toISOString() : null, 120);
  const metadataInput = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
    ? { ...body.metadata, sourceItemId: sourceItemId || body.metadata.sourceItemId }
    : { sourceItemId };
  const metadata = stringifyMetadata(metadataInput);
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO tasks (
      id, source_run_id, source_item_id, employee_id, title, description, status, priority,
      result_text, result_error, due_at, metadata_json, created_at, updated_at, completed_at
    )
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_run_id = excluded.source_run_id,
      employee_id = excluded.employee_id,
      title = excluded.title,
      description = excluded.description,
      status = excluded.status,
      priority = excluded.priority,
      result_text = excluded.result_text,
      result_error = excluded.result_error,
      due_at = excluded.due_at,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at,
      completed_at = excluded.completed_at
  `).bind(
    id,
    sourceRunId,
    employeeId,
    title,
    description,
    status,
    priority,
    resultText,
    resultError,
    dueAt,
    metadata,
    now,
    now,
    completedAt,
  ).run();

  return json({
    ok: true,
    text: "",
    data: {
      task: {
        id,
        sourceRunId,
        employeeId,
        title,
        status,
        priority,
        updatedAt: now,
        completedAt,
      },
    },
    requestId,
  });
}

async function listAutomationTasks(db, url, requestId) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 200);
  const statusParam = normalizeId(url.searchParams.get("status"), 40);
  const employeeId = normalizeId(url.searchParams.get("employeeId") ?? url.searchParams.get("employee_id"), 120);
  const sourceRunId = normalizeId(url.searchParams.get("sourceRunId") ?? url.searchParams.get("source_run_id"), 120);
  const clauses = [];
  const binds = [];

  if (statusParam && statusParam !== "all") {
    const status = normalizeBoardTaskStatus(statusParam, "");
    if (status) {
      clauses.push("status = ?");
      binds.push(status);
    }
  }
  if (employeeId) {
    clauses.push("employee_id = ?");
    binds.push(employeeId);
  }
  if (sourceRunId) {
    clauses.push("source_run_id = ?");
    binds.push(sourceRunId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db.prepare(`
    SELECT * FROM tasks
    ${where}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT ?
  `).bind(...binds, limit).all();

  return json({
    ok: true,
    text: "",
    data: {
      tasks: rows.results ?? [],
    },
    requestId,
  });
}

async function deleteAutomationTask(db, taskId, requestId) {
  let decodedId = "";
  try {
    decodedId = decodeURIComponent(String(taskId ?? ""));
  } catch {
    return agentError("bad_task_id", 400, requestId);
  }
  const id = normalizeId(decodedId, 180);
  if (!id) return agentError("bad_task_id", 400, requestId);

  const result = await db.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();

  return json({
    ok: true,
    text: "",
    data: {
      task: {
        id,
        deleted: Boolean(result.meta?.changes),
      },
    },
    requestId,
  });
}

async function listChatMessages(db, employeeId, url, requestId) {
  const normalizedEmployeeId = normalizeId(employeeId, 120);
  if (!normalizedEmployeeId) return agentError("bad_employee_id", 400, requestId);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 40, 1), 100);

  const rows = await db.prepare(`
    SELECT * FROM chat_messages
    WHERE employee_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(normalizedEmployeeId, limit).all();

  return json({
    ok: true,
    text: "",
    data: {
      messages: (rows.results ?? []).reverse(),
    },
    requestId,
  });
}

async function createChatMessage(db, employeeId, body, requestId) {
  const normalizedEmployeeId = normalizeId(employeeId, 120);
  if (!normalizedEmployeeId) return agentError("bad_employee_id", 400, requestId);

  const role = normalizeChatRole(body.role);
  const content = typeof body.content === "string"
    ? body.content.trim().slice(0, 20000)
    : String(body.text ?? "").trim().slice(0, 20000);
  if (!content) return agentError("bad_chat_message", 400, requestId);

  const id = normalizeId(body.id, 180) || crypto.randomUUID();
  const source = normalizeId(body.source, 80) || "manual";
  const metadata = stringifyMetadata(body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
    ? body.metadata
    : {});
  const createdAt = nullableString(body.createdAt ?? body.created_at, new Date().toISOString(), 120);

  await db.prepare(`
    INSERT INTO chat_messages (
      id, employee_id, role, content, source, metadata_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      role = excluded.role,
      content = excluded.content,
      source = excluded.source,
      metadata_json = excluded.metadata_json
  `).bind(
    id,
    normalizedEmployeeId,
    role,
    content,
    source,
    metadata,
    createdAt,
  ).run();

  return json({
    ok: true,
    text: "",
    data: {
      message: {
        id,
        employeeId: normalizedEmployeeId,
        role,
        content,
        source,
        createdAt,
      },
    },
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
  let toolActions = { results: [] };
  try {
    toolActions = await db.prepare(`
      SELECT * FROM tool_actions
      WHERE source_run_id = ?
      ORDER BY created_at ASC
    `).bind(id).all();
  } catch (error) {
    if (!String(error).includes("no such table")) throw error;
  }

  return json({
    ok: true,
    text: "",
    data: {
      run,
      items: items.results ?? [],
      artifacts: artifacts.results ?? [],
      toolActions: toolActions.results ?? [],
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

function normalizeBoardTaskStatus(value, fallback = "todo") {
  const allowed = new Set(["todo", "doing", "review", "done", "error", "blocked"]);
  const status = String(value ?? "").trim();
  return allowed.has(status) ? status : fallback;
}

function normalizeToolActionStatus(value, fallback = "pending") {
  const allowed = new Set(["pending", "approved", "rejected", "executed", "cancelled"]);
  const status = String(value ?? "").trim();
  return allowed.has(status) ? status : fallback;
}

function normalizeToolActionType(value) {
  const allowed = new Set([
    "calendar_event",
    "document_draft",
    "email_draft",
    "checklist",
    "file_folder",
    "automation_recipe",
  ]);
  const type = String(value ?? "").trim();
  return allowed.has(type) ? type : "document_draft";
}

function normalizeChatRole(value) {
  const role = String(value ?? "").trim();
  return role === "user" ? "user" : "ai";
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
