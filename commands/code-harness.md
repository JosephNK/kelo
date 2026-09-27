---
description: TASKS.md + TASKS-QA-COMMON.md + tasks-qa/ 기반 Generator↔Evaluator 피드백 루프
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
argument-hint: '<대상 ID> [--once] [--confirm-commit] [--max-rounds N] [task-source] [eval-source]'
---

# Generator↔Evaluator Feedback Loop

> 사용자가 작성한 TASKS.md(task-source)·`TASKS-QA-COMMON.md`+`tasks-qa/` 또는 `PHASES-QA-COMMON.md`+`phases-qa/`(eval-source)를 정본으로 Task 단위 구현-검증을 실행한다. **1회 실행 = 1라운드**, 루프 기본 활성(ScheduleWakeup 자동 재개). `--once`로 단일 라운드 모드.

## Architecture

```
TASKS.md ─────────────┐
TASKS-QA-COMMON.md ───┤→ Generator(kelo:code-generator)
tasks-qa/Task-N.md ───┘   → Gate 1 코드 리뷰 (ecc:{stack}-reviewer → SKIP; `--codex` 시 codex 우선)
                          → Gate 2 린트·빌드
                          → Gate 3 Evaluator(kelo:code-evaluator) ─ feedback ─┐
                          ▲──────────────────────────────────────────────────┘
```

## 상태 디렉토리

모든 라운드 간 정보는 파일로 전달한다. 디렉토리가 없으면 생성한다.

```
code-harness/
├── harness-state/
│   ├── state.json              ← 현재 라운드, Task ID, 상태
│   ├── generator-state.md      ← Generator 구현 결과
│   └── feedback/
│       ├── feedback-001.md     ← Round 1 피드백
│       ├── feedback-002.md     ← Round 2 피드백
│       └── ...
└── reports/
    ├── Task-1.md               ← Task별 리포트
    └── Task-1to5-summary.md    ← 종합 리포트
```

> **파일명 규칙**: feedback은 `feedback-{round}.md` (round 3자리 zero-padding, 예: `feedback-001.md`). 리포트는 공백→`-`, `~`→`to` 치환 (예: `Task-1.md`, `Task-1to5-summary.md`).

### state.json 구조

```json
{
  "taskSource": "code-harness/TASKS.md",
  "evalSource": "code-harness/TASKS-QA-COMMON.md",
  "mode": "tasks",
  "currentTaskId": "Task 1",
  "taskQueue": ["Task 1", "Task 2", "Task 3"],
  "round": 1,
  "maxRounds": 10,
  "loopMode": true,
  "autoCommit": true,
  "useCodex": false,
  "status": "initializing",
  "lastUpdated": "2026-04-16T01:00:00Z",
  "lastFailedGate": null,
  "codexAvailable": null,
  "projectStack": null,
  "commitRetryCount": 0,
  "completedTasks": [],
  "currentSlices": null
}
```

> **currentSlices** 구조 (Step 2.5에서 설정):
> ```json
> "currentSlices": {
>   "taskSlice": "code-harness/tasks/Task-1.md",
>   "evalSlice": "code-harness/tasks-qa/Task-1.md"
> }
> ```
> 항상 슬라이스 파일 경로만 들어간다 (검증 실패 시 fallback 없이 즉시 중단 — Step 2.5-2 참조). Task 전환 시 `null`로 초기화된다.

#### status 값 정의

| 값 | 의미 | Step 1 라우팅 |
|----|------|---------------|
| `"initializing"` | state.json 생성 직후, Step 3 시작 전 | Step 2 (라운드 패널티 없이 시작) |
| `"in-progress"` | Step 3 실행 중 (Generator/Gate 진행 중) | crash recovery 처리 후 종료 |
| `"pass"` | 현재 Task PASS 완료 | Task 전환 처리 |
| `"fail"` | 현재 라운드 FAIL | round 체크 후 재시도 또는 FAIL 리포트 |
| `"finalizing-pass"` | Step 5 PASS 처리 중 (커밋/리포트) | Step 5 PASS 재개 |
| `"finalizing-fail"` | Step 5 FAIL 처리 중 (롤백/리포트) | Step 5 FAIL 재개 |

## Arguments

**$ARGUMENTS**

| 인자 | 필수 | 설명 |
|------|------|------|
| `대상 ID` | O | Task ID 또는 범위 (예: "Task 1", "Task 1~5") |
| `task-source` | X | Task 정의 + Acceptance Criteria 파일 (기본: `code-harness/TASKS.md`) |
| `eval-source` | X | QA 공통 문서 (기본: `code-harness/TASKS-QA-COMMON.md` / phases 모드는 `code-harness/PHASES-QA-COMMON.md`). 단위별 QA 파일(`tasks-qa/Task-N.md` · `phases-qa/Phase-N.md`)은 이 경로로부터 자동 도출된다 |
| `--once` | X | 1라운드만 실행 후 종료 (기본값: 루프 활성 — PASS 또는 maxRounds 도달까지 자동 반복) |
| `--confirm-commit` | X | 커밋 전 사용자 확인 프롬프트 활성화 (기본값: 자동 커밋). 루프 중에도 허용되지만 사용자 부재 시 라운드가 멈출 수 있다 |
| `--max-rounds N` | X | 루프 최대 라운드 수 (기본: 10) |
| `--codex` | X | Gate 1 코드 리뷰에 `codex review --uncommitted` 우선 사용 (기본값: ecc:{stack}-reviewer). codex 실패·미설치 시 ecc로 fallback |

### 인자 파싱 규칙

1. 첫 번째 인자가 `Task`로 시작하거나 따옴표로 감싸진 경우 → **대상 ID**로 인식, task-source/eval-source는 기본값 사용
2. 인자가 3개 이상이고 첫 번째 인자가 파일 경로(`.md`로 끝남)인 경우 → 순서대로 `task-source`, `eval-source`, `대상 ID`로 파싱 (기존 호환)

### 범위 파싱

`Task N~M` 형식에서 N과 M은 정수. `Task N`, `Task N+1`, ..., `Task M`으로 확장하여 taskQueue에 추가한다. 각 Task ID 존재 여부는 Bash로 `test -f "$task_slice_dir/Task-${n}.md"`로 확인한다 (**Read 도구 금지** — 슬라이스 파일 존재 여부만 검사). 하나라도 누락되면 `/kelo:code-tasks` 재실행을 안내하고 즉시 중단한다 (하네스는 슬라이스를 생성하지 않는다).

### 예시

```bash
# 기본값 — 루프 + 자동 커밋 (완전 자율 실행)
/kelo:code-harness "Task 1"
/kelo:code-harness "Task 1~5"

# 1라운드만 실행 (자동 커밋)
/kelo:code-harness "Task 1" --once

# 커밋 전 확인 — 루프 중에도 매 커밋 승인 (자리 비움 시 멈출 수 있음)
/kelo:code-harness "Task 1" --confirm-commit

# Gate 1 코드 리뷰에 codex 우선 사용 (미설치/실패 시 ecc fallback)
/kelo:code-harness "Task 1" --codex

# 1라운드 수동 검수 (디버깅 시)
/kelo:code-harness "Task 1" --once --confirm-commit

# 명시적 — 파일 경로를 직접 지정
/kelo:code-harness code-harness/TASKS.md code-harness/TASKS-QA-COMMON.md "Task 1"
/kelo:code-harness code-harness/PHASES.md code-harness/PHASES-QA-COMMON.md "Phase 1"
```

---

## Procedure

### Step 1: 상태 확인

`code-harness/harness-state/state.json`을 읽는다.

#### 상태 파일이 없는 경우 (첫 실행)

**선행 조건 확인** — 아래 규칙에 따라 판정하고, 충족하지 못하면 실행을 **중단**하고 안내 메시지만 출력한다:

- **$ARGUMENTS에 명시적 task-source/eval-source 경로가 포함된 경우** (예: `/kelo:code-harness code-harness/TASKS.md code-harness/TASKS-QA-COMMON.md "Task 1"`):
  - 지정된 두 파일이 **실제로 존재**하는지만 확인한다
  - 존재하지 않으면 중단하고 안내한다 (경로 오타/미생성)
  - 존재하면 `code-harness/` 기본 경로 탐색은 건너뛰되, **아래 "선행 조건 충족 이후" 흐름으로 이동**하여 대상 ID 선택 → state.json 생성 단계는 반드시 수행한다 (바로 Step 2로 건너뛰지 않는다)

- **명시적 경로가 없는 경우** (기본 경로 탐색으로 진입):
  - `code-harness/` 디렉토리에 **TASK 키워드 포함 `.md` 파일이 1개 이상** 존재
  - `code-harness/` 디렉토리에 **QA/TEST/EVAL 키워드 포함 `.md` 파일이 1개 이상** 존재
  - 둘 중 하나라도 0개면 중단

안내 메시지는 스펙 문서 작성 순서(`/kelo:code-plan` → `/kelo:code-tasks` → `/kelo:code-qa`) 또는 직접 경로 지정(`/kelo:code-harness <TASKS> <QA> "Task 1"`)을 제시한다. **state.json은 생성하지 않고 즉시 종료**(중간 상태 방지).

> **PLAN/TASKS 교체 시**: 새 PLAN으로 전환할 땐 `/kelo:code-harness` 실행 전 `code-harness/harness-state/`를 수동 삭제해야 이전 라운드 state와 충돌하지 않는다.

---

선행 조건을 충족한 경우, 아래 단계로 진행한다. **명시적 경로 케이스·기본 경로 케이스 모두** 이 흐름을 거쳐 state.json 초기화까지 수행한다. $ARGUMENTS가 비어 있거나 부족한 단계에서는 사용자에게 선택형으로 입력받는다.

1. **task-source 결정**
   - 명시적 경로가 있으면 그대로 사용
   - 없으면 `code-harness/` 에서 TASK 키워드 포함 `.md` 파일 탐색 후 번호 목록 표시
2. **eval-source 결정**
   - 명시적 경로가 있으면 그대로 사용
   - 없으면 `code-harness/` 에서 QA, TEST, EVAL 키워드 포함 `.md` 파일 탐색 후 번호 목록 표시
3. **모드 일관성 검증** — task-source와 eval-source가 같은 모드(tasks/phases)에서 나온 쌍인지 확인한다. 짝이 맞지 않으면 **즉시 중단**하고 안내한다 (tasks-qa/, phases-qa/ 폴더가 공존할 때 잘못된 선택 방지).

   **모드 판정**:
   - task-source basename이 `TASKS*` → tasks 모드 / `PHASES*` → phases 모드 / 그 외 → unknown
   - eval-source basename이 `TASKS-QA-COMMON.md` 또는 `QA.md` → tasks 모드 / `PHASES-QA-COMMON.md` 또는 `PHASES-QA.md` → phases 모드 / 그 외 → unknown

   **검증 로직**:
   - 두 모드가 모두 판정되고 **일치하면** 통과
   - 한쪽이라도 `unknown` → **경고**만 출력하고 통과 (사용자 지정 경로 이름 규칙을 강제하지 않는다)
   - 두 모드가 모두 판정되었으나 **다르면** → 중단. 메시지 예: `모드 불일치: task-source=tasks, eval-source=phases. 올바른 짝 (TASKS.md + TASKS-QA-COMMON.md) 또는 (PHASES.md + PHASES-QA-COMMON.md)으로 다시 지정하세요.`
   - 검증 통과 후 판정된 모드를 state.json의 `mode` 필드에 저장 (추후 슬라이스 파일명 패턴 결정에 사용)
4. **대상 ID 결정** — task-source의 슬라이스 디렉토리(`$task_slice_dir`, 도출 규칙은 Step 2.5 참조)에서 단위 목록을 추출한다 (**Read 도구 금지** — 슬라이스 파일명만 사용). 슬라이스 파일명 패턴은 3단계에서 판정한 모드에 따른다:
   - tasks 모드: `Task-*.md`
   - phases 모드: `Phase-*.md` (소수 번호 `Phase-0.5.md` 등 포함)
   - **선행 조건 검사**: `ls "$task_slice_dir"/<pattern> 2>/dev/null` 결과가 0건이면 슬라이스 미생성 상태로 판정. `/kelo:code-tasks "$task_source"` 또는 `/kelo:code-phases "$task_source"`를 먼저 실행하라는 안내 후 **즉시 중단**한다 (하네스는 슬라이스를 생성하지 않는다 — Rule 14)
   - 슬라이스가 존재하면 `ls "$task_slice_dir"/<pattern> | xargs -n1 basename | sed 's/\.md$//'`로 단위 ID 목록(`Task-1`/`Phase-0` 등)을 사용자에게 표시
   - 인자로 대상 ID가 주어졌으면 그대로 사용
5. **옵션 파싱**:
   - `--max-rounds N` (기본 10)
   - `--once` → `loopMode = false` (기본 true)
   - `--confirm-commit` → `autoCommit = false` (기본 true)
   - `--codex` → `useCodex = true` (기본 false)

> 각 단계에서 반드시 사용자 응답을 기다린다. 사용자 입력 없이 자동으로 진행하지 않는다.

인자 확인 후 state.json을 `status: "initializing"`, `loopMode: {parsed}`, `autoCommit: {parsed}`, `useCodex: {parsed}`로 생성하고 Step 2로 진행한다.

#### 상태 파일이 있는 경우 (이어서 실행)

state.json에서 현재 Task, 라운드, 상태를 읽고 아래 분기를 적용한다.

- `status: "initializing"` → Step 2로 (라운드 패널티 없이 재시작)
- `status: "pass"` → **Task 전환 처리 (crash recovery)**: "Task 전환 정리 절차" 수행 (idempotent). 이후 `taskQueue` 비어 있으면 Step 6으로, 아니면 Step 2로
- `status: "fail"` + `round > maxRounds` → Step 5 (FAIL 리포트)
- `status: "fail"` + `round <= maxRounds` → Step 2로 (스택/codex(useCodex 시) 캐시 확인 후 Step 3 진행)
- `status: "in-progress"` → 이전 실행이 비정상 종료(crash/timeout)된 것으로 간주. `status: "fail"`, `lastFailedGate: "incomplete"`로 업데이트 (round는 증가하지 않음 — 같은 라운드를 재시도) 후 **종료** — 다음 실행(ScheduleWakeup 또는 수동 재실행)에서 `status: "fail"` 분기로 진입
- `status: "finalizing-pass"` → Step 5 PASS 처리를 재개한다 (이전 실행이 Step 5 PASS 중 crash)
- `status: "finalizing-fail"` → Step 5 FAIL 처리를 재개한다 (이전 실행이 Step 5 FAIL 중 crash)

### Step 2: 프로젝트 스택 감지

`.gitignore`에 `code-harness/`가 없으면 추가한다 (initializing 재진입 시 누락 방지). 하위 항목을 개별 등록하지 않고 폴더 전체를 무시한다.

state.json에 `projectStack`이 이미 설정되어 있고(`useCodex: true`인 경우 `codexAvailable`도 함께) 재감지를 건너뛰고 Step 3로 진행한다.

프로젝트 루트에서 첫 번째 매치로 스택을 판단하여 `projectStack`에 저장한다.

| projectStack | 감지 파일 | Gate 2 명령 |
|---|---|---|
| Flutter/Dart | `pubspec.yaml` | `dart format . && dart analyze` (analyzer가 architecture_lint 진단 통합) |
| Node.js/TS/JS | `package.json` | `git add -A && npx lint-staged` + 중복검사 `npx jscpd src/` |
| Kotlin/Android | `build.gradle.kts` / `build.gradle` | `./gradlew ktlintCheck && ./gradlew build` |
| Rust | `Cargo.toml` | `cargo fmt --check && cargo clippy -- -D warnings && cargo build` |
| Go | `go.mod` | `gofmt -l . && go vet ./... && go build ./...` |
| Python | `pyproject.toml` / `setup.py` | `ruff check . && ruff format --check .` |
| Swift | `Package.swift` | `swift build` |
| C#/.NET | `*.csproj` / `*.sln` | `dotnet format --verify-no-changes && dotnet build` |
| 그 외 | — | Gate 2 SKIP |

> **Flutter analysis_server_plugin**: architecture_lint(및 stack lint 패키지)는 `analysis_options.yaml`의 top-level `plugins:`에 등록되어 `dart analyze` 실행 시 진단이 함께 보고된다. 별도 `dart run custom_lint` 호출은 더 이상 필요 없다.

#### codex CLI 감지 (`useCodex: true`일 때만)

`useCodex: false`이면 감지를 건너뛰고 `codexAvailable: null`을 유지한다. `useCodex: true`일 때만 `which codex`로 설치 여부를 확인하고 결과를 `codexAvailable`에 저장한다.

Step 2 완료 후 `status: "in-progress"`로 업데이트하고 Step 2.5로 진행한다.

### Step 2.5: 단위 슬라이스 확인 및 갱신

Generator/Evaluator에 **전체 문서** 대신 현재 단위(Task 또는 Phase)에 해당하는 **슬라이스 한 조각**만 전달하여 라운드별 토큰 소비를 줄인다.

#### 2.5-1. 슬라이스 경로 결정

task-source와 eval-source 각각에 대해 슬라이스 디렉토리를 아래 규칙으로 결정한다:

**task-source (일반 파일 규칙 적용)**:
```
slice_dir = <dirname(source)> / <basename(source) lowercase, .md 제거> /
```
- `code-harness/TASKS.md` → `code-harness/tasks/`
- `code-harness/PHASES.md` → `code-harness/phases/`

**eval-source (`-QA-COMMON.md` 전용 규칙)**:
```
if basename(source) matches *-QA-COMMON.md:
  slice_dir = <dirname(source)> / <basename(source) lowercase, "-qa-common.md" 제거>-qa/
else:
  (일반 파일 규칙 fallback — 기존 호환)
```
- `code-harness/TASKS-QA-COMMON.md` → `code-harness/tasks-qa/`
- `code-harness/PHASES-QA-COMMON.md` → `code-harness/phases-qa/`

**슬라이스 파일명**:
```
slice_path = slice_dir / <currentTaskId 공백을 '-'로 치환>.md
```
- currentTaskId=`Task 1` → `Task-1.md`
- currentTaskId=`Phase 0.5` → `Phase-0.5.md`

파일명 sanitize는 리포트 파일과 동일 규칙(공백 → `-`, `~` → `to`)을 따른다.

#### 2.5-2. 슬라이스 검증 (생성·갱신 금지)

하네스는 슬라이스를 생성하거나 재생성하지 않는다. 각 source에 대해 다음을 순서대로 검증하고, 어느 하나라도 실패하면 사용자에게 안내 후 **즉시 중단**한다.

1. **슬라이스 파일 존재 확인**: `slice_path`가 없으면 → 중단. task-source는 `/kelo:code-tasks "$task_source"`, eval-source는 `/kelo:code-qa "$eval_source"` 재실행을 안내
2. **SHA 일치 확인** (source 타입별 분기):
   - **task-source**: 슬라이스 첫 줄 주석(`<!-- sliced from ... @ sha ... -->`)의 SHA와 source 현재 SHA 비교
     ```bash
     current_sha=$(shasum -a 1 "$source" | awk '{print $1}' | cut -c1-12)
     slice_sha=$(head -1 "$slice_path" | sed -nE 's/.*@ sha ([a-f0-9]+) .*/\1/p')
     [ "$current_sha" = "$slice_sha" ]
     ```
     불일치 → source가 슬라이싱 이후 수정됨. 중단하고 `/kelo:code-tasks` 재실행을 안내한다
   - **eval-source (`-QA-COMMON.md` 패턴)**: SHA 검증을 **건너뛴다**. 단위 QA 파일은 `code-qa`가 직접 생성한 산출물(슬라이스가 아님)이므로 source 대비 SHA 체크가 성립하지 않는다. 대신 파일 존재 여부만 검증한다.
   - **eval-source (그 외 `-QA-COMMON.md`가 아닌 경우)**: 기존 task-source와 동일한 SHA 규칙 적용 (하위 호환)

> **재슬라이싱 책임 분리**: 슬라이스/단위 QA 파일 생성은 `code-tasks` / `code-qa`의 단독 책임이다 (Rule 14). 하네스는 stale 자동 갱신도 수행하지 않는다 — source 변경이 의도된 것인지(새 Task 추가)는 사용자만 판단할 수 있고, 자동 재생성은 진행 중인 라운드 컨텍스트와 충돌할 수 있다.

#### 2.5-3. 슬라이스 경로 확정

검증을 모두 통과하면 state.json에 경로를 저장 후 Step 3로 진행한다 (fallback 없음 — 검증 실패는 전부 중단):

```json
"currentSlices": {
  "taskSlice": "code-harness/tasks/Task-1.md",
  "evalSlice": "code-harness/tasks-qa/Task-1.md"
}
```

> **Task 전환 시 (Step 5 PASS 분기)**: state.json의 `currentSlices`를 **초기화**한다 (다음 Task 진입 시 Step 2.5에서 새로 설정됨). 슬라이스 파일 자체는 삭제하지 않는다 — 같은 Task를 재실행하거나 범위 실행에서 재사용 가능.

### Step 3: 현재 라운드 실행

현재 Task에 대해 아래를 순서대로 실행한다.

#### 3-1. Generator 단계

**kelo:code-generator** 에이전트(Agent 도구의 `subagent_type: "kelo:code-generator"`)를 소환하여 Task를 구현한다.

- task-source, eval-source, Task ID를 전달 (슬라이스 경로 — Rule 14 참조)
- Generator는 `code-harness/harness-state/feedback/` 에서 이전 피드백을 읽고, 구현 결과를 `code-harness/harness-state/generator-state.md`에 쓴다

#### 3-1.5. 구조 불일치 검사 (ARCHITECTURE.md 강제)

Generator 호출 완료 직후, Gate 진입 전에 `code-harness/harness-state/generator-state.md`의 `### 구조 불일치 경고` 섹션에서 **STATUS 마커를 파싱**한다.

**파싱 규칙**: 섹션 헤딩 다음에 나오는 첫 번째 비어있지 않은 줄에서 `STATUS:` 뒤의 값(공백 제거, 대소문자 무시)을 읽는다.

- `STATUS: NONE` 또는 섹션 자체가 없음 → 정상. **Gate 1로 진행**
- `STATUS: MISMATCH` → 아래 절차로 **Task를 즉시 FAIL 처리**:

  1. Gate 1/2/3를 **모두 건너뛴다** (round 비증가 — Rounds 계산 주석 참조)
  2. state.json 업데이트: `status: "finalizing-fail"`, `lastFailedGate: "structure-mismatch"`
  3. Step 5 Task 리포트 작성:
     - Status: `FAIL`
     - Rounds: 현재 `round` 값
     - 리포트 본문의 `## 구조 불일치 경고` 섹션에 generator-state.md의 `### 구조 불일치 경고` 섹션 내용을 **그대로 복사**
  4. `git checkout -- . && git clean -fd -e code-harness/` (부분 생성 파일 롤백) → "Task 전환 정리 절차" 수행
  5. `taskQueue` 비어 있으면 Step 6으로, 아니면 종료 (loopMode면 ScheduleWakeup — Rule 1 참조)

> **PLAN escape + 재시도 없음**: Generator가 PLAN의 `## 아키텍처 변경 필요: 승인됨`을 확인하면 `STATUS: NONE`을 기록하므로 하네스는 PLAN을 재확인하지 않는다. 구조 불일치는 라운드 반복으로 해결되지 않아 round 비증가·maxRounds 무관이며, 사용자가 PLAN·Task를 수정한 뒤 Task를 taskQueue에 수동 재등록해야 한다.

#### 3-2. Gate 1: 코드 리뷰

state.json의 `useCodex`에 따라 리뷰어 경로를 선택한다:

- **`useCodex: false` (기본)** — `projectStack`에 매핑된 ecc 리뷰어를 **바로 소환**한다 (아래 매핑 표). 매핑 없음·ecc 플러그인 미설치·에이전트 호출 실패 시 Gate 1을 **SKIP**하고 Gate 2로 진행. SKIP/실패 사유는 `generator-state.md`의 Gate 1 섹션에 기록
- **`useCodex: true` + `codexAvailable: true`** — 메인이 `codex review --uncommitted`를 직접 실행한다. 실패(exit ≠ 0)·출력 파싱 불가 시 에러 유형을 구분하지 않고 **즉시 ecc 경로로 fallback**한다 (위와 동일 동작). 실패 상세는 `generator-state.md`의 Gate 1 섹션에 `Gate 1 codex 실패 → fallback 전환: {exit code + 에러 요약 3줄}`로 기록
- **`useCodex: true` + `codexAvailable: false`** — codex 미설치. 경고를 `generator-state.md`에 기록하고 ecc 경로로 진행

> codex 실패는 네트워크(rate limit/timeout) 또는 설정 오류일 수 있으나, ecc 리뷰어는 로컬 에이전트라 codex 이슈와 독립적으로 동작한다. 에러 유형 판별 없이 즉시 fallback이 단순·안정적이다.

##### 리뷰 에이전트 매핑

| projectStack | 리뷰어 에이전트 |
|---|---|
| Flutter/Dart | `ecc:flutter-reviewer` |
| Node.js/TS/JS | `ecc:typescript-reviewer` |
| Kotlin/Android | `ecc:kotlin-reviewer` |
| Rust | `ecc:rust-reviewer` |
| Go | `ecc:go-reviewer` |
| Python | `ecc:python-reviewer` |
| C#/.NET | `ecc:csharp-reviewer` |
| Swift / 그 외 | (매핑 없음 → Gate 1 SKIP) |

##### 에이전트 출력 해석

ecc 리뷰 에이전트는 `Review Summary` 테이블과 `Verdict: Approve | Warning | Block` 형식으로 응답한다. 아래 규칙으로 codex 판정과 동일하게 정규화한다:

- `Verdict: Approve` → **approve**
- `Verdict: Warning` → `CRITICAL/HIGH`가 0건이면 **approve**(경고 부록), 아니면 **needs-attention**
- `Verdict: Block` → **needs-attention**
- 심각도 정규화: `CRITICAL → critical`, `HIGH → high`, `MEDIUM → medium`, `LOW → low` (소문자)

어느 경로든 결과 판정은 동일하다:
- **approve** → Gate 2로
- **needs-attention (critical/high/medium)** → FAIL 처리 → Step 4로
- **needs-attention (low만)** → `generator-state.md`에 경고 부록으로 기록하고 Gate 2로 진행 (Step 5 리포트의 Gate 1 섹션에 포함)

> **Gate 1 FAIL 시 LEARNED.md / LEARNED-LINT.md 축적 절차**: codex/ecc 리뷰어 경로 모두 Step 4에서 이슈 단위로 구조화(파일/심볼/토픽/심각도/Automatable/Before 스니펫)하여 저장하므로 Step 5 PASS 경로의 축적 절차와 호환된다. ecc 리뷰어 출력은 메인이 해석하여 동일 필드로 변환한다.

#### 3-3. Gate 2: 린트 & 빌드 (메인이 직접 실행)

Step 2에서 감지한 린트/빌드 명령을 실행한다.

- 성공 → Gate 3로
- 실패 → FAIL 처리 → Step 4로
- Unknown 스택 → Gate 2 SKIP, Gate 3로 진행

#### 3-4. Gate 3: Evaluator 검증

**kelo:code-evaluator** 에이전트(Agent 도구의 `subagent_type: "kelo:code-evaluator"`)를 소환하여 구현을 검증한다.

- task-source, eval-source, Task ID를 전달 (슬라이스 경로 — Rule 14 참조)
- Evaluator는 `code-harness/harness-state/generator-state.md`에서 Generator 결과를 읽고, 검증 결과를 `code-harness/harness-state/feedback/feedback-{round}.md`에 쓴다
- Evaluator는 Write 도구를 갖지만 `code-harness/harness-state/feedback/` 경로에만 쓴다. 프로젝트 코드를 수정하지 않는다

판정 파싱: Evaluator의 판정이 PASS, PASS-WITH-INFRA-BLOCKER, FAIL 중 하나로 명확히 파싱되지 않으면 FAIL로 처리한다. Evaluator가 작성한 `feedback-{round}.md`에 '판정 파싱 불가 — FAIL로 처리' 사유를 append한다 (전체 템플릿을 다시 쓰지 않는다).

판정 (위에서 아래로 우선 평가):
1. **PASS / PASS-WITH-INFRA-BLOCKER** → Step 5 (PASS 리포트)
2. **FAIL** → Step 4

> maxRounds 초과 여부는 Step 1 재진입 시 판정한다. Gate 3 FAIL은 항상 Step 4를 거친다.

### Step 4: FAIL 상태 저장 후 종료

Gate 1~3 중 하나가 FAIL이면:

1. 실패 상세를 `code-harness/harness-state/feedback/feedback-{round}.md`에 쓴다

   **Gate 1/2 실패 시** 메인이 직접 아래 템플릿으로 작성한다:

   ```markdown
   ## 검증 결과: {Task ID} — Round {round}

   ### 판정: FAIL
   ### 실패 Gate: Gate {N}

   ### 에러 내용
   (Gate 명령의 전체 에러 출력을 그대로 붙여넣기)

   ### 수정 제안
   - (에러 메시지 기반 구체적 수정 방향)
   ```

   **Gate 1 FAIL 시 추가 작성 (LEARNED.md / LEARNED-LINT.md 축적 준비)**:

   위 템플릿에 이어 `### 이슈 목록 (구조화)` 섹션을 추가하여 Gate 1 출력(codex review 또는 ecc:{stack}-reviewer 에이전트)을 이슈 단위로 분해한다. 이 섹션은 Step 5 PASS 경로에서 `docs/LEARNED.md`(Automatable: unlikely|no) 또는 `docs/LEARNED-LINT.md`(Automatable: likely) 엔트리 생성에 사용된다.

   > ecc 리뷰어 출력은 카테고리별 섹션(Security/Quality/...)과 `Review Summary` 테이블로 오는데, 메인이 각 Finding 블록을 1이슈로 분해하고 파일·심볼·토픽·Automatable을 Before 스니펫과 함께 Step 4 템플릿에 채워 넣는다.

   각 이슈 블록 템플릿:

   ````markdown
   #### Issue {N}
   - **파일**: `{프로젝트 루트 기준 상대 경로}`
   - **심볼**: `{이름}` ({class|function|method}, 줄 {start}-{end}) — 탐지 실패 시 `null`
   - **토픽**: `{kebab-case-slug}` (명명 규칙은 아래 "토픽 명명 규칙" 참조)
   - **심각도**: `critical` | `high` | `medium` — `low`는 포함하지 않음
   - **Automatable**: `likely` | `unlikely` | `no` (LEARNED.md/LEARNED-LINT.md 라우팅 기준)
   - **Custom Rule**: `yes` | `no` (스택별 custom-rule 도구로 실제 구현 가능한지 — 아래 판정 가이드 참조)
   - **요약**: {Gate 1 피드백을 1-2문장으로 요약}
   - **Before 스니펫**:
     ```{language}
     {함수/클래스 경계 heuristic으로 추출한 코드}
     ```
   ````

   **이슈 분리 규칙**: ecc 리뷰어 경로는 `[CRITICAL] ...`, `[HIGH] ...` 등 개별 Finding 블록 1개 = 1 이슈. codex 경로는 번호 매긴 항목(`1.`, `2.`) 또는 bullet 항목 1개 = 1 이슈. 같은 파일·같은 심볼에 여러 지적이 한 묶음이면 하나의 이슈로 합친다.

   **심볼/경계 탐지 heuristic**: 피드백의 `파일:줄`에서 시작하여,
   - **중괄호 언어** (Dart/TS/JS/Java/Kotlin/C#/Go/Rust/Swift/C/C++): 위로 가장 가까운 `class|interface|enum|function|def|fun` 선언의 여는 `{` 줄을 시작점으로, 중괄호 깊이가 다시 0이 되는 `}`를 종료점으로
   - **들여쓰기 언어** (Python): 위로 가장 가까운 `class|def` 선언을 시작점으로, 같거나 더 작은 들여쓰기를 만나는 직전 줄을 종료점으로
   - 탐지 실패 또는 파일:줄 미명시 → `심볼: null`. **LEARNED-LINT.md 축적만 제외**(스니펫 추출 불가), LEARNED.md 축적에는 포함됨

   **심각도 매핑**:

   | Gate 1 출력 표현 | LEARNED 심각도 |
   |---|---|
   | Critical / Blocker / CRITICAL | critical |
   | High / Major / HIGH | high |
   | Medium / Minor / MEDIUM | medium |
   | Low / Info / LOW | (축적 제외) |

   > ecc 리뷰어는 `CRITICAL/HIGH/MEDIUM/LOW` 대문자로 방출하므로 소문자로 정규화한 뒤 매핑한다.

   **토픽 명명 규칙**: `{layer-or-context}-{violation}` 형식 소문자 kebab-case.
   - 예: `usecase-direct-repository-dependency`, `domain-layer-framework-import`, `bare-catch-without-logging`, `service-without-dto-validation`

   **Automatable 판정 가이드**:
   - `likely`: 클래스/함수 구조 기반 AST 매칭으로 잡을 수 있는 패턴 (예: 특정 레이어의 금지 import, 특정 이름 규칙 위반)
   - `unlikely`: 의미 분석·데이터 흐름이 필요한 패턴
   - `no`: 린트 룰로 표현 불가 (주관적 네이밍, 문서화 부족 등)

   **Custom Rule 판정 가이드** (Automatable과 독립 평가 — 스택별 custom-rule 도구로 실제 구현 가능한지만 본다):
   - `yes`: 해당 스택의 custom-rule 도구로 구현 가능 (AST 패턴·타입 정보·심볼 resolution 수준까지 포함)
     - Dart → `custom_lint` / `analyzer_plugin`
     - TS/JS → ESLint custom rule (필요 시 `@typescript-eslint` type-aware)
     - Kotlin → ktlint custom / Detekt custom rule
     - Rust → clippy lint_pass
     - Go → `go/analysis` custom analyzer
     - Python → ruff custom (또는 flake8 plugin)
     - C#/.NET → Roslyn analyzer
   - `no`: custom-rule로도 표현 불가 — 의미·흐름 분석이 과도하게 필요하거나, 주관적·도메인 규칙·문서화 영역 (휴먼 리뷰·테스트가 더 적합)

   > **Automatable vs Custom Rule 관계**: Automatable은 라우팅(LEARNED.md vs LEARNED-LINT.md)을 결정하고, Custom Rule은 승격 작업 착수 가능 여부를 가늠한다. `Automatable: likely` + `Custom Rule: no` 조합이면 초기 판정이 낙관적이었다는 신호 — 사람이 승격 검토 시 LEARNED.md 이동을 검토한다 (라우팅 자체는 Automatable 기준 유지 — 수동 재분류 여지를 남긴다).

   **Gate 3 실패 시** Evaluator가 이미 feedback 파일을 작성했으므로 파일 쓰기를 건너뛴다.

2. **변경사항은 롤백하지 않는다** — 코드가 남아있어야 다음 라운드 Generator가 피드백을 읽고 해당 에러만 수정할 수 있다
3. state.json 업데이트: `round + 1`, `status: "fail"`, `lastFailedGate: "Gate N"`
4. **라운드 종료** — loopMode면 ScheduleWakeup 예약 (prompt: `/kelo:code-harness`, delaySeconds: 60). `--once`면 즉시 종료. Rule 1 참조.

### Step 5: Task 리포트 작성

`code-harness/reports/{TaskID}.md`에 리포트를 작성한다 (파일명은 sanitize 규칙 적용). 디렉토리가 없으면 생성한다.

```markdown
# {TaskID}: {Task 제목}
## Status: PASS / PASS-WITH-INFRA-BLOCKER / FAIL
## Date: {오늘 날짜}
## Rounds: {실행 라운드 수}

---
## 구현 내역
### 변경 파일
- [신규/수정] `파일경로` — 변경 내용 요약

## 검증 결과
### Gate 1: 코드 리뷰 (ecc:{stack}-reviewer 기본, `--codex` 시 codex 우선)
- 리뷰어: ecc:flutter-reviewer | ecc:typescript-reviewer | ... | codex | SKIP
- 판정: PASS / WARNING / FAIL / SKIP

### Gate 2: 린트 & 빌드
- 스택: {projectStack}
- 판정: PASS / FAIL / SKIP

### Gate 3: eval-source 체크리스트
(evaluator 결과를 그대로 옮긴다)

## INFRA-BLOCKER 항목 (있으면)
- (PASS-WITH-INFRA-BLOCKER인 경우 해당 항목 나열)

## 구조 불일치 경고 (있으면)
(Step 3-1.5에서 `STATUS: MISMATCH`로 Task가 조기 FAIL된 경우, generator-state.md의 `### 구조 불일치 경고` 섹션 내용을 그대로 복사)

## LEARNED 축적 경고 (있으면)
- **LEARNED-LINT.md 축적 보류**: {topic} — 사유: 심볼 null / After 스니펫 추출 실패
- (기타 축적 skip 사유)

## Loop 이력
(각 라운드별 기록 — feedback/ 파일들에서 수집)
```

> Rounds 필드 계산:
> - PASS 리포트: `round` 값 (현재 라운드에서 성공)
> - FAIL 리포트 (Step 1 경유, maxRounds 초과): `round - 1` 값 (Step 4에서 이미 round를 증가시켰으므로)
> - FAIL 리포트 (Step 5 커밋 재시도 실패): `round` 값 (Step 4를 경유하지 않아 round가 증가되지 않았음)
> - FAIL 리포트 (Step 3-1.5 구조 불일치): `round` 값 (Step 4를 경유하지 않아 round가 증가되지 않았음)

#### PASS 리포트인 경우

1. state.json 업데이트: `status: "finalizing-pass"`
2. **LEARNED 축적** — Gate 1 FAIL 이력이 있으면 아래 "축적 절차 (공통 수집)"를 수행하고 이슈별로 LEARNED.md(규칙) 또는 LEARNED-LINT.md(lint 후보)로 라우팅한다 (Gate 1 FAIL 이력이 없으면 건너뜀)
3. **커밋 진행 판정**:
   - `autoCommit === true`(기본값 — `--confirm-commit` 미지정) → 확인 생략하고 4번으로 즉시 진행한다
   - `autoCommit === false`(`--confirm-commit` 지정) → 아래 정보를 사용자에게 보여주고 `커밋을 진행할까요? [y/N]` 프롬프트로 확인받는다:
     - `git diff --stat` 변경 파일 요약
     - 예정된 커밋 메시지 초안
   - 프롬프트 응답 처리:
     - `y / Y` → 4번으로 진행
     - `N` 또는 취소 → `status: "finalizing-pass"` 상태를 **유지한 채로 종료**한다. 사용자는 직접 커밋하거나 `--confirm-commit` 없이 재실행하여 재개할 수 있다 (finalizing-pass 재진입 멱등성으로 안전하게 재개됨). 종료 시 "커밋 보류 — 다음 실행에서 재확인" 메시지로 안내한다
   - **루프 중 사용자 부재 경고**: `loopMode === true`이면서 `autoCommit === false`인 경우, 2번째 라운드 이후 ScheduleWakeup으로 깨어났을 때 사용자가 자리에 없을 수 있다. 프롬프트가 응답을 기다리며 진행이 멈춘다. 완전 자율 실행을 원하면 `--confirm-commit`을 제거하라.
4. 커밋 (`docs/LEARNED.md`·`docs/LEARNED-LINT.md` 변경분 포함). 커밋 규칙은 `docs/GIT.md` 참조.

> **finalizing-pass 멱등성**: `git log --oneline -1`로 마지막 커밋이 현재 Task 커밋이면 커밋 skip하고 상태만 업데이트. 리포트는 overwrite, LEARNED.md는 topic-slug 정확 매칭 dedup(본문만 교체), LEARNED-LINT.md는 시그니처 기반 dedup으로 재진입 안전.

##### 축적 절차 (공통 수집)

1. `code-harness/harness-state/feedback/feedback-*.md` 전체를 round 오름차순으로 스캔한다
2. 각 파일의 `### 이슈 목록 (구조화)` 섹션에서 이슈 튜플을 수집한다. 섹션이 없는 feedback(Gate 2/3 FAIL)은 건너뛴다
3. **대상 파일 결정** — 각 이슈의 `Automatable` 값으로 분기한다:
   - `Automatable: unlikely` 또는 `Automatable: no` → **`docs/LEARNED.md`** (Generator가 매 라운드 읽는 재발 방지 파일, 규칙 지향 포맷)
   - `Automatable: likely` → **`docs/LEARNED-LINT.md`** (lint 룰 승격 대기열 — Generator는 읽지 않음, Before/After 스니펫 포함)

---

##### LEARNED.md 처리 (`Automatable: unlikely | no`)

Generator가 매 라운드 읽으므로 **토큰 최소화** 우선 — 심볼/파일경로/Before/After/시그니처/Severity 등 메타는 기록하지 않는다.

1. **dedup** — Task 내 같은 `topic` 이슈는 1개만 유지(복수 후보 중 최초 round 대표 선택). `심볼: null` 이슈도 포함. stack은 Task 전역 고정값이라 키에서 제외
2. **규칙 본문 생성** — 대표 이슈 라운드 feedback의 `### 에러 내용`(Gate 1 원문) + `### 이슈 목록`의 `요약`을 해석하여 **적용/규칙/방법** 3필드 작성:
   - `적용`: 발동 조건(레이어/파일 패턴/상황) 1줄
   - `규칙`: 명령문 1-2문장 (do/don't)
   - `방법`: 구체 가이드 bullet 1-3개 또는 1문장 (특정 파일/심볼에 묶지 않는 서술)
3. **기존 엔트리 확인** — `docs/LEARNED.md`에서 `## {topic-slug}` **정확 매칭**(줄 전체 일치) 섹션 검색
   - 있으면: 앵커(`## {topic-slug}`) 다음 줄부터 다음 `---` 직전까지 **본문만 교체**(앵커·구분선 유지 → fragment 링크 안정성·diff churn 최소화)
   - 없으면: 파일 하단에 신규 엔트리(앵커+본문+`---`) append
4. 파일·`docs/` 디렉토리 없으면 생성 후 헤더로 초기화하고 엔트리 append

> **이력은 git에 위임**: First/Last seen 타임스탬프 필드 없음. `git log -p docs/LEARNED.md` / `git blame`으로 확인(토큰 0).

###### LEARNED.md 헤더 (최초 생성 시)

```markdown
# Learned Rules

> `docs/LEARNED.md`에는 자동 검사로 막기 어려운 반복 실수만 남기고, lint·test로 검출 가능한 교훈은 문서가 아니라 실행 검증으로 관리한다.

---
```

###### LEARNED.md 엔트리 포맷

```markdown
## {topic-slug}
**적용:** {1줄 — 언제 발동}
**규칙:** {1-2문장 — do/don't}
**방법:** {1-3 bullet 또는 1문장}

---
```

---

###### LEARNED-LINT.md 헤더 (최초 생성 시)

```markdown
# Learned Lint Candidates

> `docs/LEARNED-LINT.md`에는 lint·test로 자동화할 수 있는 반복 실수만 남기고, 주기적으로 `rules/{stack}/custom-lint/` 검증 규칙으로 승격한 뒤 문서 항목은 제거한다.

---
```

##### LEARNED-LINT.md 처리 (`Automatable: likely`)

사람이 승격 검토하는 파일이므로 **패턴 증거(Before/After, 심볼, 시그니처)를 풍부하게** 기록한다. Generator 미열람으로 토큰 제약 없음.

1. **dedup** — `(파일, 심볼, 토픽)` 동일 튜플 중복 시 최초 round 유지
2. **`심볼: null` 이슈 제외** — 스니펫 추출 불가. Task 리포트의 "LEARNED-LINT.md 축적 보류" 섹션에 경고 기록
3. 유효 이슈별:
   - **After 스니펫**: working tree에서 같은 심볼명 찾아 Step 4와 동일 heuristic으로 경계 추출. 실패 시 skip + "축적 보류" 경고
   - **시그니처 계산**: `echo -n "{stack}:{file}:{symbol}:{topic}" | tr '[:upper:]' '[:lower:]' | shasum -a 1 | cut -c1-6`
   - **기존 엔트리 확인**: `## [{시그니처}]`로 시작하는 줄 검색
     - 있으면: `**Last seen:**` 한 줄만 오늘 날짜 + 현재 Task/Round로 덮어쓰기(나머지 유지)
     - 없으면: 파일 하단에 신규 엔트리 append
4. 파일 없으면 헤더로 초기화 후 엔트리 append

> **Automatable 변경 시**: 같은 토픽이 과거 `likely` → 이번 `unlikely`여도 **기존 엔트리 이동 없이** 각 파일에 독립 기록(이전 판정 증거 보존). 사람이 승격 검토 시 양쪽 함께 확인.

###### LEARNED-LINT.md 엔트리 포맷

```markdown
## [{6자리 시그니처}] {topic-slug}
**Stack:** {projectStack}
**Severity:** {critical|high|medium}
**Automatable:** likely
**Custom Rule:** {yes|no}
**First seen:** {YYYY-MM-DD} ({Task ID}, round {N})
**Last seen:** {YYYY-MM-DD} ({Task ID}, round {N})
**Symbol:** `{심볼명}` ({타입}) — `{파일 경로}`

### Gate 1 원문 피드백
> {요약 1-2문장}

### Before
(Step 4에서 저장된 FAIL 시점 스니펫 — 언어별 코드 펜스 포함)

### After
(PASS 시점 스니펫 — 현재 working tree에서 추출한 언어별 코드 펜스 포함)

---
```

- **커밋 성공** → `status: "pass"` → "Task 전환 정리 절차" 수행. `taskQueue` 비어 있으면 **같은 실행 내에서 Step 6 직행** (ScheduleWakeup 없이). 다음 Task 있으면 종료 (loopMode면 ScheduleWakeup 예약)
- **커밋 실패** (pre-commit 훅 등):
  1. `commitRetryCount`를 state.json에 먼저 증가시킨다
  2. 훅 에러를 `feedback-{round}-commit-retry.md`에 저장 (원래 PASS feedback 보존)
  3. Generator에게 전달하여 수정
  4. **Gate 2(린트/빌드) + Gate 3(Evaluator) 재실행** — Gate 3 실행 시 Evaluator가 `feedback-{round}.md`를 덮어쓰지만, 코드가 변경되었으므로 재평가가 맞다
  5. Gate 통과 시 커밋 재시도, Gate FAIL 시 `commitRetryCount` 증가 후 다시 3번부터 반복 (commitRetryCount는 커밋 실패 또는 재시도 중 Gate 실패 시 모두 증가시킨다)

  > **재시도 시 재확인 금지**: 커밋 재시도는 최초 커밋 시점에 이미 승인(또는 `autoCommit === true` 기본값으로 확인 생략)된 작업이므로 **확인 프롬프트를 다시 띄우지 않는다**.

- **commitRetryCount >= 3** → FAIL 처리, 아래 FAIL 경로 진행

#### FAIL 리포트인 경우

1. state.json: `status: "finalizing-fail"`
2. 리포트 작성 (feedback 삭제 전에 Loop 이력 수집)
3. `git checkout -- . && git clean -fd -e code-harness/` (변경·신규 파일 완전 제거, harness 상태 보존)
4. "Task 전환 정리 절차" 수행
5. `taskQueue` 비어 있으면 Step 6으로
6. 종료 — 다음 실행에서 새 Task 시작

> 주의: `git clean -fd`는 `.gitignore`에 포함되지 않은 모든 미추적 파일을 삭제한다. `-e code-harness/`로 harness 디렉토리는 보존하지만, 그 외 미추적 파일(IDE 설정, 로컬 환경 파일 등)은 삭제될 수 있다.

### Task 전환 정리 절차 (공통)

PASS/FAIL/구조 불일치 등 Task 종료 지점에서 공통으로 수행:

1. state.json: `completedTasks`에 현재 Task 추가, `taskQueue`에서 제거
2. `code-harness/harness-state/feedback/` 내 feedback 파일 전체 삭제
3. `generator-state.md` 삭제
4. state.json: `currentSlices: null`, `commitRetryCount: 0`
5. 다음 Task 선정:
   - `taskQueue` 비어 있음 → 호출자가 Step 6으로 라우팅
   - 아니면 첫 항목을 새 `currentTaskId`로, `round: 1`, `status: "initializing"`으로 설정

> 이 절차는 라우팅(Step 2/6/종료+ScheduleWakeup)을 결정하지 않는다 — 호출자가 컨텍스트에 맞게 결정한다. 1번은 idempotent (이미 `completedTasks`에 있으면 skip).

### Step 6: 종합 리포트 (마지막 Task 완료 시)

모든 Task가 완료되었거나 FAIL로 중단된 경우, `code-harness/reports/{대상ID}-summary.md`에 작성한다 (파일명은 sanitize 규칙 적용).

```markdown
# {대상ID} 종합 리포트
## Date: {오늘 날짜}

| Task | Status | Rounds | 비고 |
|------|--------|--------|------|

## 통계
- 총 Task: N개 / PASS: N개 / FAIL: N개
- 총 Loop: N회 (평균 N회/Task)

## FAIL Task 요약 (있으면)
- {TaskID}: {실패 사유 요약}
```

종합 리포트 작성 후 `code-harness/harness-state/` 를 정리(삭제)한다.

> Step 6은 범위/단일 구분 없이 마지막 Task 완료 후 반드시 실행된다. harness-state 정리는 Step 6에서 수행한다. Step 6은 멱등(idempotent)하게 설계되어 있어 중간 crash 후 재실행해도 안전하다. 완료 여부는 `code-harness/reports/` 디렉토리의 종합 리포트 존재 여부로 확인한다.

---

## Rules

1. **1실행 = 1라운드** — 라운드 종료 후 ScheduleWakeup으로 자동 재개(루프 기본 활성), `--once`로 단일 모드. Step 5 커밋 실패 재시도(최대 3회)만 같은 실행 내 허용
2. **파일로 전달** — 라운드 간 정보는 `code-harness/harness-state/`의 파일로 주고받음
3. **순차 실행** — Task는 하나씩 순서대로 (병렬 금지)
4. **에이전트 분리는 Generator/Evaluator만** — Gate 1~2는 메인이 직접 실행
5. **FAIL 시 코드 유지** — 다음 라운드 Generator가 수정. 최종 FAIL(maxRounds 초과) 시에만 `git checkout -- . && git clean -fd -e code-harness/`
6. **Gate 판정 존중** — Evaluator FAIL을 임의로 PASS로 바꾸지 않음
7. **Evaluator는 매번 새로 소환** — 이전 라운드 편향 방지
8. **중단 시에도 리포트 작성** — 완료된 Task까지 기록
9. **Gate 완료 대기 필수** — 명령 완전 종료 후에만 다음 Gate로
10. **state.json 쓰기 시 `lastUpdated` 갱신** — ISO 8601
11. **범위 실행 시 FAIL Task 건너뜀** — maxRounds 초과 FAIL은 리포트 후 다음 Task로(전체 중단 X)
12. **code-harness/ 보호** — `.gitignore` 단일 엔트리로 staging 제외, `git clean -e code-harness/`. 팀 공유 산출물은 `docs/LEARNED.md`·`docs/LEARNED-LINT.md` 둘
13. **Task 전환 시 정리** — "Task 전환 정리 절차" 참조
14. **Task 슬라이싱은 선행 조건** — 슬라이스 파일은 `/kelo:code-tasks` (TASKS) / `/kelo:code-qa` (QA)가 단독 생성한다. 하네스는 슬라이스를 생성·재생성·갱신하지 않으며, Step 1·2.5에서 존재·SHA 일치만 검증한다. 미생성·SHA 불일치 시 즉시 중단하고 사용자에게 해당 슬라이싱 커맨드 재실행을 안내한다 (fallback 없음). Generator/Evaluator에는 `state.currentSlices`의 슬라이스 경로를 전달한다
15. **task-source/eval-source 본문 Read 금지** — 하네스 메인은 어떤 단계에서도 TASKS.md/PHASES.md/`*-QA-COMMON.md` 본문을 Read 도구로 열지 않는다 (토큰 비용 회피). Task 목록 표시·존재 검증은 슬라이스 디렉토리(`$task_slice_dir`)의 `ls` / `test -f`로만 수행한다. 본문이 필요한 작업은 슬라이스/단위 QA 파일을 통해 Generator/Evaluator에 위임한다
