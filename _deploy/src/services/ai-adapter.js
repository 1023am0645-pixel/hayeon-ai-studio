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

window.HayeonAiAdapter = {
  aiProviderSlots,
  buildEmployeePrompt,
  createSimulatedReply,
  requestEmployeeReply,
};
})();
