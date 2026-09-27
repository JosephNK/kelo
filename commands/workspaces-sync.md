---
description: Sync Kelo configs across monorepo workspaces using kelo.workspaces.json
argument-hint: '[manifest-path]'
---

# Kelo Workspaces Sync

모노레포의 모든 워크스페이스에 Kelo docs/lint config를 `kelo.workspaces.json` 매니페스트 기반으로 일괄 동기화합니다. 앱별로 매번 같은 스택을 다시 선택할 필요가 없습니다.

## Arguments

**$ARGUMENTS**

- `[manifest-path]` (선택): 매니페스트 파일 경로. 생략 시 `./kelo.workspaces.json` 사용.

## 매니페스트 스펙

모노레포 루트의 `kelo.workspaces.json` (예시):

```json
{
  "workspaces": [
    {
      "path": "apps/web",
      "framework": "nextjs",
      "projectName": "web",
      "conventionStacks": ["design-system/mantine", "tanstack-query"],
      "eslintStacks": ["design-system/mantine", "tanstack-query"],
      "tsconfigStacks": [],
      "generateAgents": true
    },
    {
      "path": "apps/api",
      "framework": "nestjs",
      "projectName": "api",
      "conventionStacks": ["typeorm"],
      "eslintStacks": ["typeorm"],
      "tsconfigStacks": ["typeorm"],
      "generateAgents": true
    }
  ]
}
```

- `path`: 모노레포 루트 기준 상대 경로 (필수)
- `framework`: `nextjs` | `nestjs` (필수)
- `projectName`: AGENTS.md에 사용되는 이름. 생략 시 디렉터리 이름.
- `conventionStacks` / `eslintStacks` / `tsconfigStacks`: 각 generator의 `--with` 값. 빈 배열이면 base만 적용.
- `generateAgents`: AGENTS.md/CLAUDE.md 생성 여부 (sync에서는 보존되지만 누락된 경우 새로 만들지 않음)

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

[ -f "$MANIFEST_PATH" ] || {
  echo "Error: Manifest not found: $MANIFEST_PATH" >&2
  echo "       Run /kelo:workspaces-init to bootstrap." >&2
  exit 1
}
```

## 단계

### 1. 패키지 매니저 감지 (모노레포 루트)

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

### 2. 워크스페이스별 sync 실행

매니페스트의 `workspaces` 배열을 순회하며 각 entry에 대해 framework에 맞는 generator를 호출합니다. 한 워크스페이스가 실패해도 다음 워크스페이스는 계속 진행합니다 (마지막 보고에서 실패 항목 요약).

```bash
WS_COUNT=$(jq '.workspaces | length' "$MANIFEST_PATH")
FAILED_WS=()
SKIPPED_WS=()
SYNCED_WS=()

for i in $(seq 0 $((WS_COUNT - 1))); do
  WS_PATH=$(jq -r ".workspaces[$i].path" "$MANIFEST_PATH")
  WS_FRAMEWORK=$(jq -r ".workspaces[$i].framework" "$MANIFEST_PATH")
  WS_CONV_STACKS=$(jq -r ".workspaces[$i].conventionStacks // [] | join(\",\")" "$MANIFEST_PATH")
  WS_ESLINT_STACKS=$(jq -r ".workspaces[$i].eslintStacks // [] | join(\",\")" "$MANIFEST_PATH")
  PROJECT_ROOT="$MONOREPO_ROOT/$WS_PATH"

  if [ ! -d "$PROJECT_ROOT" ]; then
    echo "[skip] $WS_PATH: directory not found"
    SKIPPED_WS+=("$WS_PATH (missing dir)")
    continue
  fi

  echo ""
  echo "=== Syncing $WS_PATH ($WS_FRAMEWORK) ==="
  cd "$PROJECT_ROOT"

  case "$WS_FRAMEWORK" in
    nextjs)
      $KELO_DIR/scripts/gen-git.mjs -p docs                                                                                  && \
      $KELO_DIR/scripts/gen-architecture.mjs nextjs -p docs                                                                  && \
      $KELO_DIR/scripts/gen-structure.mjs nextjs -p docs                                                                     && \
      if [ -n "$WS_CONV_STACKS" ]; then
        $KELO_DIR/scripts/gen-conventions.mjs nextjs -p docs --with "$WS_CONV_STACKS" --no-project-init
      else
        $KELO_DIR/scripts/gen-conventions.mjs nextjs -p docs --no-project-init
      fi                                                                                                                     && \
      if [ -n "$WS_ESLINT_STACKS" ]; then
        $KELO_DIR/scripts/gen-lint.mjs nextjs -p docs --with "$WS_ESLINT_STACKS"                                             && \
        $KELO_DIR/scripts/typescript/gen-eslint.mjs nextjs -p . --with "$WS_ESLINT_STACKS"
      else
        $KELO_DIR/scripts/gen-lint.mjs nextjs -p docs                                                                        && \
        $KELO_DIR/scripts/typescript/gen-eslint.mjs nextjs -p .
      fi                                                                                                                     && \
      $KELO_DIR/scripts/typescript/gen-stylelint.mjs nextjs -p .                                                              && \
      $KELO_DIR/scripts/typescript/gen-prettier.mjs nextjs -p .
      # gen-husky, gen-commitlint는 monorepo 루트에서만 관리 (워크스페이스 호출 X)
      ;;
    nestjs)
      $KELO_DIR/scripts/gen-git.mjs -p docs                                                                                  && \
      $KELO_DIR/scripts/gen-architecture.mjs nestjs -p docs                                                                  && \
      $KELO_DIR/scripts/gen-structure.mjs nestjs -p docs                                                                     && \
      if [ -n "$WS_CONV_STACKS" ]; then
        $KELO_DIR/scripts/gen-conventions.mjs nestjs -p docs --with "$WS_CONV_STACKS" --no-project-init
      else
        $KELO_DIR/scripts/gen-conventions.mjs nestjs -p docs --no-project-init
      fi                                                                                                                     && \
      if [ -n "$WS_ESLINT_STACKS" ]; then
        $KELO_DIR/scripts/gen-lint.mjs nestjs -p docs --with "$WS_ESLINT_STACKS"                                             && \
        $KELO_DIR/scripts/typescript/gen-eslint.mjs nestjs -p . --with "$WS_ESLINT_STACKS"
      else
        $KELO_DIR/scripts/gen-lint.mjs nestjs -p docs                                                                        && \
        $KELO_DIR/scripts/typescript/gen-eslint.mjs nestjs -p .
      fi                                                                                                                     && \
      $KELO_DIR/scripts/typescript/gen-prettier.mjs nestjs -p .
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
    SYNCED_WS+=("$WS_PATH ($WS_FRAMEWORK)")
  else
    FAILED_WS+=("$WS_PATH ($WS_FRAMEWORK)")
  fi
  cd "$MONOREPO_ROOT"
done
```

> 각 워크스페이스는 해당 framework의 `*-sync` 커맨드와 동일한 generator 시퀀스를 실행합니다. **단, `gen-husky`/`gen-commitlint`는 워크스페이스에서 호출하지 않습니다** — husky 훅과 commitlint config는 monorepo 루트 한 곳에서만 관리해야 root와 중복·충돌이 없습니다. 필요하면 monorepo 루트에서 직접 `node $KELO_DIR/scripts/gen-husky.mjs <framework> -p .` 및 `node $KELO_DIR/scripts/gen-commitlint.mjs -p .`을 한 번 실행하세요. Flutter 워크스페이스(이 커맨드 대상 아님)는 `/kelo:flutter-sync`의 gen-husky가 모노레포를 감지해 `<앱>/scripts/kelo-pre-commit.sh` + 루트 `.husky/pre-commit` 호출 한 줄로 연결합니다. `AGENTS.md`, `AGENTS.PROJECT.md`, `CONVENTIONS.PROJECT.md`, `tsconfig.json`은 sync 대상이 아닙니다.

### 3. 의존성 재설치 (모노레포 루트에서 한 번)

모노레포 매니저(npm/pnpm/yarn workspaces)는 루트에서 한 번 install로 모든 워크스페이스의 devDeps를 동기화합니다.

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
```

#### peer 누락 보강 (워크스페이스별)

기존 워크스페이스가 레거시 `@jkit/code-plugin` 또는 구버전 `eslint-config-kelo-*`로 설치되어 신규 peer가 누락된 경우 framework별로 보강합니다. 이미 범위를 만족하는 peer는 `missing-peers.mjs`가 걸러 기존 범위(예: `^16.3.6`)를 덮어쓰지 않습니다. `eslint-plugin-boundaries@^7`(규칙이 v7 `policies` 문법 사용)과 `eslint-config-next@^16`(`core-web-vitals` flat subpath — v16+)은 메이저를 명시해, 구버전이 설치된 기존 프로젝트도 함께 올립니다.

```bash
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

> 모노레포에서 워크스페이스별 install이 루트 lockfile에 hoisting된다면 위 루프는 idempotent합니다. pnpm workspaces 같이 워크스페이스 단위 install이 필요한 경우에도 동일한 명령이 그대로 동작합니다.

### 4. 보고

처리 결과를 정리해 보고합니다:

- **Synced**: 성공한 워크스페이스 목록 (`$SYNCED_WS`)
- **Failed**: 실패한 워크스페이스 목록 (`$FAILED_WS`) — 있으면 로그 위치/원인 안내
- **Skipped**: 디렉터리 없음/미지원 framework (`$SKIPPED_WS`)

각 워크스페이스에서 갱신되는 파일은 해당 framework의 `*-sync` 커맨드 "보고" 섹션과 동일합니다.

> 보존된 사용자 소유 파일: `AGENTS.md`, `AGENTS.PROJECT.md`, `CONVENTIONS.PROJECT.md`, `eslint.project.config.mjs`, `tsconfig.json`, `commitlint.config.mjs` (이미 있는 경우).
