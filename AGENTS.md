# kelo

`kelo`는 Next.js / NestJS / Flutter 프로젝트의 lint 규칙 원본과, 소비 프로젝트에 이를 적용하는 Claude Code 플러그인(`/kelo:setup` 등)을 관리한다.

## 수정 → 검증

생성물(파일 상단 `GENERATED` 배너)은 직접 고치지 않는다 — 원본을 고치고 재생성한다.

| 원본 | 재생성 / 검증 |
|---|---|
| `rules/{nextjs,nestjs}/base/eslint-rules/**` | `node scripts/typescript/gen-eslint-reference.mjs rules/<fw>/base/eslint.rules.mjs [--check]` |
| `rules/nextjs/base/stylelint.rules.mjs` | `node scripts/typescript/gen-stylelint-reference.mjs rules/nextjs/base/stylelint.rules.mjs [--check]` |
| `rules/flutter/**/custom-lint/**` | `node scripts/flutter/gen-custom-lint-reference.mjs [--check]` |
| 공통 | `npm test` — 두 npm 패키지의 복사본 파일 동일성, Flutter lint 코드 접두어 등록 등 |

새 파일을 패키지에 넣었다면 `cd rules/<fw> && npm pack --dry-run`으로 포함 여부를 확인한다.

## 문서 원칙

규칙은 lint가 강제하고 메시지로 전달한다. 소비 프로젝트 문서는 `ARCHITECTURE.md`(경계 규칙에서 생성한 폴더 트리)와 `CONVENTIONS.md`(lint로 강제할 수 없는 팀 결정)만 두고 짧게 유지한다.

생성 참조 문서에 그대로 surface되는 주석은 1~2문장으로 "무엇을 금지/허용 + 왜"만 쓴다 (구체값 inline, 유지보수용 메타 금지).

- ESLint: 각 `export const` 직전 JSDoc → 섹션 preface. boundary element 라인 끝 `//` → 트리·표의 설명.
- Flutter lint: 클래스 직전 `///` **첫 줄**만 surface. Severity·Layer 컬럼과 중복 금지, 임계값은 숫자로.

```dart
/// AL_S1: 파일당 800줄 초과 금지 — 단일 책임 위반 신호.
class AlS1FileSizeLint extends DartLint { ... }
```

## `/kelo:setup` 구조

- `scripts/kelo.mjs` — 실행기 (`detect` / `validate` / `setup`). 소비 프로젝트 `kelo.yaml`을 읽는다.
- `rules/<fw>/stacks.yaml` — 스택 정의. 스택이 기여하는 산출물은 `rules/<fw>/<stack>/`의 파일 존재로 정해진다.
- `rules/<fw>/pipeline.yaml` — 실행 단계와 순서.
- 생성 스크립트는 상대 경로를 `PWD` 기준으로 푼다 — 하위 프로세스에 `PWD`를 cwd로 넘길 것.

## example 검증

`example/`(git 추적됨)의 4개 프로젝트로 검증한다.

```bash
node scripts/kelo.mjs setup -p example/<nextjs|nestjs|flutter|nx-monorepo> --no-install --analysis-path rules/flutter/base/analysis/kelo_analysis
```

- `--no-install`: example의 git 루트가 이 저장소라, 설치 시 husky `prepare`가 저장소 hook을 바꾸고 레지스트리 패키지가 로컬 pack을 덮어쓴다. 로컬 패키지는 `npm pack` 결과를 `node_modules/eslint-config-kelo-<fw>`에 푼다 (nx는 `scripts/pack-kelo-local.sh`).
- `--analysis-path`: Flutter `kelo_analysis`를 상대 path 의존성으로 (절대 경로 금지).
- Flutter 위반 확인용 임시 파일은 `example/flutter/lib/features/probe/` 아래에 만들고 끝나면 지운다.

## 배포

`./deploy.mjs`로만 한다 (버전 동기화·태그·`npm publish`·GitHub Release). 실행 전 반드시 사용자에게 확인한다.
