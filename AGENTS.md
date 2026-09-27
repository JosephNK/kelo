# AGENTS.md

## 프로젝트 목적

`kelo`는 Next.js / NestJS / Flutter 프로젝트의 lint 규칙 원본을 관리하고, 그로부터 참조 문서와 프로젝트용 기본 문서를 생성하는 저장소다.

## Source Of Truth

원본 (수정 대상)

- Next.js:
  - 베이스: `rules/nextjs/base/eslint-rules/{settings,boundaries,quality,builders,docs}/*.mjs` — 역할별 폴더로 분리된 관심사별 단일 파일.
    - `settings/` : resolver/restricted-patterns/restricted-syntax/domain-banned-packages 등 raw 데이터
    - `boundaries/` : eslint-plugin-boundaries 데이터 (elements/rules/ignores)
    - `quality/` : base-config/server-component/custom-rules/ignores
    - `builders/` : build-restricted-imports/build-domain-purity/build-architecture-boundaries, to-boundaries-policies(boundary 데이터 v6 형태 → eslint-plugin-boundaries v7 설정 변환: `mode: "full"` element → 파일 카테고리, `rules` → `policies`, 내부 의존 처리. nestjs와 동일 내용 유지)
    - `docs/` : ESLint 미참조 — generator 전용 메타 (structure-annotations, layer-semantics)
  - `rules/nextjs/base/eslint.rules.mjs`는 re-export 전용 barrel이라 직접 편집 X.
  - 스택: `rules/nextjs/<stack>/eslint.rules.mjs`
  - Stylelint: `rules/nextjs/base/stylelint.rules.mjs` (규칙), `rules/nextjs/base/stylelint.preset.mjs` (Tailwind 호환 + ignore를 더한 최종 preset)
- NestJS:
  - 베이스: `rules/nestjs/base/eslint-rules/{settings,boundaries,quality,builders,docs}/*.mjs` — 역할별 폴더로 분리된 관심사별 단일 파일.
    - `settings/` : path-alias/resolver/framework-packages 등 raw 설정
    - `boundaries/` : eslint-plugin-boundaries 데이터 (elements/rules/ignores)
    - `quality/` : base-config/immutability/file-size/cycle/custom-rules/ignores
    - `builders/` : build-layer-restrictions/build-architecture-boundaries, to-boundaries-policies(v7 설정 변환, nextjs와 동일 내용 유지)
    - `docs/` : ESLint 미참조 — generator 전용 메타 (structure-annotations, layer-semantics)
  - `rules/nestjs/base/eslint.rules.mjs`는 re-export 전용 barrel이라 직접 편집 X.
  - 스택: `rules/nestjs/<stack>/eslint.rules.mjs`
- npm 패키지 (`rules/nextjs/` → `eslint-config-kelo-nextjs`, `rules/nestjs/` → `eslint-config-kelo-nestjs`):
  - `index.mjs` — factory(`nextjs()`/`nestjs()`)와 스택 등록표(`nextjsStacks`/`nestjsStacks`). 블록 조립 순서와 스택 → 데이터 매핑의 원본. 새 스택은 여기 등록해야 적용된다.
  - `lib/factory-helpers.mjs`, `lib/run-lint-cli.mjs` — 두 패키지가 **동일 내용**을 유지 (분리 배포라 서로 import 불가). 한쪽을 고치면 다른 쪽에 복사.
  - `bin/` — `kelo-lint-<framework>` CLI (+ nestjs `kelo-check-i18n`)
  - `package.json` — `exports`/`files`/`peerDependencies`. 버전은 `deploy.mjs`가 플러그인 버전과 함께 올린다.
- Flutter (`architecture_lint` Dart 패키지): `rules/flutter/base/custom-lint/architecture_lint/lib/src/`
  - `lints/*.dart` (11개 룰 클래스), `constants.dart` (패키지 화이트/블랙리스트·임계값), `classification.dart` (경로 → 레이어 매핑), `layer_semantics.dart` (Role/Contains/Example)
- Flutter analyzer/linter 정책 (`kelo_analysis` Dart 패키지): `rules/flutter/base/analysis/kelo_analysis/`
  - `lib/analysis_options.yaml` — 소비 프로젝트가 include하는 analyzer/linter 규칙 원본 (`rules/flutter/base/templates/*.yaml`은 include 한 줄짜리 진입점)
  - `bin/verify.dart` — `dart run kelo_analysis:verify`. 소비 프로젝트의 규칙 약화(lint off, severity 하향, strict 해제, plugin diagnostics off, lib/ exclude, kelo 규칙 `// ignore:`)를 거부. 새 plugin 코드 접두어가 생기면 `_pluginCodePrefixes`에 추가

생성물 (직접 수정 금지)

- `lint-rules-structure-reference.md`, `lint-rules-reference.md`, `lint-rules-diagram.md`, `stylelint-rules-reference.md`

문제가 있으면 원본 또는 생성 스크립트를 수정한 뒤 재생성한다.

## 기본 작업 방식

1. 원본 규칙 파일을 수정한다.
2. 해당 generator를 실행한다.
3. `--check`로 드리프트 검증 후 커밋한다.

## Doc 작성 원칙 (lint 규칙 추가/수정 시)

### 핵심 원칙

생성된 md는 **rule 코드의 대체물**이다. LLM이 md만 읽어도 "이런 룰이 있구나, 지켜야 하는구나"를 인지할 수 있어야 한다.

doc에 담을 정보

- **무엇을** 금지/허용 (임계치·차단 패키지·경로 등 구체값 inline)
- **어디에** 적용 (path/layer)
- **왜** (1줄, edge case 판단 근거)

### Flutter Dart lint (`rules/flutter/base/custom-lint/architecture_lint/lib/src/lints/*.dart`)

클래스 직전 `///` doc **첫 줄**이 `lint-rules-reference.md`의 rules table 셀과 glossary Constraints 항목에 surface된다.

형식

```dart
/// {ID}: {자족 룰 진술 + 구체값/짧은 예시 inline}.
///
/// {선택: 1줄 reasoning — md에 표시되지 않고 source 유지보수자만 본다}.
class XxxLint extends DartLint { ... }
```

규칙

- `{ID}:` prefix는 generator가 자동 strip
- Severity / Layer 컬럼과 중복 금지 — `(warning)`, `` `<layer>/`는... `` 등은 컬럼에 이미 있다
- 숫자 임계값은 inline (`maxFileLines` 식별자 대신 `800`)
- 짧은 예시는 첫 줄에 inline (`` (예: `AuthPort`, `UserRepositoryPort`) ``)
- 2번째 줄 이후는 md에 표시되지 않으나 백틱 식별자는 Refs 컬럼 추출 대상

예시

```dart
/// AL_S1: 파일당 800줄 초과 금지 — 단일 책임 위반 신호.
///
/// 800은 경험적 임계치. 한계값은 `maxFileLines` 상수로 조정 가능.
class AlS1FileSizeLint extends DartLint { ... }

/// AL_N1: 클래스명에 `Port` suffix 필수 (예: `AuthPort`, `UserRepositoryPort`).
///
/// 클래스명만으로 레이어 역할을 즉시 식별 — grep/리뷰 효율.
class AlN1PortNamingLint extends DartLint { ... }
```

### Next.js / NestJS ESLint

대상 파일:
- Next.js 베이스: `rules/nextjs/base/eslint-rules/{settings,boundaries,quality,builders,docs}/*.mjs`
- Next.js 스택: `rules/nextjs/<stack>/eslint.rules.mjs`
- NestJS 베이스: `rules/nestjs/base/eslint-rules/{settings,boundaries,quality,builders,docs}/*.mjs`
- NestJS 스택: `rules/nestjs/<stack>/eslint.rules.mjs`

각 `export const` 직전의 JSDoc은 해당 데이터를 렌더하는 md 섹션의 preface로 surface된다. 룰 데이터(boundary elements 등)에 라인 끝 `//` 코멘트를 적으면 boundary element 표의 "설명" 컬럼으로 surface된다. base 폴더는 barrel(`eslint.rules.mjs`)이 sub-파일을 re-export하며, generator(`gen-eslint-reference.mjs`)가 re-export를 따라가 sub-파일의 JSDoc과 inline 코멘트를 그대로 surface한다.

규칙

- 1~2문장 — 무엇을 차단/허용 + 왜
- 코드 유지보수자용 메타 정보 금지 (`(doc-only)`, `ESLint 미참조`, `LLM/신규 인원` 등)

surface되는 export

- `baseBoundaryElements` (인라인 `//` → 구조 reference 설명 컬럼)
- `baseLayerSemantics`, `baseBoundaryRules`, `baseBoundaryAllowPatches`, `baseRestrictedPatterns`, `baseRestrictedSyntax`, `baseDomainBannedPackages`, `baseFrameworkBannedPackages`, `baseBoundaryIgnores` (또는 `baseIgnores`) → 각 섹션 preface (스택 파일은 `<stack>FrameworkBannedPackages` / `<stack>InfraBannedPackages` 형태)

예시

```js
/**
 * 도메인 레이어(`src/lib/domain/**`)에서 import 금지 패키지.
 * 프레임워크 비의존 유지. 스택별로 UI 라이브러리 추가 차단.
 */
export const baseDomainBannedPackages = [...];
```

### Stylelint (`rules/nextjs/base/stylelint.rules.mjs`)

각 룰 export의 JSDoc이 해당 룰의 설명으로 surface된다. 원칙은 ESLint와 동일.

## 스크립트 역할 구분

- `scripts/typescript/gen-eslint.mjs` — 입력: `rules/<framework>/package.json` + `--with` 스택 → 출력(소비 프로젝트): `eslint.config.mjs`(factory 호출, 매번 덮어씀), `kelo.lint.json`(`stacks`만 갱신, 나머지 키 보존), `eslint.project.config.mjs`(없을 때만 스텁), `package.json`(패키지 버전, lint-staged와 `scripts.lint`/eslint 기반 `lint:ci`·`lint:fix`를 `kelo-lint-<framework>`로 통일, 레거시 `@jkit/code-plugin`·`lint:jkit` 제거).
- `scripts/typescript/gen-stylelint.mjs` — 출력(소비 프로젝트): `stylelint.config.mjs`(`eslint-config-kelo-nextjs/stylelint` re-export) + stylelint devDeps.
- `scripts/flutter/gen-analysis-options.mjs` — 출력(소비 프로젝트): include 한 줄짜리 `analysis_options.yaml` + 엔트리 `pubspec.yaml`의 `kelo_analysis` git 의존성(`ref: v<plugin-version>`). 미배포 체크아웃 검증은 `-analysis-path <dir>`로 path 의존성 사용.
- `scripts/flutter/custom_lint/inject-custom-lint.mjs` (gen-custom-lint가 호출) — Flutter lint 플러그인 소스를 소비 프로젝트의 `.kelo/plugins/<package>/`로 vendoring(+ `.kelo-vendor.json` sha256)하고 `plugins:`에 상대 `path:`로 등록. `git:`/절대 경로는 이식성·동작 문제로 쓰지 않는다.
- `scripts/typescript/dependencies/fill-tarball-integrity.mjs` — 소비 프로젝트 lockfile(pnpm-lock.yaml·package-lock.json)의 kelo Release tarball 항목 integrity를 점검: 빠지면 자산 sha512로 채우고, 있으면 자산과 대조해 불일치 시 에러(덮어쓰지 않음). init/sync의 install 직후와 update-plugin-ref 후에 실행.
- `hooks/block-lint-config-edits.sh` — 소비 프로젝트에서 kelo 관리 헤더(`Managed by kelo` 등)가 있는 `eslint.config.mjs`/`stylelint.config.mjs`/`analysis_options.yaml`과 `.kelo/plugins/**`를 에이전트가 수정하지 못하게 차단. `kelo.lint.json`은 대상이 아니며(ignores·boundary*·프레임워크별 추가 금지 목록은 프로젝트 소유 — `index.mjs`의 `*_LINT_CONFIG_KEYS`), 너무 넓은 제외 패턴은 `lib/factory-helpers.mjs`가 로드 단계에서 거부 (이 저장소 내부 경로와 `KELO_ALLOW_LINT_CONFIG_EDIT=1`은 예외).

- `scripts/gen-agents.mjs` — 입력: `rules/<framework>/base/agents.template.md` → 출력: `AGENTS.md`, `CLAUDE.md→AGENTS.md`. 템플릿을 렌더링해 프로젝트 루트의 에이전트 문서 생성.
- `scripts/gen-architecture.mjs` — 입력: `rules/<framework>/base/architecture.md` → 출력: `ARCHITECTURE.md`. base 아키텍처 문서를 프로젝트 문서로 복사.
- `scripts/gen-git.mjs` — 입력: `rules/common/git.md` → 출력: `GIT.md`. 공통 Git 가이드 복사.
- `scripts/gen-conventions.mjs` — 입력: `rules/<framework>/base/conventions.md` + `rules/<framework>/<stack>/conventions.md` → 출력: `CONVENTIONS.md`. base + 선택 stack conventions 이어 붙임.
- `scripts/typescript/gen-eslint-reference.mjs` — 입력: `eslint.rules.mjs` → 출력: `lint-rules-{structure-reference,reference,diagram}.md`. AST로 export 데이터를 읽어 ESLint 참조 문서 생성. `--check`로 드리프트 검사.
- `scripts/typescript/gen-stylelint-reference.mjs` — 입력: `stylelint.rules.mjs` → 출력: `stylelint-rules-reference.md`. AST로 `*Config` export와 rule JSDoc을 읽어 Stylelint 참조 문서 생성. `--check`로 드리프트 검사.
- `scripts/flutter/gen-custom-lint-reference.mjs` — 입력: `rules/flutter/base/custom-lint/architecture_lint/lib/src/{lints/*.dart, constants.dart, classification.dart, layer_semantics.dart}` + stack lint 패키지(예: `rules/flutter/leaf-kit/custom-lint/leaf_kit_lint/lib/src/`, `rules/flutter/freezed/custom-lint/freezed_lint/lib/src/`) → 출력: `rules/flutter/base/{lint-rules-structure-reference,lint-rules-reference,lint-rules-diagram}.md` + stack별 `rules/flutter/<stack>/lint-rules-reference.md`. Dart 텍스트 파싱으로 룰 doc·`code`·`severity`·target layer + constants의 Set/스칼라 + layer_semantics의 Role/Contains/Example을 합쳐 Flutter 참조 문서 생성. `--check`로 드리프트 검사.

## 프로세스

### Next.js / NestJS

`eslint.rules.mjs` 또는 `stylelint.rules.mjs` 수정 후:

```bash
node scripts/typescript/gen-eslint-reference.mjs <path-to-eslint.rules.mjs>
node scripts/typescript/gen-stylelint-reference.mjs <path-to-stylelint.rules.mjs>
```

스택을 추가/변경했다면 `rules/<framework>/index.mjs` 스택 등록표도 함께 수정하고, `cd rules/<framework> && npm pack --dry-run`으로 새 파일이 패키지에 포함되는지 확인한다. 배포는 `./deploy.mjs`(버전 범프 + 태그 + `npm pack` tarball을 GitHub Release에 첨부 — npm 레지스트리 미사용).

### Flutter

`rules/flutter/base/custom-lint/architecture_lint/lib/src/` 하위 원본 수정 후:

```bash
node scripts/flutter/gen-custom-lint-reference.mjs
```

Flutter custom lint 동작 검증이 필요하면 기본적으로 `example/flutter/` 프로젝트를 사용한다. `example/` 하위는 Git 추적 대상이 아니므로 로컬에서만 사용한다.

- `example/flutter/analysis_options.yaml`은 lint plugin 연결 검증에 사용한다.
- 검증용 임시 파일은 `example/flutter/lib/features/probe/...` 아래에 만든다.
- 위반 케이스 확인은 `example/flutter/` 루트에서 `dart analyze <probe-file>` 또는 필요한 범위의 `dart analyze`로 수행한다.
- 검증이 끝나면 probe 파일은 삭제하고, 필요한 설정 파일만 유지한다.

## 검증 기준

- 생성 문서가 현재 규칙 정의와 일치해야 한다.
- 생성 문서 형식이 불필요하게 흔들리지 않아야 한다.
- 구조 문서, 규칙 문서, 다이어그램 문서가 서로 모순되지 않아야 한다.
