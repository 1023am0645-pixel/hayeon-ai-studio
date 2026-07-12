(() => {
const adapterLabels = {
  calendar_event: "Calendar",
  document_draft: "Document",
  email_draft: "Mail",
  checklist: "Checklist",
  file_folder: "Drive",
  automation_recipe: "Automation",
};

const actionTypeLabels = {
  calendar_event: "일정 초안",
  document_draft: "문서 초안",
  email_draft: "메일 초안",
  checklist: "체크리스트",
  file_folder: "파일 정리",
  automation_recipe: "자동화 레시피",
};

const defaultPolicy = {
  mode: "approval-required",
  externalExecution: false,
  connectorReady: false,
  requireContactReview: true,
  allowAutoRegisterTasks: false,
  connectors: {},
};

const requiredConnectorByActionType = {
  calendar_event: "calendar",
  email_draft: "mail",
  file_folder: "drive",
  document_draft: "drive",
  checklist: "",
  automation_recipe: "",
};

function getActionTypeLabel(type) {
  return actionTypeLabels[type] ?? actionTypeLabels.document_draft;
}

function getAdapterLabel(type) {
  return adapterLabels[type] ?? adapterLabels.document_draft;
}

function normalizePolicy(policy = {}) {
  return {
    ...defaultPolicy,
    ...(policy && typeof policy === "object" ? policy : {}),
    connectors: normalizeConnectors(policy?.connectors),
  };
}

function normalizeConnectors(connectors = {}) {
  if (!connectors || typeof connectors !== "object" || Array.isArray(connectors)) return {};
  return Object.fromEntries(Object.entries(connectors).map(([key, value]) => {
    const item = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return [key, {
      connected: Boolean(item.connected),
      writeEnabled: Boolean(item.writeEnabled),
      requiredSecrets: Array.isArray(item.requiredSecrets) ? item.requiredSecrets.slice(0, 8) : [],
    }];
  }));
}

function getRequiredConnector(actionType) {
  return requiredConnectorByActionType[actionType] ?? "";
}

function resolveConnectorPolicy(policy, actionType) {
  const requiredConnector = getRequiredConnector(actionType);
  if (!requiredConnector) {
    return {
      requiredConnector,
      connectorReady: Boolean(policy.connectorReady),
      connectorConnected: Boolean(policy.connectorReady),
      writeEnabled: Boolean(policy.connectorReady),
    };
  }
  const connector = policy.connectors?.[requiredConnector] ?? {};
  return {
    requiredConnector,
    connectorReady: Boolean(connector.writeEnabled),
    connectorConnected: Boolean(connector.connected),
    writeEnabled: Boolean(connector.writeEnabled),
  };
}

function getPayload(action = {}) {
  return action.payload && typeof action.payload === "object" && !Array.isArray(action.payload)
    ? action.payload
    : {};
}

function extractLines(text = "", limit = 6) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split(/\n|(?:^|\s)[-*]\s+/)
    .map((line) => line
      .replace(/^#+\s*/, "")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter(Boolean);
  return [...new Set(lines)].slice(0, limit);
}

function makeBase(action = {}, policy = {}) {
  const payload = getPayload(action);
  const actionType = action.actionType || action.action_type || "document_draft";
  const sourceTitle = payload.subtask || action.title || "자동화 후보";
  const previewLines = extractLines(payload.contentPreview || action.description || "", 6);
  return {
    actionType,
    payload,
    sourceTitle,
    previewLines: previewLines.length ? previewLines : ["원문 산출물을 기준으로 실행 직전 초안을 구성합니다."],
    employeeName: payload.employeeName || "담당 직원",
    policy: normalizePolicy(policy),
  };
}

function buildCalendarPackage(base) {
  return {
    targetApp: "Calendar",
    payloadPreview: {
      title: base.sourceTitle,
      durationMinutes: 60,
      attendees: "확인 필요",
      description: base.previewLines.join("\n"),
    },
    steps: [
      "일정 제목과 목적을 확인한다.",
      "실제 날짜, 시간, 참석자를 운영자가 입력한다.",
      "안건을 일정 설명에 붙여넣는다.",
      "저장 전 알림과 공개 범위를 확인한다.",
    ],
    checks: ["날짜/시간", "참석자", "공개 범위", "알림"],
  };
}

function buildDocumentPackage(base) {
  return {
    targetApp: "Document",
    payloadPreview: {
      title: base.sourceTitle,
      sections: base.previewLines,
      owner: base.employeeName,
    },
    steps: [
      "문서 제목과 저장 위치를 확정한다.",
      "산출물 미리보기를 문서 섹션으로 옮긴다.",
      "확인 필요 항목을 운영자가 채운다.",
      "공유 권한을 확인한 뒤 배포한다.",
    ],
    checks: ["문서 제목", "저장 위치", "공유 권한", "확인 필요 항목"],
  };
}

function buildEmailPackage(base) {
  return {
    targetApp: "Mail Draft",
    payloadPreview: {
      subject: base.sourceTitle,
      recipients: "확인 필요",
      body: base.previewLines.join("\n"),
    },
    steps: [
      "메일 제목과 핵심 문장을 확인한다.",
      "수신자와 참조자를 운영자가 직접 입력한다.",
      "첨부 파일이 필요한지 확인한다.",
      "발송 전 개인정보와 외부 공개 범위를 점검한다.",
    ],
    checks: ["수신자", "첨부", "개인정보", "발송 시점"],
  };
}

function buildChecklistPackage(base) {
  return {
    targetApp: "Task Board",
    payloadPreview: {
      title: base.sourceTitle,
      items: base.previewLines.map((line) => ({ label: line, done: false })),
    },
    steps: [
      "미리보기 내용을 체크 항목으로 변환한다.",
      "완료 기준과 담당자를 확인한다.",
      "할 일판 또는 업무 템플릿에 등록한다.",
    ],
    checks: ["완료 기준", "담당자", "우선순위"],
  };
}

function buildFilePackage(base) {
  return {
    targetApp: "Drive",
    payloadPreview: {
      folderName: base.sourceTitle,
      suggestedFiles: base.previewLines.slice(0, 4),
    },
    steps: [
      "폴더명과 저장 위치를 정한다.",
      "관련 산출물을 한 폴더로 모은다.",
      "파일명 규칙과 공유 권한을 확인한다.",
    ],
    checks: ["저장 위치", "파일명 규칙", "공유 권한"],
  };
}

function buildAutomationRecipePackage(base) {
  return {
    targetApp: "Automation Recipe",
    payloadPreview: {
      name: base.sourceTitle,
      trigger: "운영자 승인 또는 수동 시작",
      flow: base.previewLines,
    },
    steps: [
      "시작 조건과 입력값을 확정한다.",
      "처리 단계와 예외 상황을 정리한다.",
      "출력물과 검수 기준을 연결한다.",
      "반복 실행 전 샘플 데이터로 리허설한다.",
    ],
    checks: ["입력값", "예외 처리", "출력물", "검수 기준"],
  };
}

function buildExecutionPackage(action = {}, options = {}) {
  const policy = normalizePolicy(options.policy);
  const base = makeBase(action, policy);
  const connectorPolicy = resolveConnectorPolicy(policy, base.actionType);
  const builders = {
    calendar_event: buildCalendarPackage,
    document_draft: buildDocumentPackage,
    email_draft: buildEmailPackage,
    checklist: buildChecklistPackage,
    file_folder: buildFilePackage,
    automation_recipe: buildAutomationRecipePackage,
  };
  const specific = (builders[base.actionType] ?? buildDocumentPackage)(base);
  return {
    id: `pkg-${action.id || Date.now()}`,
    actionId: action.id || "",
    actionType: base.actionType,
    typeLabel: getActionTypeLabel(base.actionType),
    adapter: getAdapterLabel(base.actionType),
    title: base.sourceTitle,
    status: policy.externalExecution && connectorPolicy.connectorReady ? "ready" : "blocked",
    externalExecution: Boolean(policy.externalExecution && connectorPolicy.connectorReady),
    connectorReady: Boolean(connectorPolicy.connectorReady),
    connectorConnected: Boolean(connectorPolicy.connectorConnected),
    requiredConnector: connectorPolicy.requiredConnector,
    blocker: policy.externalExecution
      ? (connectorPolicy.connectorReady ? "" : "external_connector_missing")
      : "external_execution_disabled",
    summary: `${getActionTypeLabel(base.actionType)} 실행 전 패키지`,
    warnings: [
      "현재 기본 정책은 외부 서비스 자동 실행을 차단합니다.",
      connectorPolicy.requiredConnector && !connectorPolicy.connectorReady
        ? `${getAdapterLabel(base.actionType)} 쓰기 커넥터가 아직 준비되지 않았습니다.`
        : "",
      "실제 실행 전 수신자, 날짜, 공유 권한, 개인정보를 운영자가 확인해야 합니다.",
    ].filter(Boolean),
    ...specific,
  };
}

function formatPackageOutput(pkg = {}) {
  const preview = pkg.payloadPreview && typeof pkg.payloadPreview === "object"
    ? Object.entries(pkg.payloadPreview)
      .map(([key, value]) => {
        const rendered = Array.isArray(value)
          ? value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("\n")
          : String(value ?? "");
        return `${key}: ${rendered}`;
      })
      .join("\n")
    : "미리보기 없음";
  return [
    `${pkg.summary || "실행 패키지"}`,
    `대상 도구: ${pkg.targetApp || pkg.adapter || "Tool"}`,
    `외부 실행: ${pkg.externalExecution ? "허용" : "차단"}`,
    "",
    "[실행 전 단계]",
    ...(pkg.steps ?? []).map((step, index) => `${index + 1}. ${step}`),
    "",
    "[패키지 미리보기]",
    preview,
  ].join("\n").trim();
}

function buildDryRun(action = {}, options = {}) {
  const pkg = buildExecutionPackage(action, options);
  return {
    at: new Date().toISOString(),
    adapter: "tool-adapter-local-v1",
    externalExecution: false,
    package: pkg,
    outputText: formatPackageOutput(pkg).slice(0, 1800),
    warnings: pkg.warnings ?? [],
  };
}

function execute(action = {}, options = {}) {
  const policy = normalizePolicy(options.policy);
  const pkg = buildExecutionPackage(action, { policy });
  if (!policy.externalExecution) {
    return {
      ok: false,
      status: "blocked",
      code: "external_execution_disabled",
      externalExecution: false,
      message: "운영 정책상 외부 서비스 자동 실행이 꺼져 있어 실행 패키지만 생성했습니다.",
      package: pkg,
    };
  }
  const connectorPolicy = resolveConnectorPolicy(policy, action.actionType || action.action_type || "document_draft");
  if (!connectorPolicy.connectorReady) {
    return {
      ok: false,
      status: "blocked",
      code: connectorPolicy.requiredConnector
        ? `${connectorPolicy.requiredConnector}_connector_missing`
        : "external_connector_missing",
      externalExecution: false,
      message: connectorPolicy.connectorConnected
        ? "외부 계정은 감지됐지만 쓰기 권한이 아직 비활성화되어 실제 실행을 막았습니다."
        : "외부 계정/OAuth 커넥터가 아직 연결되지 않아 실제 실행을 막았습니다.",
      package: pkg,
    };
  }
  return {
    ok: false,
    status: "blocked",
    code: "adapter_not_implemented",
    externalExecution: false,
    message: "실제 외부 실행 어댑터는 아직 연결되지 않았습니다.",
    package: pkg,
  };
}

window.HayeonToolAdapters = {
  defaultPolicy,
  getActionTypeLabel,
  getAdapterLabel,
  buildExecutionPackage,
  buildDryRun,
  execute,
};
})();
