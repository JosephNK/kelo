---
description: Initialize Kelo in NestJS project
argument-hint: '[project-path]'
---

# Kelo NestJS Init

NestJS 프로젝트에 Kelo 설정을 초기화합니다. 생성 스크립트로 동작합니다.

## Arguments

**$ARGUMENTS**

- `[project-path]` (선택): 모노레포 환경에서 NestJS 앱 경로 (예: `apps/api`). 생략 시 현재 디렉토리(`pwd`) 사용.

## 플러그인 경로 확인

스크립트를 실행하기 전에 kelo 플러그인 설치 경로를 확인합니다:

```bash
KELO_DIR=$(jq -r '.plugins["kelo@kelo"][0].installPath' ~/.claude/plugins/installed_plugins.json)
```

이후 모든 스크립트 경로는 `$KELO_DIR`를 기준 디렉토리로 사용합니다.

## 프로젝트 루트 고정

**중요**: 모든 스텝을 실행하기 **전**에 프로젝트 루트를 캡처하고, 스크립트를 실행하는 모든 스텝 시작 시점에 해당 디렉토리로 `cd` 합니다. cwd drift는 잘못된 디렉토리 버그의 가장 흔한 원인입니다 (예: 서브디렉토리 안에서 `AGENTS.md`가 생성되는 문제 등).

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

프로젝트 루트의 `kelo.project.json`은 init/sync가 쓰는 셋업 source-of-truth입니다. **있으면** 아래 프롬프트 스텝(이름·스택 선택·AGENTS 생성 여부)을 건너뛰고 매니페스트 값으로 무인 재현합니다. **없으면** 지금처럼 대화형으로 진행하고, 마지막에 수집한 값으로 매니페스트를 작성합니다.

스펙 (NestJS):

```jsonc
{
  "framework": "nestjs",
  "projectName": "api",
  "conventionStacks": ["typeorm"],
  "eslintStacks": ["typeorm", "gcp"],
  "tsconfigStacks": ["typeorm"],
  "generateAgents": true
}
```

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
  PROJECT_NAME=$(jq -r '.projectName // ""' "$MANIFEST_PATH")
  USER_CONV_STACKS=$(jq -r '(.conventionStacks // []) | join(",")' "$MANIFEST_PATH")
  USER_ESLINT_STACKS=$(jq -r '(.eslintStacks // []) | join(",")' "$MANIFEST_PATH")
  USER_TSCONFIG_STACKS=$(jq -r '(.tsconfigStacks // []) | join(",")' "$MANIFEST_PATH")
  GEN_AGENTS=$(jq -r '.generateAgents // true' "$MANIFEST_PATH")
  MANIFEST_MODE="apply"
  echo "[manifest] apply mode — kelo.project.json 로드:"
  echo "  projectName=$PROJECT_NAME conv=[$USER_CONV_STACKS] eslint=[$USER_ESLINT_STACKS] tsconfig=[$USER_TSCONFIG_STACKS] agents=$GEN_AGENTS"
else
  MANIFEST_MODE="prompt"
  echo "[manifest] prompt mode — kelo.project.json 없음. 대화형 진행 후 작성합니다."
fi
```

- **`MANIFEST_MODE=apply`** → 아래 프롬프트 스텝(프로젝트 이름·컨벤션/ESLint/tsconfig 스택·AGENTS 생성 여부)을 **모두 건너뛰고** 로드된 변수(`PROJECT_NAME`, `USER_CONV_STACKS`, `USER_ESLINT_STACKS`, `USER_TSCONFIG_STACKS`, `GEN_AGENTS`)로 생성 스텝을 진행합니다. PM 감지 단계의 확인 프롬프트도 생략하고 감지값을 그대로 사용합니다.
- **`MANIFEST_MODE=prompt`** → 기존대로 프롬프트 스텝을 수행하고, 생성 후 매니페스트를 작성합니다.

## 단계

> **`MANIFEST_MODE=apply`인 경우** 아래 Step 1~5(이름·스택·AGENTS 여부)를 건너뛰고 로드된 변수를 그대로 사용하세요. **`prompt`인 경우만** 아래 프롬프트를 수행합니다.

### 1. 프로젝트 이름 확인

사용자에게 프로젝트 이름을 묻습니다. 기본값: 현재 디렉토리 이름. 입력값을 `PROJECT_NAME`으로 보관합니다. (apply 모드면 이미 로드돼 있으니 묻지 않습니다.)

### 2. 컨벤션 스택 선택

아래 **컨벤션** 스택을 보여주고 사용자에게 선택을 받습니다 (쉼표 구분, 전부 선택은 `all`, 비우면 base만 적용).
**중요: 이전 대화·세션 컨텍스트와 무관하게, 매 실행마다 아래 1개 항목을 모두 그대로 노출해야 합니다. 항목을 임의로 생략하거나 이전 응답에서 사용한 축약 목록을 재사용하지 마세요.**

1. `typeorm`

### 3. ESLint 스택 선택

아래 **ESLint** 스택을 보여주고 사용자에게 선택을 받습니다 (쉼표 구분, 전부 선택은 `all`, 비우면 base만 적용).
**중요: ESLint 스택은 컨벤션 스택과 동일하지 않습니다. 이전 대화·세션 컨텍스트와 무관하게, 매 실행마다 아래 3개 항목을 모두 그대로 노출해야 합니다 — 항목을 임의로 생략하거나 이전 응답에서 사용한 축약 목록을 재사용하지 마세요.**

1. `typeorm`
2. `gcp`
3. `anthropic-ai`

### 4. tsconfig 스택 선택

아래 **tsconfig** 스택을 보여주고 사용자에게 선택을 받습니다 (쉼표 구분, 전부 선택은 `all`, 비우면 base만 적용).
**중요: 이전 대화·세션 컨텍스트와 무관하게, 매 실행마다 아래 1개 항목을 모두 그대로 노출해야 합니다. 항목을 임의로 생략하거나 이전 응답에서 사용한 축약 목록을 재사용하지 마세요.**

1. `typeorm`

### 5. AGENTS.md 생성 여부

사용자에게 `AGENTS.md` 및 `CLAUDE.md` 심볼릭 링크 생성 여부를 묻습니다.
이 파일들은 사용자가 커스터마이즈할 수 있으므로 선택 스텝입니다. 선택 결과를 `GEN_AGENTS`(`true`/`false`)로 보관합니다. (apply 모드면 이미 로드돼 있으니 묻지 않습니다.)

`GEN_AGENTS=true`이면:
```bash
cd "$PROJECT_ROOT"
$KELO_DIR/scripts/gen-agents.mjs nestjs -p . -n "$PROJECT_NAME" --docs-dir docs
```

### 6. 패키지 매니저 감지 및 package.json 보장

`gen-eslint.mjs`는 사용자 프로젝트의 `package.json`에 devDependency를 주입하므로 파일이 반드시 존재해야 합니다. 또한 이후 Step 8의 install 명령을 프로젝트가 이미 쓰는 패키지 매니저에 맞춰야 합니다.

#### 6-1. 감지

아래 우선순위로 패키지 매니저(`PM`)를 감지합니다.

```bash
cd "$PROJECT_ROOT"

detect_pm() {
  # 1. 기존 lock 파일 우선
  [ -f pnpm-lock.yaml ]    && echo "pnpm" && return
  [ -f yarn.lock ]         && echo "yarn" && return
  [ -f bun.lockb ]         && echo "bun"  && return
  [ -f package-lock.json ] && echo "npm"  && return
  # 2. package.json의 packageManager 필드
  if [ -f package.json ]; then
    pm_field=$(jq -r '.packageManager // empty' package.json | cut -d@ -f1)
    [ -n "$pm_field" ] && echo "$pm_field" && return
  fi
  # 3. 설치된 매니저 우선순위 (pnpm > yarn > bun > npm)
  command -v pnpm >/dev/null && echo "pnpm" && return
  command -v yarn >/dev/null && echo "yarn" && return
  command -v bun  >/dev/null && echo "bun"  && return
  echo "npm"
}

PM=$(detect_pm)
```

사용자에게 감지 결과를 보여주고 확인을 받습니다: **"감지된 매니저: {PM}. 사용할까요? 다른 매니저를 원하면 npm / yarn / pnpm / bun 중 선택."**

사용자가 다른 매니저를 지정하면 `PM`을 그 값으로 덮어씁니다.

#### 6-2. package.json 보장

```bash
cd "$PROJECT_ROOT"
if [ ! -f package.json ]; then
  case "$PM" in
    npm)  npm init -y ;;
    yarn) yarn init -y ;;
    pnpm) pnpm init ;;
    bun)  bun init -y ;;
  esac
fi
```

> `init`은 기본 필드(name/version/main 등)만 채운 최소 `package.json`을 생성합니다. 이후 스텝에서 `devDependencies`가 자동으로 추가됩니다.
> 사용자가 생성을 거부하면 Step 7 이후를 중단하고 `package.json`을 수동 생성 후 재실행하라고 안내합니다.

### 7. 생성 스크립트 실행

플러그인의 `scripts/` 디렉토리에서 다음 스크립트들을 실행합니다.

```bash
cd "$PROJECT_ROOT"

# 1. GIT.md
$KELO_DIR/scripts/gen-git.mjs -p docs

# 2. ARCHITECTURE.md
$KELO_DIR/scripts/gen-architecture.mjs nestjs -p docs

# 3. STRUCTURE.md (lint-rules-structure-reference 복사)
$KELO_DIR/scripts/gen-structure.mjs nestjs -p docs

# prompt 모드: Step 2~4 선택값을 변수에 대입. apply 모드: 매니페스트 분기에서 이미 설정됨.
[ "$MANIFEST_MODE" = "prompt" ] && USER_CONV_STACKS="<conventions-stacks>"
[ "$MANIFEST_MODE" = "prompt" ] && USER_ESLINT_STACKS="<eslint-stacks>"
[ "$MANIFEST_MODE" = "prompt" ] && USER_TSCONFIG_STACKS="<tsconfig-stacks>"

# 4. CONVENTIONS.md
if [ -n "$USER_CONV_STACKS" ]; then
  $KELO_DIR/scripts/gen-conventions.mjs nestjs -p docs --with "$USER_CONV_STACKS"
else
  $KELO_DIR/scripts/gen-conventions.mjs nestjs -p docs
fi

# 5. LINT.md (base + 선택 stack lint-rules)
if [ -n "$USER_ESLINT_STACKS" ]; then
  $KELO_DIR/scripts/gen-lint.mjs nestjs -p docs --with "$USER_ESLINT_STACKS"
else
  $KELO_DIR/scripts/gen-lint.mjs nestjs -p docs
fi

# 6. ESLint config (Step 6에서 package.json 존재를 보장한 뒤 실행)
#    - eslint.config.mjs (패키지 factory 호출) + kelo.lint.json(stacks) 생성
#    - package.json: eslint-config-kelo-nestjs devDep + lint-staged(kelo-lint-nestjs --fix) + scripts.lint(→ kelo-lint CLI 통일)
if [ -n "$USER_ESLINT_STACKS" ]; then
  $KELO_DIR/scripts/typescript/gen-eslint.mjs nestjs -p . --with "$USER_ESLINT_STACKS"
else
  $KELO_DIR/scripts/typescript/gen-eslint.mjs nestjs -p .
fi

# 7. Prettier config (항상 실행, 스택 선택 없음)
#    - prettier.config.mjs 생성
#    - package.json: prettier devDep + scripts.format + lint-staged TS/JS·데이터 글로브 자동 주입
$KELO_DIR/scripts/typescript/gen-prettier.mjs nestjs -p .

# 8. tsconfig.json patch
if [ -n "$USER_TSCONFIG_STACKS" ]; then
  $KELO_DIR/scripts/typescript/gen-tsconfig.mjs nestjs -p . --with "$USER_TSCONFIG_STACKS"
else
  $KELO_DIR/scripts/typescript/gen-tsconfig.mjs nestjs -p .
fi

# 9. Husky hooks
#    + package.json에 husky/lint-staged/@commitlint devDeps와 scripts.prepare 주입
$KELO_DIR/scripts/gen-husky.mjs nestjs -p .

# 10. commitlint.config.mjs (Conventional Commits + 프로젝트 허용 타입 강제)
$KELO_DIR/scripts/gen-commitlint.mjs -p .
```

해당 생성기에 사용자가 선택한 스택이 없으면 `--with` 인자를 생략합니다.

### 8. ESLint rules 의존성 설치

`gen-eslint.mjs`는 kelo ESLint 패키지를 쓰도록 프로젝트를 연결합니다:

- `eslint.config.mjs` — 패키지 factory 호출만 담은 짧은 생성물 (매 sync마다 덮어씀)
- `kelo.lint.json` — 선택한 스택(`stacks`) + 프로젝트별 경계 확장(`boundaryElements`/`boundaryRules`/`boundaryIgnores`/`ignores`) + 추가 금지 패키지(`frameworkBannedPackages`: model·port·exception, `infraBannedPackages`: service — 스택 목록 뒤에 추가만)
- `package.json` — `devDependencies`에 `"eslint-config-kelo-nestjs": "<current-version>"` 추가 (npm 레지스트리, 플러그인 버전과 같은 정확한 버전) (레거시 `@jkit/code-plugin` git 의존성은 제거), lint-staged TS/JS glob은 `kelo-lint-nestjs --fix`, `scripts.lint`를 `kelo-lint-nestjs`로 통일 (eslint 기반 `lint:ci`/`lint:fix`도 교체 — 경로/`--ignore-pattern` 인자는 `kelo.lint.json` `ignores`로 이전)

의존성을 실제로 설치합니다. 명령은 Step 6에서 결정된 `PM` 변수에 따라 분기합니다.

```bash
cd "$PROJECT_ROOT"
case "$PM" in
  npm)  npm install ;;
  yarn) yarn ;;
  pnpm) pnpm install ;;
  bun)  bun install ;;
esac
# kelo가 생성한 docs를 프로젝트 prettier 설정으로 맞춤 — lint:ci의 prettier --check가 생성물 때문에 실패하지 않도록 (prettier가 없으면 건너뜀)
ls docs/GIT.md docs/ARCHITECTURE.md docs/STRUCTURE.md docs/CONVENTIONS.md docs/LINT.md 2>/dev/null | xargs npx --no-install prettier --write >/dev/null 2>&1 || true
```

> 규칙 원본과 조립 로직은 `node_modules/eslint-config-kelo-nestjs/`에 있습니다. 규칙 변경은 kelo 저장소에서 수정·배포(npm 레지스트리)하고, 프로젝트는 `/kelo:update-plugin-ref code-plugin` 또는 sync로 버전을 올려 반영합니다. `kelo-check-i18n` CLI도 이 패키지가 제공합니다.

> **peerDependencies**: `eslint-config-kelo-nestjs`는 다음을 peer로 요구합니다 (rules가 직접 import):
> - `eslint` (9.22+) — `eslint/config`의 `defineConfig`/`globalIgnores` 사용
> - `eslint-plugin-boundaries` (7+) — 아키텍처 레이어 boundary 검사 (v7 `policies` 문법 사용)
> - `eslint-plugin-import` — 순환 의존성 감지(`import/no-cycle`) + resolver 기반 동작
> - `eslint-import-resolver-typescript` — `@/*` path alias 및 NodeNext `.js` import 해석 (boundaries/no-unknown-dependencies 오발화 방지)
> - `eslint-plugin-simple-import-sort` — import 순서 자동 정렬
> - `eslint-plugin-unused-imports` — 미사용 import 제거
> - `eslint-plugin-prettier` + `eslint-config-prettier` + `prettier` — prettier 포맷 룰 통합
> - `typescript-eslint` — TypeScript 룰셋 (`tseslint.configs.*`)
> - `@eslint/js`, `globals` — `nest new` 스캐폴드가 기본 포함
>
> 프로젝트에 없으면 Step 6에서 결정된 `PM`에 맞춰 추가 설치합니다. npm 7+ / pnpm / yarn berry는 `npm install` 단계에서 peer를 자동 설치하지만, yarn classic / bun 호환을 위해 명시 install을 권장합니다.
>
> ```bash
> cd "$PROJECT_ROOT"
> NESTJS_PEERS="eslint-plugin-boundaries@^7 eslint-plugin-import eslint-import-resolver-typescript eslint-plugin-simple-import-sort eslint-plugin-unused-imports eslint-plugin-prettier eslint-config-prettier typescript-eslint"
> NESTJS_PEERS=$($KELO_DIR/scripts/typescript/missing-peers.mjs -p . $NESTJS_PEERS)  # 이미 범위를 만족하는 peer는 제외
> [ -n "$NESTJS_PEERS" ] && case "$PM" in
>   npm)  echo "$NESTJS_PEERS" | xargs npm install -D ;;
>   yarn) echo "$NESTJS_PEERS" | xargs yarn add -D ;;
>   pnpm) echo "$NESTJS_PEERS" | xargs pnpm add -D ;;
>   bun)  echo "$NESTJS_PEERS" | xargs bun add -d ;;
> esac
> ```

### 9. Project Preferences 안내 (선택)

사용자에게 다음 옵션을 안내합니다 (선택 — 필요할 때만 추가):

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
> - `pathAliasCheck` (기본 `true`): 상대 parent import(`../**`) 차단 룰. `false`면 모든 레이어에서 OFF — `@/*` path alias 강제 해제.

### 10. 매니페스트 작성 (`MANIFEST_MODE=prompt`인 경우만)

prompt 모드로 진행했다면 수집한 값으로 `kelo.project.json`을 작성합니다. 작성 직전 사용자에게 내용을 보여주고 확인을 받습니다. 다음 init/sync는 이 파일로 무인 재현됩니다. (apply 모드면 이미 매니페스트가 있으므로 건너뜁니다.)

```bash
cd "$PROJECT_ROOT"
if [ "$MANIFEST_MODE" = "prompt" ]; then
  to_arr() { [ -z "$1" ] && echo "[]" || jq -cn --arg s "$1" '$s | split(",")'; }
  jq -n \
    --arg name "$PROJECT_NAME" \
    --argjson conv "$(to_arr "$USER_CONV_STACKS")" \
    --argjson eslint "$(to_arr "$USER_ESLINT_STACKS")" \
    --argjson ts "$(to_arr "$USER_TSCONFIG_STACKS")" \
    --argjson agents "${GEN_AGENTS:-true}" \
    '{framework:"nestjs", projectName:$name, conventionStacks:$conv, eslintStacks:$eslint, tsconfigStacks:$ts, generateAgents:$agents}' \
    > "$MANIFEST_PATH"
  echo "[manifest] 작성: $MANIFEST_PATH"
fi
```

### 11. 보고

사용자에게 생성된 항목을 보고합니다:
- `kelo.project.json` — Kelo 셋업 매니페스트 (prompt 모드에서 신규 작성; 다음 init/sync 무인 재현용)
- `AGENTS.md` — AI 에이전트 엔트리 포인트
- `CLAUDE.md` → `AGENTS.md` 심볼릭 링크
- `AGENTS.PROJECT.md` — 사용자 소유 프로젝트 고유 가이드 (최초 1회만 생성, 이후 보존)
- `GIT.md` — Git & GitHub 가이드
- `ARCHITECTURE.md` — 아키텍처 상세
- `STRUCTURE.md` — lint 룰이 가정하는 디렉토리 구조 참조
- `CONVENTIONS.md` — 선택한 스택이 반영된 컨벤션 (하단에 `CONVENTIONS.PROJECT.md` 링크 포함)
- `CONVENTIONS.PROJECT.md` — 사용자 소유 프로젝트 고유 컨벤션 (최초 1회만 생성, 이후 보존)
- `eslint.config.mjs` — kelo 관리 생성물. `eslint-config-kelo-nestjs`의 `nestjs()` factory 호출 (직접 수정 금지 — hook이 차단)
- `kelo.lint.json` — kelo 관리. 선택한 스택 + 프로젝트별 경계 확장(`boundaryElements`/`boundaryRules`/`boundaryIgnores`/`ignores`) + 추가 금지 패키지(`frameworkBannedPackages`: model·port·exception, `infraBannedPackages`: service — 스택 목록 뒤에 추가만)
- `eslint.project.config.mjs` — 사용자 소유 프로젝트 전용 규칙 추가 파일 (최초 1회만 스텁 생성, 이후 보존). kelo 규칙 재정의 시 ESLint 로드 에러
- `package.json` — `devDependencies`에 `eslint-config-kelo-nestjs`, `husky`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional` 추가 + `scripts.lint`(→ `kelo-lint-nestjs`) + `scripts.prepare: "husky"`
- `tsconfig.json` — 프레임워크별 설정으로 패치됨
- `.husky/pre-commit` — `npx lint-staged` + `npx kelo-check-i18n`
- `.husky/commit-msg` — `npx --no -- commitlint --edit $1`
- `commitlint.config.mjs` — Conventional Commits 설정 (허용 타입: feat, fix, refactor, docs, test, chore, perf, ci)
