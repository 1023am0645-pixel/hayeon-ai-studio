// Cloudflare Pages Function — POST /api/agent
// Uses Cloudflare Workers AI (free allowance, no API key, no auto-charge).
// Security: same-origin only (blocks outside abuse of the free quota).
export async function onRequestPost({ request, env }) {
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

  if (!env.AI) return json({ error: "AI binding 'AI' is not enabled" }, 500);

  try {
    const r = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: user },
      ],
      max_tokens: 800,
    });
    return json({ text: r.response ?? "" });
  } catch (e) {
    return json({ error: "ai_failed", detail: String(e).slice(0, 200) }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
