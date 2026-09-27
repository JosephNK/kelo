# kelo lint 패키지 전환 — nx 모노레포 검증 (vocabit 구조)

`vocabit`(pnpm + nx, `kelo.workspaces.json`)과 같은 구조로 만든 검증용 모노레포다.

```
nx-monorepo/
├── package.json / pnpm-workspace.yaml / nx.json / kelo.workspaces.json
├── .husky/pre-commit          # vocabit 루트 훅 구조 예시 (설치하지 않음)
├── scripts/pack-kelo-local.sh # 배포 전 검증용 tarball 생성
└── apps/
    ├── api/    @demo/api   — NestJS (stacks: typeorm, gcp, anthropic-ai) + src/libs(서브모듈 흉내)
    ├── admin/  @demo/admin — Next.js (stacks: design-system/shadcn, tanstack-query, next-proxy)
    └── app/    @demo/app   — Flutter pub workspace (app/ 엔트리 + packages/core, stack: leaf-kit)
```

## 진행한 순서

1. **레거시 상태 생성**: 현재 커밋(HEAD)의 옛 생성 스크립트로 vocabit과 같은 `@jkit/code-plugin`(git) 방식 설정을 만들었다.
2. **전환**: 새 스크립트로 `/kelo:workspaces-sync`(api, admin) + `/kelo:flutter-sync`(apps/app, `-entry app`)와 같은 호출을 실행했다.
3. **사용자 확장**: api의 `--ignore-pattern "src/libs/**"`를 `apps/api/kelo.lint.json`의 `"ignores": ["src/libs/**"]`로 옮겼다.
4. **설치**: 루트 `pnpm install` → 워크스페이스별 peer 보강(`pnpm add -D $NESTJS_PEERS / $NEXTJS_PEERS`, 문서와 동일) → `apps/app`에서 `flutter pub get`.

> **배포 전 임시 장치**
> - 앱 `package.json`에는 실제 사용자와 같은 GitHub Release tarball URL(`…/releases/download/v<ver>/eslint-config-kelo-*-<ver>.tgz`)이 들어 있다. 설치만 `pnpm-workspace.yaml`의 `overrides`로 로컬 tarball(`.local-packages/`, git 제외)에 연결했다. 새로 받은 경우 `./scripts/pack-kelo-local.sh` → `pnpm install`.
> - Flutter `kelo_analysis`는 로컬 path 의존성이다 (실제: `git: ref: v<version>`).
> - GitHub Release 배포 후에는 `overrides`와 `.local-packages`, pack 스크립트를 지우면 된다.
> - Flutter lint 플러그인은 `apps/app/.kelo/plugins/`에 vendoring되어 커밋된다 (workspace 루트 `analysis_options.yaml`이 상대 경로로 참조).

## 전환 전/후

| 파일 | 전환 전 (레거시) | 전환 후 |
|---|---|---|
| `apps/api/eslint.config.mjs` | 130줄 (규칙 병합 로직 전체) | 15줄 (`nestjs({ root, project })` 호출) |
| `apps/admin/eslint.config.mjs` | 155줄 | 15줄 (`nextjs({ root, project })`) |
| `apps/*/kelo.lint.json` | 없음 | `stacks` (+ api는 `ignores`) |
| `apps/admin/stylelint.config.mjs` | 템플릿 복사본 | `export { default } from "eslint-config-kelo-nextjs/stylelint"` |
| `apps/*/package.json` | `@jkit/code-plugin: github:…#v0.3.x`, lint-staged `eslint --fix` | `eslint-config-kelo-*`: GitHub Release tarball URL, **모든 glob**의 `eslint --fix` → `kelo-lint-* --fix`, `scripts.lint`/`lint:ci` → `kelo-lint-*` |
| `apps/app/app/analysis_options.yaml` | 79줄 (규칙 전체) | `include: [../analysis_options.yaml, package:kelo_analysis/analysis_options.yaml]` |
| `apps/app/analysis_options.yaml` | flutter_lints + plugins | 동일 (workspace 루트 — plugins 호스트, `packages/*`는 엄격 규칙 미적용) |
| `apps/app/app/pubspec.yaml` | — | `dev_dependencies.kelo_analysis` |

## 실행해 보기

```bash
cd example/nx-monorepo
pnpm lint                      # = nx run-many -t lint:ci — 모든 앱이 kelo CLI/verify로 검사 (CI 강제 지점)
pnpm --filter @demo/api lint   # = kelo-lint-nestjs
pnpm --filter @demo/admin lint # = kelo-lint-nextjs
(cd apps/app && pnpm lint:ci)  # dart analyze + dart run kelo_analysis:verify
```

## 검증 결과

| 항목 | 결과 |
|---|---|
| `pnpm lint` (`nx run-many -t lint:ci`) | api 10건(9 error/1 warning), admin 9건, app 0건 + `verify` OK (options 2개) |
| pnpm strict node_modules | 두 패키지 모두 peer로 정상 로드 |
| 루트에서 파일 경로로 CLI 호출 (lint-staged 방식) | 파일마다 가장 가까운 `kelo.lint.json`으로 앱 루트를 찾아 해당 앱 설정으로 검사 |
| `src/libs/**` (api `kelo.lint.json` ignores) | 검사 제외, lint-staged가 넘겨도 경고 없음 |
| Flutter 엔트리 `app/` probe | `al_e7_no_bare_catch`, `al_s2_unknown_path`, `avoid_print`(error) 검출 |
| Flutter `packages/core` probe | `avoid_print`(info)만 — 엄격 규칙은 엔트리에만 적용 |
| admin `eslint.config.mjs`를 `ignores: ["**/*"]`로 조작 | `npx eslint`(에디터 경로)는 아무것도 보고하지 않음 → **`pnpm lint`(kelo CLI)는 그대로 9건** |

(검증용 probe 파일과 조작은 모두 원복했다. 남아 있는 위반은 원래 example 코드의 것이다.)

## 이번 검증으로 kelo에 반영한 수정
- `gen-eslint.mjs`: `*.ts`, `*.{ts,tsx}` 등 **모든 lint-staged glob**의 `eslint --fix`를 CLI로 교체 (vocabit처럼 여러 glob에 eslint를 건 경우 대비).
- `eslint-config-kelo-nextjs`: `typescript-eslint`를 필수 peer로 (pnpm은 optional peer를 자동 설치하지 않아 base 설정 import가 실패할 수 있음).
- `kelo-lint-*` CLI: `kelo.lint.json` ignores 대상 파일에 "File ignored" 경고를 내지 않도록 (`warnIgnored: false`).

## 참고 — vocabit 전환 시 사람이 결정할 것
- `gen-eslint`가 `lint`/`lint:ci`의 `eslint …` 명령을 `kelo-lint-<framework>`로 바꾸므로 nx `lint:ci`(= vocabit `pnpm lint`)가 그대로 CI 강제 지점이 된다. Flutter 앱의 `lint:ci`에는 `dart run kelo_analysis:verify`를 직접 추가해야 한다 (Flutter 쪽 package.json은 kelo가 관리하지 않음).
- api의 `--ignore-pattern "src/libs/**"`처럼 스크립트 인자로 주던 제외 경로는 `kelo.lint.json`의 `ignores`로 옮겨야 한다 (gen-eslint가 교체할 때 안내 메시지를 출력).
- `pnpm-workspace.yaml`의 `onlyBuiltDependencies`에 있는 `@jkit/code-plugin`은 더 이상 필요 없다 (새 패키지는 설치 스크립트가 없음).
