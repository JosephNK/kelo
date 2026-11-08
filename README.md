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

| Framework | Stacks (`rules/<framework>/stacks.yaml`) |
|-----------|------------------------------------------|
| **Flutter** | freezed, go-router, leaf-kit, easy-localization |
| **Next.js** | tanstack-query, next-proxy |
| **NestJS** | typeorm |

## Setup (`/kelo:setup`)

모든 프레임워크·단일 프로젝트·모노레포를 하나의 커맨드로 셋업하고 동기화합니다. 설정은 프로젝트 루트의 `kelo.yaml` 한 파일입니다.

- `kelo.yaml`이 없으면 framework·워크스페이스·패키지 매니저를 감지해 보여주고, 스택 등을 물어 작성합니다.
- `kelo.yaml`이 있으면 프롬프트 없이 그대로 적용합니다 (재실행 = sync).
- 실제 작업은 `scripts/kelo.mjs`가 `rules/<framework>/pipeline.yaml`의 단계를 순서대로 실행합니다.

```yaml
# 단일 프로젝트
framework: nextjs        # nextjs | nestjs | flutter
name: web                # 기본: 디렉터리 이름
stacks: [tanstack-query]
agents: true             # AGENTS.md + CLAUDE.md 생성 (기본 true)
packageManager: pnpm     # 생략하면 매번 감지
# entryDir: app          # flutter만 (기본 app)

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

모노레포에서는 워크스페이스별 생성 → 루트에서 install 한 번 → 워크스페이스별 후속 단계 순으로 실행하고, 루트 `.husky/`·`commitlint.config.mjs`는 없을 때만 만듭니다.

```bash
node scripts/kelo.mjs detect   -p <dir>                 # 감지 결과(JSON)
node scripts/kelo.mjs validate -p <dir>                 # kelo.yaml 검증
node scripts/kelo.mjs setup    -p <dir> [--dry-run] [--no-install] [--move-app]
```

## Commands

### Flutter — Init & Setup

| Command | Description |
|---------|-------------|
| `/kelo:flutter-app-scaffold` | app.dart, main.dart, router, 다국어 리소스 생성 |
| `/kelo:flutter-android-setup` | build.gradle.kts, AndroidManifest, proguard 설정 |
| `/kelo:flutter-ios-setup` | pbxproj (4 flavor × 3 build type), xcscheme, Info.plist 설정 |

### Flutter — Development

| Command | Description |
|---------|-------------|
| `/kelo:flutter-create-bloc-screen` | Screen + BLoC + View + DI + Route 보일러플레이트 생성 |
| `/kelo:flutter-design` | 프로덕션급 UI 디자인 (LeafTheme + Atomic Design) |
| `/kelo:flutter-openapi-gen` | OpenAPI 3.x → BuiltValue 모델 + Dio 서비스 코드 생성 |
| `/kelo:flutter-create-package` | 모노레포 워크스페이스 패키지 생성 |

### Flutter — Quality

| Command | Description |
|---------|-------------|
| `/kelo:flutter-build-fix` | 빌드/분석 에러 점진적 수정 |
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
| `/kelo:update-plugin-ref` | `flutter_leaf_kit` git ref 일괄 업데이트 |

## Generator Scripts

`/kelo:setup` 외에 개별 스크립트로도 실행 가능합니다.

```bash
# Agents, Architecture, Conventions
./scripts/gen-agents.mjs <framework> -p /path/to/project -n "Project Name"
./scripts/gen-architecture.mjs <framework> -p /path/to/project
./scripts/gen-conventions.mjs <framework> -p /path/to/project --with stack1,stack2

# Husky hooks (all frameworks)
# - .husky/pre-commit, .husky/commit-msg 생성
# - package.json에 husky/lint-staged/@commitlint devDeps + scripts.prepare 주입
./scripts/gen-husky.mjs <framework> -p /path/to/project [-entry <dir>] [--monorepo-root <dir>]

# Commitlint config (Conventional Commits + 프로젝트 허용 타입)
./scripts/gen-commitlint.mjs -p /path/to/project

# TypeScript (Next.js / NestJS)
./scripts/typescript/gen-eslint.mjs <framework> -p /path/to/project
./scripts/typescript/gen-tsconfig.mjs <framework> -p /path/to/project --with stack1
```

## Convention System

모듈러 컨벤션 조합 방식:

1. `rules/<framework>/base/conventions.md` — 프레임워크 공통 규칙
2. `rules/<framework>/<stack>/conventions.md` — 스택별 추가 규칙
3. `gen-conventions.mjs`가 선택된 스택을 순서대로 concat → 최종 CONVENTIONS.md 생성

### 새 스택 추가

1. `rules/<framework>/stacks.yaml`에 등록 (`description`, Flutter lint 패키지가 있으면 `lintPackage`)
2. 스택 디렉터리에 산출물 파일을 둔다 — 파일이 있는 것만 적용된다

```
rules/<framework>/<stack-name>/
├── conventions.md          # 컨벤션 규칙
└── tsconfig.patch.json     # TSConfig 패치 (필요 시)
```

ESLint 규칙에는 스택이 없습니다. 특정 라이브러리 전용 규칙도 `rules/<framework>/base/eslint-rules/`에 둡니다
(미사용 패키지의 import 금지·없는 파일의 ignore는 무해).

## ESLint 설정 패키지 (Next.js / NestJS)

lint 규칙과 조립 로직은 npm 패키지로 배포되고, 소비 프로젝트는 설치 + 짧은 참조만 갖습니다.

| 패키지 | 소스 | 제공 |
|---|---|---|
| `eslint-config-kelo-nextjs` | `rules/nextjs/` | `nextjs()` factory, `./formatter`, `./stylelint`, `kelo-lint-nextjs` CLI |
| `eslint-config-kelo-nestjs` | `rules/nestjs/` | `nestjs()` factory, `./formatter`, `kelo-lint-nestjs` / `kelo-check-i18n` CLI |

소비 프로젝트 구성 (`/kelo:setup`이 생성):

```js
// eslint.config.mjs — kelo 관리 (/kelo:setup마다 덮어씀, 직접 수정은 hook이 차단)
import { nestjs } from "eslint-config-kelo-nestjs";
import projectConfig from "./eslint.project.config.mjs";
export default nestjs({ root: import.meta.dirname, project: projectConfig });
```

- `kelo.lint.json` — 프로젝트 소유. 프로젝트별 확장 `boundaryElements` / `boundaryRules` / `boundaryIgnores` / `ignores` + 추가 금지 목록 (setup이 보존)
- `eslint.project.config.mjs` — 사용자 소유. 새 규칙·플러그인 **추가만** 허용. kelo 규칙/settings 재정의, `linterOptions`, 전역 ignores는 로드 시 에러
- inline `eslint-disable` 주석은 무시됩니다 (`noInlineConfig`)
- `kelo-lint-<framework>` — 프로젝트 `eslint.config.mjs`를 무시하고 패키지 규칙으로 검사. `scripts.lint`(eslint 기반 `lint:ci`/`lint:fix` 포함)와 lint-staged가 모두 이 CLI로 통일됩니다. 경로/`--ignore-pattern` 인자는 `kelo.lint.json`의 `ignores`로 옮깁니다. 에디터 실시간 표시는 `eslint.config.mjs`가 담당합니다

배포는 **npm 레지스트리**입니다: `./deploy.mjs`(버전 범프 + 태그 + `npm publish` + GitHub Release) → 소비 프로젝트는 `package.json`에 플러그인과 같은 정확한 버전(`"eslint-config-kelo-<fw>": "<ver>"`)을 쓰고, `/kelo:setup`으로 버전을 올립니다.

## Project Preferences (NestJS)

NestJS 소비 프로젝트의 `package.json`에 `kelo-rules` 객체를 두면 일부 lint 동작을 토글할 수 있습니다. 값은 ESLint config 로드 시점에 평가되므로 **`/kelo:setup` 재실행 없이** 다음 ESLint 실행부터 반영됩니다.

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

> 옵션을 추가하지 않거나 객체 자체를 두지 않으면 모든 검사가 활성된 기본값으로 동작합니다.

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
