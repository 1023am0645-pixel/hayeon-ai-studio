# HA:YEON AI STUDIO AI Agent 자동화 구현 계획서

## 현재 구조 요약

- 프론트엔드 앱은 `index.html`에서 `src/data/office-data.js`, `src/services/ai-adapter.js`, `src/app.js`를 불러오는 정적 앱 구조다.
- AI 호출은 `worker.js`의 `/api/agent` 엔드포인트가 Cloudflare Workers AI `AI` 바인딩을 호출한다.
- 직원별 역할, 프롬프트, 아바타, 층 배치 데이터는 `src/data/office-data.js`에 있다.
- 직원 채팅, 업무 생성, 오케스트레이션 실행, 검토 흐름은 `src/app.js`에서 관리한다.
- 현재 업무/채팅/오케스트레이션 상태는 주로 브라우저 `localStorage`에 저장된다.

## 핵심 개선 목표

1. AI API를 역할별로 분리해 유지보수성과 안정성을 높인다.
2. 오케스트레이션 실행 상태를 서버 저장소에 남길 수 있게 준비한다.
3. 사용자가 페이지를 닫아도 업무 실행 상태와 결과를 복구할 수 있게 한다.
4. 직원별 산출물, 대화, 검토 결과를 구조화해서 재사용 가능하게 만든다.
5. 외부 업무 도구 연동은 승인 기반으로 단계적으로 추가한다.

## 우선순위

### P0. 안정화 기반

- `worker.js`에서 AI API를 역할별 경로로 분리한다.
  - `/api/agent/reply`: 직원 단일 응답
  - `/api/agent/plan`: 업무 분배 계획
  - `/api/agent/summarize`: 오케스트레이션 요약
  - `/api/agent`: 기존 호환 경로
- 응답 형식을 `{ ok, text, data, error, requestId }` 형태로 통일한다.
- 관리자 토큰 검증, Origin 검증, 입력 길이 제한을 공통 처리한다.
- `src/services/ai-adapter.js`가 새 API 경로를 사용하도록 정리한다.

### P1. 서버 저장과 실행 이관

- Cloudflare D1 또는 KV를 연결해 업무 상태를 저장한다.
- 추천 D1 테이블:
  - `agent_runs`: 오케스트레이션 실행 단위
  - `agent_run_items`: 직원별 세부 업무
  - `tasks`: 업무 보드 항목
  - `chat_messages`: 직원 대화 기록
  - `artifacts`: 산출물 텍스트와 파일 메타데이터
- 브라우저 중심 실행을 Worker 중심 실행으로 옮긴다.
- 실행 중 새로고침/재접속해도 상태를 복원한다.

### P2. 개인 업무 자동화 도구 연결

- 캘린더, 문서, 메일, 노션, 구글 드라이브 같은 외부 도구는 별도 tool adapter로 분리한다.
- 외부 전송, 일정 생성, 파일 업로드처럼 되돌리기 어려운 작업은 사용자 승인 단계를 둔다.
- 반복 업무는 Cloudflare Cron Triggers 또는 Queue 기반으로 분리한다.

### P3. 운영 품질 개선

- 실행 로그, 실패 원인, 재시도 버튼을 추가한다.
- 직원별 성과와 자주 쓰는 업무 템플릿을 누적한다.
- 모델/provider 교체가 쉬운 구조로 확장한다.

## 1차 수정 파일 목록

- `worker.js`: AI API 라우팅 분리, 공통 검증, 공통 응답 형식
- `src/services/ai-adapter.js`: 새 API 경로 연결
- `AI_AGENT_AUTOMATION_PLAN.md`: 구현 계획 문서

## 2차 저장소 기반 준비

- `migrations/0001_agent_automation.sql`: D1 저장소 스키마 초안
- `wrangler.toml`: `AGENT_DB` D1 바인딩 주석형 초안
- `worker.js`: `/api/automation/health`, `/api/automation/runs`, `/api/automation/runs/:id` 기본 골격
- D1이 연결되지 않은 배포 환경에서는 기존 화면을 깨지 않고 `agent_db_missing`을 반환한다.

## 3차 프론트-서버 저장 연결 준비

- `src/services/automation-store.js`: 프론트에서 `/api/automation/*`를 호출하는 저장소 adapter
- `src/app.js`: 오케스트레이션 시작, 직원별 진행, 완료/검토 상태를 서버 run/item에 동기화
- `worker.js`: run 상태 PATCH, run item upsert API 추가
- D1이 아직 연결되지 않은 경우 기존 localStorage 실행 흐름을 유지한다.

## 이후 예상 수정 파일

- `wrangler.toml`: D1/KV/Queue/R2 바인딩 추가
- `src/app.js`: 서버 저장소 기반 오케스트레이션 상태 동기화
- `src/data/office-data.js`: 직원 agent metadata 정리
- `src/services/state-store.js`: localStorage와 서버 저장소 사이 추상화
- `migrations/*.sql`: D1 테이블 스키마

## 진행 원칙

- 기존 화면, 직원 데이터, 층 클릭, 업무 보드, 직원 상세 기능은 유지한다.
- `/api/agent` 기존 경로는 당분간 호환용으로 남긴다.
- 저장소에 있는 대용량 임시 파일은 커밋하지 않는다.
- Claude Code와 병행 작업 시 매 단계 시작 전 `git status`와 최신 커밋을 확인한다.
