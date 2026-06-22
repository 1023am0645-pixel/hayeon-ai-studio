# HA:YEON AI STUDIO — 직원을 실제 AI Agent로 연결하기 (핸드오프)

> 작성: 2026-06-22 · 대상 배포: **Cloudflare Pages + Functions**(권장) / Netlify Functions(대안)
> LLM: **Claude(주) + OpenAI(보조)** 병행 — Claude 요금 한도에 걸리면 자동으로 OpenAI로 폴백

이 문서는 시간 날 때 그대로 따라 하면 되도록 단계별로 정리했어요.
지금 코드에 **이미 들어가 있는 것**과 **직접 해야 할 것**을 나눠서 설명합니다.

---

## 0. 지금 코드에 이미 있는 것 (건드릴 필요 없음)

| 항목 | 위치 | 설명 |
|---|---|---|
| 직원별 페르소나 | `src/data/office-data.js` → 각 직원 `prompt.system` | 그 직원이 AI Agent일 때의 "역할 지시문" |
| 업무 데이터 | `office-data.js` → `tasks` (`assigneeId`, `status`) | 할 일/진행/검토/완료 상태 |
| 어댑터 뼈대 | `src/services/ai-adapter.js` | `buildEmployeePrompt()`, provider 슬롯(claude/openai/gemini) |
| 연결 지점 | `src/app.js` 약 **204번째 줄** `chatForm` 핸들러 | 지금은 `createSimulatedReply()`(가짜) 호출 → **여기를 실제 호출로 교체** |

핵심 매핑은 이미 끝나 있습니다:
**직원 = `system` 프롬프트**, **업무/대화 = `user` 메시지**.

---

## 1. 큰 그림 (왜 백엔드가 필요한가)

```
브라우저 (직원 클릭 → 업무 지시/대화)
   └─▶  /api/agent   ← Cloudflare Function (여기에만 API 키 보관)
            ├─▶ Claude API  (기본)
            └─▶ OpenAI API  (Claude 429/한도 시 폴백)
   ◀── 답변 텍스트
브라우저: 말풍선 / 직원 상세 패널 / 할 일판에 표시
```

> ⚠️ **API 키를 절대 HTML/JS(프론트엔드)에 넣지 마세요.** 깃허브·브라우저에 노출되면 도용됩니다.
> 키는 Cloudflare/Netlify의 **환경변수**에만 둡니다.

---

## 2. Part A — "지시하면 진짜 답이 온다" (1회성 응답)

가장 먼저 이걸 완성하세요. 도구 없이 텍스트 답변만.

### 2-1. 폴더 구조 (Cloudflare Pages 기준)

프로젝트 루트에 `functions/` 폴더를 만들고 그 아래 라우트를 둡니다.
Cloudflare Pages는 `functions/api/agent.js` → 자동으로 `/api/agent` 엔드포인트가 됩니다.

```
HAYEON AI STUDIO/
├─ index.html
├─ src/ ...
└─ functions/
   └─ api/
      └─ agent.js     ← 새로 생성
```

### 2-2. `functions/api/agent.js` (복붙)

```js
// Cloudflare Pages Function: POST /api/agent
// body: { system, user, provider? }  provider 생략 시 claude→openai 폴백
export async function onRequestPost({ request, env }) {
  const cors = {
    "access-control-allow-origin": "*",
    "content-type": "application/json",
  };
  try {
    const { system, user, provider } = await request.json();
    if (!user) return new Response(JSON.stringify({ error: "user 필요" }), { status: 400, headers: cors });

    // 1순위 claude, 막히면 openai
    const order = provider ? [provider] : ["claude", "openai"];
    let lastErr = "";
    for (const p of order) {
      try {
        const text = p === "claude"
          ? await callClaude(env, system, user)
          : await callOpenAI(env, system, user);
        return new Response(JSON.stringify({ text, provider: p }), { headers: cors });
      } catch (e) {
        lastErr = String(e);
        // 429(한도)·5xx면 다음 provider로 폴백
      }
    }
    return new Response(JSON.stringify({ error: "all providers failed", detail: lastErr }), { status: 502, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
}

async function callClaude(env, system, user) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: system || "",
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) throw new Error("claude " + r.status + " " + (await r.text()).slice(0, 200));
  const data = await r.json();
  return data.content?.[0]?.text ?? "";
}

async function callOpenAI(env, system, user) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "authorization": "Bearer " + env.OPENAI_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini", // 원하는 모델로 교체
      max_tokens: 1024,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) throw new Error("openai " + r.status + " " + (await r.text()).slice(0, 200));
  const data = await r.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// 프리플라이트(CORS)
export function onRequestOptions() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}
```

### 2-3. 환경변수 설정

Cloudflare Pages 대시보드 → 프로젝트 → **Settings → Environment variables**:

- `ANTHROPIC_API_KEY` = `sk-ant-...`
- `OPENAI_API_KEY` = `sk-...`

(Production / Preview 양쪽에 넣어두면 편합니다.)

### 2-4. `src/services/ai-adapter.js` 에 실제 호출 추가

기존 `createSimulatedReply`는 그대로 두고(폴백/오프라인용), **아래 함수를 추가**한 뒤 `window.HayeonAiAdapter`에 같이 노출하세요.

```js
async function requestEmployeeReply(employee, taskText, provider) {
  const p = buildEmployeePrompt(employee, taskText); // 이미 있는 함수
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ system: p.system, user: p.user, provider }),
  });
  if (!res.ok) throw new Error("agent api " + res.status);
  const data = await res.json();
  return data.text; // 실제 모델 답변
}

window.HayeonAiAdapter = {
  aiProviderSlots,
  buildEmployeePrompt,
  createSimulatedReply,   // 폴백용 유지
  requestEmployeeReply,   // ← 추가
};
```

### 2-5. `src/app.js` 연결 (약 204번째 줄, `chatForm` 핸들러 교체)

지금:
```js
if (event.target.id === "chatForm") {
  event.preventDefault();
  const formData = new FormData(event.target);
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return;
  const reply = createSimulatedReply(getSelectedEmployee(), message);  // ← 가짜
  showToast(`${getSelectedEmployee().name}: ${reply.text}`);
  event.target.reset();
}
```

이렇게:
```js
if (event.target.id === "chatForm") {
  event.preventDefault();
  const formData = new FormData(event.target);
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return;
  const employee = getSelectedEmployee();
  event.target.reset();
  showToast(`${employee.name}: 생각 중…`);
  try {
    const text = await window.HayeonAiAdapter.requestEmployeeReply(employee, message);
    showToast(`${employee.name}: ${text}`);
    // TODO: 토스트 대신 직원 상세 패널/말풍선에 누적 표시하면 더 좋음
  } catch (e) {
    // 네트워크/한도 실패 시 시뮬레이션으로 폴백
    const reply = createSimulatedReply(employee, message);
    showToast(`${employee.name}(오프라인): ${reply.text}`);
  }
}
```
> 상위 콜백을 `async`로 바꿔야 `await`가 동작합니다.
> `refs.employeeDetail.addEventListener("submit", async (event) => { ... })`
> 파일 상단 `const { createSimulatedReply } = window.HayeonAiAdapter;` 는 그대로 두세요.

여기까지 하면 **직원 채팅창에 지시 → 그 직원 페르소나로 진짜 답변**이 옵니다. 🎉

---

## 3. Part B — Claude + OpenAI(코덱스) 병행 전략

요금 한도 대응은 위 `agent.js`에 **이미** 들어가 있어요(`["claude","openai"]` 순서 폴백).
취향에 따라 조절:

- **항상 Claude, 막히면 OpenAI** → 지금 기본값(그대로 두기).
- **직원별로 provider 고정** → `requestEmployeeReply(employee, msg, "openai")` 처럼 3번째 인자 전달.
  예: 코드/자동화 직원(앱기획·화면봇·자동봇)은 `"openai"`, 글쓰기 직원은 `"claude"`.
- **사용량 분산(라운드로빈)** → 호출 카운트를 세서 짝수는 claude, 홀수는 openai.

> "코덱스"를 코딩 도구로 병행하시는 거라면: 이 문서가 자체 완결형이라 **Claude Code로 일부, Codex로 일부** 나눠 작업해도 충돌 없이 그대로 적용됩니다.

---

## 4. Part C — 진짜 "Agent"로 만들기 (도구 사용 + 업무 자동 처리)

위까지는 "질문→답변" 1회성입니다. 직원이 **실제로 일을 수행**(문서 작성, 검색, Slack 전송, 파일 저장)하게 하려면 **도구 사용(tool use) 루프**가 필요해요.

### 개념
```
모델에게 [system + user + 사용 가능한 도구 목록] 전달
  └ 모델이 "도구 X를 이 인자로 실행해줘" 요청
      └ 서버가 실제로 실행 → 결과를 모델에 다시 전달
          └ 모델이 다음 단계 결정 … 완료될 때까지 반복(agent loop)
```

### 직원별 도구 예시
| 직원 | 붙일 도구 |
|---|---|
| 아카이브/성과관리 | 문서 저장·조회(DB/Notion) |
| AX피엠·보고봇 | 보고서 생성→파일/Drive 저장 |
| 일정봇 | 캘린더 조회·등록 |
| 자동봇·템플릿봇 | 웹훅/자동화 트리거 |

### 구현 선택지
1. **직접 구현**: Anthropic `tools` 파라미터(또는 OpenAI `tools`)로 함수 정의 → 호출 응답을 받아 서버에서 실행 → 결과 재전달 루프. 가장 가볍지만 직접 짜야 함.
2. **Claude Agent SDK 사용(권장)**: 위 루프·세션·도구 연결을 SDK가 대신 처리. 외부 앱은 **MCP 커넥터**(Slack/Notion/Google 등)로 붙임. 단, 별도 Node 런타임이 필요해 Cloudflare Functions보다는 작은 서버(Workers+Durable Objects 또는 별도 VM)가 어울림.

### 업무 상태 자동 갱신
에이전트가 일을 끝내면 해당 `task`를 자동으로 옮기세요:
- 시작 시 `status: "doing"` → 직원 `status: "working"`(걷기 애니메이션 자동 적용)
- 완료 시 `status: "done"`, 결과물 링크 저장
- 검토 필요 시 `status: "review"`(빨간 점)
`office-data.js`의 `statusMeta`와 `app.js`의 상태 변경 함수(`setEmployeeStatus`, 약 1423~1439줄 부근)를 재사용하면 됩니다.

---

## 5. Netlify로 할 경우(대안)

- 함수 위치: `netlify/functions/agent.js`
- 핸들러 형태가 다릅니다:
```js
export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "POST only" };
  const { system, user, provider } = JSON.parse(event.body || "{}");
  // ... 위 callClaude/callOpenAI 동일 ...
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) };
}
```
- 엔드포인트는 `/.netlify/functions/agent` (프론트의 fetch 경로만 이 값으로 바꾸면 됨)
- 환경변수는 Netlify 대시보드 → Site settings → Environment variables

---

## 6. 로컬 테스트

- **Cloudflare**: `npm i -g wrangler` → 프로젝트 루트에서 `wrangler pages dev .`
  (환경변수는 `.dev.vars` 파일에 `ANTHROPIC_API_KEY=...` 형식으로; 이 파일은 깃에 올리지 말 것)
- **Netlify**: `npm i -g netlify-cli` → `netlify dev`

브라우저에서 직원 채팅창에 한 줄 입력 → 실제 답변이 오면 성공.

---

## 7. 체크리스트

- [ ] `functions/api/agent.js` 생성 (Part A 코드 복붙)
- [ ] Cloudflare 환경변수 `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` 등록
- [ ] `ai-adapter.js`에 `requestEmployeeReply` 추가 + export
- [ ] `app.js` `chatForm` 핸들러 async 교체
- [ ] 로컬 `wrangler pages dev .`로 응답 확인
- [ ] 배포 후 실제 도메인에서 응답 확인
- [ ] (이후) 직원별 provider 고정/분산 정책 결정
- [ ] (이후) 도구 사용 + task 상태 자동 갱신으로 에이전트화

---

## 8. 보안·비용 메모

- API 키는 **환경변수에만**. `.dev.vars`, `.env`는 `.gitignore`에 추가.
- 공개 사이트면 `/api/agent`에 **간단한 비밀 토큰/Origin 체크**를 걸어 무단 호출 방지(키 비용 폭탄 방지).
- `max_tokens`를 적당히(예: 512~1024) 잡아 비용 관리.
- 한도(429)는 폴백으로 흡수되지만, 양쪽 다 막히면 `createSimulatedReply`로 자연스럽게 degrade되도록 이미 처리됨.

---

막히는 부분 생기면 이 파일 들고 와서 물어봐 주세요. 원하시면 Part A를 제가 실제 코드로 바로 넣어드릴 수도 있어요.
