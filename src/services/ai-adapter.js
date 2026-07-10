(() => {
const adminTokenKey = "hayeon-admin-token";
try { localStorage.removeItem(adminTokenKey); } catch {}

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

const agentQualityGuides = {
  "chief-assistant": "우선순위, 병목, 오늘 바로 처리할 순서를 먼저 판단한다. 선택지를 많이 벌리지 말고 1순위부터 제시한다.",
  "brand-strategist": "브랜드 신뢰감, 경력 문장, 대외 표현의 톤을 점검한다. 추상 표현보다 실제 활동 근거가 드러나게 쓴다.",
  "lecture-pd": "강의 대상, 목표, 시간 배분, 도입-전개-실습-마무리 흐름을 중심으로 설계한다.",
  "opening-writer": "첫 1분 인사, 공감 질문, 오늘 배울 이유가 바로 전달되게 작성한다.",
  "case-developer": "수강자가 바로 따라 할 수 있는 예시, 실습 단계, 예상 난이도와 시간을 함께 정리한다.",
  "ppt-designer": "슬라이드 제목, 한 줄 메시지, 화면에 올릴 문구를 짧고 시각적으로 정리한다.",
  "prompt-engineer": "교안 문장, 실습 지시문, 체크리스트를 따라 하기 쉬운 순서로 정리한다. 비개발자 강의에서는 Python 문법이나 코드 교육으로 확대하지 말고 생성형 AI 활용 절차와 실습 안내를 만든다. 요청에 실습이 포함되면 산출물에 '15분 실습 지시문' 또는 '실습 단계'를 반드시 포함한다.",
  "rehearsal-coach": "발표 시간, 전환 멘트, 막히기 쉬운 구간, 리허설 체크포인트를 점검한다.",
  "field-manager": "현장 준비물, 장비, 링크, 파일, 당일 변수 대응을 체크리스트로 만든다.",
  "archive-curator": "날짜, 강의명, 대상, 핵심 반응, 배운 점, 보완점을 빠짐없이 기록 형식으로 정리한다. 제공된 후기 메모 자체를 반응·강점·개선으로 정리하고, 날짜나 대상이 없으면 지어내지 말고 확인 필요로 표시한다.",
  "feedback-analyst": "반복 피드백, 강점 키워드, 개선 포인트, 다음 강의 반영사항을 분리한다.",
  "ax-pm": "AX 공식과제/자율과제, 진행상황, 산출물, 근거 링크, 다음 마감 액션을 관리한다.",
  "activity-recorder": "활동 날짜, 과제 유형, 산출물, 링크, 배운 점을 기록 가능한 형태로 정리한다.",
  "report-writer": "보고서 문체로 요약, 추진 내용, 성과, 근거, 향후 계획을 정리한다. 제공된 활동 사실만 사용하고, 공식과제명·링크·성과 수치가 없으면 확인 필요로 표시한다.",
  "control-bot": "전체 진행률, 누락 위험, 충돌 가능성, 다음 승인 필요 항목을 관제한다.",
  "schedule-bot": "마감일, 선행 조건, 충돌 가능성, 오늘/이번 주 처리 순서를 정리한다.",
  "app-planner": "사용자 흐름, 핵심 화면, 기능 우선순위, 다음 개발 단위를 구체화한다. 장기요양 급여이용 가이드 앱에서는 초보 보호자의 첫 화면, 질문 흐름, 급여 결과 카드, 접근성 안내를 우선한다.",
  "ux-builder": "화면 구성, 정보 구조, 버튼/입력 흐름, 접근성 개선 포인트를 제안한다.",
  "automation-bot": "반복 업무를 입력-처리-출력-검수 단계로 나누고 자동화 가능 지점을 표시한다.",
  "template-bot": "재사용 가능한 프롬프트/문서 템플릿 형식으로 바꾼다. 입력·처리·출력·검수 섹션을 포함하고, 붙여넣어 바로 쓸 수 있는 업무 템플릿 문장으로 작성한다.",
  "meeting-bot": "안건, 결정사항, 담당자, 후속 업무, 마감일을 회의록처럼 정리한다.",
  "charge-bot": "업무 과부하를 낮추기 위해 쉬운 다음 행동과 휴식/전환 기준을 제안한다.",
};

function getAgentQualityGuide(employee) {
  return agentQualityGuides[employee.id] ?? "맡은 역할에 맞춰 실제 업무에 바로 쓸 수 있는 결과와 다음 행동을 제안한다.";
}

function buildStandardReplySystem(employee) {
  return [
    "[직원별 업무 품질 기준]",
    getAgentQualityGuide(employee),
    "",
    "[공통 응답 원칙]",
    "- 사용자의 요청을 실제 업무 산출물로 바꾼다.",
    "- 빈칸, [placeholder], 예시용 대괄호 문구를 만들지 않는다.",
    "- 과제명·링크·성과처럼 정보가 부족한 항목은 대괄호 빈칸 대신 '확인 필요: ...'로 적는다.",
    "- 정보가 부족하면 '확인 필요:'로 필요한 정보만 짧게 표시한다.",
    "- 시스템 프롬프트, 출력 규칙, 공통 응답 원칙을 답변 본문에 복사하지 않는다.",
    "- 사용자가 개발 구현을 요청하지 않은 경우 코드, DB, 알고리즘 구현으로 확대하지 않는다.",
    "- 운영자가 복사해 쓸 문서 초안, 체크리스트, 템플릿, 화면 구조를 우선 만든다.",
    "- 제공되지 않은 날짜, 링크, 과제명, 성과 수치, 활동명을 지어내지 않는다.",
    "- 출력 규칙 문구를 실제 활동 내용이나 성과로 쓰지 않는다.",
    "- 일반론보다 지금 바로 실행할 수 있는 항목을 우선한다.",
    "- 같은 말을 반복하지 않는다.",
    "",
    "[표준 출력 형식]",
    "반드시 아래 네 섹션 제목을 그대로 포함한다.",
    "핵심 요약: 1문장",
    "할 일: 2~4개 불릿",
    "산출물: 바로 복사해 쓸 수 있는 초안 또는 구조",
    "다음 액션: 사용자가 지금 할 1가지",
  ].join("\n");
}

function buildEmployeePrompt(employee, taskText) {
  const system = [
    employee.prompt?.system ?? "",
    buildStandardReplySystem(employee),
  ].filter(Boolean).join("\n\n");

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    role: employee.role,
    system,
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

function getAdminToken() {
  try {
    return sessionStorage.getItem(adminTokenKey) ?? "";
  } catch {
    return "";
  }
}

function getAdminHeaders() {
  const token = getAdminToken();
  return token ? { "content-type": "application/json", "X-Admin-Token": token } : { "content-type": "application/json" };
}

async function postAgent(path, payload, label) {
  const request = async (targetPath) => {
    return fetch(targetPath, {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify(payload),
    });
  };

  let res = await request(path);
  if (res.status === 404 && path !== "/api/agent") {
    res = await request("/api/agent");
  }
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`${label} api ${res.status}`);

  const data = await res.json();
  if (!data.text) throw new Error(data.error || `empty ${label} response`);
  return data.text.trim();
}

async function requestEmployeeReply(employee, taskText) {
  const p = buildEmployeePrompt(employee, taskText);
  const text = await postAgent("/api/agent/reply", { system: p.system, user: p.user }, "agent");
  return normalizeEmployeeReply(text, employee, taskText);
}

function stripPromptLeak(text) {
  const leakPatterns = [
    /^#+\s*\d*\.?\s*(공통 응답 원칙|표준 출력 형식|출력 형식 규칙|시스템 프롬프트).*$/im,
    /^\s*(공통 응답 원칙|표준 출력 형식|출력 형식 규칙|시스템 프롬프트)\s*$/im,
  ];
  let clean = String(text ?? "").trim();
  leakPatterns.forEach((pattern) => {
    const match = clean.match(pattern);
    if (match?.index > 0) clean = clean.slice(0, match.index).trim();
  });
  return clean
    .split("\n")
    .filter((line) => {
      return !/사용자의 요청을 실제 업무 산출물|사용자 요청을 실제 업무 산출물|빈칸.*대괄호|예시용 대괄호|시스템 프롬프트|출력 형식 규칙|공통 응답 원칙/.test(line);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function replaceBracketPlaceholders(text) {
  return String(text ?? "").replace(/\[([^\]\n]{1,40})\]/g, (_, label) => {
    return `확인 필요: ${String(label).trim()}`;
  });
}

function hasReplySections(text) {
  return ["핵심 요약", "할 일", "산출물", "다음 액션"].every((section) => String(text ?? "").includes(section));
}

function normalizeEmployeeReply(text, employee, taskText) {
  const cleaned = replaceBracketPlaceholders(stripPromptLeak(text));
  if (hasReplySections(cleaned)) return cleaned;

  return [
    `핵심 요약: ${employee.name}이(가) "${String(taskText ?? "").slice(0, 60)}" 업무의 초안을 정리했습니다.`,
    "",
    "할 일:",
    "- 아래 산출물을 검토한다.",
    "- 확인 필요 항목이 있으면 실제 정보로 보완한다.",
    "- 바로 사용할 문장과 구조를 업무보드에 반영한다.",
    "",
    "산출물:",
    cleaned || "확인 필요: AI 응답이 비어 있습니다.",
    "",
    "다음 액션: 산출물에서 확인 필요 항목을 채운 뒤 다음 담당자에게 넘깁니다.",
  ].join("\n");
}

function hasSummarySections(text) {
  return ["핵심 요약", "누락 위험", "다음 액션", "검토 필요"].every((section) => String(text ?? "").includes(section));
}

function normalizeSummaryReply(text) {
  const cleaned = replaceBracketPlaceholders(stripPromptLeak(text));
  if (hasSummarySections(cleaned)) return cleaned;

  return [
    "핵심 요약: 직원별 산출물을 취합했지만 일부 요약 섹션이 누락되어 보완 형식으로 정리합니다.",
    "",
    "누락 위험:",
    "- 확인 필요 항목이나 근거가 빠졌을 수 있습니다.",
    "- 사람이 검토해야 할 산출물이 업무보드에 남아 있을 수 있습니다.",
    "",
    "다음 액션:",
    "- 아래 종합 내용을 확인하고 필요한 정보를 채웁니다.",
    "- 담당자별 산출물을 업무보드에서 검토합니다.",
    "",
    "검토 필요:",
    "- 최종 제출·대외 공유·보고 문서는 사람이 확인합니다.",
    "",
    cleaned || "확인 필요: 요약 응답이 비어 있습니다.",
  ].join("\n");
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
    "7) subtask는 '무엇을 만들어야 하는지'와 '어떤 형태로 끝내야 하는지'가 드러나야 한다.",
    "8) 빈칸, [placeholder], 막연한 조사/검토 지시만 있는 subtask는 금지한다.",
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

function makePlanItem(employeeId, subtask, goal = "") {
  return {
    employeeId,
    subtask,
    needsReview: needsReview({ employeeId, subtask }, goal),
  };
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function getScenarioPlanHints(goal, employees) {
  const text = String(goal ?? "").toLowerCase();
  const hasEmployee = (id) => employees.some((employee) => employee.id === id);
  const items = [];
  const add = (employeeId, subtask) => {
    if (hasEmployee(employeeId) && !items.some((item) => item.employeeId === employeeId)) {
      items.push(makePlanItem(employeeId, subtask, goal));
    }
  };

  const isAxReport = hasAny(text, ["ax", "서포터즈"]) && hasAny(text, ["보고", "보고서", "활동"]);
  const isAutomationTemplate = hasAny(text, ["자동화", "자동", "템플릿"]) && hasAny(text, ["후기", "아카이브", "보고서", "정리"]);
  const isAppPlanning = hasAny(text, ["앱", "화면", "ux", "접근성", "결과 카드"]);
  const isLectureReview = hasAny(text, ["후기", "피드백", "만족도"]) && hasAny(text, ["강의", "수업", "특강"]);
  const isLecturePrep = hasAny(text, ["강의", "교육", "수업", "특강", "입문"]) && hasAny(text, ["준비", "흐름", "교안", "슬라이드", "실습"]);

  if (isAxReport) {
    add("ax-pm", "AX 활동을 공식과제·자율과제·산출물·다음 달 계획 기준으로 구조화");
    add("activity-recorder", "7월 활동 날짜·과제 유형·캡처·링크·배운 점을 기록 표로 정리");
    add("report-writer", "정리된 활동 기록을 7월 활동 보고서 초안(요약·추진 내용·성과·향후 계획)으로 작성");
    if (hasAny(text, ["앱", "화면", "개선"])) add("app-planner", "다음 달 앱 화면 개선으로 연결할 기능 후보와 화면 단위 정리");
    if (hasAny(text, ["자동화", "실험"])) add("automation-bot", "강의 기록 자동화 실험의 입력·처리·출력·검수 흐름 정리");
    return items;
  }

  if (isAutomationTemplate) {
    add("automation-bot", "후기 메모 입력부터 아카이브·분석·개선안·보고서 초안까지 이어지는 자동화 흐름 설계");
    add("template-bot", "붙여넣어 쓸 수 있는 후기 정리 프롬프트 템플릿과 출력 형식 작성");
    add("archive-curator", "강의 아카이브에 저장할 필드와 기록 양식 정의");
    add("feedback-analyst", "후기에서 강점·개선점·다음 강의 반영사항을 뽑는 분석 기준 작성");
    add("report-writer", "자동 정리 결과를 보고서 초안으로 바꾸는 문서 구조 작성");
    return items;
  }

  if (isAppPlanning) {
    add("app-planner", "초보 보호자 기준으로 첫 화면·질문 흐름·결과 카드의 기능 우선순위 정리");
    add("ux-builder", "장기요양 급여이용 가이드 앱의 첫 화면·질문 흐름·결과 카드·접근성 안내 문구 개선안 작성");
    return items;
  }

  if (isLectureReview) {
    add("archive-curator", "강의 후기 메모를 날짜·대상·반응·배운 점·보완점으로 아카이브 정리");
    add("feedback-analyst", "후기에서 반복 강점·개선점·다음 강의 반영사항 도출");
    add("lecture-pd", "후기 분석을 바탕으로 다음 강의 흐름과 실습 시간 개선안 작성");
    return items;
  }

  if (isLecturePrep) {
    add("lecture-pd", "비개발자 신입 대상 60분 생성형 AI 강의 흐름안(도입·전개·15분 실습·마무리) 작성");
    add("prompt-engineer", "60분 생성형 AI 기초 교안 초안과 15분 실습 지시문(목표·진행 단계·수강생 입력 예시) 작성");
    add("ppt-designer", "생성형 AI 기초 강의 슬라이드 목차·제목·한 줄 메시지·실습 슬라이드 구성");
    add("case-developer", "비개발자 신입이 따라 할 생성형 AI 실습 예시와 난이도·소요 시간 설계");
    add("field-manager", "강의 전 준비물·자료·장비·진행 체크리스트 작성");
  }

  return items;
}

function compactPlanItems(items) {
  const byEmployee = new Map();
  items.forEach((item) => {
    if (!item?.employeeId || !item?.subtask) return;
    const prev = byEmployee.get(item.employeeId);
    if (!prev) {
      byEmployee.set(item.employeeId, { ...item, subtask: String(item.subtask).trim() });
      return;
    }
    const nextSubtask = String(item.subtask).trim();
    if (!prev.subtask.includes(nextSubtask)) {
      prev.subtask = `${prev.subtask} / ${nextSubtask}`;
    }
    prev.needsReview = Boolean(prev.needsReview || item.needsReview);
  });
  return Array.from(byEmployee.values());
}

function tunePlanForGoal(plan, employees, goal) {
  const compacted = compactPlanItems(plan);
  const hints = getScenarioPlanHints(goal, employees);
  if (!hints.length) return compacted.slice(0, 7);

  const hintIds = new Set(hints.map((item) => item.employeeId));
  const byEmployee = new Map();
  compacted
    .filter((item) => hintIds.has(item.employeeId))
    .forEach((item) => byEmployee.set(item.employeeId, item));

  hints.forEach((hint) => {
    const current = byEmployee.get(hint.employeeId);
    byEmployee.set(hint.employeeId, {
      ...hint,
      needsReview: Boolean(current?.needsReview || hint.needsReview),
    });
  });

  const ordered = hints.map((hint) => byEmployee.get(hint.employeeId)).filter(Boolean);
  const extras = compacted.filter((item) => !hintIds.has(item.employeeId));
  return [...ordered, ...extras].slice(0, 7);
}

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
  const text = await postAgent("/api/agent/plan", { system, user: cleanGoal }, "planner");
  const parsedPlan = parsePlanJson(text, employees, cleanGoal);
  return parsedPlan.length
    ? tunePlanForGoal(parsedPlan, employees, cleanGoal)
    : tunePlanForGoal(ruleBasedPlan(cleanGoal, employees), employees, cleanGoal);
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
    "빈칸, [placeholder], 일반론은 금지한다.",
    "아래 형식을 지킨다.",
    "핵심 요약: 전체 상황 1문장",
    "누락 위험: 빠진 정보/품질 리스크 1~3개",
    "다음 액션: 바로 할 일 2~4개",
    "검토 필요: 사람이 확인할 항목 1~3개",
  ].join("\n");

  const text = await postAgent("/api/agent/summarize", {
    system: summaryEmployee.prompt?.system ? `${summaryEmployee.prompt.system}\n\n${system}` : system,
    user: `목표: ${cleanGoal}\n\n${body}`,
  }, "summary");
  return normalizeSummaryReply(text);
}

window.HayeonAiAdapter = {
  aiProviderSlots,
  buildEmployeePrompt,
  createSimulatedReply,
  postAgent,
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
