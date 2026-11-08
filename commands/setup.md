---
description: Set up or sync Kelo (Next.js / NestJS / Flutter, single project or monorepo) from kelo.yaml
argument-hint: '[project-path]'
---

# Kelo Setup

프로젝트(또는 모노레포)에 Kelo 문서·lint 설정·husky 훅을 적용합니다. 처음 실행이든 재실행이든 같은 커맨드입니다 — 설정은 프로젝트 루트의 `kelo.yaml`에 있고, 실제 작업은 `scripts/kelo.mjs`가 `rules/<framework>/pipeline.yaml` 순서대로 수행합니다.

## Arguments

**$ARGUMENTS**

- `[project-path]` (선택): 대상 디렉터리 (예: `apps/web`). 생략 시 현재 디렉터리.

## 1. 준비

```bash
KELO_DIR=$(jq -r '.plugins["kelo@kelo"][0].installPath' ~/.claude/plugins/installed_plugins.json)
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

질문은 AskUserQuestion으로 합니다. 확정된 값으로 `kelo.yaml`을 작성하고 내용을 보여줍니다:

```yaml
# 단일 프로젝트
framework: nextjs        # nextjs | nestjs | flutter
name: web
stacks: [tanstack-query]
agents: true
packageManager: pnpm     # 생략하면 매번 감지
# entryDir: app          # flutter만

# 모노레포 — 루트 kelo.yaml
packageManager: pnpm
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

- **kelo 관리 (매번 재생성)**: `AGENTS.md`(+ `CLAUDE.md` 링크), `docs/{GIT,ARCHITECTURE,CONVENTIONS,LINT}.md`, `eslint.config.mjs`, `stylelint.config.mjs`, `prettier.config.mjs`, `.husky/*`, `commitlint.config.mjs`, `analysis_options.yaml`, `.kelo/plugins/**`
- **프로젝트 소유 (없을 때만 생성)**: `kelo.yaml`, `kelo.lint.json`, `eslint.project.config.mjs`, `AGENTS.PROJECT.md`, `docs/CONVENTIONS.PROJECT.md`
- 모노레포 루트의 `.husky/`·`commitlint.config.mjs`는 **없을 때만** 생성합니다.
