---
description: Update JKit dependency version/ref (code-plugin / architecture-lint / leaf-kit)
---

# Update Plugin Ref

JKit이 관리하는 의존성의 버전(npm 패키지) 또는 git ref(Dart 패키지)를 프로젝트 내 모든 manifest 파일에서 업데이트합니다.

## 지원 타겟

| Target | 매니페스트 | 의존성 | Auto 지원 |
|--------|-----------|--------|----------|
| `code-plugin` | `package.json` | `@josephnk/eslint-config-nextjs`, `@josephnk/eslint-config-nestjs` (GitHub Release tarball URL `v<version>`) | ✓ plugin.json version |
| `architecture-lint` | `pubspec.yaml` | `architecture_lint` | ✓ plugin.json version (동일 repo) |
| `leaf-kit` | `pubspec.yaml` | `flutter_leaf_kit` | ✗ 외부 repo — 명시적 ref 필수 |

## 호출 형식

```
/jkit:update-plugin-ref <target> [ref] [--dry-run]
```

- `<target>`: 필수. `code-plugin`, `architecture-lint`, `leaf-kit` 중 하나
- `[ref]`: 선택. 생략 시 auto (단, `leaf-kit`은 필수). `code-plugin`은 semver 버전만 허용 (`main` 같은 git ref 불가)
- `[--dry-run]`: 선택. 변경 내용만 미리보기

예시:
```
/jkit:update-plugin-ref code-plugin
/jkit:update-plugin-ref code-plugin 0.3.80
/jkit:update-plugin-ref architecture-lint
/jkit:update-plugin-ref architecture-lint v0.1.32
/jkit:update-plugin-ref leaf-kit v3.0.0
/jkit:update-plugin-ref leaf-kit main --dry-run
```

## Steps

### 1. Parse & validate target

사용자 입력에서 `<target>`을 추출합니다.

- target이 없으면: 위 "지원 타겟" 표를 사용자에게 보여주고 "어떤 target으로 업데이트할까요?"라고 물어봅니다.
- target이 `code-plugin | architecture-lint | leaf-kit` 외의 값이면: 유효 값을 나열하고 중단합니다.

### 2. Resolve ref

- target이 `leaf-kit`인데 ref가 없으면: **오류** — "leaf-kit은 외부 repo라서 명시적 ref가 필요합니다 (예: v3.0.0, main)". 사용자에게 ref를 묻거나 중단합니다.
- target이 `code-plugin` 또는 `architecture-lint`이고 ref가 없으면: **auto** — 백엔드 스크립트가 `.claude-plugin/plugin.json`에서 자동으로 version을 읽습니다.
- ref가 명시되어 있으면 그대로 전달합니다 (v 접두는 스크립트가 자동 처리).

### 3. Dispatch to backend

jkit 플러그인 설치 경로 해석:

```bash
JKIT_DIR=$(jq -r '.plugins["jkit@jkit"][0].installPath' ~/.claude/plugins/installed_plugins.json)
```

target에 따라 해당 백엔드 스크립트를 실행합니다.

**code-plugin** (`package.json` / `@josephnk/eslint-config-{nextjs,nestjs}`):

레거시 `@jkit/code-plugin` git 의존성이 남아 있으면 버전만 바꿔서는 동작하지 않습니다 (`eslint.config.mjs` 재생성 필요). 스크립트가 해당 파일을 경고로 보고하므로, 사용자에게 `/jkit:<framework>-sync` 실행을 안내합니다.
```bash
$JKIT_DIR/scripts/typescript/dependencies/update-code-plugin-ref.mjs [<ref>] --project-dir <user-project-dir> [--dry-run]
```

**architecture-lint** (`pubspec.yaml` / `architecture_lint`):
```bash
$JKIT_DIR/scripts/flutter/dependencies/update-architecture-lint-ref.mjs [<ref>] --project-dir <user-project-dir> [--dry-run]
```

**leaf-kit** (`pubspec.yaml` / `flutter_leaf_kit`):
```bash
$JKIT_DIR/scripts/flutter/dependencies/update-leaf-kit-ref.mjs <ref> --project-dir <user-project-dir> [--dry-run]
```

- `<user-project-dir>`: 사용자의 현재 작업 디렉토리 (절대 경로)
- `--dry-run`: 선택. 파일 수정 없이 변경 예정 목록만 출력

### 4. Report

스크립트 출력을 사용자에게 그대로 보고합니다.

- `--dry-run`이었다면 변경될 파일 목록을 보여주고 "실제로 적용할까요?"를 묻습니다.
- 스크립트가 실패하면 가능한 원인을 안내합니다 (예: 대상 manifest 미발견, 해당 의존성 없음, plugin.json 파싱 실패).
