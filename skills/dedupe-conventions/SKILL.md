---
name: dedupe-conventions
description: kelo의 `rules/<framework>/<scope>/conventions.md`와 같은 디렉토리의 `lint-rules-reference.md`를 비교해 중복 영역을 식별하고, 사용자 합의 후 conventions.md에서 제거한다. AGENTS.md가 두 파일을 모두 mandatory docs로 링크하므로 같은 정보를 중복 기재하면 LLM 컨텍스트가 낭비된다. Use when 룰 추가/수정 후, 또는 conventions 정리 시.
argument-hint: "<framework | all>  (e.g. flutter, nestjs, nextjs, all — 생략 시 all)"
---

# Dedupe Conventions Skill

`conventions.md`(사람 작성, 자유 형식)와 `lint-rules-reference.md`(generator 산출물)는 모두 사용자 프로젝트의 `AGENTS.md`에서 mandatory docs로 링크된다. 같은 룰을 양쪽에 중복 기재하면 LLM이 컨텍스트를 두 번 읽으며 낭비하고, 룰 변경 시 동기화 부담이 생긴다.

본 스킬은 자동으로 중복을 식별·보고하고, 사용자 합의를 받아 `conventions.md`에서만 제거한다. `lint-rules-reference.md`는 generator 산출물이므로 절대 수정하지 않는다.

## $ARGUMENTS Parsing

| 인자 | 대상 |
|---|---|
| (없음) 또는 `all` | flutter / nestjs / nextjs 모든 framework의 모든 scope |
| `flutter` / `nestjs` / `nextjs` | 해당 framework의 base + 모든 stack |

`<framework>/<scope>` 단위 (예: `flutter/leaf-kit`)는 지원하지 않는다 — base가 같이 검토돼야 stack의 자기 참조도 정확히 식별 가능.

## 대상 파일 발견

다음 명령으로 (conventions.md, lint-rules-reference.md) 양쪽이 모두 존재하는 쌍만 수집:

```bash
# all 모드
find rules -maxdepth 4 -name conventions.md \
  | while read c; do d=$(dirname "$c"); [ -f "$d/lint-rules-reference.md" ] && echo "$d"; done

# 단일 framework 모드
find rules/<framework> -maxdepth 3 -name conventions.md \
  | while read c; do d=$(dirname "$c"); [ -f "$d/lint-rules-reference.md" ] && echo "$d"; done
```

쌍이 아닌 (lint-ref 없음) 디렉토리는 자동 skip. 사용자에게 skip 목록 표시.

## 중복 식별 휴리스틱

각 쌍에서 conventions.md를 라인 단위로 읽고 다음 카테고리에 분류한다.

### 강한 중복 (default 삭제 후보)

1. **룰 ID 자기 참조** — 정규식 매칭으로 자동 검출 가능:
   - Flutter Dart lint: `(architecture_lint|leaf_kit_lint|freezed_lint)`, `\b(AL|LK|FZ)_[ENS]\d+\b`
   - ESLint local 룰: `\blocal/[\w-]+\b`
   - Stylelint local 룰: `\blocal/[\w-]+\b`
   - 예: `bare catch 금지 (architecture_lint AL_E7)` → 룰 인용 부분만 제거

2. **글로서리 prose 재진술** — `lint-rules-reference.md`의 "레이어 글로서리" 섹션에 다음 헤더가 있다:
   - `Role:` (한 줄 책임)
   - `Contains:` (포함 파일 종류·suffix·예시)
   - `Forbids:` (금지 사항)
   - `Constraints:` (룰 ID + 한 줄 진술)
   - `Example:` (대표 코드)

   conventions.md에서 같은 레이어를 설명하는 **prose**(코드 아님)가 위 정보와 의미적으로 동일하면 강한 중복.

3. **룰 표 직접 인용** — `lint-rules-reference.md`의 룰 표(코드·Severity·Layer·Constraints) 셀에 있는 진술을 conventions가 그대로 prose화:
   - 예: "Port suffix 강제" ↔ AL_N1 Constraints
   - 예: "*ItemDto/*DataResponseDto 명명 강제" ↔ `local/dto-naming-convention`
   - 예: "timestamptz 강제" ↔ `local/require-timestamptz`

4. **금지 패키지 진술** — `lint-rules-reference.md`의 패키지 섹션에 등재된 항목을 conventions에서 prose로 재진술:
   - `## Framework 금지 패키지`
   - `## Infra 금지 패키지`
   - `## Domain 금지 패키지`
   - `## Codegen 허용 패키지` 등

5. **동일/유사 코드 예시** — `lint-rules-reference.md`의 글로서리 `Example:`과 동일한 클래스명·메서드 시그니처를 보이는 코드 블록.

### 약한 중복 (사용자 판단)

- 같은 framework의 **다른 scope**에 있는 룰을 base/conventions.md가 prose로 재진술 (예: `nextjs/base/conventions.md`의 `component="a"` 차단은 `nextjs/design-system/mantine/lint-rules-reference.md`에만 lint으로 enforce됨).
- 사용자가 그 stack을 안 쓰면 lint이 미적용이라 conventions가 유일한 가이드 역할 → 보존 가치.
- 보고 시 "약한 중복: <stack>에 의존" 라벨로 분리 표시.

### 보존 (default 보존)

- **코드 예시**: 글로서리 `Example:`에 없는 통합 패턴 (예: 다중 데이터 소스 Adapter, Page→Component props 흐름, 테스트 mock 셋업)
- **디자인 가이드**: "언제 X 사용", "왜 그렇게", scope 결정 기준 (common/ vs features/, registerLazySingleton vs registerFactory)
- **운영 절차**: i18n 등록, codegen 명령, jscpd 임계치
- **도구 사용 가이드**: optimizePackageImports, ConfigProvider 위치, theme.ts 구조
- **테스트 전략**: mock 대상·tearDown 패턴
- **외부 라이브러리 사용법**: leaf_kit API 호출, Mantine `createTheme` 등

## Workflow

### 1. 대상 쌍 수집

위의 find 명령으로 쌍 목록을 만들고 사용자에게 표시:

```
대상 쌍 N개:
  rules/flutter/base
  rules/flutter/freezed
  rules/flutter/leaf-kit
  ...
Skip (lint-rules-reference 없음):
  rules/flutter/easy-localization
  rules/flutter/go-router
  ...
```

### 2. 쌍별 분석 (병렬 권장)

쌍이 4개 이상이면 framework 단위로 general-purpose subagent에 분석 위임:
- agent에 두 파일의 절대 경로 + 분석 기준(위 휴리스틱)을 전달
- 출력 형식 강제 (각 쌍별 "삭제 후보" / "약한 중복" / "보존" 섹션 + 라인 번호)

쌍이 적으면 메인 컨텍스트에서 직접 Read + 비교.

### 3. 보고서 출력

각 쌍별로 다음 형식:

```markdown
## <framework>/<scope>
**conventions.md**: N줄 / **lint-rules-reference.md**: M줄

### 강한 중복 (삭제 후보)
- L<a>-<b>: 한 줄 요약 — 매칭된 룰 ID/글로서리 항목

### 약한 중복 (사용자 판단)
- L<a>-<b>: 한 줄 요약 — 의존하는 stack

### 보존 사유 (참고)
- L<a>-<b>: 한 줄 요약 — 유지 근거
```

전체 쌍에 대한 통계도 출력:
```
총 N 쌍 / 강한 중복 X곳 / 약한 중복 Y곳 / 총 삭제 후보 라인 ~Z줄
```

### 4. 사용자 합의

다음 옵션을 제시:

| 옵션 | 의미 |
|---|---|
| 모두 적용 | 강한 중복 전부 삭제. 약한 중복은 보존 |
| 그룹별 적용 | 사용자가 강한/약한 별로 따로 결정 |
| 쌍 단위 검토 | 각 쌍을 보여주고 yes/no/skip 받음 |
| 취소 | 수정 안 함 |

약한 중복은 항상 별도 합의 — 자동 삭제 금지.

### 5. 수정 적용

합의된 라인만 `conventions.md`에서 제거. 다음 정리도 같이:

- **자기 참조 한 줄 안의 룰 ID만 인용**된 케이스: 그 토큰만 제거하고 문장은 보존 (예: `bare catch 금지 (architecture_lint AL_E7)` → `bare catch 금지`).
- **인접 빈 줄 정리**: 섹션 헤더만 남고 본문이 빈 경우 헤더도 제거.
- **인접 섹션 머지**: 작은 섹션이 비면 상위 섹션과 머지 또는 제거.

### 6. 검증

수정 후 다음을 확인 후 보고:

```bash
# conventions.md 라인 수 변화
for f in <변경된 파일들>; do echo "$f: $(wc -l < "$f")"; done

# 플러그인 npm 의존성 체크 (gen-eslint-reference.mjs는 acorn 필요)
(cd ${CLAUDE_PLUGIN_ROOT} && [ -d node_modules/acorn ] || npm install)

# generator 산출물 무결성 — conventions.md는 generator 입력이 아니지만,
# 경로상 같이 묶이므로 lint-ref drift 검증을 함께 실행
node scripts/typescript/gen-eslint-reference.mjs <eslint.rules.mjs> --check
node scripts/flutter/gen-custom-lint-reference.mjs --check
```

### 7. 종료

git diff 요약(파일별 +/- 라인)을 출력. 커밋은 사용자가 명시적으로 요청할 때만 실행 (skill 내부에서 자동 commit 금지).

## 절대 하지 말 것

- `lint-rules-reference.md` / `lint-rules-structure-reference.md` / `lint-rules-diagram.md` 수정 — 모두 generator 산출물.
- 코드 예시 무조건 삭제 — 글로서리에 없는 통합 예시는 보존 가치 큼.
- 약한 중복 자동 삭제 — 항상 사용자 합의.
- "왜/언제" 진술 삭제 — 룰이 없는 디자인 가이드는 conventions의 핵심.

## Edge Cases

- **conventions.md가 헤더만 있는 경우** (예: `nestjs/gcp`, `nextjs/nextauth`): skip하고 보고서에 "내용 없음" 마킹.
- **lint-rules-reference.md가 빈 섹션만 있는 경우**: 비교 의미 없음. skip.
- **stack에 lint-rules-reference.md가 없는 경우** (예: `flutter/easy-localization`): skip.
- **base의 룰을 stack/conventions가 자기 참조하는 경우** (예: `flutter/leaf-kit/conventions.md`가 `AL_E7`을 인용): base lint-ref와 비교해 같은 휴리스틱 적용.

## 출력 예시

```
== 분석 시작 (대상: flutter/all) ==
대상 쌍 3개: rules/flutter/{base,freezed,leaf-kit}
Skip 2개: rules/flutter/{easy-localization,go-router} (lint-rules-reference 없음)

== 분석 결과 ==

## flutter/base
**conventions.md**: 176줄 / **lint-rules-reference.md**: 312줄

### 강한 중복 (삭제 후보)
- L26: AL_E8 룰 ID 자기 참조 — 인용 부분만 제거
- L29-34: Adapter Private Methods 표 — adapters 글로서리 Contains와 동일
- L60-85: ProductPort + ProductApiAdapter 코드 — lint-ref Example과 동일

### 보존
- L1-19: common/ vs features/ scope 결정 — lint 미검사
- L36-52: UseCase Patterns + 코드 — 글로서리에 미수록 통합 예시
- ...

== 통계 ==
총 3 쌍 / 강한 중복 9곳 / 약한 중복 1곳 / 총 삭제 후보 ~46줄

옵션 선택: [모두 적용 / 그룹별 / 쌍 단위 / 취소]
```
