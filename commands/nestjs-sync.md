---
description: Sync Kelo docs and lint config in NestJS project
argument-hint: '[project-path]'
---

# Kelo NestJS Sync

NestJS 프로젝트의 Kelo docs(`GIT.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`, `LINT.md`), `eslint.config.mjs`, `.husky/` 훅을 플러그인 최신 버전과 동기화합니다.

## Arguments

**$ARGUMENTS**

- `[project-path]` (선택): 모노레포 환경에서 NestJS 앱 경로 (예: `apps/api`). 생략 시 현재 디렉토리(`pwd`) 사용.

> 이 커맨드는 init이 아닙니다. `AGENTS.md`, `AGENTS.PROJECT.md`, `CONVENTIONS.PROJECT.md`, `tsconfig.json`은 건드리지 않습니다. `commitlint.config.mjs`도 있으면 보존하며, 없을 때만 husky 훅 정합성을 위해 새로 생성합니다. (`package.json`의 husky/@commitlint/lint-staged devDeps와 `scripts.prepare`, `.husky/` 훅은 sync 대상.) 최초 셋업은 `/kelo-nestjs-init`를 사용하세요.

## 플러그인 경로 확인

스크립트를 실행하기 전에 kelo 플러그인 설치 경로를 확인합니다:

```bash
KELO_DIR=$(jq -r '.plugins["kelo@kelo"][0].installPath' ~/.claude/plugins/installed_plugins.json)
```

이후 모든 스크립트 경로는 `$KELO_DIR`를 기준 디렉토리로 사용합니다.

## 프로젝트 루트 고정

커맨드 인자로 프로젝트 경로를 받습니다 (모노레포 지원). 인자가 없으면 현재 디렉토리(`pwd`)를 사용합니다.

```bash
# 사용자가 전달한 프로젝트 경로 인자. 예: "apps/api"(상대) 또는 "/abs/path"(절대). 비어 있으면 cwd.
PROJECT_PATH="<argument-or-empty>"

if [ -n "$PROJECT_PATH" ]; then
  case "$PROJECT_PATH" in
    /*) PROJECT_ROOT="$PROJECT_PATH" ;;
    *)  PROJECT_ROOT="$(pwd)/$PROJECT_PATH" ;;
  esac
else
  PROJECT_ROOT="$(pwd)"
fi

[ -d "$PROJECT_ROOT" ] || { echo "Error: Project path not found: $PROJECT_ROOT" >&2; exit 1; }
```

아래 모든 shell 블록은 `cd "$PROJECT_ROOT"`가 해당 스텝에서 이미 실행된 상태를 전제로 합니다.

## 매니페스트 (`kelo.project.json`)

프로젝트 루트에 `kelo.project.json`이 **있으면** 스택 선택 프롬프트를 건너뛰고 매니페스트 값으로 무인 재현합니다. **없으면** 지금처럼 대화형으로 진행하며, 끝에 작성을 제안합니다(강제 아님). 스펙은 `/kelo:nestjs-init` 문서 참조.

### 매니페스트 분기

```bash
cd "$PROJECT_ROOT"
MANIFEST_PATH="$PROJECT_ROOT/kelo.project.json"
# 레거시 이름(jkit.project.json)은 kelo 이름으로 옮긴다
if [ ! -f "$MANIFEST_PATH" ] && [ -f "$PROJECT_ROOT/jkit.project.json" ]; then
  if git ls-files --error-unmatch "$PROJECT_ROOT/jkit.project.json" >/dev/null 2>&1; then git mv "$PROJECT_ROOT/jkit.project.json" "$MANIFEST_PATH"; else mv "$PROJECT_ROOT/jkit.project.json" "$MANIFEST_PATH"; fi
  echo "[manifest] jkit.project.json → kelo.project.json 이름 변경"
fi

if [ -f "$MANIFEST_PATH" ]; then
  MF_FRAMEWORK=$(jq -r '.framework // ""' "$MANIFEST_PATH")
  if [ "$MF_FRAMEWORK" != "nestjs" ]; then
    echo "Error: kelo.project.json framework='$MF_FRAMEWORK' (expected 'nestjs')" >&2
    exit 1
  fi
  USER_CONV_STACKS=$(jq -r '(.conventionStacks // []) | join(",")' "$MANIFEST_PATH")
  USER_ESLINT_STACKS=$(jq -r '(.eslintStacks // []) | join(",")' "$MANIFEST_PATH")
  MANIFEST_MODE="apply"
  echo "[manifest] apply mode — conv=[$USER_CONV_STACKS] eslint=[$USER_ESLINT_STACKS]"
else
  MANIFEST_MODE="prompt"
  echo "[manifest] prompt mode — kelo.project.json 없음. 대화형 진행."
fi
```

- **`MANIFEST_MODE=apply`** → 아래 Step 1~2(스택 선택)를 건너뛰고 로드된 변수를 사용합니다. PM 감지(Step 3)의 확인 프롬프트도 생략하고 감지값을 그대로 씁니다.
- **`MANIFEST_MODE=prompt`** → 기존대로 프롬프트하고, 마지막에 매니페스트 작성을 제안합니다.

## 단계

> **`MANIFEST_MODE=apply`인 경우** 아래 Step 1~2를 건너뛰고 로드된 `USER_CONV_STACKS`, `USER_ESLINT_STACKS`를 사용하세요.

### 1. 컨벤션 스택 선택

아래 **컨벤션** 스택을 보여주고 사용자에게 선택을 받습니다 (쉼표 구분, 전부 선택은 `all`, 비우면 base만 적용).
**중요: 이전 대화·세션 컨텍스트와 무관하게, 매 실행마다 아래 1개 항목을 모두 그대로 노출해야 합니다. 항목을 임의로 생략하거나 이전 응답에서 사용한 축약 목록을 재사용하지 마세요.**

1. `typeorm`

### 2. ESLint 스택 선택

아래 **ESLint** 스택을 보여주고 사용자에게 선택을 받습니다 (쉼표 구분, 전부 선택은 `all`, 비우면 base만 적용).
**중요: ESLint 스택은 컨벤션 스택과 동일하지 않습니다. 이전 대화·세션 컨텍스트와 무관하게, 매 실행마다 아래 3개 항목을 모두 그대로 노출해야 합니다 — 항목을 임의로 생략하거나 이전 응답에서 사용한 축약 목록을 재사용하지 마세요.**

1. `typeorm`
2. `gcp`
3. `anthropic-ai`

### 3. 패키지 매니저 감지

Step 5의 install 명령을 프로젝트가 이미 쓰는 패키지 매니저에 맞추기 위해 감지합니다.

```bash
cd "$PROJECT_ROOT"

detect_pm() {
  [ -f pnpm-lock.yaml ]    && echo "pnpm" && return
  [ -f yarn.lock ]         && echo "yarn" && return
  [ -f bun.lockb ]         && echo "bun"  && return
  [ -f package-lock.json ] && echo "npm"  && return
  if [ -f package.json ]; then
    pm_field=$(jq -r '.packageManager // empty' package.json | cut -d@ -f1)
    [ -n "$pm_field" ] && echo "$pm_field" && return
  fi
  command -v pnpm >/dev/null && echo "pnpm" && return
  command -v yarn >/dev/null && echo "yarn" && return
  command -v bun  >/dev/null && echo "bun"  && return
  echo "npm"
}

PM=$(detect_pm)
```

사용자에게 감지 결과를 보여주고 확인을 받습니다: **"감지된 매니저: {PM}. 사용할까요? 다른 매니저를 원하면 npm / yarn / pnpm / bun 중 선택."**

### 4. Docs / Lint 재생성

```bash
cd "$PROJECT_ROOT"

# 1. GIT.md
$KELO_DIR/scripts/gen-git.mjs -p docs

# 2. ARCHITECTURE.md
$KELO_DIR/scripts/gen-architecture.mjs nestjs -p docs

# 3. STRUCTURE.md (lint-rules-structure-reference 복사)
$KELO_DIR/scripts/gen-structure.mjs nestjs -p docs

# prompt 모드: Step 1~2 선택값을 변수에 대입. apply 모드: 매니페스트 분기에서 이미 설정됨.
[ "$MANIFEST_MODE" = "prompt" ] && USER_CONV_STACKS="<conventions-stacks>"
[ "$MANIFEST_MODE" = "prompt" ] && USER_ESLINT_STACKS="<eslint-stacks>"

# 4. CONVENTIONS.md (PROJECT는 절대 건드리지 않음 — 없어도 새로 만들지 않음)
if [ -n "$USER_CONV_STACKS" ]; then
  $KELO_DIR/scripts/gen-conventions.mjs nestjs -p docs --with "$USER_CONV_STACKS" --no-project-init
else
  $KELO_DIR/scripts/gen-conventions.mjs nestjs -p docs --no-project-init
fi

# 5. LINT.md (base + 선택 stack lint-rules)
if [ -n "$USER_ESLINT_STACKS" ]; then
  $KELO_DIR/scripts/gen-lint.mjs nestjs -p docs --with "$USER_ESLINT_STACKS"
else
  $KELO_DIR/scripts/gen-lint.mjs nestjs -p docs
fi

# 6. ESLint config (eslint.config.mjs + kelo.lint.json(stacks) 재생성, package.json의 eslint-config-kelo-nestjs 버전 + lint-staged + scripts.lint(→ kelo-lint CLI 통일) 갱신 — 레거시 @jkit/code-plugin은 제거)
if [ -n "$USER_ESLINT_STACKS" ]; then
  $KELO_DIR/scripts/typescript/gen-eslint.mjs nestjs -p . --with "$USER_ESLINT_STACKS"
else
  $KELO_DIR/scripts/typescript/gen-eslint.mjs nestjs -p .
fi

# 7. Prettier config (prettier.config.mjs 덮어쓰기 + lint-staged 글로브 갱신)
$KELO_DIR/scripts/typescript/gen-prettier.mjs nestjs -p .

# 8. Husky hooks (.husky/* 덮어쓰기 + package.json husky/@commitlint/lint-staged devDeps와 scripts.prepare 패치)
$KELO_DIR/scripts/gen-husky.mjs nestjs -p .

# 9. commitlint.config.mjs 부트스트랩 (이미 있으면 보존)
#    init을 거치지 않은 프로젝트에서 commit-msg 훅이 commitlint config 부재로 실패하는 것을 방지.
[ -f commitlint.config.mjs ] || $KELO_DIR/scripts/gen-commitlint.mjs -p .
```

해당 생성기에 사용자가 선택한 스택이 없으면 `--with` 인자를 생략합니다.

> husky 훅 sync는 `.husky/` 파일과 `package.json` devDeps/`scripts.prepare`를 모두 덮어씁니다. 사용자 수정 훅은 보존되지 않으므로 프로젝트별 커스터마이즈는 kelo 체크아웃의 `rules/nestjs/base/husky/` 템플릿을 fork해야 합니다.

### 5. 의존성 재설치

`eslint-config-kelo-nestjs` 버전이 갱신되었으므로(레거시 `@jkit/code-plugin` git 의존성에서 전환된 경우 포함) install로 동기화합니다.

```bash
cd "$PROJECT_ROOT"
case "$PM" in
  npm)  npm install ;;
  yarn) yarn ;;
  pnpm) pnpm install ;;
  bun)  bun install ;;
esac
# lockfile에 kelo Release tarball의 integrity가 빠졌으면 자산 sha512로 채우고, 있으면 자산과 대조 (pnpm·npm)
$KELO_DIR/scripts/typescript/dependencies/fill-tarball-integrity.mjs --project-dir .
# kelo가 생성한 docs를 프로젝트 prettier 설정으로 맞춤 — lint:ci의 prettier --check가 생성물 때문에 실패하지 않도록 (prettier가 없으면 건너뜀)
ls docs/GIT.md docs/ARCHITECTURE.md docs/STRUCTURE.md docs/CONVENTIONS.md docs/LINT.md 2>/dev/null | xargs npx --no-install prettier --write >/dev/null 2>&1 || true
```

#### peer 누락 보강

기존 프로젝트가 레거시 `@jkit/code-plugin` 또는 구버전 `eslint-config-kelo-nestjs`로 설치되어 신규 peer가 누락된 경우 보강합니다. 이미 범위를 만족하는 peer는 `missing-peers.mjs`가 걸러 기존 범위(예: `^16.3.6`)를 덮어쓰지 않습니다. `eslint-plugin-boundaries@^7`(규칙이 v7 `policies` 문법 사용)은 메이저를 명시해, 구버전이 설치된 기존 프로젝트도 함께 올립니다.

```bash
cd "$PROJECT_ROOT"
NESTJS_PEERS="eslint-plugin-boundaries@^7 eslint-plugin-import eslint-import-resolver-typescript eslint-plugin-simple-import-sort eslint-plugin-unused-imports eslint-plugin-prettier eslint-config-prettier typescript-eslint"
NESTJS_PEERS=$($KELO_DIR/scripts/typescript/missing-peers.mjs -p . $NESTJS_PEERS)  # 이미 범위를 만족하는 peer는 제외
[ -n "$NESTJS_PEERS" ] && case "$PM" in
  npm)  echo "$NESTJS_PEERS" | xargs npm install -D ;;
  yarn) echo "$NESTJS_PEERS" | xargs yarn add -D ;;
  pnpm) echo "$NESTJS_PEERS" | xargs pnpm add -D ;;
  bun)  echo "$NESTJS_PEERS" | xargs bun add -d ;;
esac
```

### 6. Project Preferences 안내 (선택)

사용자에게 lint 토글 옵션을 환기합니다 (선택 — 이미 설정돼 있으면 생략):

> NestJS 프로젝트의 `package.json`에 `kelo-rules` 객체를 추가하면 lint 동작 일부를 토글할 수 있습니다. ESLint config 로드 시점에 평가되므로 `package.json` 수정 후 sync 재실행 없이 다음 ESLint 실행부터 반영됩니다.
>
> ```json
> {
>   "kelo-rules": {
>     "pathAliasCheck": false
>   }
> }
> ```
>
> - `pathAliasCheck` (기본 `true`): 상대 parent import(`../**`) 차단 룰. `false`면 모든 레이어에서 OFF.
>
> 옛 `jkit.pathAliasCheck` 키를 쓰던 프로젝트는 `kelo-rules.pathAliasCheck`로 마이그레이션 필요.

### 7. 매니페스트 작성 제안 (`MANIFEST_MODE=prompt`인 경우만)

prompt 모드로 진행했다면, 다음 sync부터 무인 재현되도록 `kelo.project.json` 작성을 **제안**합니다. sync는 강제하지 않으므로 사용자가 동의할 때만 작성합니다. `projectName`은 디렉토리명, `generateAgents`는 `true`, `tsconfigStacks`는 `[]`를 기본값으로 넣고 사용자가 나중에 조정할 수 있다고 안내합니다.

```bash
cd "$PROJECT_ROOT"
# 사용자가 작성에 동의한 경우에만 실행:
to_arr() { [ -z "$1" ] && echo "[]" || jq -cn --arg s "$1" '$s | split(",")'; }
jq -n \
  --arg name "$(basename "$PROJECT_ROOT")" \
  --argjson conv "$(to_arr "$USER_CONV_STACKS")" \
  --argjson eslint "$(to_arr "$USER_ESLINT_STACKS")" \
  '{framework:"nestjs", projectName:$name, conventionStacks:$conv, eslintStacks:$eslint, tsconfigStacks:[], generateAgents:true}' \
  > "$MANIFEST_PATH"
echo "[manifest] 작성: $MANIFEST_PATH"
```

### 8. 보고

사용자에게 갱신된 항목을 보고합니다:

- `docs/GIT.md` — Git & GitHub 가이드 (덮어쓰기)
- `docs/ARCHITECTURE.md` — 아키텍처 상세 (덮어쓰기)
- `docs/STRUCTURE.md` — lint 룰이 가정하는 디렉토리 구조 참조 (덮어쓰기)
- `docs/CONVENTIONS.md` — 선택한 스택이 반영된 컨벤션 (덮어쓰기, 하단 `CONVENTIONS.PROJECT.md` 링크 포함)
- `docs/LINT.md` — Lint 규칙 참조 (덮어쓰기)
- `eslint.config.mjs` — `eslint-config-kelo-nestjs` factory 호출 (덮어쓰기)
- `kelo.lint.json` — `stacks` 갱신, 그 외 키(경계 확장·ignores)는 보존
- `eslint.project.config.mjs` — 사용자 소유 프로젝트 전용 규칙 추가 파일 (있으면 보존, 없을 때만 스텁 생성)
- `.husky/pre-commit`, `.husky/commit-msg` — husky 훅 (덮어쓰기)
- `package.json` — `eslint-config-kelo-nestjs` 버전(레거시 `@jkit/code-plugin` 제거) + lint-staged(`kelo-lint-nestjs --fix`) + `scripts.lint`(→ `kelo-lint-nestjs`) + `devDependencies`(`husky`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional`) + `scripts.prepare` 갱신 (그 외 필드는 보존)

> 보존된 사용자 소유 파일: `AGENTS.md`, `AGENTS.PROJECT.md`, `CONVENTIONS.PROJECT.md`, `eslint.project.config.mjs`, `tsconfig.json`, `commitlint.config.mjs`, `kelo.project.json`.
