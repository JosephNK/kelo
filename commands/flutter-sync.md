---
description: Sync Kelo docs and lint config in Flutter project
---

# Kelo Flutter Sync

Flutter 프로젝트의 Kelo docs(`GIT.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`, `LINT.md`), `architecture_lint` pin, `.husky/` 훅을 플러그인 최신 버전과 동기화합니다.

> 이 커맨드는 init이 아닙니다. `AGENTS.md`, `AGENTS.PROJECT.md`, `CONVENTIONS.PROJECT.md`는 건드리지 않습니다. `commitlint.config.mjs`도 있으면 보존하며, 없을 때만 husky 훅 정합성을 위해 새로 생성합니다. (`package.json`의 husky/@commitlint devDeps와 `scripts.prepare`, `.husky/` 훅은 sync 대상.) 최초 셋업은 `/kelo-flutter-init`를 사용하세요.

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

```bash
PROJECT_ROOT="$(pwd)"   # 의도한 프로젝트 루트에서 실행
```

아래 모든 shell 블록은 `cd "$PROJECT_ROOT"`가 해당 스텝에서 이미 실행된 상태를 전제로 합니다.

## 매니페스트 (`kelo.project.json`)

프로젝트 루트에 `kelo.project.json`이 **있으면** 스택·엔트리 프롬프트를 건너뛰고 매니페스트 값으로 무인 재현합니다. **없으면** 지금처럼 대화형으로 진행하며, 끝에 작성을 제안합니다(강제 아님). 스펙은 `/kelo:flutter-init` 문서 참조.

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
  USER_CONV_STACKS=$(jq -r '(.conventionStacks // []) | join(",")' "$MANIFEST_PATH")
  ENTRY_DIR=$(jq -r '.entryDir // "app"' "$MANIFEST_PATH")
  MANIFEST_MODE="apply"
  echo "[manifest] apply mode — conv=[$USER_CONV_STACKS] entryDir=$ENTRY_DIR"
else
  MANIFEST_MODE="prompt"
  echo "[manifest] prompt mode — kelo.project.json 없음. 대화형 진행."
fi
```

- **`MANIFEST_MODE=apply`** → 아래 Step 1~2(스택·엔트리)를 건너뛰고 로드된 `USER_CONV_STACKS`, `ENTRY_DIR`를 사용합니다.
- **`MANIFEST_MODE=prompt`** → 기존대로 프롬프트하고, 마지막에 매니페스트 작성을 제안합니다.

## 단계

> **`MANIFEST_MODE=apply`인 경우** 아래 Step 1~2를 건너뛰고 로드된 변수를 사용하세요. 생성 스텝의 `<conventions-stacks>`/`<entry-dir>` 자리에는 각각 `$USER_CONV_STACKS`/`$ENTRY_DIR`를 사용합니다.

### 1. 컨벤션 스택 선택

아래 **컨벤션** 스택을 보여주고 사용자에게 선택을 받습니다 (쉼표 구분, 전부 선택은 `all`, 비우면 base만 적용).
**중요: 이전 대화·세션 컨텍스트와 무관하게, 매 실행마다 아래 4개 항목을 모두 그대로 노출해야 합니다. 항목을 임의로 생략하거나 이전 응답에서 사용한 축약 목록을 재사용하지 마세요.**

1. `freezed`
2. `go-router`
3. `leaf-kit`
4. `easy-localization`

### 2. Flutter 엔트리 디렉토리 확인

사용자에게 Flutter 엔트리 디렉토리를 묻습니다. 기본값: `app`. (`pubspec.yaml`이 위치한 디렉토리) 입력값을 `ENTRY_DIR`로 보관합니다. (apply 모드면 이미 로드돼 있으니 묻지 않습니다.)

### 3. Docs 재생성

```bash
cd "$PROJECT_ROOT"

# 1. GIT.md
$KELO_DIR/scripts/gen-git.mjs -p docs

# 2. ARCHITECTURE.md
$KELO_DIR/scripts/gen-architecture.mjs flutter -p docs

# 3. STRUCTURE.md (lint-rules-structure-reference 복사)
$KELO_DIR/scripts/gen-structure.mjs flutter -p docs

# prompt 모드: Step 1/2 선택값을 변수에 대입. apply 모드: 매니페스트 분기에서 이미 설정됨.
[ "$MANIFEST_MODE" = "prompt" ] && USER_CONV_STACKS="<conventions-stacks>"
[ "$MANIFEST_MODE" = "prompt" ] && ENTRY_DIR="<entry-dir>"

# 4. CONVENTIONS.md (PROJECT는 절대 건드리지 않음 — 없어도 새로 만들지 않음)
if [ -n "$USER_CONV_STACKS" ]; then
  $KELO_DIR/scripts/gen-conventions.mjs flutter -p docs --with "$USER_CONV_STACKS" --no-project-init
else
  $KELO_DIR/scripts/gen-conventions.mjs flutter -p docs --no-project-init
fi

# 5. LINT.md (base + 선택 stack lint-rules)
if [ -n "$USER_CONV_STACKS" ]; then
  $KELO_DIR/scripts/gen-lint.mjs flutter -p docs --with "$USER_CONV_STACKS"
else
  $KELO_DIR/scripts/gen-lint.mjs flutter -p docs
fi
```

해당 생성기에 사용자가 선택한 스택이 없으면 `--with` 인자를 생략합니다.

### 4. analysis_options.yaml 템플릿 sync

엔트리(+ 워크스페이스 모드에선 root)의 `analysis_options.yaml`을 kelo 표준 템플릿(`rules/flutter/base/templates/`)과 sync — **무조건 덮어씀**. 규칙 본체는 `kelo_analysis` Dart 패키지에 있고 파일은 `include: package:kelo_analysis/analysis_options.yaml`만 가지므로, 새 lint 룰은 엔트리 `pubspec.yaml`의 `kelo_analysis` git ref(`v<plugin-version>`, 스크립트가 갱신) → `dart pub get`으로 전파됩니다. 레거시 템플릿(규칙 전체를 담은 파일)을 쓰던 프로젝트도 이 스텝 한 번으로 전환됩니다. 규칙을 끄거나 severity를 낮추는 로컬 수정은 `dart run kelo_analysis:verify`(pre-commit)가 거부합니다.

```bash
cd "$PROJECT_ROOT"
$KELO_DIR/scripts/flutter/gen-analysis-options.mjs flutter -p . -entry "$ENTRY_DIR"
```

이 스크립트는 `plugins:` 섹션을 작성하지 않습니다. 다음 스텝의 `gen-custom-lint.mjs`가 같은 파일에 `plugins:`를 YAML round-trip으로 추가합니다 (템플릿 컨텐츠 보존).

### 5. architecture_lint pin 갱신 (+ stack lint 패키지)

`.kelo/plugins/`에 vendoring된 `architecture_lint`와 선택한 스택의 lint 패키지(예: `leaf-kit` → `leaf_kit_lint`)를 현재 kelo 버전으로 다시 복사하고, `plugins:`를 상대 경로로 등록합니다. 예전 방식(절대 경로 / `git:`)으로 등록된 프로젝트도 이 스텝 한 번으로 vendoring으로 전환됩니다. 바뀐 `.kelo/plugins/`는 커밋하세요.

```bash
cd "$PROJECT_ROOT"
if [ -n "$USER_CONV_STACKS" ]; then
  $KELO_DIR/scripts/flutter/gen-custom-lint.mjs flutter -p . -entry "$ENTRY_DIR" --stacks "$USER_CONV_STACKS"
else
  $KELO_DIR/scripts/flutter/gen-custom-lint.mjs flutter -p . -entry "$ENTRY_DIR"
fi
```

사용자가 선택한 스택이 없으면 `--stacks` 인자를 생략합니다. base의 `architecture_lint`만 sync됩니다.

> idempotent — 등록이 같으면 `plugins:`는 건드리지 않습니다. additive only — 빠진 스택의 플러그인은 자동 제거되지 않으므로, `plugins:` 항목과 `.kelo/plugins/<package>/`를 수동 삭제하세요.

ref가 바뀌어 pubspec이 갱신된 경우, 엔트리 디렉토리에서 `dart pub get`을 실행합니다:

```bash
cd "$PROJECT_ROOT/$ENTRY_DIR" && dart pub get && cd "$PROJECT_ROOT"
```

### 6. Husky 훅 sync

플러그인의 husky 훅 템플릿(`rules/flutter/base/husky/`)을 프로젝트 `.husky/`에 **무조건 덮어쓰고**, `package.json`에 husky/@commitlint devDeps와 `scripts.prepare`를 패치합니다. 사용자 수정 훅은 덮어쓰여지므로 프로젝트별 커스터마이즈는 kelo 체크아웃의 템플릿 파일을 fork해야 합니다.

```bash
cd "$PROJECT_ROOT"
$KELO_DIR/scripts/gen-husky.mjs flutter -p . -entry "$ENTRY_DIR"

# commitlint.config.mjs 부트스트랩 (이미 있으면 보존)
# init을 거치지 않은 프로젝트에서 commit-msg 훅이 commitlint config 부재로 실패하는 것을 방지.
[ -f commitlint.config.mjs ] || $KELO_DIR/scripts/gen-commitlint.mjs -p .
```

> `package.json`이 없으면 스크립트가 fail합니다 — Flutter 프로젝트에 husky를 처음 적용하려면 `/kelo-flutter-init`을 먼저 실행하세요.

`package.json` devDeps가 갱신되었으면 install을 실행해 새 husky/@commitlint 버전을 설치하고 `scripts.prepare` → `husky`로 git 훅을 활성화합니다:

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
case "$PM" in
  npm)  npm install ;;
  yarn) yarn ;;
  pnpm) pnpm install ;;
  bun)  bun install ;;
esac
```

### 7. 매니페스트 작성 제안 (`MANIFEST_MODE=prompt`인 경우만)

prompt 모드로 진행했다면, 다음 sync부터 무인 재현되도록 `kelo.project.json` 작성을 **제안**합니다. sync는 강제하지 않으므로 사용자가 동의할 때만 작성합니다. `projectName`은 디렉토리명, `generateAgents`는 `true`를 기본값으로 넣고 사용자가 나중에 조정할 수 있다고 안내합니다.

```bash
cd "$PROJECT_ROOT"
# 사용자가 작성에 동의한 경우에만 실행:
to_arr() { [ -z "$1" ] && echo "[]" || jq -cn --arg s "$1" '$s | split(",")'; }
jq -n \
  --arg name "$(basename "$PROJECT_ROOT")" \
  --argjson conv "$(to_arr "$USER_CONV_STACKS")" \
  --arg entry "${ENTRY_DIR:-app}" \
  '{framework:"flutter", projectName:$name, conventionStacks:$conv, entryDir:$entry, generateAgents:true}' \
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
- `analysis_options.yaml` — `include: package:kelo_analysis/analysis_options.yaml` 템플릿 (덮어쓰기) + `plugins:`에 `architecture_lint`(base) + 선택한 stack lint 패키지(예: `leaf_kit_lint`) (변경/추가 시에만 갱신)
- `pubspec.yaml` — `dev_dependencies.kelo_analysis` git ref(`v<plugin-version>`) 갱신
- `.husky/pre-commit`, `.husky/commit-msg` — husky 훅 (덮어쓰기, 엔트리 디렉토리 인라인 치환). pre-commit은 `dart run kelo_analysis:verify` → dart format → `dart analyze --fatal-infos`(staged 파일) → 관련 테스트 순
- `package.json` — `devDependencies`(`husky`, `@commitlint/cli`, `@commitlint/config-conventional`)와 `scripts.prepare` 패치 (그 외 필드는 보존)

> 보존된 사용자 소유 파일: `AGENTS.md`, `AGENTS.PROJECT.md`, `CONVENTIONS.PROJECT.md`, `commitlint.config.mjs`, `kelo.project.json`.
