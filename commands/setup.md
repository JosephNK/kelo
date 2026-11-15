---
description: Set up or sync Kelo (Next.js / NestJS / Flutter, single project or monorepo) from kelo.yaml
argument-hint: "[project-path]"
---

# Kelo Setup

프로젝트(또는 모노레포)에 Kelo 문서·lint 설정·husky 훅을 적용합니다. 처음 실행이든 재실행이든 같은 커맨드입니다 — 설정은 프로젝트 루트의 `kelo.yaml`에 있고, 실제 작업은 `scripts/kelo.mjs`가 `rules/<framework>/pipeline.yaml` 순서대로 수행합니다.

## Arguments

**$ARGUMENTS**

- `[project-path]` (선택): 대상 디렉터리 (예: `apps/web`). 생략 시 현재 디렉터리.

## 1. 준비

```bash
KELO_DIR="${CLAUDE_PLUGIN_ROOT}"
[ -d "$KELO_DIR/node_modules/yaml" ] || (cd "$KELO_DIR" && npm install --silent)
PROJECT_ROOT="$(cd "${PROJECT_PATH:-.}" && pwd)"   # PROJECT_PATH = 인자 (없으면 cwd)
```

## 2. `kelo.yaml` 확인

`$PROJECT_ROOT/kelo.yaml`이 **있으면** 3단계로 갑니다.

**없으면** 감지 결과를 받아 사용자에게 확인한 뒤 작성합니다:

```bash
node "$KELO_DIR/scripts/kelo.mjs" detect -p "$PROJECT_ROOT"
```

출력(JSON)의 `mode`에 따라:

- `single` — `project.framework`(감지 실패 시 `null`)를 보여주고 확정받습니다. 이어서 `stacks[<framework>]` 목록을 **설명과 함께 전부** 보여주고 선택받습니다(복수 선택, 없어도 됨). `name`(기본: `project.name`), AGENTS.md 생성 여부(기본: 예), Flutter면 `entryDir`(기본: `project.entryDir`)를 확인합니다.
- `workspaces` — `workspaces` 후보 목록을 보여주고 포함할 워크스페이스와 framework를 확정받은 뒤, 워크스페이스마다 위와 같이 스택·이름·AGENTS 여부(·entryDir)를 받습니다.
- `packageManager`는 감지값을 보여주고 다르면 고칩니다.
- 오케스트레이션 모드 사용 여부(기본: 아니오 — 키 생략)를 묻습니다. 메인 세션이 분석·설계만 하고 구현·검증은 `kelo:implementer` / `kelo:verifier`에 위임하는 모드입니다. 사용하면 메인 세션 모델(기본: `claude-fable-5-2`, 별칭 `opus` 등이나 풀 ID 가능)을 확인합니다. 루트 설정이라 모노레포에서도 워크스페이스가 아닌 최상위에 둡니다.

질문은 AskUserQuestion으로 합니다. 확정된 값으로 `kelo.yaml`을 작성하고 내용을 보여줍니다:

```yaml
# 단일 프로젝트
framework: nextjs        # nextjs | nestjs | flutter
name: web
stacks: [tanstack-query]
agents: true
packageManager: pnpm     # 생략하면 매번 감지
# entryDir: app          # flutter만
# orchestration: true    # 오케스트레이션 모드 (기본 모델) | { model: opus } | false = 해제

# 모노레포 — 루트 kelo.yaml
packageManager: pnpm
# orchestration: { model: opus }   # 루트에만 (워크스페이스 항목에는 둘 수 없음)
workspaces:
  - path: apps/web
    framework: nextjs
    stacks: [tanstack-query]
  - path: apps/api
    framework: nestjs
    stacks: [typeorm]
```

작성 후 검증합니다 (에러면 메시지대로 고친 뒤 다시):

```bash
node "$KELO_DIR/scripts/kelo.mjs" validate -p "$PROJECT_ROOT"
```

## 3. 실행

```bash
node "$KELO_DIR/scripts/kelo.mjs" setup -p "$PROJECT_ROOT"
```

- **`app/ 이 있고 src/app/ 이 없습니다`** 에러(Next.js): kelo 규칙은 `src/app/`을 가정합니다. 사용자에게 이동 동의를 받은 경우에만 `--move-app`을 붙여 다시 실행합니다 (`git mv`로 이력 보존). 이동 후 `tsconfig.json` `paths`(`@/*` → `./src/*`)와 상대 import를 확인하도록 안내합니다.
- 실행 계획만 보려면 `--dry-run`, 의존성 설치를 건너뛰려면 `--no-install`.
- 단계 실패 시 출력된 단계·메시지를 그대로 보고하고 중단합니다.

## 4. 확인 (Flutter)

`dart pub get` 후 `pubspec.lock` 변경이 `kelo_analysis`(+ `crypto`·`yaml` 정도)에 그쳤는지 확인합니다. 관련 없는 패키지가 대량으로 바뀌었으면 lock을 커밋된 상태로 되돌리고 원인을 해결한 뒤 `dart pub get`을 **한 번에** 다시 실행합니다 (`pub upgrade` 금지).

```bash
git diff -- '*pubspec.lock' | grep -E '^[-+]    version:' | wc -l
```

## 5. 보고

`kelo.mjs` 출력의 단계별 결과를 요약합니다. 생성물 소유 구분:

- **kelo 관리 (매번 재생성)**: `AGENTS.md`(+ `@AGENTS.md`를 import하는 `CLAUDE.md`), `docs/{ARCHITECTURE,CONVENTIONS}.md`, `eslint.config.mjs`, `stylelint.config.mjs`, `prettier.config.mjs`, `.husky/*`, `commitlint.config.mjs`, `analysis_options.yaml`, `.kelo/plugins/**`, `.claude/rules/kelo-orchestration.md`(`orchestration` 사용 시)
- **`.claude/settings.json`**: `orchestration` 사용 시 `model` 키만 관리하고 나머지 키·순서는 보존합니다.
- **프로젝트 소유 (없을 때만 생성)**: `kelo.yaml`, `kelo.lint.json`, `eslint.project.config.mjs`, `AGENTS.PROJECT.md`, `docs/CONVENTIONS.PROJECT.md`
- 모노레포 루트의 `.husky/`·`commitlint.config.mjs`는 **없을 때만** 생성합니다.

`orchestration` 단계가 실행됐다면 함께 안내합니다:

- 규칙 파일과 `model`은 세션 시작 시 로드되므로 **새 세션부터** 적용됩니다.
- `/model`, `claude --model`, `ANTHROPIC_MODEL`이 settings의 `model`보다 우선합니다.
- `kelo:implementer` / `kelo:verifier`는 플러그인에 포함되어 있고 에이전트 정의의 모델로 실행됩니다.
- verifier는 `ocr` CLI(`npm i -g @alibaba-group/open-code-review`)가 있으면 OCR delegate 리뷰를 함께 하고, 없으면 그 단계를 건너뜁니다.
- `orchestration: false`로 바꿔 setup을 다시 실행하면 규칙 파일을 지우고 이전 `model`을 복원합니다.

## 6. 진단

setup 결과를 lint로 확인합니다. 오류·경고·경계 위반 수, 상위 규칙, 미분류 파일(폴더별 + 옮길 위치 제안)을 요약해 보고합니다. 제안대로 파일을 옮기는 것은 사용자 확인 후에만 합니다.

```bash
node "$KELO_DIR/scripts/kelo.mjs" doctor -p "$PROJECT_ROOT"
```
