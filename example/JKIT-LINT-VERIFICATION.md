# jkit lint 패키지 전환 — example 검증 기록 (2026-09-27)

`example/` 세 프로젝트를 실제 `/jkit:*-init|sync`가 실행하는 생성 스크립트로 새 방식(설치형 패키지)으로 전환하고 검증한 결과다.

> **배포 방식 (1단계: GitHub)** — Next.js/NestJS 패키지는 npm 레지스트리가 아니라 GitHub Release tarball URL로 설치하고, Flutter lint 플러그인은 프로젝트 안 `.jkit/plugins/`에 vendoring(상대 path)한다.
> **아직 배포 전이다** (해당 GitHub Release와 `jkit_analysis`가 든 태그가 없음).
> - Next.js / NestJS: `package.json`에는 실제 사용자와 같은 Release URL이 들어가 있고, 설치만 `npm pack` 결과를 `node_modules`에 풀어 흉내 냈다. 배포 전 `npm install`/`yarn`을 새로 돌리면 404로 실패한다.
> - Flutter: `jkit_analysis`는 `-analysis-path`로 로컬 path 의존성을 썼다 (실제 사용자는 `git: ref: v<version>`). 플러그인은 실제와 동일하게 `.jkit/plugins/`에 vendoring했다.
> - husky는 설치하지 않았다 (example은 이 저장소 안에 있어서 루트 `.git` hook을 건드리게 됨).

> nx 모노레포(vocabit 구조) 검증은 [`nx-monorepo/README.md`](nx-monorepo/README.md) 참고.

## 바뀐 파일 한눈에 보기

| 프로젝트 | 파일 | 내용 |
|---|---|---|
| nestjs | `eslint.config.mjs` | 팩토리 호출 몇 줄 (jkit 관리, 매 sync 덮어씀) |
| nestjs | `jkit.lint.json` | `{ "stacks": ["typeorm"] }` |
| nestjs | `eslint.project.config.mjs` | 프로젝트 전용 규칙 **추가**용 스텁 (사용자 소유) |
| nestjs | `package.json` / `yarn.lock` | `@josephnk/eslint-config-nestjs`, peer 설치, `lint` → `jkit-lint-nestjs --fix`(원래 `--fix` 유지), lint-staged |
| nextjs | `eslint.config.mjs` / `jkit.lint.json` / `eslint.project.config.mjs` | 동일 구조, stacks: `design-system/shadcn`, `nextauth`, `tanstack-query` |
| nextjs | `stylelint.config.mjs` | `export { default } from "@josephnk/eslint-config-nextjs/stylelint"` |
| nextjs | `package.json` / `package-lock.json` | 레거시 `@jkit/code-plugin`(git) 제거 → `@josephnk/eslint-config-nextjs`, `eslint-config-next@^16`, `eslint-plugin-boundaries@^7` |
| flutter | `analysis_options.yaml` | `include: package:jkit_analysis/analysis_options.yaml` + `plugins:` (`path: .jkit/plugins/architecture_lint`, `leaf_kit_lint`) |
| flutter | `.jkit/plugins/*` | vendoring된 플러그인 소스 + `.jkit-vendor.json`(sha256) — 커밋 대상, 직접 수정 시 `verify` 실패 |
| flutter | `pubspec.yaml` / `pubspec.lock` | `dev_dependencies.jkit_analysis` |

## 직접 확인해 보기

```bash
# NestJS
cd example/nestjs
yarn lint               # = jkit-lint-nestjs --fix (프로젝트 설정 무시, 패키지 규칙 — 자동 수정 포함)
npx jkit-lint-nestjs    # 수정 없이 검사만
npx eslint src          # 참고: 생성된 eslint.config.mjs 경유 (에디터와 같은 경로)

# Next.js
cd example/nextjs
npm run lint            # = jkit-lint-nextjs
npx eslint .            # 참고: eslint.config.mjs 경유
npx stylelint "**/*.css"

# Flutter
cd example/flutter
dart analyze                     # 플러그인 진단(al_*)은 dart analyze(전체)에서 보고됨
dart run jkit_analysis:verify    # 규칙 약화 검사
```

## 검증 결과

### 기본 동작
| 프로젝트 | 결과 |
|---|---|
| nestjs | `npx eslint src` 6건 (import 정렬, type import, floating promise). `jkit-lint-nestjs`(= `yarn lint`)는 test/ 포함 10건, exit 1 |
| nextjs | `npx eslint .` = `npm run lint` = 10건 (boundaries 의존 규칙, 미등록 파일, i18n 경로 제한, import 정렬) |
| nextjs stylelint | 토큰 하드코딩(`color: #fff`) 1건 검출 |
| flutter | 깨끗한 상태 `verify` OK. probe 파일에서 `al_e7_no_bare_catch`, `al_s2_unknown_path`, `avoid_print` 검출 (probe는 삭제함) |

### 규칙 약화 시도 (시연 후 원복)
| 시도 | 결과 |
|---|---|
| `eslint.config.mjs` 끝에 `{ rules: { "simple-import-sort/imports": "off" } }` 추가 | `npx eslint`는 2건으로 줄어듦 → **`yarn lint`(jkit CLI)는 그대로 10건** (CI·커밋에서 걸림) |
| `eslint.project.config.mjs`에서 jkit 규칙 `off` | ESLint 로드 에러: `[jkit] eslint.project.config.mjs가 jkit 관리 규칙을 변경하려고 합니다` |
| 코드에 `/* eslint-disable */` | 무시됨: `has no effect because you have 'noInlineConfig'` + 원래 위반 그대로 보고 |
| Flutter `linter: rules: avoid_print: false` | `verify` 실패: `analysis_options.yaml: linter.rules.avoid_print: false` |
| Flutter `// ignore_for_file: al_e7_no_bare_catch` | `verify` 실패: `// ignore: al_e7_no_bare_catch` |
| 에이전트가 `eslint.config.mjs` 등 Edit/Write/`sed -i` | `hooks/block-lint-config-edits.sh`가 차단 (단, jkit 저장소 내부인 example/은 예외라 여기서는 차단되지 않음) |

## 검증 중 발견해 반영한 것
- **peer 범위**: 현재 규칙은 `eslint-config-next` 16+, `eslint-plugin-boundaries` 6+에서만 로드된다 (기존 example/nextjs는 15/5라 옛 방식에서도 로드 실패 상태였음). sync의 peer 보강 명령에 `eslint-config-next@^16`, `eslint-plugin-boundaries@^7`을 명시해 기존 프로젝트도 함께 올라가게 했다. `eslint-plugin-simple-import-sort` peer 범위에 14를 추가했다.
- **monorepo**: `jkit-lint-*` CLI가 파일마다 가장 가까운 `jkit.lint.json`으로 프로젝트 루트를 찾도록 했다 (루트 lint-staged가 여러 워크스페이스 파일을 넘겨도 각자 설정으로 검사).

## 알려진 이슈 (이번 범위 밖)
- `flutter analyze`는 이 환경(Dart 3.13.4)에서 커스텀 플러그인 진단(`al_*`)을 보고하지 않는다. `dart analyze`(프로젝트 전체)에서만 보고된다. Flutter pre-commit이 `flutter analyze`를 쓰므로 architecture 규칙이 커밋 단계에서 실제로 검사되지 않을 수 있다.
- (해결) `eslint-plugin-boundaries` v7 deprecation 경고 — builder가 v7 문법(`policies`, 엔티티 선택자, 파일 카테고리)으로 변환하도록 바꿨다. v6 대비 허용/차단 매트릭스(1596쌍)가 동일함을 확인했다. peer는 `^7`.
