# Conventions

## 범위: common vs features

| 위치 | 언제 |
|---|---|
| `common/services/<svc>/` | 여러 feature가 쓰는 서비스·전역 인프라 (token storage, TTS, DB, auth 등) |
| `features/<feature>/domain/ports/` | 한 feature 도메인 전용 Port |
| `common/widgets/` | 2개 이상 feature가 쓰는 위젯 (feature에서 승격) |
| `features/<feature>/presentation/widgets/` | 한 feature 전용 위젯 |

- `common/services/<svc>/` 구조: 외부 시스템 1:1 wrapper면 **FLAT**(`ports/` + `adapters/`), 여러 feature가 의존하고 자체 entities/usecases/exceptions가 있으면 **nested**. 애매하면 FLAT으로 시작해 필요할 때 nested로 승격한다.

## Feature 유형

| 유형 | 구성 |
|---|---|
| Full-stack | `features/<feature>/` — domain + infrastructure + presentation |
| Presentation-only | `features/<feature>/presentation/`만 — 다른 feature의 도메인을 자체 bloc으로 사용 (bloc 필수) |
| Shared domain | `features/shared/domain/` — entities + exceptions만 |

## UseCase · Adapter · DI

- UseCase: 한 가지 비즈니스 동작, `call()`로 실행, 생성자는 `const`, 파라미터가 없으면 생략한다.
- remote + local 데이터 소스는 하나의 Adapter에서 결합한다 — 네트워크 실패 시 로컬 캐시로 fallback.
- DI(GetIt): 앱 공용 stateful 서비스는 `registerLazySingleton`, Adapter·UseCase는 `registerFactory`.

## 에러

- API Adapter: 응답 실패(403·404·429·5xx)면 `ServerException`을 throw한다.
- Local DB Adapter: DB 예외를 `DatabaseException`으로 변환한다.
- UseCase: 예외를 그대로 전파한다 (필요하면 도메인 검증 에러만 추가).

## 테스트

- `mocktail`로 mock하고, 테스트 파일 구조는 `lib/`를 그대로 따른다.

## FlutterLeafKit

### API 문서 (llms.txt)

상세 API·사용법·코드 예시는 라이브러리의 `llms.txt`에서 찾는다.

1. 로컬: `{entry}/.dart_tool/package_config.json`의 `flutter_leaf_kit` `rootUri`(없으면 `~/.pub-cache/git/flutter_leaf_kit-*`) → `{root}/llms.txt`, 서브 패키지는 `{root}/llms/{package}/llms.txt` (leaf, leaf_core, leaf_component, leaf_network, leaf_platform, leaf_route, leaf_state)
2. 로컬에 없으면 GitHub: `gh api repos/JosephNK/flutter_leaf_kit/contents/llms.txt --jq '.content' | base64 -d` (서브 패키지·링크된 `.md`도 같은 방식)

### Entry Points

영역에 맞는 좁은 진입점을 우선 쓴다. 한 파일에서 component + state + route를 함께 쓰면 메인 `flutter_leaf_kit.dart`.

| Entry Point (`package:flutter_leaf_kit/…`) | 사용 영역 |
|---|---|
| `flutter_leaf_kit.dart` | 일반 presentation (영역이 섞일 때) |
| `flutter_leaf_kit_state.dart` | bloc 레이어 (`Bloc`, `Emitter`, `BlocScreenConsumer` 등) |
| `flutter_leaf_kit_component.dart` | UI 위젯 (`LeafText`, `LeafCard`, `LeafAppBar` 등) |
| `flutter_leaf_kit_route.dart` | 라우팅 |
| `flutter_leaf_kit_network.dart` | API adapter (`LeafDioSharedClient`) |
| `flutter_leaf_kit_platform.dart` / `_manager.dart` | platform service (`_manager`는 alias) |
| `flutter_leaf_kit_core.dart` / `_datetime.dart` | 유틸리티 (`_datetime`은 alias) |

- alias 진입점(`_manager`·`_datetime`)과 원본을 한 파일에서 함께 import하지 않는다 (`ambiguous_export`).
- Local DB·Platform adapter는 leaf-kit 대신 SDK(drift/sqflite 등)를 직접 써도 된다.

### 컴포넌트

- 레이아웃·제스처 위젯(`Container`/`Row`/`Column`/`Stack`/`Padding`/`SizedBox`/`GestureDetector` 등)은 Flutter 기본, 그 외 시각 컴포넌트는 Leaf 컴포넌트 우선 (예: `Text` 대신 `LeafText('Hello', style: context.leafTypography.bodyLg)`).
- 색·타이포는 항상 `context.leafColors` / `context.leafTypography`. Leaf에 없는 컴포넌트만 Flutter 기본·외부 패키지를 쓴다.

### Network (Remote API를 쓸 때)

- `app.dart`에서 `LeafDioSharedClient`를 초기화한다 (토큰 refresh는 interceptor).
- Adapter: `LeafDioSharedClient.shared.getService<T>()`로 호출 → `response.isSuccessful`이면 도메인 객체로 변환, 401(`isHttpUnauthorisedException`)이면 `response.httpException!`을 그대로 throw, 그 외 실패는 `ServerException`.

### BLoC

- `Bloc<Event, State>`를 직접 상속, 생성자에서 `on<Event>(_on{EventName})` 등록. 비즈니스 로직은 usecase에 위임한다.
- 이벤트 이름: `{verb}Requested` / `{field}Changed` (`loadRequested`, `refreshRequested`, `deleteRequested`, `submitRequested`, `emailChanged`).
- 병렬 요청은 `Future.wait()`, pull-to-refresh는 이벤트에 `Completer<void>?`를 넘겨 완료 신호, stream 구독은 `close()`에서 cancel.
- 에러: `on Exception catch (e)` → 에러 상태 emit. 401(`LeafUnauthorisedException`)은 `addError(e, st)`로 넘겨 `Bloc.observer`가 전역 logout 처리.
- BLoC 간 통신: 부모→자식은 생성자·초기 이벤트, 형제는 `common/events/` event bus, 전역 상태 변화(logout 등)는 `Bloc.observer`.
- DI는 `registerFactory`(라우트마다 새 인스턴스), 라우트에서 `BlocProvider(create: (_) => sl<XBloc>()..add(const XLoadRequested()))`.
- 테스트: `tearDown`에서 `bloc.close()`, Freezed params는 `setUpAll`에서 `registerFallbackValue()`.

### Presentation

- Screen(`pages/`): `LeafScreenStatefulWidget` + `LeafScreenState<T>`, `buildScreen`에서 `BlocScreenConsumer<XBloc, XState>`로 구독하고 `buildAppBar`/`buildBody`를 override.
- View(`views/`): StatelessWidget — 한 화면의 논리적 섹션.
- Widget(`widgets/`): 재사용 컴포넌트.


---

## Project-specific

@CONVENTIONS.PROJECT.md

See [CONVENTIONS.PROJECT.md](./CONVENTIONS.PROJECT.md) for project-specific required reading.
