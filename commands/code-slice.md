---
description: TASKS.md / QA.md를 Task 단위 슬라이스 파일로 분할 (수동 슬라이싱)
allowed-tools: Read, Bash
argument-hint: '--mode <full|compact> [<file1.md> <file2.md> ...]'
---

# Task 슬라이스 생성

이미 작성된 `TASKS.md` / `QA.md` 같은 Task 단위 마크다운 문서를 **Task 1개당 하나의 파일**로 분할합니다.
`/kelo:code-harness` 실행 시 Generator/Evaluator가 전체 문서가 아닌 슬라이스만 읽도록 하여 라운드별 토큰 소비를 줄입니다.

> 보통은 `/kelo:code-tasks` / `/kelo:code-qa`가 자동으로 슬라이싱하므로 이 커맨드는 **이미 만들어둔 TASKS.md/QA.md에 대해 한 번 수동 슬라이싱이 필요할 때**만 사용합니다. 이후 편집은 `/kelo:code-harness`가 SHA로 stale 감지하여 자동 재슬라이싱합니다.

## Arguments

**$ARGUMENTS**

| 인자 | 설명 |
|------|------|
| `--mode compact` | 모든 입력 파일을 compact 모드로 슬라이싱 (TASKS.md 권장) |
| `--mode full` | 모든 입력 파일을 full 모드로 슬라이싱 (QA.md 권장) |
| 파일 경로 없음 | 기본값으로 `code-harness/TASKS.md`, `code-harness/QA.md` 둘 다 시도. 존재하는 파일만 지정 모드로 슬라이싱 |
| 파일 경로 (1개 이상) | 명시된 각 마크다운 파일을 슬라이싱 |

### 출력 디렉토리 규칙

```
slice_dir = <dirname(input)> / <basename(input) lowercase, .md 제거> /
```

예시:
- `code-harness/TASKS.md` → `code-harness/tasks/Task-N.md`
- `code-harness/QA.md` → `code-harness/qa/Task-N.md`
- `path/to/MyTasks.md` → `path/to/mytasks/Task-N.md`

> 이 규칙은 `/kelo:code-harness` Step 2.5의 슬라이스 경로 매핑과 일치한다. 다른 디렉토리에 출력하면 harness가 슬라이스를 인식하지 못한다.

## Procedure

### Step 1: 입력 파일 결정

1. `$ARGUMENTS`에서 필수 `--mode full|compact`를 먼저 파싱 (누락 시 에러)
2. 모드 옵션을 제외한 `$ARGUMENTS`가 비어 있으면 기본값 사용:
   - `code-harness/TASKS.md`
   - `code-harness/QA.md`
3. 모드 옵션을 제외한 `$ARGUMENTS`에 인자가 있으면 그 경로들을 입력 파일로 사용
4. 각 입력 파일의 존재 여부를 확인:
   - 존재 → 다음 단계로
   - 부재 → 경고 출력 후 해당 파일은 건너뜀 (다른 파일은 계속 진행)
   - 모든 파일이 부재 → 에러로 종료하고 사용법 안내

### Step 2: 슬라이싱 실행

각 입력 파일에 대해 출력 디렉토리를 위 규칙으로 계산한 뒤 `slice-tasks.mjs` 호출:

```bash
KELO_DIR=$(jq -r '.plugins["kelo@kelo"][0].installPath' ~/.claude/plugins/installed_plugins.json)
mode="<파싱한 mode: full|compact>"

for input in <입력 파일 목록>; do
  dir=$(dirname "$input")
  base=$(basename "$input" .md | tr '[:upper:]' '[:lower:]')
  out_dir="$dir/$base/"
  echo ">> Slicing $input -> $out_dir"
  "$KELO_DIR/scripts/slice-tasks.mjs" --mode "$mode" "$input" "$out_dir" || echo "  ⚠ failed: $input"
done
```

`slice-tasks.mjs`는 파싱한 `--mode`로 실행됩니다.

- compact mode — 최소 공통 문맥 + 해당 Task 상세 + 적용 컨벤션/관련 리스크 중심
- full mode — 기존 방식대로 공통 헤더 + 해당 Task + 공통 푸터 포함
- compact mode 에서는 footer 영역의 `### Task N ...` 소제목 블록을 해당 `Task-N.md` 에만 추가한다. 예: `### Task 13 특별 주의` 는 `Task-13.md` 에만 포함

> 한 파일 슬라이싱이 실패해도 (예: `### Task N` 헤더 0건) 다른 파일은 계속 진행한다. 실패 사유는 그대로 사용자에게 노출한다.

### Step 3: 완료 보고

각 입력 파일에 대해 아래를 보고:

```
## 슬라이싱 결과

### code-harness/TASKS.md → code-harness/tasks/
- ✓ Task-1.md, Task-2.md, Task-3.md (총 3개)
- Source SHA: abc123def456

### code-harness/QA.md → code-harness/qa/
- ✓ Task-1.md, Task-2.md, Task-3.md (총 3개)
- Source SHA: 789xyz012abc

### 건너뜀
- (존재하지 않는 파일이 있었으면 나열)

### 실패
- (슬라이싱이 실패한 파일이 있었으면 사유와 함께 나열)
```

## 사용 예시

```bash
# TASKS.md 기본 위치를 compact로 재생성
/kelo:code-slice --mode compact code-harness/TASKS.md

# QA.md 기본 위치를 full로 재생성
/kelo:code-slice --mode full code-harness/QA.md

# 기본 파일 둘 다 같은 모드로 재생성
/kelo:code-slice --mode compact

# 다른 경로의 파일들
/kelo:code-slice --mode full docs/MyQA.md
```

## 주의

- 입력 마크다운에 **`### Task N`** (h3) 헤더가 1개 이상 있어야 한다. 없으면 슬라이싱이 실패한다 (slice-tasks.mjs가 에러로 종료)
- 슬라이스 파일 첫 두 줄에 출처 SHA·타임스탬프 메타 주석이 자동 삽입되며, harness가 이를 stale 감지에 사용한다
- compact 슬라이스에는 `<!-- slice-mode: compact -->` 메타 주석이 추가된다
- 입력에서 사라진 Task ID에 해당하는 슬라이스 파일은 자동 제거된다 (예: TASKS.md에서 Task 3 삭제 시 `tasks/Task-3.md` 자동 삭제)
- `code-harness/tasks/`, `code-harness/qa/`는 이미 `.gitignore`에 포함된다 (`code-harness/`의 일부로 관리)
