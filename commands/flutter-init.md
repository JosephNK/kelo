---
description: Initialize Kelo in Flutter project
---

# Kelo Flutter Init

Flutter 프로젝트에 Kelo 설정을 초기화합니다. 생성 스크립트로 동작합니다.

## 플러그인 경로 확인

스크립트를 실행하기 전에 kelo 플러그인 설치 경로를 확인합니다:

```bash
KELO_DIR=$(jq -r '.plugins["kelo@kelo"][0].installPath' ~/.claude/plugins/installed_plugins.json)
```

이후 모든 스크립트 경로는 `$KELO_DIR`를 기준 디렉토리로 사용합니다.

## 플러그인 의존성 보장

`gen-analysis-options.mjs` / `gen-custom-lint.mjs`는 `yaml` 패키지를 사용합니다. 플러그인이 새 버전으로 캐시될 때 `node_modules`가 비어 있을 수 있으므로 사전 설치합니다.

```bash
if [ ! -d "$KELO_DIR/node_modules/yaml" ]; then
  (cd "$KELO_DIR" && npm install --silent)
fi
```

## 프로젝트 루트 고정

**중요**: 모든 스텝을 실행하기 **전**에 프로젝트 루트를 캡처하고, 스크립트를 실행하는 모든 스텝 시작 시점에 해당 디렉토리로 `cd` 합니다. cwd drift (예: 앞선 스텝에서 `cd app/` 후 원복 안 된 상태)는 잘못된 디렉토리 버그의 가장 흔한 원인입니다 (예: `app/AGENTS.md` 덮어쓰기, husky 훅에 잘못된 config 경로가 베이킹되는 문제 등).

```bash
PROJECT_ROOT="$(pwd)"   # 의도한 프로젝트 루트에서 실행
```

아래 모든 shell 블록은 `cd "$PROJECT_ROOT"`가 해당 스텝에서 이미 실행된 상태를 전제로 합니다.

## 매니페스트 (`kelo.project.json`)

프로젝트 루트의 `kelo.project.json`은 init/sync가 쓰는 셋업 source-of-truth입니다. **있으면** 아래 프롬프트 스텝(이름·스택 선택·엔트리 디렉토리·AGENTS 생성 여부)을 건너뛰고 매니페스트 값으로 무인 재현합니다. **없으면** 지금처럼 대화형으로 진행하고, 마지막에 수집한 값으로 매니페스트를 작성합니다.

스펙 (Flutter — eslint/tsconfig 스택 없음, 대신 `entryDir`):

```jsonc
{
  "framework": "flutter",
  "projectName": "my_app",
  "conventionStacks": ["freezed", "leaf-kit"],
  "entryDir": "app",
  "generateAgents": true
}
```

### 매니페스트 분기

```bash
cd "$PROJECT_ROOT"
MANIFEST_PATH="$PROJECT_ROOT/kelo.project.json"
# 레거시 이름(jkit.project.json)은 kelo 이름으로 옮긴다
if [ ! -f "$MANIFEST_PATH" ] && [ -f "$PROJECT_ROOT/jkit.project.json" ]; then
  mv "$PROJECT_ROOT/jkit.project.json" "$MANIFEST_PATH"
  echo "[manifest] jkit.project.json → kelo.project.json 이름 변경"
fi

if [ -f "$MANIFEST_PATH" ]; then
  MF_FRAMEWORK=$(jq -r '.framework // ""' "$MANIFEST_PATH")
  if [ "$MF_FRAMEWORK" != "flutter" ]; then
    echo "Error: kelo.project.json framework='$MF_FRAMEWORK' (expected 'flutter')" >&2
    exit 1
  fi
  PROJECT_NAME=$(jq -r '.projectName // ""' "$MANIFEST_PATH")
  USER_CONV_STACKS=$(jq -r '(.conventionStacks // []) | join(",")' "$MANIFEST_PATH")
  ENTRY_DIR=$(jq -r '.entryDir // "app"' "$MANIFEST_PATH")
  GEN_AGENTS=$(jq -r '.generateAgents // true' "$MANIFEST_PATH")
  MANIFEST_MODE="apply"
  echo "[manifest] apply mode — kelo.project.json 로드:"
  echo "  projectName=$PROJECT_NAME conv=[$USER_CONV_STACKS] entryDir=$ENTRY_DIR agents=$GEN_AGENTS"
else
  MANIFEST_MODE="prompt"
  echo "[manifest] prompt mode — kelo.project.json 없음. 대화형 진행 후 작성합니다."
fi
```

- **`MANIFEST_MODE=apply`** → 아래 프롬프트 스텝(프로젝트 이름·컨벤션 스택·엔트리 디렉토리·AGENTS 생성 여부)을 **모두 건너뛰고** 로드된 변수(`PROJECT_NAME`, `USER_CONV_STACKS`, `ENTRY_DIR`, `GEN_AGENTS`)로 생성 스텝을 진행합니다. PM 감지 단계의 확인 프롬프트도 생략하고 감지값을 그대로 사용합니다.
- **`MANIFEST_MODE=prompt`** → 기존대로 프롬프트 스텝을 수행하고, 생성 후 매니페스트를 작성합니다.

## 단계

> **`MANIFEST_MODE=apply`인 경우** 아래 Step 1~4(이름·스택·엔트리·AGENTS 여부)를 건너뛰고 로드된 변수를 그대로 사용하세요. **`prompt`인 경우만** 아래 프롬프트를 수행합니다. 생성 스텝의 `<entry-dir>`/`<conventions-stacks>` 자리에는 각각 `$ENTRY_DIR`/`$USER_CONV_STACKS`를 사용합니다.

### 1. 프로젝트 이름 확인

사용자에게 프로젝트 이름을 묻습니다. 기본값: 현재 디렉토리 이름. 입력값을 `PROJECT_NAME`으로 보관합니다. (apply 모드면 이미 로드돼 있으니 묻지 않습니다.)

### 2. 컨벤션 스택 선택

아래 **컨벤션** 스택을 보여주고 사용자에게 선택을 받습니다 (쉼표 구분, 전부 선택은 `all`, 비우면 base만 적용).
**중요: 이전 대화·세션 컨텍스트와 무관하게, 매 실행마다 아래 4개 항목을 모두 그대로 노출해야 합니다. 항목을 임의로 생략하거나 이전 응답에서 사용한 축약 목록을 재사용하지 마세요.**

1. `freezed`
2. `go-router`
3. `leaf-kit`
4. `easy-localization`

### 3. Flutter 엔트리 디렉토리 확인

사용자에게 Flutter 엔트리 디렉토리를 묻습니다. 기본값: `app`. 입력값을 `ENTRY_DIR`로 보관합니다. (apply 모드면 이미 로드돼 있으니 묻지 않습니다.)

### 4. AGENTS.md 생성 여부

사용자에게 `AGENTS.md` 및 `CLAUDE.md` 심볼릭 링크 생성 여부를 묻습니다.
이 파일들은 사용자가 커스터마이즈할 수 있으므로 선택 스텝입니다. 선택 결과를 `GEN_AGENTS`(`true`/`false`)로 보관합니다. (apply 모드면 이미 로드돼 있으니 묻지 않습니다.)

`GEN_AGENTS=true`이면:
```bash
cd "$PROJECT_ROOT"
$KELO_DIR/scripts/gen-agents.mjs flutter -p . -n "$PROJECT_NAME" --docs-dir docs
```

### 5. 패키지 매니저 감지 및 package.json 보장

`gen-husky.mjs`는 사용자 프로젝트의 `package.json`에 husky/@commitlint devDependency를 주입하므로 파일이 반드시 존재해야 합니다. Flutter 프로젝트는 전통적으로 `package.json`이 없지만, husky 훅을 활성화하려면 루트에 생성해야 합니다.

#### 5-1. 감지

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

#### 5-2. package.json 보장

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

> `init`은 기본 필드(name/version/main 등)만 채운 최소 `package.json`을 생성합니다. 이후 Step 6의 `gen-husky.mjs`가 `devDependencies`와 `scripts.prepare`를 자동으로 추가합니다.
> 사용자가 생성을 거부하면 Step 6 이후를 중단하고 `package.json`을 수동 생성 후 재실행하라고 안내합니다.

### 6. 생성 스크립트 실행

플러그인의 `scripts/` 디렉토리에서 다음 스크립트들을 실행합니다.

```bash
cd "$PROJECT_ROOT"

# prompt 모드: Step 2/3 선택값을 변수에 대입. apply 모드: 매니페스트 분기에서 이미 설정됨.
[ "$MANIFEST_MODE" = "prompt" ] && USER_CONV_STACKS="<conventions-stacks>"
[ "$MANIFEST_MODE" = "prompt" ] && ENTRY_DIR="<entry-dir>"

# 1. GIT.md
$KELO_DIR/scripts/gen-git.mjs -p docs

# 2. ARCHITECTURE.md
$KELO_DIR/scripts/gen-architecture.mjs flutter -p docs

# 3. STRUCTURE.md (lint-rules-structure-reference 복사)
$KELO_DIR/scripts/gen-structure.mjs flutter -p docs

# 4. CONVENTIONS.md
if [ -n "$USER_CONV_STACKS" ]; then
  $KELO_DIR/scripts/gen-conventions.mjs flutter -p docs --with "$USER_CONV_STACKS"
else
  $KELO_DIR/scripts/gen-conventions.mjs flutter -p docs
fi

# 5. LINT.md (base + 선택 stack lint-rules)
if [ -n "$USER_CONV_STACKS" ]; then
  $KELO_DIR/scripts/gen-lint.mjs flutter -p docs --with "$USER_CONV_STACKS"
else
  $KELO_DIR/scripts/gen-lint.mjs flutter -p docs
fi

# 6. Husky hooks (.husky/pre-commit에 $ENTRY_DIR이 인라인 치환됨, .husky/commit-msg)
#    + package.json에 husky/@commitlint devDeps와 scripts.prepare 주입
$KELO_DIR/scripts/gen-husky.mjs flutter -p . -entry "$ENTRY_DIR"

# 7. commitlint.config.mjs (Conventional Commits + 프로젝트 허용 타입 강제)
$KELO_DIR/scripts/gen-commitlint.mjs -p .
```

해당 생성기에 사용자가 선택한 스택이 없으면 `--with` 인자를 생략합니다.

### 7. devDependencies 설치 (husky 활성화)

`gen-husky.mjs`가 `package.json`에 주입한 husky / @commitlint devDeps를 실제로 설치합니다. 설치가 끝날 때 `scripts.prepare` → `husky`가 자동 실행되어 git 훅이 활성화됩니다.

```bash
cd "$PROJECT_ROOT"
case "$PM" in
  npm)  npm install ;;
  yarn) yarn ;;
  pnpm) pnpm install ;;
  bun)  bun install ;;
esac
```

### 8. analysis_options.yaml scaffold (analyzer/linter 룰 템플릿)

엔트리(+ 워크스페이스 모드에선 워크스페이스 root)의 `analysis_options.yaml`을 kelo 표준 템플릿(`rules/flutter/base/templates/`)으로 **무조건 덮어씀**. `flutter create`가 남긴 기본 파일이나 사용자 수정 파일이 있다면 git history로만 복구 가능합니다.

analyzer/linter 규칙 본체는 `kelo_analysis` Dart 패키지(`rules/flutter/base/analysis/kelo_analysis/`)에 있고, 엔트리의 `analysis_options.yaml`은 `include: package:kelo_analysis/analysis_options.yaml`만 가집니다 (워크스페이스 멤버는 `include: [<root>, package:kelo_analysis/...]`). 스크립트가 엔트리 `pubspec.yaml`의 `dev_dependencies`에 `kelo_analysis`를 git 의존성(`ref: v<plugin-version>`)으로 추가합니다. 규칙 변경은 kelo 저장소에서 합니다 — 프로젝트에서 규칙을 끄거나 severity를 낮추면 `dart run kelo_analysis:verify`(pre-commit에 연결)가 실패합니다.

```bash
cd "$PROJECT_ROOT"
$KELO_DIR/scripts/flutter/gen-analysis-options.mjs flutter -p . -entry "$ENTRY_DIR"
```

이 스크립트는 `plugins:` 섹션을 작성하지 않습니다. 다음 스텝의 `gen-custom-lint.mjs`가 같은 파일에 `plugins:`를 YAML round-trip으로 추가합니다 (템플릿 컨텐츠 보존).

### 9. architecture_lint 주입 (+ stack lint 패키지)

Flutter 엔트리(워크스페이스 모드에선 root)의 `analysis_options.yaml` top-level `plugins:` 섹션에 `architecture_lint`(base)와 선택한 컨벤션 스택의 stack lint 패키지(예: `leaf-kit` → `leaf_kit_lint`)를 등록합니다. 플러그인 소스는 같은 폴더의 `.kelo/plugins/<package>/`로 **복사(vendoring)**되고 상대 경로(`path: .kelo/plugins/<package>`)로 등록되므로, 다른 PC와 CI에서도 동작합니다 — `.kelo/plugins/`는 **git에 커밋**하세요. (`git:` 등록은 Dart 3.13.4에서도 진단이 나오지 않고, 절대 경로는 한 PC에서만 동작합니다.) 복사본은 `.kelo-vendor.json` 해시로 보호되어, 직접 수정하면 `dart run kelo_analysis:verify`가 실패합니다. analysis_server_plugin(Dart 3.10+)이 두 패키지를 독립 isolate로 로드해 IDE 및 `dart analyze`에서 동작합니다. 레거시 `custom_lint` dev dep와 `analyzer.plugins:` 항목은 자동으로 제거됩니다. 이 스텝은 **무조건** 실행되어야 합니다.

```bash
cd "$PROJECT_ROOT"
if [ -n "$USER_CONV_STACKS" ]; then
  $KELO_DIR/scripts/flutter/gen-custom-lint.mjs flutter -p . -entry "$ENTRY_DIR" --stacks "$USER_CONV_STACKS"
else
  $KELO_DIR/scripts/flutter/gen-custom-lint.mjs flutter -p . -entry "$ENTRY_DIR"
fi
```

사용자가 선택한 스택이 없으면 `--stacks` 인자를 생략합니다. base의 `architecture_lint`만 주입됩니다.

주입 후, 새 의존성을 해결하기 위해 엔트리 디렉토리에서 `dart pub get`을 실행합니다:

```bash
cd "$PROJECT_ROOT/$ENTRY_DIR" && dart pub get && cd "$PROJECT_ROOT"
```

> `gen-custom-lint.mjs`는 매번 복사본을 현재 kelo 버전으로 교체하고, `plugins:` 등록은 동일하면 건드리지 않습니다 (idempotent). stack ↔ 패키지 매핑은 `inject-custom-lint.mjs`의 `STACK_PACKAGES`에 정의 (현재 `leaf-kit` → `leaf_kit_lint`, `freezed` → `freezed_lint`).

### 10. 매니페스트 작성 (`MANIFEST_MODE=prompt`인 경우만)

prompt 모드로 진행했다면 수집한 값으로 `kelo.project.json`을 작성합니다. 작성 직전 사용자에게 내용을 보여주고 확인을 받습니다. 다음 init/sync는 이 파일로 무인 재현됩니다. (apply 모드면 이미 매니페스트가 있으므로 건너뜁니다.)

```bash
cd "$PROJECT_ROOT"
if [ "$MANIFEST_MODE" = "prompt" ]; then
  to_arr() { [ -z "$1" ] && echo "[]" || jq -cn --arg s "$1" '$s | split(",")'; }
  jq -n \
    --arg name "$PROJECT_NAME" \
    --argjson conv "$(to_arr "$USER_CONV_STACKS")" \
    --arg entry "${ENTRY_DIR:-app}" \
    --argjson agents "${GEN_AGENTS:-true}" \
    '{framework:"flutter", projectName:$name, conventionStacks:$conv, entryDir:$entry, generateAgents:$agents}' \
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
- `package.json` — `devDependencies`(`husky`, `@commitlint/cli`, `@commitlint/config-conventional`) + `scripts.prepare: "husky"`
- `.husky/pre-commit` — husky pre-commit 훅 (`dart run kelo_analysis:verify`, dart format, `dart analyze --fatal-infos`; 엔트리 디렉토리가 파일에 베이킹됨)
- `.husky/commit-msg` — husky commit-msg 훅 (`commitlint --edit $1`)
- `commitlint.config.mjs` — Conventional Commits 설정 (허용 타입: feat, fix, refactor, docs, test, chore, perf, ci)
- `kelo_analysis` — 엔트리 `pubspec.yaml` dev_dependencies(git dep)에 추가, `analysis_options.yaml`이 include하는 analyzer/linter 규칙 + `verify` CLI
- `architecture_lint` (base) — `.kelo/plugins/architecture_lint/`에 vendoring, `analysis_options.yaml` `plugins:`에 상대 경로로 등록 (커밋 대상). analysis_server_plugin이 IDE/`dart analyze`에 진단 통합
- stack lint 패키지(선택한 스택 기반) — `leaf-kit` 선택 시 `leaf_kit_lint`도 동일하게 `plugins:`에 등록
