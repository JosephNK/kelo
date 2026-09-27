---
description: Initialize Kelo across monorepo workspaces using kelo.workspaces.json
argument-hint: '[manifest-path]'
---

# Kelo Workspaces Init

모노레포의 여러 워크스페이스에 Kelo을 일괄 초기화합니다.

- **매니페스트가 이미 있으면**: 각 entry에 대해 init을 실행합니다 (프롬프트 없이 매니페스트 값 사용).
- **매니페스트가 없으면**: 워크스페이스를 자동 탐색하고 entry별 스택을 받아 매니페스트를 생성한 뒤 init을 실행합니다.

## Arguments

**$ARGUMENTS**

- `[manifest-path]` (선택): 매니페스트 파일 경로. 생략 시 `./kelo.workspaces.json` 사용.

## 매니페스트 스펙

`/kelo:workspaces-sync` 와 동일한 스펙입니다. 요약:

```json
{
  "workspaces": [
    {
      "path": "apps/web",
      "framework": "nextjs",
      "projectName": "web",
      "conventionStacks": ["design-system/mantine"],
      "eslintStacks": ["design-system/mantine"],
      "tsconfigStacks": [],
      "generateAgents": true
    }
  ]
}
```

자세한 필드 설명은 `/kelo:workspaces-sync` 문서 참조.

## 플러그인 경로 확인

```bash
KELO_DIR=$(jq -r '.plugins["kelo@kelo"][0].installPath' ~/.claude/plugins/installed_plugins.json)
```

## 모노레포 루트 고정

```bash
MONOREPO_ROOT="$(pwd)"

MANIFEST_ARG="<argument-or-empty>"
if [ -n "$MANIFEST_ARG" ]; then
  case "$MANIFEST_ARG" in
    /*) MANIFEST_PATH="$MANIFEST_ARG" ;;
    *)  MANIFEST_PATH="$MONOREPO_ROOT/$MANIFEST_ARG" ;;
  esac
else
  MANIFEST_PATH="$MONOREPO_ROOT/kelo.workspaces.json"
  # 레거시 이름(jkit.workspaces.json)은 kelo 이름으로 옮긴다
  if [ ! -f "$MANIFEST_PATH" ] && [ -f "$MONOREPO_ROOT/jkit.workspaces.json" ]; then
    mv "$MONOREPO_ROOT/jkit.workspaces.json" "$MANIFEST_PATH"
    echo "[manifest] jkit.workspaces.json → kelo.workspaces.json 이름 변경"
  fi
fi
```

## 단계

### 1. 매니페스트 존재 분기

```bash
if [ -f "$MANIFEST_PATH" ]; then
  echo "Found manifest: $MANIFEST_PATH"
  MODE="apply"
else
  echo "Manifest not found. Bootstrapping..."
  MODE="bootstrap"
fi
```

### 2. (bootstrap 모드만) 워크스페이스 자동 탐색

매니페스트가 없으면 모노레포 워크스페이스 정의를 읽어 후보를 추립니다.

```bash
cd "$MONOREPO_ROOT"

# package.json#workspaces (npm/yarn/bun) 또는 pnpm-workspace.yaml에서 패턴 추출
WS_PATTERNS=()
if [ -f package.json ]; then
  mapfile -t WS_PATTERNS < <(jq -r '.workspaces[]? // empty' package.json 2>/dev/null)
fi
if [ ${#WS_PATTERNS[@]} -eq 0 ] && [ -f pnpm-workspace.yaml ]; then
  # yq 우선, 없으면 grep fallback
  if command -v yq >/dev/null; then
    mapfile -t WS_PATTERNS < <(yq '.packages[]' pnpm-workspace.yaml)
  else
    mapfile -t WS_PATTERNS < <(grep -E "^\s*-\s" pnpm-workspace.yaml | sed 's/^\s*-\s*["'\'']\?//; s/["'\'']\?\s*$//')
  fi
fi

# 패턴 → 실제 경로 (glob 확장)
CANDIDATE_PATHS=()
for pattern in "${WS_PATTERNS[@]}"; do
  for dir in $pattern; do
    [ -d "$dir" ] && [ -f "$dir/package.json" ] && CANDIDATE_PATHS+=("$dir")
  done
done
```

워크스페이스 정의가 없거나 후보가 비면 사용자에게 직접 경로를 입력받습니다 (쉼표 구분).

### 3. (bootstrap 모드만) framework 자동 판별

각 후보 경로에 대해 framework를 추정합니다.

```bash
detect_framework() {
  local dir="$1"
  if [ -f "$dir/next.config.js" ] || [ -f "$dir/next.config.mjs" ] || [ -f "$dir/next.config.ts" ]; then
    echo "nextjs"
  elif [ -f "$dir/nest-cli.json" ]; then
    echo "nestjs"
  else
    # package.json 의존성으로 추가 판별
    if [ -f "$dir/package.json" ]; then
      if jq -e '.dependencies.next // .devDependencies.next' "$dir/package.json" >/dev/null 2>&1; then
        echo "nextjs"
      elif jq -e '.dependencies["@nestjs/core"] // .devDependencies["@nestjs/core"]' "$dir/package.json" >/dev/null 2>&1; then
        echo "nestjs"
      else
        echo "unknown"
      fi
    else
      echo "unknown"
    fi
  fi
}
```

판별 결과를 사용자에게 보여주고 confirmed/edit 받기. `unknown`은 사용자가 직접 지정 (`nextjs` | `nestjs` | `skip`).

### 4. (bootstrap 모드만) 각 워크스페이스 스택 입력

탐색된 각 워크스페이스에 대해 순차적으로 묻습니다:

1. **프로젝트 이름** (기본값: 디렉터리 이름)
2. **컨벤션 스택** — framework에 따라 다른 선택지:
   - nextjs: `design-system/mantine`, `design-system/antd`, `design-system/shadcn`, `tanstack-query`, `next-proxy`
   - nestjs: `typeorm`
3. **ESLint 스택** — framework에 따라:
   - nextjs: `design-system/mantine`, `design-system/antd`, `design-system/shadcn`, `nextauth`, `tanstack-query`, `next-proxy`
   - nestjs: `typeorm`, `gcp`, `anthropic-ai`
4. **tsconfig 스택** — framework에 따라:
   - nextjs: (없음 — skip)
   - nestjs: `typeorm`
5. **AGENTS.md 생성 여부** (기본값: yes)

> 매 실행마다 위 항목을 모두 그대로 노출해야 합니다. 이전 응답 컨텍스트의 축약 목록을 재사용하지 마세요.

### 5. (bootstrap 모드만) 매니페스트 작성

수집한 값으로 `$MANIFEST_PATH`를 작성합니다. 사용자에게 작성 직전 최종 확인을 받습니다.

```bash
# 예시: 두 워크스페이스를 jq로 조립
jq -n --argjson w '[...]' '{ "workspaces": $w }' > "$MANIFEST_PATH"
```

> 매니페스트는 git에 커밋해두면 다음 sync/init 실행 시 동일한 셋업이 그대로 재현됩니다.

### 6. 패키지 매니저 감지 (모노레포 루트)

```bash
cd "$MONOREPO_ROOT"

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

사용자에게 감지 결과를 보여주고 확인을 받습니다.

### 7. 워크스페이스별 init 실행

매니페스트의 각 entry에 대해 framework에 맞는 init 시퀀스를 실행합니다. 한 워크스페이스가 실패해도 다음은 계속 진행합니다 (마지막 보고에서 요약).

```bash
WS_COUNT=$(jq '.workspaces | length' "$MANIFEST_PATH")
INITED_WS=()
FAILED_WS=()
SKIPPED_WS=()

for i in $(seq 0 $((WS_COUNT - 1))); do
  WS_PATH=$(jq -r ".workspaces[$i].path" "$MANIFEST_PATH")
  WS_FRAMEWORK=$(jq -r ".workspaces[$i].framework" "$MANIFEST_PATH")
  WS_NAME=$(jq -r ".workspaces[$i].projectName // \"\"" "$MANIFEST_PATH")
  WS_CONV_STACKS=$(jq -r ".workspaces[$i].conventionStacks // [] | join(\",\")" "$MANIFEST_PATH")
  WS_ESLINT_STACKS=$(jq -r ".workspaces[$i].eslintStacks // [] | join(\",\")" "$MANIFEST_PATH")
  WS_TSCONFIG_STACKS=$(jq -r ".workspaces[$i].tsconfigStacks // [] | join(\",\")" "$MANIFEST_PATH")
  WS_GEN_AGENTS=$(jq -r ".workspaces[$i].generateAgents // true" "$MANIFEST_PATH")
  PROJECT_ROOT="$MONOREPO_ROOT/$WS_PATH"

  if [ ! -d "$PROJECT_ROOT" ]; then
    echo "[skip] $WS_PATH: directory not found"
    SKIPPED_WS+=("$WS_PATH (missing dir)")
    continue
  fi

  # projectName 기본값
  [ -z "$WS_NAME" ] && WS_NAME=$(basename "$PROJECT_ROOT")

  echo ""
  echo "=== Initializing $WS_PATH ($WS_FRAMEWORK) ==="
  cd "$PROJECT_ROOT"

  # package.json 보장
  if [ ! -f package.json ]; then
    case "$PM" in
      npm)  npm init -y ;;
      yarn) yarn init -y ;;
      pnpm) pnpm init ;;
      bun)  bun init -y ;;
    esac
  fi

  case "$WS_FRAMEWORK" in
    nextjs)
      # src/app 레이아웃 보장
      if [ -d app ] && [ ! -d src/app ]; then
        mkdir -p src
        git mv app src/app 2>/dev/null || mv app src/app
        echo "Moved: app/ → src/app/"
      fi

      # AGENTS.md (선택)
      [ "$WS_GEN_AGENTS" = "true" ] && $KELO_DIR/scripts/gen-agents.mjs nextjs -p . -n "$WS_NAME" --docs-dir docs

      $KELO_DIR/scripts/gen-git.mjs -p docs                                                                   && \
      $KELO_DIR/scripts/gen-architecture.mjs nextjs -p docs                                                   && \
      $KELO_DIR/scripts/gen-structure.mjs nextjs -p docs                                                      && \
      if [ -n "$WS_CONV_STACKS" ]; then
        $KELO_DIR/scripts/gen-conventions.mjs nextjs -p docs --with "$WS_CONV_STACKS"
      else
        $KELO_DIR/scripts/gen-conventions.mjs nextjs -p docs
      fi                                                                                                      && \
      if [ -n "$WS_ESLINT_STACKS" ]; then
        $KELO_DIR/scripts/gen-lint.mjs nextjs -p docs --with "$WS_ESLINT_STACKS"                              && \
        $KELO_DIR/scripts/typescript/gen-eslint.mjs nextjs -p . --with "$WS_ESLINT_STACKS"
      else
        $KELO_DIR/scripts/gen-lint.mjs nextjs -p docs                                                         && \
        $KELO_DIR/scripts/typescript/gen-eslint.mjs nextjs -p .
      fi                                                                                                      && \
      $KELO_DIR/scripts/typescript/gen-stylelint.mjs nextjs -p .                                               && \
      $KELO_DIR/scripts/typescript/gen-prettier.mjs nextjs -p .                                                && \
      $KELO_DIR/scripts/typescript/gen-tsconfig.mjs nextjs -p .
      # gen-husky, gen-commitlint는 monorepo 루트에서만 관리 (워크스페이스 호출 X)
      ;;
    nestjs)
      [ "$WS_GEN_AGENTS" = "true" ] && $KELO_DIR/scripts/gen-agents.mjs nestjs -p . -n "$WS_NAME" --docs-dir docs

      $KELO_DIR/scripts/gen-git.mjs -p docs                                                                   && \
      $KELO_DIR/scripts/gen-architecture.mjs nestjs -p docs                                                   && \
      $KELO_DIR/scripts/gen-structure.mjs nestjs -p docs                                                      && \
      if [ -n "$WS_CONV_STACKS" ]; then
        $KELO_DIR/scripts/gen-conventions.mjs nestjs -p docs --with "$WS_CONV_STACKS"
      else
        $KELO_DIR/scripts/gen-conventions.mjs nestjs -p docs
      fi                                                                                                      && \
      if [ -n "$WS_ESLINT_STACKS" ]; then
        $KELO_DIR/scripts/gen-lint.mjs nestjs -p docs --with "$WS_ESLINT_STACKS"                              && \
        $KELO_DIR/scripts/typescript/gen-eslint.mjs nestjs -p . --with "$WS_ESLINT_STACKS"
      else
        $KELO_DIR/scripts/gen-lint.mjs nestjs -p docs                                                         && \
        $KELO_DIR/scripts/typescript/gen-eslint.mjs nestjs -p .
      fi                                                                                                      && \
      $KELO_DIR/scripts/typescript/gen-prettier.mjs nestjs -p .                                                && \
      if [ -n "$WS_TSCONFIG_STACKS" ]; then
        $KELO_DIR/scripts/typescript/gen-tsconfig.mjs nestjs -p . --with "$WS_TSCONFIG_STACKS"
      else
        $KELO_DIR/scripts/typescript/gen-tsconfig.mjs nestjs -p .
      fi
      # gen-husky, gen-commitlint는 monorepo 루트에서만 관리 (워크스페이스 호출 X)
      ;;
    *)
      echo "[skip] $WS_PATH: unsupported framework '$WS_FRAMEWORK'"
      SKIPPED_WS+=("$WS_PATH (unsupported: $WS_FRAMEWORK)")
      cd "$MONOREPO_ROOT"
      continue
      ;;
  esac

  if [ $? -eq 0 ]; then
    INITED_WS+=("$WS_PATH ($WS_FRAMEWORK)")
  else
    FAILED_WS+=("$WS_PATH ($WS_FRAMEWORK)")
  fi
  cd "$MONOREPO_ROOT"
done
```

### 8. 의존성 설치 (모노레포 루트에서 한 번 + 워크스페이스별 peer 보강)

```bash
cd "$MONOREPO_ROOT"
case "$PM" in
  npm)  npm install ;;
  yarn) yarn ;;
  pnpm) pnpm install ;;
  bun)  bun install ;;
esac
# lockfile에 kelo Release tarball의 integrity가 빠졌으면 자산 sha512로 채우고, 있으면 자산과 대조 (pnpm·npm)
$KELO_DIR/scripts/typescript/dependencies/fill-tarball-integrity.mjs --project-dir .

# framework별 peer 보강
NEXTJS_PEERS="eslint-plugin-boundaries@^7 eslint-import-resolver-typescript eslint-plugin-simple-import-sort eslint-plugin-unused-imports eslint-plugin-sonarjs eslint-config-prettier eslint-config-next@^16"
NESTJS_PEERS="eslint-plugin-boundaries@^7 eslint-plugin-import eslint-import-resolver-typescript eslint-plugin-simple-import-sort eslint-plugin-unused-imports eslint-plugin-prettier eslint-config-prettier typescript-eslint"

for i in $(seq 0 $((WS_COUNT - 1))); do
  WS_PATH=$(jq -r ".workspaces[$i].path" "$MANIFEST_PATH")
  WS_FRAMEWORK=$(jq -r ".workspaces[$i].framework" "$MANIFEST_PATH")
  PROJECT_ROOT="$MONOREPO_ROOT/$WS_PATH"
  [ -d "$PROJECT_ROOT" ] || continue
  cd "$PROJECT_ROOT"

  case "$WS_FRAMEWORK" in
    nextjs) PEERS="$NEXTJS_PEERS" ;;
    nestjs) PEERS="$NESTJS_PEERS" ;;
    *)      cd "$MONOREPO_ROOT"; continue ;;
  esac

  PEERS=$($KELO_DIR/scripts/typescript/missing-peers.mjs -p . $PEERS)  # 이미 범위를 만족하는 peer는 제외
  [ -n "$PEERS" ] && case "$PM" in
    npm)  npm install -D $PEERS ;;
    yarn) yarn add -D $PEERS ;;
    pnpm) pnpm add -D $PEERS ;;
    bun)  bun add -d $PEERS ;;
  esac
  cd "$MONOREPO_ROOT"
done
```

### 9. 모노레포 루트 husky / commitlint 자동 setup (없을 때만)

워크스페이스에는 husky/commitlint를 설치하지 않습니다 (루트와 중복·충돌 방지). 대신 monorepo 루트에 없을 때만 자동으로 setup합니다 — **이미 존재하면 건드리지 않습니다** (사용자 커스텀 보존).

```bash
cd "$MONOREPO_ROOT"

# framework: 매니페스트 첫 번째 워크스페이스의 framework 사용
# (nextjs/nestjs 혼재라도 husky devDeps와 hook 템플릿이 사실상 동일하므로 결과 동일)
ROOT_FRAMEWORK=$(jq -r ".workspaces[0].framework" "$MANIFEST_PATH")

if [ ! -d .husky ]; then
  echo ""
  echo "[setup] monorepo 루트에 .husky가 없어 자동 setup합니다 ($ROOT_FRAMEWORK 템플릿)..."
  $KELO_DIR/scripts/gen-husky.mjs "$ROOT_FRAMEWORK" -p .
else
  echo "[skip] monorepo 루트에 이미 .husky가 있어 setup을 건너뜁니다 (기존 설정 보존)."
fi

if [ ! -f commitlint.config.mjs ]; then
  echo "[setup] monorepo 루트에 commitlint.config.mjs가 없어 자동 setup합니다..."
  $KELO_DIR/scripts/gen-commitlint.mjs -p .
else
  echo "[skip] monorepo 루트에 이미 commitlint.config.mjs가 있어 setup을 건너뜁니다."
fi
```

> setup 시 루트 `package.json`의 `devDependencies`에 `husky`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional` 4개가 추가되고 `scripts.prepare = "husky"`가 설정됩니다 (`scripts.prepare`에 이미 다른 값이 있으면 보존). `.husky/pre-commit`, `.husky/commit-msg`도 생성됩니다.

> `/kelo:workspaces-sync`는 루트 husky/commitlint를 절대 손대지 않습니다. 갱신이 필요하면 monorepo 루트에서 `node $KELO_DIR/scripts/gen-husky.mjs <framework> -p .`을 명시적으로 실행하세요.

### 10. 보고

처리 결과 정리:

- **Initialized**: 성공한 워크스페이스 목록 (`$INITED_WS`)
- **Failed**: 실패 (`$FAILED_WS`)
- **Skipped**: 디렉터리 없음/미지원 (`$SKIPPED_WS`)
- **매니페스트 위치**: `$MANIFEST_PATH` — git에 커밋해 두면 다음 init/sync는 프롬프트 없이 일괄 재현 가능

워크스페이스별로 생성된 파일 목록은 해당 framework의 `*-init` 커맨드 "보고" 섹션 참조. 각 워크스페이스에는 사용자 소유 `eslint.project.config.mjs`가 최초 1회만 스텁으로 생성되며 이후 sync에서 보존됩니다(워크스페이스별 ESLint override 지점). 단, **`.husky/*`, `commitlint.config.mjs`, `husky`/`@commitlint/*` devDeps는 워크스페이스에 생성되지 않습니다** (Step 9 참조).
