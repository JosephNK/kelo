# kelo

Flutter / Next.js / NestJS용 Claude Code 플러그인 — 프로젝트 셋업, 스크린·BLoC 스캐폴딩, OpenAPI 코드젠, 빌드·배포, TDD·코드리뷰, 컨벤션 관리를 하나로.

## Quick Start

### Claude Code

```bash
# Add marketplace
/plugin marketplace add https://github.com/JosephNK/kelo

# Install plugin
/plugin install kelo@kelo
```

### Codex

Codex에서 이 플러그인을 사용하려면 marketplace를 추가한다.

```bash
codex plugin marketplace add JosephNK/kelo
```

특정 릴리스로 고정하려면:

```bash
codex plugin marketplace add JosephNK/kelo --ref <tag>
```

추가 후 Codex에서 `kelo:commit` skill을 사용할 수 있다.

### Local Development (Plugin Testing)

플러그인 개발 시 로컬에서 직접 테스트하려면:

```bash
# 플러그인 디렉토리에서 직접 실행
claude --plugin-dir .

# 다른 경로에서 실행
claude --plugin-dir /path/to/kelo
```

### Team Setup

Add to your project's `.claude/settings.json` so teammates get the plugin automatically:

```json
{
  "extraKnownMarketplaces": {
    "kelo": {
      "source": {
        "source": "github",
        "repo": "JosephNK/kelo"
      }
    }
  }
}
```

## Supported Frameworks

| Framework | Init Command | Convention Stacks |
|-----------|-------------|-------------------|
| **Flutter** | `/kelo:flutter-init` | bloc, freezed, go-router, leaf-kit, easy-localization |
| **Next.js** | `/kelo:nextjs-init` | design-system/mantine, design-system/antd, design-system/shadcn, tanstack-query, next-proxy |
| **NestJS** | `/kelo:nestjs-init` | typeorm, gcp, anthropic-ai |

Init 커맨드 실행 시 AGENTS.md, GIT.md, ARCHITECTURE.md, CONVENTIONS.md 등 프로젝트 설정 파일을 자동 생성합니다.

## Commands

### Flutter — Init & Setup

| Command | Description |
|---------|-------------|
| `/kelo:flutter-init` | 프로젝트 초기화 (conventions, husky hooks, commitlint 등) |
| `/kelo:flutter-app-scaffold` | app.dart, main.dart, router, 다국어 리소스 생성 |
| `/kelo:flutter-android-setup` | build.gradle.kts, AndroidManifest, proguard 설정 |
| `/kelo:flutter-ios-setup` | pbxproj (4 flavor × 3 build type), xcscheme, Info.plist 설정 |

### Flutter — Development

| Command | Description |
|---------|-------------|
| `/kelo:flutter-plan` | 요구사항 분석 → 리스크 평가 → 구현 계획 생성 |
| `/kelo:flutter-tdd` | RED→GREEN→REFACTOR TDD 워크플로우 |
| `/kelo:flutter-create-bloc-screen` | Screen + BLoC + View + DI + Route 보일러플레이트 생성 |
| `/kelo:flutter-design` | 프로덕션급 UI 디자인 (LeafTheme + Atomic Design) |
| `/kelo:flutter-openapi-gen` | OpenAPI 3.x → BuiltValue 모델 + Dio 서비스 코드 생성 |
| `/kelo:flutter-create-package` | 모노레포 워크스페이스 패키지 생성 |

### Flutter — Quality

| Command | Description |
|---------|-------------|
| `/kelo:flutter-code-review` | 보안/품질/베스트프랙티스 코드 리뷰 |
| `/kelo:flutter-build-fix` | 빌드/분석 에러 점진적 수정 |
| `/kelo:flutter-test-coverage` | 커버리지 분석 + 누락 테스트 자동 생성 (80%+ 목표) |
| `/kelo:check-conventions` | CONVENTIONS.md 기반 변경 파일 규칙 검증 |

### Flutter — Build & Deploy

| Command | Description |
|---------|-------------|
| `/kelo:flutter-build-deploy` | APK / AppBundle / IPA 빌드 (flavor: production/staging/dev/qa) |
| `/kelo:flutter-android-keystore-info` | 키스토어 인증서 정보 조회 |
| `/kelo:flutter-android-signing-report` | 키스토어 alias별 서명 정보 |
| `/kelo:flutter-android-verify-apk` | APK 서명 검증 |

### Flutter — Maintenance

| Command | Description |
|---------|-------------|
| `/kelo:flutter-update-dependencies` | pub.dev 패키지 최신 버전 업데이트 |

### Cross-Framework

| Command | Description |
|---------|-------------|
| `/kelo:commit` | 변경 분석 → 한국어 커밋 메시지 자동 생성 (3개 후보) |
| `/kelo:typeorm-migration` | TypeORM 마이그레이션 SQL 생성 (dev/prod 분리) |
| `/kelo:update-plugin-ref` | Kelo 의존성 git ref 일괄 업데이트 (`code-plugin` / `architecture-lint` / `leaf-kit`) |

### Monorepo (Next.js / NestJS)

`kelo.workspaces.json` 매니페스트로 모노레포의 여러 워크스페이스를 한 번에 init/sync. 앱별 스택 선택을 매니페스트에 보관해 반복 실행 시 프롬프트 없이 재현 가능.

| Command | Description |
|---------|-------------|
| `/kelo:workspaces-init` | 매니페스트 기반 일괄 init. 매니페스트 없으면 워크스페이스 자동 탐색 후 부트스트랩 |
| `/kelo:workspaces-sync` | 매니페스트 기반 일괄 sync. docs/lint config + husky 훅 갱신 |

단일 워크스페이스만 갱신할 때는 기존 `/kelo:nextjs-init [path]`, `/kelo:nextjs-sync [path]`, `/kelo:nestjs-init [path]`, `/kelo:nestjs-sync [path]` 도 그대로 사용 가능합니다.

### 단일 프로젝트 매니페스트 (`kelo.project.json`)

`kelo.workspaces.json`의 단일 프로젝트 버전. 프로젝트 루트에 두면 `nextjs/nestjs/flutter`의 `-init`·`-sync`가 스택 선택 프롬프트 없이 매니페스트 값으로 **무인 재현**합니다. 셋업이 어떤 스택으로 구성됐는지 기록되어 `-sync` 반복 시 드리프트가 없습니다.

```jsonc
// nextjs/nestjs
{
  "framework": "nextjs",
  "projectName": "web",
  "conventionStacks": ["design-system/mantine"],
  "eslintStacks": ["design-system/mantine", "tanstack-query"],
  "tsconfigStacks": [],
  "generateAgents": true
}
// flutter — eslint/tsconfig 대신 entryDir
{
  "framework": "flutter",
  "projectName": "my_app",
  "conventionStacks": ["freezed", "leaf-kit"],
  "entryDir": "app",
  "generateAgents": true
}
```

동작 (매니페스트 존재 여부로 분기):

| | 있음 | 없음 |
|---|---|---|
| `-init` | 무인 재현 (프롬프트 생략) | 대화형 진행 후 매니페스트 **자동 작성** |
| `-sync` | 무인 재현 (프롬프트 생략) | 대화형 진행 (기존과 동일) + 작성 **제안** |

매니페스트가 없으면 기존 대화형 동작이 그대로 유지되므로 하위 호환됩니다. (모노레포의 `kelo.workspaces.json`은 워크스페이스별 동일 필드 집합을 배열로 보관합니다.)

## Generator Scripts

Init 커맨드 외에 개별 스크립트로도 실행 가능합니다.

```bash
# Agents, Git, Architecture, Conventions
./scripts/gen-agents.mjs <framework> -p /path/to/project -n "Project Name"
./scripts/gen-git.mjs -p /path/to/project
./scripts/gen-architecture.mjs <framework> -p /path/to/project
./scripts/gen-conventions.mjs <framework> -p /path/to/project --with stack1,stack2

# Husky hooks (all frameworks)
# - .husky/pre-commit, .husky/commit-msg 생성
# - package.json에 husky/lint-staged/@commitlint devDeps + scripts.prepare 주입
./scripts/gen-husky.mjs <framework> -p /path/to/project [-entry <dir>]

# Commitlint config (Conventional Commits + 프로젝트 허용 타입)
./scripts/gen-commitlint.mjs -p /path/to/project

# TypeScript (Next.js / NestJS)
./scripts/typescript/gen-eslint.mjs <framework> -p /path/to/project --with stack1,stack2
./scripts/typescript/gen-tsconfig.mjs <framework> -p /path/to/project --with stack1
```

## Convention System

모듈러 컨벤션 조합 방식:

1. `rules/<framework>/base/conventions.md` — 프레임워크 공통 규칙
2. `rules/<framework>/<stack>/conventions.md` — 스택별 추가 규칙
3. `gen-conventions.mjs`가 선택된 스택을 순서대로 concat → 최종 CONVENTIONS.md 생성

### 새 스택 추가

```
rules/<framework>/<stack-name>/
├── conventions.md          # 컨벤션 규칙
├── eslint.rules.mjs        # ESLint rule export (TypeScript만)
└── tsconfig.patch.json     # TSConfig 패치 (필요 시)
```

TypeScript 스택은 `rules/<framework>/index.mjs`의 스택 등록표(`nextjsStacks` / `nestjsStacks`)에
`eslint.rules.mjs` export를 연결해야 factory가 적용합니다. 새 파일이 패키지에 포함되는지
`rules/<framework>/package.json`의 `files`도 확인합니다.

## ESLint 설정 패키지 (Next.js / NestJS)

lint 규칙과 조립 로직은 npm 패키지로 배포되고, 소비 프로젝트는 설치 + 짧은 참조만 갖습니다.

| 패키지 | 소스 | 제공 |
|---|---|---|
| `eslint-config-kelo-nextjs` | `rules/nextjs/` | `nextjs()` factory, `./formatter`, `./stylelint`, `kelo-lint-nextjs` CLI |
| `eslint-config-kelo-nestjs` | `rules/nestjs/` | `nestjs()` factory, `./formatter`, `kelo-lint-nestjs` / `kelo-check-i18n` CLI |

소비 프로젝트 구성 (`/kelo:*-init`, `/kelo:*-sync`가 생성):

```js
// eslint.config.mjs — kelo 관리 (매 sync 덮어씀, 직접 수정은 hook이 차단)
import { nestjs } from "eslint-config-kelo-nestjs";
import projectConfig from "./eslint.project.config.mjs";
export default nestjs({ root: import.meta.dirname, project: projectConfig });
```

- `kelo.lint.json` — kelo 관리. `stacks`(sync가 갱신) + 프로젝트별 확장 `boundaryElements` / `boundaryRules` / `boundaryIgnores` / `ignores`(sync가 보존)
- `eslint.project.config.mjs` — 사용자 소유. 새 규칙·플러그인 **추가만** 허용. kelo 규칙/settings 재정의, `linterOptions`, 전역 ignores는 로드 시 에러
- inline `eslint-disable` 주석은 무시됩니다 (`noInlineConfig`)
- `kelo-lint-<framework>` — 프로젝트 `eslint.config.mjs`를 무시하고 패키지 규칙으로 검사. `scripts.lint`(eslint 기반 `lint:ci`/`lint:fix` 포함)와 lint-staged가 모두 이 CLI로 통일됩니다. 경로/`--ignore-pattern` 인자는 `kelo.lint.json`의 `ignores`로 옮깁니다. 에디터 실시간 표시는 `eslint.config.mjs`가 담당합니다

배포는 **npm 레지스트리**입니다: `./deploy.mjs`(버전 범프 + 태그 + `npm publish` + GitHub Release) → 소비 프로젝트는 `package.json`에 플러그인과 같은 정확한 버전(`"eslint-config-kelo-<fw>": "<ver>"`)을 쓰고, `/kelo:update-plugin-ref code-plugin` 또는 sync로 버전을 올립니다. 1.0.0 이전의 Release tarball URL 의존성은 다음 sync 때 레지스트리 버전으로 바뀝니다.
레거시 `@jkit/code-plugin` git 의존성 프로젝트는 `/kelo:<framework>-sync` 한 번으로 전환됩니다.

## Project Preferences (NestJS)

NestJS 소비 프로젝트의 `package.json`에 `kelo-rules` 객체를 두면 일부 lint 동작을 토글할 수 있습니다. 값은 ESLint config 로드 시점에 평가되므로 **`/kelo:nestjs-sync` 재실행 없이** 다음 ESLint 실행부터 반영됩니다.

```json
{
  "kelo-rules": {
    "pathAliasCheck": false
  }
}
```

| Key | 기본값 | 효과 (`false` 시) |
|---|---|---|
| `pathAliasCheck` | `true` | 모든 레이어에서 상대 parent import(`../**`) 차단 룰 OFF — `@/*` path alias 강제 해제 |

> 옵션을 추가하지 않거나 객체 자체를 두지 않으면 모든 검사가 활성된 기본값으로 동작합니다. 레거시 `jkit-rules` 키도 계속 인식되지만 `kelo-rules`로 옮기는 것을 권장합니다. 옛 `jkit.pathAliasCheck` 키는 더 이상 인식되지 않으니 `kelo-rules.pathAliasCheck`로 옮겨주세요.

## ESLint 메시지 포매터 (Next.js / NestJS)

`boundaries/no-unknown-files`, `boundaries/no-unknown-dependencies` 등 일부 룰의 기본 에러 메시지를
프로젝트 컨텍스트에 맞는 가이드 문구(대응 순서, 참조 문서 링크)로 재작성한 뒤
ESLint 기본 `stylish` formatter로 렌더링합니다. 그 외 룰 메시지는 원본 그대로 통과합니다.

프로젝트 `package.json` lint 스크립트에 `--format` 지정:

**Next.js**
```json
{
  "scripts": {
    "lint": "eslint --format eslint-config-kelo-nextjs/formatter ."
  }
}
```

**NestJS**
```json
{
  "scripts": {
    "lint": "eslint --format eslint-config-kelo-nestjs/formatter ."
  }
}
```

메시지를 추가/변경하려면 해당 포매터 파일의 `MESSAGE_OVERRIDES` 맵에 룰 ID를 키로 추가합니다.
