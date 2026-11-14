---
name: flutter-design
description: Create distinctive, production-grade Flutter interfaces with high design quality. Use when the user asks for a new visual design or design concept for a Flutter screen, widget, or app (not for routine widget edits or bug fixes). Produces a design concept that avoids generic AI aesthetics, optionally followed by an implementation plan (--plan).
---

이 스킬은 진부한 "AI 풍" 디자인을 피하고 디자인 완성도가 높은 프로덕션급 Flutter 인터페이스를 만들도록 안내한다. 미적 디테일과 창의적 선택에 세심하게 신경 쓰며 실제로 동작하는 Dart 코드를 작성한다.

사용자는 Flutter UI 요구사항(위젯·화면·앱·인터페이스)을 제시한다. 목적·대상 사용자·기술 제약 같은 컨텍스트가 함께 주어질 수 있다.

## Arguments

| Argument | Description                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| `--plan` | 디자인 컨셉을 출력한 뒤 Plan 에이전트를 호출해 상세 구현 계획을 만든다. 플래그가 없으면 디자인 컨셉만 출력. |

사용 예:

- `/flutter-design` → 디자인 컨셉만 (기본값)
- `/flutter-design --plan` → 디자인 컨셉 + Plan 에이전트

## 프로젝트 디자인 시스템

먼저 프로젝트가 쓰는 UI 기반을 확인하고, 그 위에서 디자인한다.

- **leaf-kit 스택** (`kelo.yaml` `stacks`에 `leaf-kit`, 또는 `pubspec.yaml`에 `flutter_leaf_kit`): 토큰·컴포넌트 API를 기억으로 쓰지 말고 `docs/CONVENTIONS.md`의 leaf-kit 섹션이 안내하는 `llms.txt`를 읽는다. 디자인 토큰(`context.leafColors`/`leafTypography`/`leafSpacing`/`leafRadius`/`leafElevation`/`leafDuration`), 테마(`LeafThemeData` + 컴포넌트 ThemeData), Atomic 컴포넌트 목록은 `llms/leaf_component/llms.txt`에 있다. 스타일 우선순위는 위젯 파라미터 > 컴포넌트 테마 > 글로벌 토큰.
- **그 외**: `lib/` 아래 기존 테마(`ThemeData`, `ColorScheme`, `ThemeExtension`)와 공용 위젯을 찾아 그 위에 쌓는다.

디자인이 새 토큰·테마 값을 요구하면 화면 코드에 hex를 흩뿌리지 말고 테마(`copyWith`/ThemeExtension) 변경으로 제안한다. 새 패키지(`google_fonts` 등)는 `pubspec.yaml`에 없으면 추가 전에 사용자에게 확인한다.

## 디자인 사고

코딩하기 전에 컨텍스트를 이해하고 **대담한** 미적 방향을 정한다:

- **목적**: 이 인터페이스는 어떤 문제를 푸는가? 누가 사용하는가?
- **톤**: 극단을 골라라 — 극단적 미니멀, 맥시멀리즘 카오스, 레트로 퓨처리즘, 유기적/자연스러움, 럭셔리/세련, 장난스러움/장난감 같음, 에디토리얼/매거진, 브루털리즘/날것, 아르데코/기하학, 부드러움/파스텔, 산업/실용 등 다양하다. 예시는 영감 용도로 쓰되 컨셉에 맞는 고유한 방향을 설계하라.
- **제약**: 기술 요구사항 (플랫폼·성능·접근성).
- **차별화**: 무엇이 이 인터페이스를 **잊을 수 없게** 만드는가? 사용자가 기억할 단 하나의 요소는?

**중요**: 분명한 컨셉 방향을 잡고 정밀하게 실행하라. 대담한 맥시멀리즘과 정제된 미니멀리즘 둘 다 통한다. 핵심은 강도가 아니라 **의도성**이다.

이어서 다음을 만족하는 Flutter/Dart 코드를 작성한다:

- 프로덕션급, 실제 동작
- 시각적으로 강렬하고 기억에 남음
- 명확한 미적 관점으로 일관됨
- 모든 디테일이 세심하게 다듬어짐

## Flutter 미적 가이드라인

집중할 영역:

- **타이포그래피**: `google_fonts` 패키지로 캐릭터 있는 폰트를 선택. Roboto나 시스템 폰트 기본값으로 후퇴하지 말 것. 임팩트 있는 디스플레이 폰트와 정제된 본문 폰트를 페어링. 고유 타입은 테마의 타이포그래피 토큰을 오버라이드해 적용 (leaf-kit: `LeafThemeData.copyWith()`).
- **컬러 & 테마**: 응집된 미적 방향에 commit. 팔레트는 테마 토큰으로 정의해 앱 전반의 일관성 확보 (leaf-kit: `LeafThemeData`의 `LeafColors`). 강한 도미넌트 컬러 + 날카로운 액센트가 미지근한 균등 팔레트보다 효과적. 디자인 비전을 살리는 `ColorScheme.fromSeed()` 또는 직접 다듬은 팔레트를 사용.
- **모션**: Flutter 애니메이션 시스템으로 효과·마이크로 인터랙션 구현. 디자인 시스템의 애니메이션 위젯·duration 토큰으로 일관된 타이밍 (leaf-kit: `LeafAnimated`, `leafDuration`). 복잡한 애니메이션은 `AnimationController` + `CurvedAnimation` 사용. 화면 전환에는 `Hero`. 임팩트 있는 한 순간(스태거드 리빌이 잘 짜인 화면 진입 등)이 흩어진 마이크로 인터랙션 여러 개보다 더 큰 인상을 만든다.
- **공간 구성**: `Stack`/`CustomMultiChildLayout`/`Transform`/`SliverAppBar`로 예측 못 한 레이아웃. 비대칭. `Positioned`로 오버랩. `Transform.rotate`로 사선 흐름. spacing 토큰으로 일관된 리듬. 넉넉한 여백 또는 통제된 밀도.
- **배경 & 시각 디테일**: 단색 배경에 의존하지 말고 분위기·깊이를 만든다. `BoxDecoration` 그라디언트, `CustomPainter`로 기하 패턴/텍스처, `ShaderMask`로 그라디언트 텍스트/마스크, `BackdropFilter`로 블러/글래스, elevation 토큰 섀도우로 레이어 깊이, `ClipPath`로 창의적 형태.

다음과 같은 진부한 AI풍은 **절대 사용 금지**: 손대지 않은 Material 기본 테마, 기본 AppBar 스타일이 그대로인 `Scaffold`, 시각 정제 없는 `ListView`, 남발된 컬러 스킴(특히 흰 배경 위 보라 그라디언트), 예측 가능한 레이아웃·위젯 패턴, 컨텍스트 특수성이 없는 쿠키 커터 디자인.

창의적으로 해석하고 컨텍스트에 맞춰 의도된 느낌의 예상 밖 선택을 하라. 어떤 디자인도 같으면 안 된다. 라이트/다크, 다른 폰트, 다른 미학을 다양화하라. 세대 간에 흔한 선택으로 수렴하지 마라.

**중요**: 구현 복잡도를 미적 비전에 맞춰라. 맥시멀리즘 디자인은 광범위한 애니메이션/이펙트를 갖춘 정교한 코드가 필요하고, 미니멀하고 정제된 디자인은 절제·정밀함·간격/타이포/디테일에 대한 세심한 주의가 필요하다. 우아함은 비전을 잘 실행하는 데서 나온다.

기억하라: Claude는 비범한 창의 작업을 할 수 있다. 자제하지 말고 박스 밖에서 사고하며 명확한 비전에 온전히 commit할 때 만들 수 있는 결과를 보여줘라.

## 구현 계획

> **참고**: 이 섹션은 `--plan` 인자가 제공된 경우에만 적용된다. `--plan`이 없으면 이 섹션 전체를 **건너뛰고** 디자인 컨셉만 출력 후 종료한다. Plan 에이전트를 호출하지 않는다.

`--plan`이 제공되면 위에서 디자인 컨셉 출력을 마친 뒤 Plan 에이전트를 호출해 상세 구현 계획을 만든다.

### 워크플로

1. **디자인 단계** (이 스킬): 디자인 컨셉 생성 — 미적 방향, 컬러 팔레트, 타이포그래피, 레이아웃 구성, 모션 디자인, 컴포넌트 매핑.
2. **계획 단계** (Plan 에이전트): 디자인 출력 전체를 Plan 에이전트에 넘겨 단계별 구현 계획을 받는다. _(`--plan` 사용 시에만)_

### 호출 방법

Agent 툴에 `subagent_type: "Plan"`을 지정하고 디자인 출력 전체를 prompt로 전달한다 (Claude Code 내장 에이전트 — 외부 플러그인 불필요). prompt에 포함할 내용:

- 디자인 컨셉 전체 (미적 방향, 컬러, 타이포그래피, 레이아웃, 모션 등)
- 대상 파일 경로 및 컴포넌트 구조
- 프로젝트 디자인 시스템 컨텍스트 (확인한 테마·토큰·컴포넌트와 그 출처 문서 경로)
- 사용자가 명시한 제약·요구사항

Task prompt 예시 구조:

```
다음 Flutter 디자인 컨셉을 기반으로 상세 구현 계획을 만들어줘:

[디자인 컨셉 출력 전체]

[확인한 디자인 시스템: 예) flutter_leaf_kit — 토큰·컴포넌트 문서 <llms.txt 경로>]

다음을 포함하는 단계별 구현 계획을 만들어줘:
- 파일 구조와 컴포넌트 계층
- 구현 순서 (의존성 순)
- 컴포넌트별 사용할 위젯·디자인 토큰
- 애니메이션·인터랙션 디테일
- 위험 영역과 기술적 고려사항
```

### 기대 출력

Plan 에이전트가 만들 결과물:

- **단계 분해**: 의존성 기반 구현 단계 정렬
- **파일별 계획**: 각 파일이 담는 내용과 책임
- **컴포넌트 매핑**: 디자인 시스템의 어떤 컴포넌트를 쓸지
- **토큰 사용**: 컴포넌트별 구체적 디자인 토큰 (color, spacing, typography, radius)
- **애니메이션 계획**: 모션 요소별 타이밍·커브·트리거 시점
