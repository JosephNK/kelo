---
name: dedupe-conventions
description: kelo 저장소 관리용. `rules/<framework>/<scope>/conventions.md`에서 lint가 이미 강제하는 내용(같은 framework의 `lint-rules-reference.md`에 있는 규칙)을 찾아 보고하고, 사용자 합의 후 conventions.md에서 제거한다. 룰 추가·수정 후 또는 conventions 정리 시 사용.
argument-hint: "<framework | all>  (flutter, nestjs, nextjs, all — 생략 시 all)"
---

# Dedupe Conventions

`conventions.md`는 소비 프로젝트 `docs/CONVENTIONS.md`로 생성돼 AGENTS.md가 매번 로드한다. 여기에는 **lint로 강제할 수 없는 팀 결정만** 둔다 (AGENTS.md "문서 원칙"). lint가 강제하는 규칙은 lint 메시지로 전달되므로, conventions.md에 다시 적으면 컨텍스트만 차지하고 동기화 부담이 생긴다.

이 skill은 중복을 찾아 보고하고, 합의된 부분만 `conventions.md`에서 지운다. `lint-rules-*.md`는 생성물이므로 수정하지 않는다.

## 대상

| 인자                            | 대상                              |
| ------------------------------- | --------------------------------- |
| (없음) / `all`                  | 세 framework 전부                 |
| `flutter` / `nestjs` / `nextjs` | 해당 framework의 base + 모든 스택 |

```bash
find rules/<framework|*> -maxdepth 2 -name conventions.md
```

비교 기준은 같은 framework의 모든 `lint-rules-reference.md`다 (base + 스택). 스택 conventions가 base 규칙을 재진술하는 경우도 잡기 위해, 스택 디렉터리에 lint-ref가 없어도 base lint-ref와 비교한다.

## 판정

**강한 중복 (삭제 후보)**

1. 룰 ID 인용 — `\b(AL|LK|FZ)_[ENS]\d+\b`, `\blocal/[\w-]+\b`, `\bboundaries/[\w-]+\b`. 문장 전체가 규칙 재진술이면 삭제, 근거 표기만 덧붙인 경우 ID 토큰만 제거.
2. 레이어 글로서리 재진술 — lint-ref "레이어 글로서리"의 `**Role**`·`**Contains**`·`**Constraints**`·코드 예시와 같은 의미의 prose나 코드.
3. 규칙 표·패키지 화이트/블랙리스트 재진술 — 예: "Port suffix 강제", "timestamptz 강제", 금지 패키지 목록.
4. 폴더 구조 설명 — `ARCHITECTURE.md`(경계 규칙에서 생성한 트리)와 겹치는 위치 안내.

**약한 중복 (사용자 판단)** — 다른 스택의 lint가 강제하는 내용을 base conventions가 재진술. 그 스택을 안 쓰는 프로젝트에는 conventions가 유일한 안내일 수 있다. 자동 삭제 금지.

**보존** — lint가 검사하지 않는 "언제·왜" 결정 (scope 선택 기준, DI 등록 방식), 운영 절차 (codegen 명령, i18n 등록), 외부 라이브러리 사용법, 테스트 전략, 글로서리에 없는 통합 예시.

## 절차

1. 대상 파일과 비교 기준 lint-ref 목록을 보여준다.
2. 파일별로 읽고 비교한다. 대상이 많으면 framework 단위로 subagent에 나눠 맡긴다 (두 파일 경로 + 위 판정 기준 + 아래 보고 형식 전달).
3. 보고:
   ```markdown
   ## <framework>/<scope> (conventions N줄)

   ### 강한 중복

   - L<a>-<b>: 요약 — 근거 (룰 ID / 글로서리 항목)

   ### 약한 중복

   - L<a>-<b>: 요약 — 의존 스택

   ### 보존

   - L<a>-<b>: 요약 — 사유
   ```
   마지막에 `강한 X곳 / 약한 Y곳 / 삭제 후보 ~Z줄`.
4. 적용 범위를 묻는다: 강한 중복 전부 / 파일 단위 선택 / 취소. 약한 중복은 따로 묻는다.
5. 합의된 부분만 지운다. 본문이 빈 섹션 헤더는 같이 지운다.
6. 검증:
   ```bash
   npm test
   node scripts/kelo.mjs setup -p example/<fw> --no-install --analysis-path rules/flutter/base/analysis/kelo_analysis
   ```
   example `docs/CONVENTIONS.md` 재생성 결과를 diff로 확인한다.
7. 파일별 +/- 줄 수를 보고한다. 커밋은 사용자가 요청할 때만.
