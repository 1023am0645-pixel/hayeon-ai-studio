export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/agent")) {
      return handleAgentRoute(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};

const agentModel = "@cf/meta/llama-3.1-8b-instruct-fp8";

async function handleAgentRoute(request, env, url) {
  if (request.method !== "POST") {
    return agentError("method_not_allowed", 405);
  }

  const context = validateAgentRequest(request, env);
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

function validateAgentRequest(request, env) {
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

function agentError(error, status, requestId = crypto.randomUUID(), detail = "") {
  return json({ ok: false, text: "", data: null, error, detail, requestId }, status);
}
