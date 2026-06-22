(() => {
const aiProviderSlots = {
  openai: {
    enabled: false,
    endpoint: "/api/ai/openai",
    note: "Next.js 이전 후 app/api/ai/openai/route.ts 같은 서버 라우트에서 연결할 수 있습니다.",
  },
  gemini: {
    enabled: false,
    endpoint: "/api/ai/gemini",
    note: "직원별 system prompt를 같은 인터페이스로 전달하면 됩니다.",
  },
  claude: {
    enabled: false,
    endpoint: "/api/ai/claude",
    note: "프론트엔드는 provider 이름만 바꾸도록 설계합니다.",
  },
};

function buildEmployeePrompt(employee, taskText) {
  return {
    employeeId: employee.id,
    employeeName: employee.name,
    role: employee.role,
    system: employee.prompt?.system ?? "",
    user: taskText,
  };
}

function createSimulatedReply(employee, message) {
  const prompt = buildEmployeePrompt(employee, message);
  const role = employee.role ?? "";
  const rolePrefix = [
    ["강의 PD", "강의 목표, 도입, 실습, 마무리 순서로 나눠볼게요."],
    ["PPT", "슬라이드 제목과 한 줄 메시지를 먼저 정리할게요."],
    ["교안", "교육자료 문장을 짧고 따라 하기 쉬운 흐름으로 다듬어볼게요."],
    ["아카이브", "날짜, 대상, 주제, 반응, 배운 점을 표준 양식으로 정돈할게요."],
    ["후기 분석", "반복되는 피드백과 강점 키워드를 먼저 묶어볼게요."],
    ["AX-서포터즈", "공식과제, 자율과제, 산출물, 다음 액션으로 나눠볼게요."],
  ];
  const prefix = rolePrefix.find(([keyword]) => role.includes(keyword))?.[1];

  return {
    prompt,
    text: prefix ?? `${employee.role} 관점에서 핵심을 정리하고 다음 행동으로 바꿔볼게요.`,
  };
}

async function requestEmployeeReply(employee, taskText) {
  const p = buildEmployeePrompt(employee, taskText);
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ system: p.system, user: p.user }),
  });
  if (!res.ok) throw new Error("agent api " + res.status);
  const data = await res.json();
  if (!data.text) throw new Error(data.error || "empty");
  return data.text;
}

function buildPlanningSystemPrompt(employees) {
  const roster = employees.map((employee) => {
    return `- ${employee.id} | ${employee.name} | ${employee.role}`;
  }).join("\n");

  return [
    "너는 'HA:YEON AI STUDIO'의 총괄 매니저다.",
    "주어진 목표를 달성하기 위해, 아래 직원 명단에서 '꼭 필요한 직원만' 선정하고",
    "각 직원에게 그 사람의 역할에 맞는 '구체적이고 실행 가능한 세부지시'를 만든다.",
    "규칙:",
    "1) 반드시 JSON 배열만 출력. 설명/머리말 금지.",
    "2) 형식: [{\"employeeId\":\"<id>\",\"subtask\":\"<한국어 세부지시>\"}]",
    "3) employeeId는 반드시 명단의 id와 정확히 일치.",
    "4) 목표와 무관한 직원은 절대 넣지 마라. 보통 3~6명.",
    "",
    "[직원 명단]",
    roster,
    "",
    "[예시] 목표: \"다음달 신입 입문교육 준비\"",
    "[{\"employeeId\":\"lecture-pd\",\"subtask\":\"신입 대상 90분 입문교육 강의 흐름안(도입·본론·실습·마무리) 작성\"},",
    " {\"employeeId\":\"prompt-engineer\",\"subtask\":\"입문교육 핵심 개념 교안 초안 작성\"},",
    " {\"employeeId\":\"ppt-designer\",\"subtask\":\"교안 기반 슬라이드 구성/제목 문구 정리\"},",
    " {\"employeeId\":\"case-developer\",\"subtask\":\"신입이 따라할 실습 예시 3개 설계\"},",
    " {\"employeeId\":\"schedule-bot\",\"subtask\":\"교육 일정·준비 마감일 정리\"}]",
  ].join("\n");
}

function parsePlanJson(text, employees) {
  const match = String(text ?? "").match(/\[[\s\S]*\]/);
  if (!match) return [];

  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item) => {
      return item
        && employees.some((employee) => employee.id === item.employeeId)
        && typeof item.subtask === "string"
        && item.subtask.trim();
    })
    .map((item) => ({
      employeeId: item.employeeId,
      subtask: item.subtask.trim(),
    }));
}

async function planTasks(goal, employees) {
  const cleanGoal = String(goal ?? "").trim();
  if (!cleanGoal) return [];

  const system = buildPlanningSystemPrompt(employees);
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ system, user: cleanGoal }),
  });
  if (!res.ok) throw new Error("planner api " + res.status);

  const data = await res.json();
  if (!data.text) throw new Error(data.error || "empty planner response");
  return parsePlanJson(data.text, employees);
}

window.HayeonAiAdapter = {
  aiProviderSlots,
  buildEmployeePrompt,
  createSimulatedReply,
  requestEmployeeReply,
  buildPlanningSystemPrompt,
  parsePlanJson,
  planTasks,
};
})();
