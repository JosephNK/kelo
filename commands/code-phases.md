# Phase 생성 커맨드

계획 문서(Plan)와 프로젝트 아키텍처/컨벤션을 분석하여, **구현 순서에 맞게 재정렬된 Phase 문서**를 생성합니다.

code-tasks가 PLAN → TASKS.md → Task 슬라이스를 만들듯, code-phases는 PLAN → PHASES.md → Phase 슬라이스를 만듭니다. PLAN은 읽기만 하고 수정하지 않습니다.

## 사용법

```
/kelo:code-phases <plan-file-path>
/kelo:code-phases code-harness/PLAN.md
/kelo:code-phases code-harness/PLAN.md -o code-harness/PHASES.md
```

## 인자

- `$ARGUMENTS` 첫 번째 값: 계획 문서 경로 (필수)
- `-o <path>`: 출력 파일 경로 (선택, 기본값: `code-harness/PHASES.md`)
- `-arch <path>`: 아키텍처 문서 경로 (선택, 기본값: `docs/ARCHITECTURE.md`)
- `-conv <path>`: 컨벤션 문서 경로 (선택, 기본값: `docs/CONVENTIONS.md`)

## 워크플로우

### Step 1: 인자 파싱 및 문서 로드

1. `$ARGUMENTS`에서 계획 문서 경로, `-o`, `-arch`, `-conv` 옵션 파싱
2. 계획 문서(PLAN.md) 읽기 — 파일이 없으면 에러 메시지 출력 후 종료
2-1. **디자인 계획 문서(PLAN-DESIGN.md) 자동 로드** — PLAN.md `## 트랙 모드` 섹션의 `디자인 계획 문서:` 필드를 확인:
   - 경로 값(예: `code-harness/PLAN-DESIGN.md`)이면 해당 파일을 추가로 읽어 `PLAN_DESIGN`으로 보관
   - "해당 없음" 또는 필드 자체가 없으면 `PLAN_DESIGN = null`
   - 포인터가 가리키는 파일이 없으면 경고 출력 후 `PLAN_DESIGN = null`. PLAN.md `디자인 도구 ≠ none` 일 때는 사용자에게 PLAN-DESIGN.md 누락을 알리고 진행 여부 확인
   - **구버전 호환**: PLAN.md에 `## 트랙 모드` 섹션 자체가 없으면 단일 파일 PLAN으로 간주하고 PLAN.md 본문에서 디자인 트랙 정보를 직접 추출 (Step 2의 폴백)
3. 아키텍처 문서 읽기 (`docs/ARCHITECTURE.md` 또는 `-arch` 경로)
   - 파일이 없으면 경고 출력 후 아키텍처 제약 없이 진행
   - 이 경우 Step 8의 아키텍처 기반 검증 항목은 `N/A (아키텍처 문서 없음)`으로 기록
4. 컨벤션 문서 읽기 (`docs/CONVENTIONS.md` 또는 `-conv` 경로)
   - 파일이 없으면 경고 출력 후 컨벤션 제약 없이 진행
   - 이 경우 Step 8의 컨벤션 기반 검증 항목은 `N/A (컨벤션 문서 없음)`으로 기록

### Step 2: 계획 문서 분석

계획 문서에서 다음 정보를 추출:

1. **프로젝트 개요**: 목적, 대상 사용자, 핵심 기능
2. **기술 스택**: 언어, 프레임워크, 주요 라이브러리
3. **기능 트랙 포함 여부**: PLAN.md `## 트랙 모드` 섹션의 `기능 트랙: yes | no` (누락 시 yes). 구버전 단일 파일 PLAN인 경우 `## 기능 트랙` 섹션의 `기능 트랙 포함:` 필드로 폴백
4. **디자인 도구**: PLAN.md `## 트랙 모드` 섹션의 `디자인 도구: figma | stitch | none` (누락 시 none). 구버전 단일 파일 PLAN인 경우 `## 디자인 트랙` 섹션의 `디자인 도구:` 필드로 폴백
5. **디자인 트랙 상세**: 디자인 도구 ≠ none 일 때 `PLAN_DESIGN`(PLAN-DESIGN.md)의 `## 디자인 트랙` 섹션에서 Figma URL+Frame 매핑 또는 Stitch 프롬프트 경로, 디자인 토큰 소스, 공통 컴포넌트 목록, 상태 계약 표, 위젯 교체 가능성을 추출. `PLAN_DESIGN = null` (구버전 또는 누락) 인 경우 PLAN.md `## 디자인 트랙` 섹션에서 폴백 추출
6. **Phase 블록 추출**: `## 3. Phased Implementation` 섹션 또는 `### 3. Phased Implementation` 섹션에서 `#### Phase N` 헤더 기준으로 각 블록을 분리
   - Phase 번호 (정수 또는 소수: Phase 0, Phase 1, Phase 0.5 등)
   - Phase 제목
   - 목표 (`- **목표**:`)
   - 영향 파일 (`- **영향 파일**:` 블록)
   - 완료 기준 (`- **완료 기준**:`)
   - 선언된 의존성 (`- **의존성**:`)

> **모드 판정**: (기능 트랙, 디자인 도구) 조합으로 Step 4의 기대 Phase 구성을 결정한다.
> **금지 모드**: `기능 트랙: no` + `디자인 도구: none` → 처리 범위 없음. 에러 출력 후 종료.

### Step 3: 아키텍처/컨벤션 매핑

아키텍처 문서와 컨벤션 문서를 **전체** 분석합니다. 상세 절차는 code-tasks.md Step 3와 동일하되, 결과는 Phase 단위 검증에 사용합니다.

#### 3-1. 아키텍처 분석

1. **레이어 구조 파악** (Presentation, Domain, Infrastructure 등)
2. **레이어 → 파일 경로 패턴 테이블 추출** — Step 8 경로 검증에 사용

   ```
   | 레이어 | 허용 경로 패턴 | 비고 |
   |--------|----------------|------|
   | Domain (Models) | src/lib/domain/models/** | |
   | UI (Shared)     | src/components/**        | |
   | Page            | src/app/**               | |
   ```

3. **의존성 방향 파악**
4. **PLAN의 `## 아키텍처 변경 필요` 섹션 확인**: 있으면 테이블에 `(PLAN 변경 승인됨)` 표기 추가. 없고 PLAN이 지시하는 경로가 기존 레이어에 없으면 Phase 재구성을 중단하고 PLAN 재작성 요청.

#### 3-2. 컨벤션 분석 — 헤딩 단위 강제 순회

컨벤션 문서의 **모든 `##`/`###` 헤딩**을 순회해 6개 카테고리로 분류 (code-tasks.md Step 3-2와 동일):
1. 의존성 규칙 / 2. 네이밍 규칙 / 3. 코드 패턴 / 4. 프레임워크 사용 규칙 / 5. 테스트 전략 / 6. 코드 생성

#### 3-3. Phase → 컨벤션 매핑 테이블

```markdown
| 컨벤션 규칙 | 적용 대상 Phase 유형 | 적용 방식 |
|------------|---------------------|----------|
| {레이어별 경로 제약} | 도메인/인프라/프레젠테이션 Phase | 영향 파일 경로 검증 |
| {base class 상속 규칙} | 프레젠테이션 Phase | Phase 설명에 명시 |
```

이 테이블은 Step 8 Self-Validation에서 참조합니다. PHASES.md 본문의 "4. 적용 컨벤션 요약"에 포함.

### Step 4: Phase 재정렬 및 수정

#### 4-A. 모드별 기대 Phase 구성

| 기능 트랙 | 디자인 도구 | 포함되어야 할 Phase 카테고리 |
|-----------|-------------|----------------------------|
| yes | none | 기반 → 도메인 → 인프라 → 프레젠테이션 → 통합 |
| yes | figma/stitch | 기반 → 도메인 → 인프라 → **디자인 시스템** → 프레젠테이션 → 통합 |
| no | figma/stitch | **디자인 시스템** → 프레젠테이션(리디자인) → 통합 |
| no | none | 금지 — 에러 출력 후 종료 |

각 Phase 블록을 아래 기준으로 카테고리에 분류:

- **기반**: 의존성/패키지/폴더/DB 스키마/설정 파일
- **도메인**: `domain/models/**`, `domain/ports/**`, `domain/services/**`, `domain/errors/**`
- **인프라**: `api/repositories/**`, `api/mappers/**`, `infrastructure/**`, 외부 SDK 래핑
- **디자인 시스템**: 디자인 토큰, 공통 컴포넌트(`components/ui/**`, `components/layout/**`), 디자인 소스 문서(`docs/stitch/*`, `docs/DESIGN.md`)
- **프레젠테이션**: `app/**/page.tsx`, `_components/**`, 라우팅/네비
- **통합**: 테스트, 문서, DI 등록, Lighthouse/빌드 검증

#### 4-B. Phase 정합성 검증 룰

아래 위반을 Phase 단위로 감지하고 자동 수정 또는 중단합니다.

**일반 의존성**

| ID | 위반 유형 | 감지 방법 | 수정 전략 |
|----|-----------|----------|-----------|
| V1 | 순환 의존 | topological sort 실패 | 중단하고 사용자 확인 요청 |
| V2 | 파일 참조 선행 누락 | Phase N의 영향 파일이 다른 Phase의 산출물을 참조, 선행 선언 없음 | 선행 Phase로 추가 |
| V3 | 선언/실제 의존성 불일치 | 영향 파일 경로로 역추적한 실제 의존 Phase와 선언이 다름 | `- **의존성**:` 항목 교정 |
| V4 | 레이어 경계 위반 | 한 Phase에 서로 다른 카테고리 파일이 섞여 있음 | Phase를 카테고리 단위로 split |
| V5 | 고아 Phase | 영향 파일 비어 있거나 다른 Phase가 참조 안 함 | 경고만 — 자동 삭제 안 함 |
| V6 | 죽은 의존성 | Phase N이 선언한 선행 Phase 산출물을 실제로 사용하지 않음 | 선언에서 제거 |

**디자인 트랙**

| ID | 위반 유형 | 감지 방법 | 수정 전략 |
|----|-----------|----------|-----------|
| V7 | 금지 모드 | 기능=no && 디자인=none | 중단 |
| V8 | 디자인 시스템 Phase 누락 | 디자인 도구≠none인데 디자인 토큰/공통 컴포넌트 Phase 없음 | 디자인 시스템 Phase 신규 삽입 (인프라 다음, 프레젠테이션 앞) |
| V9 | 디자인 소스 선행 위반 | screen/디자인시스템 Phase가 참조하는 문서(`docs/stitch/*.md` 등)가 선행 Phase에 없음. 마지막 "문서 최종화" Phase에서 신규 생성 패턴 금지 | **디자인 소스 준비 Phase**로 분리해 프레젠테이션 앞에 배치 |
| V10 | 디자인 소스 혼용 | 단일 screen Phase가 Figma + Stitch 둘 다 참조 | 경고만 — 사용자 결정 |
| V11 | 디자인 토큰 의존성 누락 | 프레젠테이션 Phase가 디자인 시스템 Phase를 선행으로 선언 안 함 | 선언 교정 |
| V12 | 디자인 시스템 Phase 위치 오류 | 디자인 시스템 Phase가 프레젠테이션 Phase 뒤에 있음 | topological sort로 앞당김 |

> 아키텍처 문서 없으면 V4 skip. 컨벤션 문서 없으면 V11 보조 검증 skip. 디자인 도구=none이면 V8~V12 skip.

#### 4-C. 재정렬 및 수정 실행

1. **Phase → 카테고리 분류** (Step 4-A)
2. **V1, V7 선제 검사** — 해당 시 즉시 중단
3. **V4 split, V8 신규 삽입** 우선 수행 (구조적 누락 보완)
4. **토폴로지 정렬** — 선언 의존성 기준, 같은 깊이는 카테고리 순(기반 → 도메인 → 인프라 → 디자인 시스템 → 프레젠테이션 → 통합), 같은 카테고리 내는 원본 PLAN 순서 유지
5. **V2, V3, V6, V11, V12** 자동 교정
6. **V5, V10** 경고만 (자동 수정 금지)

#### 4-D. Phase 번호 정책

재정렬 후 **원래 번호를 유지**합니다 (Phase 0, 4, 2 같은 비연속 순서 허용). 신규 삽입 Phase는 앞 Phase 번호 + 0.5 식으로 부여 (예: Phase 0.5, Phase 2.5). 번호 재부여는 하지 않습니다.

### Step 5: Phase 상세 작성

각 Phase를 다음 양식으로 작성합니다:

```markdown
#### Phase N: {제목}

**카테고리**: 기반 / 도메인 / 인프라 / 디자인 시스템 / 프레젠테이션 / 통합
**선행 Phase**: {의존하는 Phase 번호 목록 또는 "없음"}
**디자인 소스** (디자인 시스템/프레젠테이션 + 디자인 도구 ≠ none 일 때):
- figma: Figma Frame `{node-id}`
- stitch: `docs/stitch/{name}.md`
- 예외: `없음 — {사유}`

**목표**:
{1~2문장}

**영향 파일**:
- `path/to/file` (신규|수정) — {역할 설명}

**참조 산출물** (이 Phase 시작 전에 필요한 선행 산출물):
- `path/to/source.md` — {이미 존재 또는 선행 Phase N에서 생성}
- 없으면 "없음"

**적용 컨벤션** (Step 3-3 매핑에서 해당 규칙):
- {규칙 1} → {구체적 적용 방법}

**완료 기준**:
- [ ] {검증 가능한 기준}
- [ ] 빌드 성공 (프로젝트 lint/build 명령)
- [ ] 컨벤션 준수 확인
```

원본 Phase 블록에 없는 필드는 추론해 채우되 근거가 약하면 `TODO: 사용자 확인 필요`로 표기.

### Step 6: 의존 관계 그래프 생성

Phase 간 의존 관계를 ASCII 트리로 시각화:

```
Phase 0 — 재활용 준비
  └→ Phase 0.5 — 디자인 소스 준비
       └→ Phase 1 — 도메인/인프라
            ├→ Phase 2 — i18n
            └→ Phase 4 — Shared UI
                 └→ Phase 5 — 홈 컴포지션
                      └→ Phase 7 — Page 통합
```

### Step 7: PHASES.md 조립

최종 Phase 문서를 다음 구조로 조립합니다. 실제 파일 저장은 Step 8 검증을 통과한 뒤 Step 9에서 수행합니다.

```markdown
# {프로젝트명} Phases

## 1. 개요
{계획 문서에서 추출한 프로젝트 개요}

## 2. 기술 스택
{사용 기술 목록 + 기능 트랙/디자인 도구 모드 표기}

## 3. 아키텍처 요약
{아키텍처 문서에서 추출한 레이어 구조, 의존성 방향, 핵심 패턴. PLAN의 `## 아키텍처 변경 필요`가 있으면 반영}

## 4. 적용 컨벤션 요약
{컨벤션 문서에서 추출한 핵심 규칙 — Step 3-3 매핑 테이블}

## 5. Phase 목록 (구현 순서)

| # | Phase | 카테고리 | 선행 |
|---|-------|---------|------|
| 1 | Phase 0: 재활용 준비 | 기반 | 없음 |
| 2 | Phase 0.5: 디자인 소스 준비 | 디자인 시스템 | Phase 0 |
| ... | ... | ... | ... |

## 6. Phase 상세

#### Phase 0: 재활용 준비
...

#### Phase 0.5: 디자인 소스 준비
...

## 7. 의존 관계 그래프
{ASCII 트리}

## 8. 재정렬/수정 이력

재정렬 전후 Phase 순서와 적용된 수정 룰(V1~V12):

- 원 순서: Phase 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
- 새 순서: Phase 0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
- 적용 룰:
  - [V9] Phase 10 → Phase 0.5 신규 삽입 (디자인 소스 선행)
  - [V3] Phase 5 의존성 선언에 Phase 4 추가
- 스킵 룰:
  - V4 (아키텍처 문서 없음)

## 9. 리스크
{식별된 리스크와 대응 방안. PLAN에 `### 2. Risks & Decisions`가 있으면 해당 내용 반영}
```

### Step 8: Self-Validation (저장 전 필수 검증)

PHASES.md를 저장하기 **전에** 아래 체크리스트를 순회합니다. 하나라도 실패하면 수정 후 재검증.
Step 1에서 아키텍처/컨벤션 문서가 없어 경고 후 진행한 경우, 해당 문서에 의존하는 항목은 `N/A`로 기록.

#### 8-1. 재정렬 검증

- [ ] Phase 간 순환 의존이 없는가? (topological sort 성공)
- [ ] 모든 Phase의 `선행 Phase`가 재정렬 후에도 선행 위치에 있는가?
- [ ] 의존 관계 그래프와 각 Phase의 `선행 Phase` 필드가 일치하는가?

#### 8-2. 모드 일관성 검증

- [ ] 금지 모드(기능=no + 디자인=none)가 아닌가?
- [ ] 디자인 도구 ≠ none 이면 "디자인 시스템" Phase가 1개 이상 있는가?
- [ ] 기능 트랙 = yes 이면 기반/도메인/인프라/프레젠테이션/통합 카테고리 각 1개 이상 있는가?
- [ ] 기능 트랙 = no 이면 기반/도메인/인프라 카테고리 Phase가 없는가?

#### 8-3. 레이어 경계 검증 (아키텍처 문서 있을 때만)

- [ ] 각 Phase의 영향 파일 경로가 Step 3-1 "레이어 → 허용 경로 패턴" 테이블 중 하나에 매칭되는가?
- [ ] 매칭되지 않는 경로가 있으면 PLAN의 `## 아키텍처 변경 필요` 섹션에 명시되어 있는가?
- [ ] 한 Phase가 복수 카테고리에 걸친 영향 파일을 갖고 있지 않은가?

#### 8-4. 디자인 트랙 검증 (디자인 도구 ≠ none 일 때만)

- [ ] 로컬 디자인 소스 파일(`docs/stitch/*.md`, `docs/DESIGN.md`)을 참조하는 모든 Phase에서 해당 파일이 이미 존재하거나 선행 Phase에서 생성되는가?
- [ ] 디자인 소스 준비 Phase가 필요한 경우, 디자인 시스템/프레젠테이션 Phase보다 먼저 배치되어 있는가?
- [ ] 프레젠테이션 Phase의 선행에 "디자인 시스템" Phase가 포함되어 있는가?
- [ ] 각 screen 관련 Phase가 **단일 디자인 소스**만 참조하는가?
- [ ] 디자인 도구 ≠ none 인 모든 디자인 시스템/프레젠테이션 Phase에 "디자인 소스" 필드가 있거나 예외 사유가 명시되어 있는가?

#### 8-5. 구조적 검증

- [ ] 모든 Phase가 완료 시점에 빌드가 깨지지 않는 순서인가?
- [ ] 후속 Phase 입력으로 쓰이는 문서/스키마/설정 파일이 마지막 "문서 최종화" Phase에서 처음 생성되지 않는가?
- [ ] 각 Phase의 "참조 산출물"이 이미 존재하거나 선행 Phase에서 생성되는가?
- [ ] Phase 번호가 Step 4-D 정책(원 번호 유지, 삽입 시 .5)과 일치하는가?

### Step 9: 저장 및 Phase 슬라이싱

#### 9-1. PHASES.md 저장

Step 8 검증을 모두 통과한 Phase 문서를 `-o` 경로(기본: `code-harness/PHASES.md`)에 저장합니다.

#### 9-2. Phase 단위 슬라이스 생성

저장 직후 PHASES.md를 Phase 단위로 분할해 슬라이스 파일을 생성합니다.

**슬라이스 출력 디렉토리** (출력 파일 경로 기반):

```
slice_dir = <dirname of OUTPUT> / <basename(OUTPUT) lowercase, .md 제거> /
```

- 단, 출력 파일명이 정확히 `PHASES.md`이면 slice_dir은 `<dirname of OUTPUT>/phases/`를 사용.
- `code-harness/PHASES.md` → `code-harness/phases/`
- `path/to/MyPhases.md` → `path/to/myphases/`

**실행**:

실행 전에 `slice-phases.mjs`의 존재 여부와 실행 권한을 확인합니다. 스크립트가 없거나 실행할 수 없으면 경고 후 PHASES.md 저장은 유지.

```bash
KELO_DIR=$(jq -r '.plugins["kelo@kelo"][0].installPath' ~/.claude/plugins/installed_plugins.json)
$KELO_DIR/scripts/slice-phases.mjs --mode compact <OUTPUT> <slice_dir>
```

스크립트 수행 내용:
1. `#### Phase N` 헤더 기준으로 분할 (정수 + 소수 지원: Phase 0, Phase 0.5)
2. compact 모드 — 공통 컨텍스트(개요, 기술 스택, 아키텍처, 컨벤션, Phase 목록) + 해당 Phase 상세 + 관련 리스크
3. 슬라이스 첫 줄에 메타 주석 (`<!-- sliced from ... @ sha ... -->`)
4. Phase ID 메타 (`<!-- phase-id: Phase N -->`, `<!-- slice-mode: compact -->`)
5. 입력에 더 이상 존재하지 않는 Phase 슬라이스 자동 제거 (stale)

**예시 출력**:
```
code-harness/phases/Phase-0.md
code-harness/phases/Phase-0.5.md
code-harness/phases/Phase-1.md
...
```

> 슬라이싱 실패 시 경고하되 PHASES.md 저장은 유지.

### Step 10: 완료 보고

- 생성된 PHASES.md 파일 경로 출력
- 생성된 슬라이스 디렉토리 경로 + 슬라이스 개수 출력
- Phase 총 개수, 카테고리별 분포 요약
- 재정렬 전후 Phase 순서 diff
- 적용된 수정 룰(V1~V12) 목록 + 스킵된 룰 목록
- Step 8 검증 결과 요약 (전체 통과 / N/A 항목)
- 커밋은 하지 않음 — 사용자가 직접 커밋
- **다음 단계 안내**: `/kelo:code-qa {OUTPUT}` 실행으로 Phase 단위 QA 체크리스트 문서 생성 가능

## 주의사항

- PLAN 문서는 **읽기 전용** — 절대 수정하지 않음
- PLAN에 없는 기능을 추가하지 않음 (Phase 신규 삽입은 **구조적 누락 보완** 목적으로만, 신기능 도입 금지)
- 디자인 소스 혼용(V10), 고아 Phase(V5)는 자동 수정 금지 — 사용자 결정
- 재정렬 기준은 "구현 순서"지 "선호 순서"가 아님
- Phase 순서/선언 수정은 PHASES.md에만 반영 — PLAN은 그대로
