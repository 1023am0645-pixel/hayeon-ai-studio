export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/agent" && request.method === "POST") {
      return handleAgent(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleAgent(request, env) {
  const host = new URL(request.url).host;
  const origin = request.headers.get("Origin");
  if (origin) {
    try { if (new URL(origin).host !== host) return json({ error: "forbidden" }, 403); }
    catch { return json({ error: "bad origin" }, 403); }
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const system = typeof body.system === "string" ? body.system.slice(0, 4000) : "";
  const user = typeof body.user === "string" ? body.user.trim() : "";
  if (!user || user.length > 2000) return json({ error: "bad input" }, 400);
  if (!env.AI) return json({ error: "AI binding 'AI' missing" }, 500);
  const isPlannerRequest = system.includes("반드시 JSON 배열만 출력") || system.includes('"employeeId"');
  const brevityRule = [
    "",
    "",
    "[출력 형식 규칙]",
    "한국어로 핵심만 답한다.",
    "불릿 3~5개, 각 항목은 한 줄과 최대 한 문장으로 제한한다.",
    "서론·결론·일반론·표·장문 설명은 쓰지 않는다.",
    "전체 8줄 이내로 작성한다.",
  ].join("\n");
  const effectiveSystem = isPlannerRequest ? system : `${system}${brevityRule}`;
  try {
    const r = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: [
        ...(effectiveSystem ? [{ role: "system", content: effectiveSystem }] : []),
        { role: "user", content: user },
      ],
      max_tokens: isPlannerRequest ? 600 : 380,
    });
    return json({ text: r.response ?? "" });
  } catch (e) {
    return json({ error: "ai_failed", detail: String(e).slice(0, 200) }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
