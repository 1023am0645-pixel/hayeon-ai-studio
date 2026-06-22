# HA:YEON AI STUDIO

사내 강사 활동 · 강의 아카이브 · AX-서포터즈 활동을 운영하는 AI 기반 작업실/라이브 오피스 MVP입니다.

Space Label: LIVE OFFICE  
Subcopy: Lecture · Archive · AX · App Workflow

현재 버전은 의존성 설치 없이 바로 열 수 있는 정적 웹앱입니다. 직원, 부서, 업무 데이터는 분리되어 있어 이후 Next.js + TypeScript + Tailwind CSS 구조로 옮기기 쉽도록 구성했습니다.

## 실행 방법

```bash
python3 -m http.server 8062
```

브라우저에서 아래 주소를 엽니다.

```text
http://127.0.0.1:8062/index.html
```

## 폴더 구조

```text
.
├── index.html
├── README.md
└── src
    ├── app.js
    ├── data
    │   └── office-data.js
    ├── services
    │   └── ai-adapter.js
    └── styles.css
```

## 구현된 1차 MVP 기능

- 한 화면에 들어오는 2D 미니 오피스 평면도
- 대표실, 관제실, 강의기획본부, 콘텐츠제작본부, 강의운영본부, 아카이브 / 성과관리본부, AX-서포터즈 사업부, 앱개발팀, 자동화팀, 회의실, 탕비실-휴게
- 작은 AI 직원 스프라이트, 이름표, 상태등, 짧은 말풍선 표시
- 방별 우측 하단 설명 텍스트와 책상, 모니터, 파일함, 회의 테이블, 소파 등 오피스 소품 표시
- 상태 색상: 초록 업무 중, 노랑 준비 중, 파랑 대기 중, 빨강 점검 필요
- 직원 클릭 시 상세 패널 표시
- 업무 지시하기, 대화하기, 업무 히스토리 보기
- 상단 할 일판 버튼으로 열리는 퀘스트 보드형 업무 드로어
- 전체 업무 칸반 보드: 할 일, 진행 중, 검토 중, 완료
- 업무 생성, 수정, 삭제, 상태 이동
- 직원에게 업무 지시 시 상태가 업무 중으로 변경
- 진행 중 업무가 일정 시간 뒤 검토 또는 완료로 이동하는 시뮬레이션
- 브라우저 localStorage 저장

## 주요 파일 설명

`src/data/office-data.js`

- 앱 이름, 상태 메타데이터, 부서, 직원, 샘플 업무를 관리합니다.
- 비개발자도 직원 이름, 역할, 말풍선, system prompt, 샘플 업무를 한 곳에서 수정할 수 있습니다.

`src/app.js`

- 화면 렌더링, 직원 선택, 업무 생성/수정/삭제, 상태 전환, localStorage 저장을 담당합니다.
- 실제 AI 호출 없이 업무 처리 흐름을 시뮬레이션합니다.

`src/services/ai-adapter.js`

- 향후 OpenAI, Gemini, Claude API를 붙일 때 사용할 어댑터 자리입니다.
- 직원별 system prompt와 사용자 업무 지시를 하나의 요청 형태로 묶는 함수가 있습니다.

`src/styles.css`

- 미니 오피스 평면도, 방별 grid area, 직원 스프라이트, 말풍선, 상태등, 업무 드로어, 반응형 스타일을 담당합니다.

## 이후 확장 포인트

1. Next.js 전환
   - `index.html`은 `app/page.tsx`로, `src/app.js`의 상태 로직은 React 컴포넌트와 커스텀 훅으로 옮기면 됩니다.
   - `src/data/office-data.js`는 `src/data/office-data.ts`로 타입을 붙여 사용할 수 있습니다.

2. 저장소 연동
   - 현재는 localStorage를 사용합니다.
   - 업무, 직원, 아카이브 기록을 Supabase 또는 Firebase 컬렉션으로 분리하면 여러 기기에서 이어서 쓸 수 있습니다.

3. AI API 연결
   - `src/services/ai-adapter.js`의 `buildEmployeePrompt()`를 서버 API 라우트로 전달합니다.
   - 직원별 `prompt.system`을 사용하면 강의 PD, PPT 디자이너, 아카이브 큐레이터, AX 과제 PM이 서로 다른 역할로 응답할 수 있습니다.

4. 2차 기능
   - 회의 시작 시 참여 직원이 회의실로 이동하는 애니메이션
   - 휴식 상태 직원의 휴게실 이동
   - 강의 기록 및 AX 활동 기록용 아카이브 페이지
   - 부서와 직원을 직접 추가/수정/삭제하는 관리자 설정 페이지
