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

function getAdminHeaders() {
  const token = localStorage.getItem("hayeon-admin-token") ?? "";
  return token ? { "content-type": "application/json", "X-Admin-Token": token } : { "content-type": "application/json" };
}

async function requestEmployeeReply(employee, taskText) {
  const p = buildEmployeePrompt(employee, taskText);
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ system: p.system, user: p.user }),
  });
  if (res.status === 401) throw new Error("unauthorized");
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
    "2) 형식: [{\"employeeId\":\"<id>\",\"subtask\":\"<한국어 세부지시>\",\"needsReview\":true|false}]",
    "3) employeeId는 반드시 명단의 id와 정확히 일치.",
    "4) 목표와 무관한 직원은 절대 넣지 마라. 보통 3~6명.",
    "5) 외부 공개·발표·보고·고객 전송처럼 사람이 확인해야 하는 과제는 needsReview:true, 내부 초안성 작업은 false로 표시하라.",
    "6) 배열 순서는 실제 실행 순서다. 뒤 직원은 앞 직원의 산출물을 참고하므로, 의존성이 있는 업무는 반드시 앞뒤 순서가 자연스럽게 배열하라.",
    "",
    "[직원 명단]",
    roster,
    "",
    "[예시] 목표: \"다음달 신입 입문교육 준비\"",
    "[{\"employeeId\":\"lecture-pd\",\"subtask\":\"신입 대상 90분 입문교육 강의 흐름안(도입·본론·실습·마무리) 작성\",\"needsReview\":false},",
    " {\"employeeId\":\"prompt-engineer\",\"subtask\":\"입문교육 핵심 개념 교안 초안 작성\",\"needsReview\":false},",
    " {\"employeeId\":\"ppt-designer\",\"subtask\":\"교안 기반 슬라이드 구성/제목 문구 정리\",\"needsReview\":true},",
    " {\"employeeId\":\"case-developer\",\"subtask\":\"신입이 따라할 실습 예시 3개 설계\",\"needsReview\":false},",
    " {\"employeeId\":\"schedule-bot\",\"subtask\":\"교육 일정·준비 마감일 정리\",\"needsReview\":false}]",
  ].join("\n");
}

const reviewEmployeeIds = new Set(["report-writer", "ax-pm", "brand-strategist"]);
const reviewKeywords = ["발표", "보고", "대외", "고객", "제출", "공개"];

function needsReview(item, goal = "") {
  const employeeId = String(item?.employeeId ?? "");
  const text = `${item?.subtask ?? ""} ${goal ?? ""}`;
  return reviewEmployeeIds.has(employeeId) || reviewKeywords.some((keyword) => text.includes(keyword));
}

function parsePlanJson(text, employees, goal = "") {
  try {
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
        needsReview: item.needsReview === true
          || String(item.needsReview).toLowerCase() === "true"
          || needsReview(item, goal),
      }));
  } catch {
    return [];
  }
}

function ruleBasedPlan(goal, employees) {
  const cleanGoal = String(goal ?? "").trim();
  const normalizedGoal = cleanGoal.toLowerCase();
  const hasEmployee = (id) => employees.some((employee) => employee.id === id);
  const rules = [
    [["강의", "교육", "수업", "특강", "입문"], "lecture-pd", "강의 흐름/설계안 작성"],
    [["교안", "자료", "원고"], "prompt-engineer", "교안·교육자료 초안 작성"],
    [["ppt", "슬라이드", "발표자료"], "ppt-designer", "슬라이드 구성/문구 정리"],
    [["실습", "사례", "예시"], "case-developer", "실습 사례/예시 설계"],
    [["오프닝", "도입", "첫인사"], "opening-writer", "오프닝·도입 멘트 작성"],
    [["리허설", "시간", "발표연습"], "rehearsal-coach", "리허설·시간배분 점검"],
    [["현장", "준비물", "장비", "체크"], "field-manager", "현장 준비 체크리스트"],
    [["일정", "마감", "스케줄"], "schedule-bot", "일정·마감일 정리"],
    [["ax", "서포터즈", "과제"], "ax-pm", "AX 과제 정리/관리"],
    [["보고", "보고서"], "report-writer", "보고서 초안 작성"],
    [["후기", "피드백", "만족도"], "feedback-analyst", "후기/피드백 분석"],
    [["기록", "아카이브"], "archive-curator", "기록 정리"],
    [["앱", "화면", "ux"], "app-planner", "앱 기획/화면 정리"],
    [["자동화", "반복", "템플릿"], "automation-bot", "자동화 흐름 설계"],
  ];

  const picked = [];
  rules.forEach(([keywords, employeeId, subtask]) => {
    const alreadyPicked = picked.some((item) => item.employeeId === employeeId);
    if (!alreadyPicked && hasEmployee(employeeId) && keywords.some((keyword) => normalizedGoal.includes(keyword))) {
      const fullSubtask = `${cleanGoal} — ${subtask}`;
      picked.push({ employeeId, subtask: fullSubtask, needsReview: needsReview({ employeeId, subtask: fullSubtask }, cleanGoal) });
    }
  });

  if (!picked.length && hasEmployee("chief-assistant")) {
    picked.push({ employeeId: "chief-assistant", subtask: cleanGoal, needsReview: needsReview({ employeeId: "chief-assistant", subtask: cleanGoal }, cleanGoal) });
  }

  return picked;
}

async function planTasks(goal, employees) {
  const cleanGoal = String(goal ?? "").trim();
  if (!cleanGoal) return [];

  const system = buildPlanningSystemPrompt(employees);
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ system, user: cleanGoal }),
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error("planner api " + res.status);

  const data = await res.json();
  if (!data.text) throw new Error(data.error || "empty planner response");
  const parsedPlan = parsePlanJson(data.text, employees, cleanGoal);
  return parsedPlan.length ? parsedPlan : ruleBasedPlan(cleanGoal, employees);
}

async function runOrchestration(goal, employees, { onUpdate } = {}) {
  const cleanGoal = String(goal ?? "").trim();
  if (!cleanGoal) return { goal: cleanGoal, plan: [], results: [], summary: "" };

  const plan = await planTasks(cleanGoal, employees);
  const results = [];

  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index];
    const itemKey = `${item.employeeId}#${index}`;
    const employee = employees.find((entry) => entry.id === item.employeeId);
    if (!employee) continue;

    onUpdate?.({ phase: "start", key: itemKey, employee, subtask: item.subtask });

    try {
      const text = await requestEmployeeReply(employee, item.subtask);
      const result = {
        key: itemKey,
        employeeId: employee.id,
        employeeName: employee.name,
        role: employee.role,
        subtask: item.subtask,
        text,
      };
      results.push(result);
      onUpdate?.({ phase: "done", key: itemKey, employee, subtask: item.subtask, text });
    } catch (err) {
      const error = err && err.message ? err.message : String(err);
      const result = {
        key: itemKey,
        employeeId: employee.id,
        employeeName: employee.name,
        role: employee.role,
        subtask: item.subtask,
        text: "",
        error,
      };
      results.push(result);
      onUpdate?.({ phase: "error", key: itemKey, employee, subtask: item.subtask, error });
    }
  }

  const summaryEmployee =
    employees.find((employee) => employee.id === "control-bot")
    ?? employees.find((employee) => employee.id === "chief-assistant")
    ?? employees[0];
  let summary = "";
  let summaryError = "";

  if (results.length && summaryEmployee) {
    onUpdate?.({
      phase: "summary-start",
      key: "summary",
      employee: summaryEmployee,
      subtask: "직원별 산출물 종합 요약",
    });

    try {
      summary = await summarizeOrchestration(cleanGoal, results, employees);
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

  return { goal: cleanGoal, plan, results, summary, summaryError };
}

async function summarizeOrchestration(goal, results, employees) {
  const cleanGoal = String(goal ?? "").trim();
  const summaryEmployee =
    employees.find((employee) => employee.id === "control-bot")
    ?? employees.find((employee) => employee.id === "chief-assistant")
    ?? employees[0];
  if (!cleanGoal || !results.length || !summaryEmployee) return "";

  const body = results.map((result) => {
    const answer = result.text || `(처리 실패) ${result.error ?? ""}`;
    return [
      `## ${result.employeeName} (${result.role})`,
      `지시: ${result.subtask}`,
      "결과:",
      answer,
    ].join("\n");
  }).join("\n\n");

  const system = [
    "너는 HA:YEON AI STUDIO의 관제 매니저다.",
    "직원별 산출물을 종합해 전체 요약, 빠진 부분, 다음 액션 체크리스트를 간결하게 정리한다.",
    "한국어로 작성하고, 실제 실행에 바로 쓸 수 있는 항목 중심으로 답한다.",
    "전체 10줄 이내로 제한하고, 불릿 중심으로 작성한다.",
  ].join("\n");

  const res = await fetch("/api/agent", {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({
      system: summaryEmployee.prompt?.system ? `${summaryEmployee.prompt.system}\n\n${system}` : system,
      user: `목표: ${cleanGoal}\n\n${body}`,
    }),
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error("summary api " + res.status);

  const data = await res.json();
  if (!data.text) throw new Error(data.error || "empty summary response");
  return data.text.trim();
}

window.HayeonAiAdapter = {
  aiProviderSlots,
  buildEmployeePrompt,
  createSimulatedReply,
  requestEmployeeReply,
  buildPlanningSystemPrompt,
  parsePlanJson,
  ruleBasedPlan,
  needsReview,
  planTasks,
  runOrchestration,
  summarizeOrchestration,
};
})();
