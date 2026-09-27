---
name: flutter-redesign-feature
description: Redesign an existing Flutter feature's UI (presentation/pages/views/widgets only) while preserving its bloc, domain, and infrastructure. Use when the user wants to apply a new design (Figma, Stitch, image, or text) to a feature without touching its business logic.
argument-hint: "<free-form text containing target feature + design source>"
---

# Flutter Feature Redesign Skill

기존 Flutter feature의 UI(`presentation/{pages,views,widgets}`)만 새 디자인으로 재작성한다. BLoC·domain·infrastructure는 절대 건드리지 않는다.

## Mandatory Docs

**BEFORE running this skill, you MUST first read:**

- @ARCHITECTURE.md — Hexagonal layer 구조와 의존 방향
- @CONVENTIONS.md — naming, port/adapter, BLoC 컨벤션
- @LINT.md — Layer 글로서리, 룰 표, 패키지 화이트/블랙리스트

## $ARGUMENTS Parsing

자유 형식 입력에서 두 가지를 식별한다.

### 1. 대상 feature 식별

다음 순서로 진행:

1. 입력 텍스트에서 한국어/영어 feature 키워드 추출
   - 예: `홈/home`, `상품/제품/product`, `주문/order`, `로그인/login`, `회원가입/signup`, `프로필/profile`, `설정/settings`, `검색/search`, `장바구니/cart` 등
2. 추출된 키워드(snake_case 변환 후)로 다음 glob 실행:
   ```
   <entry>/lib/features/**/<keyword>/presentation/bloc/<keyword>_bloc.dart
   ```
3. 매칭 결과:
   - **0개** → halt. AskUserQuestion으로 정확한 feature 폴더 경로 확인.
   - **1개** → 그 feature를 대상으로 확정.
   - **여러 개** → halt. AskUserQuestion으로 후보 리스트 제시 후 선택.

### 2. 디자인 소스 식별

| 입력 패턴 | 처리 방법 |
|---|---|
| `Stitch` + Project ID/Screen ID | `mcp__stitch__get_screen` (가용 시) → 결과의 hosted URL을 `curl -L`/WebFetch로 다운로드 후 시각 인식 |
| `https://www.figma.com/...` | WebFetch로 페이지 fetch |
| `.png`/`.jpg`/`.webp`/`.svg` 파일 경로 | Read tool (이미지 시각 인식) |
| 그 외 URL | WebFetch |
| 자유 텍스트 설명만 | 텍스트를 디자인 명세로 사용 |

여러 소스가 동시에 들어오면 모두 fetch한 뒤 종합한다.

## Redesign Scope

본 스킬이 **수정**할 수 있는 파일 범위 — import 제약은 별도로 architecture lint가 강제한다 (`@LINT.md` 참조).

### 수정 허용 (생성/수정/삭제 OK)

- `<entry>/lib/features/<feature>/presentation/pages/**`
- `<entry>/lib/features/<feature>/presentation/views/**`
- `<entry>/lib/features/<feature>/presentation/widgets/**`

### 수정 금지 (read-only — import 해서 사용만 OK)

- `<entry>/lib/features/<feature>/presentation/bloc/**` — BLoC Event/State는 **계약**. 시그니처 변경이 필요하면 본 스킬에서는 수정하지 않고 `// TODO(bloc):` 마커로 surface한다 ("Markers" 섹션 참조).
- `<entry>/lib/features/<feature>/domain/**`
- `<entry>/lib/features/<feature>/infrastructure/**`
- 다른 feature 전체
- `<entry>/lib/common/**`
- `<entry>/lib/di/**`
- `<entry>/lib/router/**`

> import 가능 여부는 `@LINT.md`의 `presentation`·`bloc`·`usecases`·`ports`·`adapters` 레이어 룰을 따른다. 본 스킬은 lint 룰을 복제·요약하지 않으며, 위반은 9단계 검증의 `dart analyze`에서 자동 검출된다.

## Markers (디자인 우선 + 사후 보완)

새 디자인이 현재 BLoC/도메인/디자인 토큰으로 완전히 표현되지 않아도 **UI 재작성을 끝까지 진행**한다. 부족한 부분은 코드에 마커를 남기고 9단계 보고서에 surface해서 별도 작업으로 보완한다.

| 마커 | 용도 | 예시 |
|---|---|---|
| `// TODO(bloc):` | 새 BLoC Event/State 또는 도메인 확장 필요 | `// TODO(bloc): HomeEvent에 RankingRefreshed 추가 필요` |
| `// FIXME(design):` | 미정의 디자인 토큰·공용 위젯 — 임시값 사용 중 | `// FIXME(design): primaryAccent 토큰 미정의, 임시 hex 사용` |
| `// NOTE(scope):` | 정보성 (예: common 승격 후보) | `// NOTE(scope): common 승격 후보` |

규칙:

- 마커 위치는 부족 동작이 발생하는 라인 바로 위.
- 빈 콜백·더미값·임시 hex를 두는 경우 **반드시** 마커를 동반.
- 보고서 단계에서 `grep -rn "TODO(bloc)\|FIXME(design)\|NOTE(scope)" <entry>/lib/features/<feature>/presentation` 결과를 그대로 노출 — 누락 방지.

## Workflow

### 0. Entry 디렉토리 감지

이후 모든 경로의 `<entry>` placeholder를 다음 규칙으로 결정:

1. `app/lib/` 디렉토리가 존재하면 → `<entry>` = `app` (Melos workspace 컨벤션).
2. 그렇지 않고 `lib/`이 존재하면 → `<entry>` = `.` (프로젝트 루트 = entry).
3. 둘 다 없으면 → halt. AskUserQuestion으로 entry 디렉토리 확인.

이후 단계에서 `<entry>/lib/...` 형식으로 표기된 경로는 위 규칙으로 치환되어 사용된다. `<entry>` = `.` 인 경우 `./lib/...` 또는 단순히 `lib/...`.

### 1. 입력 파싱

위 "$ARGUMENTS Parsing" 규칙으로 feature + 디자인 소스를 추출. 모호하면 즉시 halt + AskUserQuestion.

### 2. Mandatory Docs 로드

위 `@` eager imports로 자동 로드. 특히 `LINT.md`의 `presentation`·`bloc` 레이어 import 제약을 한 번 더 확인.

### 3. 계약 읽기 (수정 금지)

다음 파일을 Read로 모두 읽어 BLoC 계약을 머릿속에 적재:

- `<entry>/lib/features/<feature>/presentation/bloc/<feature>_state.dart`
- `<entry>/lib/features/<feature>/presentation/bloc/<feature>_event.dart`
- `<entry>/lib/features/<feature>/presentation/bloc/<feature>_bloc.dart`

State 필드 = UI에 노출되는 데이터.
Event = UI에서 dispatch 가능한 액션.

### 4. 기존 UI 스캔

`<entry>/lib/features/<feature>/presentation/{pages,views,widgets}/` 의 파일 트리만 파악(전체 내용 정독은 불필요). 어떤 위젯이 어떤 State 필드/Event를 사용 중인지 빠르게 매핑.

### 5. 디자인 소스 fetch

다운로드 데이터는 소스 종류별로 `/tmp/<source>_<feature>/` 디렉토리에 저장한다 (없으면 `mkdir -p`로 생성). 저장 경로는 9단계 보고서에 surface된다.

- Stitch: `mcp__stitch__get_project` + `mcp__stitch__get_screen` 호출. 결과를 `/tmp/stitch_<feature>/`에 저장.
  - 스크린샷(PNG): `/tmp/stitch_<feature>/<feature>.png` — `curl -L -o`로 hosted image URL 다운로드
  - HTML 코드 (Tailwind 마크업): `/tmp/stitch_<feature>/<feature>.html` — Stitch 응답에서 추출
- Figma: WebFetch로 디자인 페이지 fetch. 응답을 `/tmp/figma_<feature>/<feature>.html` (+ 추출 이미지 `<feature>.png`)로 저장.
- 이미지 경로 입력: Read만 (이미 디스크에 있음 — 별도 저장 불필요, 원본 경로를 그대로 보고서에 surface).
- 자유 텍스트: `/tmp/redesign_<feature>/spec.txt`로 저장.

### 6. Plan 제시 — **의무 컨펌**

다음 형식으로 계획을 출력하고 **사용자 승인 대기**. 승인 없이 다음 단계로 진행 금지.

```
## 작업 계획

대상 feature: <feature>
디자인 소스: <type + ref>

### 변경 파일
- pages/<feature>_screen.dart       (rewrite)
- views/<feature>_body_view.dart    (rewrite)
- widgets/<feature>_card.dart        (new)
- widgets/<feature>_old_banner.dart  (delete)

### State → UI 매핑
- <Feature>State.field1   →  <UI 요소>
- <Feature>State.field2   →  <UI 요소>

### Event → UI 트리거
- <Feature>Event.loadRequested   ←  initState
- <Feature>Event.refreshRequested ←  pull-to-refresh

### 마커 예정 (사후 보완 필요)
- TODO(bloc): <FeatureEvent>에 X 추가 — 디자인 Y 항목 위해 필요
- FIXME(design): <토큰명> 미정의 — 임시 hex 사용 예정
- (없으면 "없음")
```

AskUserQuestion으로 옵션 제시: ["진행", "수정 요청", "취소"].

### 7. 구현

허용 경로 안에서만 파일을 생성/수정/삭제. import 제약 준수. BLoC Event는 dispatch만, 비즈니스 결정 금지.

현재 BLoC/도메인/디자인 토큰으로 표현 불가능한 부분은 위 "Markers" 섹션의 컨벤션으로 마커를 남기고 진행한다. 빈 콜백·더미값·임시 hex에 마커 누락 금지.

### 8. 검증 (1단계)

`<entry>` 디렉토리에서 dart analyze 실행:

```bash
# <entry>가 'app'인 경우
cd app && dart analyze

# <entry>가 '.'인 경우 (루트)
dart analyze
```

- 에러 0이 되어야 통과.
- architecture lint 위반(레이어 import 제약 등)이 나오면 즉시 수정 후 재실행. 자동 수정 불가능하면 halt + 사용자 보고.

이어서 변경 범위 검사:

```bash
git diff --name-only
```

- 결과는 모두 `<entry>/lib/features/<feature>/presentation/(pages|views|widgets)/` 아래여야 한다.
- 다른 경로가 보이면 halt + AskUserQuestion: "범위 밖 변경 — 어떻게 처리할까요?" 옵션 ["롤백", "사용자 검토 후 결정"].

### 9. 보고서 출력

```
## 변경 파일
- pages/<feature>_screen.dart        (rewrite, 132→89줄)
- views/<feature>_body_view.dart     (rewrite)
- widgets/<feature>_card.dart        (new)
- widgets/<feature>_old_banner.dart  (delete)

## State → UI 매핑
- <Feature>State.field1 → <UI>

## Lint 결과
dart analyze: 0 errors, 0 warnings

## 디자인 소스 데이터
- /tmp/stitch_<feature>/<feature>.png    (Stitch 스크린샷)
- /tmp/stitch_<feature>/<feature>.html   (Stitch Tailwind HTML)
- /tmp/figma_<feature>/<feature>.html    (Figma 페이지)
- /tmp/redesign_<feature>/spec.txt       (자유 텍스트)
- /abs/path/to/input.png                  (이미지 경로 입력 — 원본)

## 사후 보완 항목 (마커)
- pages/<feature>_screen.dart:42  TODO(bloc): HomeEvent에 RankingRefreshed 추가 필요
- widgets/<feature>_card.dart:18  FIXME(design): primaryAccent 토큰 미정의, 임시 hex 사용
- (없으면 "없음" — `grep -rn "TODO(bloc)\|FIXME(design)\|NOTE(scope)"` 결과 그대로)
```

## Halt 조건 / Marker 처리

진짜 halt는 disambiguation·fetch 실패·자동 수정 불가 케이스만. BLoC/토큰 부족은 marker 삽입 후 자동 진행.

| 조건 | 처리 |
|---|---|
| feature 키워드 모호 / glob 결과 0개 또는 다중 | **halt** + AskUserQuestion (후보 리스트) |
| 디자인 소스 fetch 실패 | **halt** + "Stitch/Figma fetch 실패: <error>. 재시도 또는 다른 소스?" |
| `dart analyze` 에러를 자동 수정 불가 | **halt** + 에러 원문 제시 |
| `git diff`에 범위 밖 파일 존재 | **halt** + "범위 밖 변경: <파일 리스트>. 롤백할까요?" |
| 새 BLoC Event 필요 | `// TODO(bloc):` 마커 + 빈 콜백, 진행 |
| 새 BLoC State 필드 필요 | `// TODO(bloc):` 마커 + 더미값/생략 처리, 진행 |
| 새 공용 위젯 필요 | feature/widgets에 생성 + `// NOTE(scope): common 승격 후보`, 진행 |
| Theme 토큰 변경 필요 | `// FIXME(design):` 마커 + 임시값, 진행 |

## Usage Examples

### Stitch 디자인

```
/kelo:flutter-redesign-feature

## Stitch Instructions
Get the images and code for the following Stitch project's screens:

## Project
Title: <project title>
ID: <project id>

## Screens:
1. <screen name>
   ID: <screen id>

Use a utility like `curl -L` to download the hosted URLs. <feature 키워드> UI 변경 해줘
```

→ feature: 키워드에서 추출, source: Stitch (project/screen ID). `pages/<feature>_screen.dart` + `views/*` + `widgets/*` 재작성.

### Figma URL

```
/kelo:flutter-redesign-feature <figma URL> <feature 키워드> UI 새 디자인 적용해줘
```

→ source: Figma URL → WebFetch로 fetch.

### 로컬 이미지 파일

```
/kelo:flutter-redesign-feature <이미지 경로> <feature 키워드> 화면 이렇게 바꿔줘
```

→ source: 로컬 이미지 → Read로 시각 인식.

### 자유 텍스트 명세

```
/kelo:flutter-redesign-feature <feature 키워드> 화면을 <스타일 설명>으로 바꿔줘.
```

→ source: 텍스트 설명 그대로 디자인 명세로 사용.

## Notes

- 본 스킬은 **디자인 우선** — 현재 BLoC/도메인이 새 디자인을 완전히 지원하지 못해도, 부족한 부분을 마커("Markers" 섹션 참조)로 남기고 UI 재작성을 끝까지 진행한다. 사후 별도 작업으로 BLoC/토큰을 보완한다.
- `common/widgets/`·`common/theme/` 변경은 범위 밖. 새 공용 위젯이 명확히 필요하면 feature/widgets에 우선 둔 뒤 `// NOTE(scope): common 승격 후보` 마커로 표시한다.
- architecture lint 위반(특히 presentation 레이어가 도메인/인프라를 직접 import하는 경우)은 `dart analyze`로 자동 검출되며, 발견 시 즉시 수정 후 재검증한다.
