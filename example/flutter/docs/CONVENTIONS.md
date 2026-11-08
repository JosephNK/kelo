# Conventions

## common/ vs features/ Scope Rules

### common/services/ vs features/

| Location | When to use | Example |
|----------|-------------|---------|
| `common/services/` | Service used by **multiple features** or global infrastructure | Token storage, TTS, database, image compression, auth, gatekeeper |
| `features/<feature>/domain/ports/` | Port specific to **one feature's domain** | Product CRUD, order processing |

Both follow the same Port & Adapter pattern. The only difference is scope.

### common/services/ — FLAT vs nested layout

`common/services/<svc>/` 자체가 두 패턴을 지원한다. 서비스의 도메인 풍부도에 따라 선택:

| Pattern | When to use | Layout |
|---------|-------------|--------|
| **FLAT** (thin service) | 외부 시스템 1:1 wrapper, 자체 도메인 거의 없음 (token storage, TTS, image compression 등) | `<svc>/ports/<svc>_port.dart` + `<svc>/adapters/<svc>_adapter.dart` (+ optional `support/`) |
| **nested** (domain-rich subsystem) | 다수 feature가 의존하는 cross-cutting subsystem, 자체 entities/usecases/exceptions 보유 (auth, gatekeeper 등) | `<svc>/{entities,ports,adapters,usecases,exceptions}/` (+ optional `support/`) |

**Lint 적용 (양 모드 동일)**:

- AL_N1/N2/N3 — `Port`/`Adapter`/`UseCase` suffix 강제
- AL_E1 — `entities/`는 codegen annotation만 외부 import 허용
- AL_E4 — 도메인 4 레이어(entities/ports/usecases/exceptions)는 인프라 SDK 차단
- AL_E5 — `ports/`는 framework 패키지 차단
- AL_E6 — `common/services/`는 feature가 아니므로 cross-feature 위반 fire 안 함 → 모든 feature가 자유롭게 의존 가능
- LK_E3 — `bloc/` → `common/services/<svc>/usecases/`는 통과, `ports/`/`adapters/` 직접 import는 차단 (DI 경유 강제)

**선택 기준**:

- Adapter 1개 + 자체 도메인 타입 거의 없음 → **FLAT**
- 다수 feature가 의존 + 서비스가 자체 entities/usecases/exceptions 보유 → **nested**
- 의심되면 FLAT으로 시작하고, 자체 도메인이 늘어나면 nested로 promote

### common/widgets/ vs features/widgets/

| Location | When to use |
|----------|-------------|
| `features/<feature>/presentation/widgets/` | Widget used by **one feature only** |
| `common/widgets/` | Widget used by **2+ features** — promote from feature to common |

## Feature Types

| Type | Layers | Location | Description |
|------|--------|----------|-------------|
| Full-stack feature | domain/ + infrastructure/ + presentation/ | `features/<feature>/` | Has its own port, adapter, usecase, and UI |
| Presentation-only feature | presentation/ only | `features/<feature>/presentation/` | Reuses another feature's domain layer via its own bloc — bloc is required. |
| Shared domain module | entities/ + exceptions/ | `features/shared/domain/` | Shared domain objects with no full stack |

## UseCase Patterns

- Single responsibility: one business action per UseCase
- Execute via `call()` method (callable like a function)
- Omit parameters when none are needed
- Declare constructors as `const`

```dart
class CreateOrderUseCase {
  final OrderPort orderPort;
  const CreateOrderUseCase({required this.orderPort});

  Future<Order> call(CreateOrderParams params) async {
    return orderPort.createOrder(items: params.items);
  }
}
```

## Multi-Source Adapter

다수 데이터 소스(remote + local)는 단일 Adapter에서 결합 — 네트워크 실패 시 캐시 fallback.

```dart
// Local DB Adapter (동일 ProductPort 구현)
class ProductLocalAdapter implements ProductPort {
  final AppDatabase _db;
  const ProductLocalAdapter({required AppDatabase db}) : _db = db;

  @override
  Future<ProductPage> getProducts({required int page, required int limit}) async {
    final rows = await _db.productDao.getProducts(page: page, limit: limit);
    final total = await _db.productDao.count();
    return ProductPage(
      items: rows.map(_toProduct).toList(),
      total: total,
    );
  }

  Product _toProduct(ProductRow row) => Product(
    id: row.id, name: row.name, price: row.price, createdAt: row.createdAt,
  );
}
```

## DI Registration

| Scope | Registration | Target |
|-------|-------------|--------|
| Cross-app services | `registerLazySingleton` | Stateful services shared across features |
| Feature Adapter | `registerFactory` | Port implementations |
| UseCase | `registerFactory` | Business logic units |

```dart
final sl = GetIt.instance;

void setupDependencies() {
  sl.registerLazySingleton<TokenStoragePort>(() => TokenStorageAdapter());
  sl.registerFactory<ProductPort>(() => ProductAdapter());
  sl.registerFactory(() => GetProductsUseCase(productPort: sl()));
}
```

## Error Handling

| Layer | Responsibility |
|-------|---------------|
| Adapter (API) | Check response success. Throw `ServerException` for failures (403, 404, 429, 5xx). |
| Adapter (Local DB) | Catch DB exceptions. Throw `DatabaseException` for failures (not found, constraint violation, etc.). |
| UseCase | Let exceptions propagate. Add domain-specific validation errors if needed. |

```dart
class ServerException implements Exception {
  final String message;
  const ServerException(this.message);
  @override
  String toString() => message;
}

class DatabaseException implements Exception {
  final String message;
  const DatabaseException(this.message);
  @override
  String toString() => message;
}
```

## Test Strategy

- Mocking: `mocktail` (`Mock`, `when`, `verify`)
- Test file structure mirrors `lib/`

```dart
class MockProductPort extends Mock implements ProductPort {}

void main() {
  late MockProductPort mockPort;
  late GetProductsUseCase useCase;

  setUp(() {
    mockPort = MockProductPort();
    useCase = GetProductsUseCase(productPort: mockPort);
  });

  test('delegates to port with correct params', () async {
    when(() => mockPort.getProducts(page: 1, limit: 20))
        .thenAnswer((_) async => mockPage);
    final result = await useCase(const GetProductsParams());
    expect(result, mockPage);
    verify(() => mockPort.getProducts(page: 1, limit: 20)).called(1);
  });
}
```

## FlutterLeafKit

### LLM Documentation

이 라이브러리는 `llms.txt`를 제공합니다. 상세 API, 제공 패키지, 사용법은 아래 순서로 참조:

#### 1순위: 로컬 캐시

- **패키지 캐시 경로 찾기**: `{entry}/.dart_tool/package_config.json`에서 `flutter_leaf_kit`의 `rootUri` 확인
  - `package_config.json`에 없으면 `~/.pub-cache/git/`에서 `flutter_leaf_kit-*` 디렉토리 검색
- **Entry point 파일 확인**: `ls {package_root}/lib/` — 메인 + 영역별 sub-entrypoint (Entry Points 섹션 참조)
- **메인 인덱스**: `{package_root}/llms.txt`
- **서브 패키지별 문서**: `{package_root}/llms/{package}/llms.txt`
  - leaf, leaf_core, leaf_component, leaf_network, leaf_platform, leaf_route, leaf_state

#### 2순위: GitHub (로컬 캐시에 없을 때 fallback)

- **Repository**: `https://github.com/JosephNK/flutter_leaf_kit`
- **메인 인덱스**: `gh api repos/JosephNK/flutter_leaf_kit/contents/llms.txt --jq '.content' | base64 -d`
- **서브 패키지별 문서**: `gh api repos/JosephNK/flutter_leaf_kit/contents/llms/{package}/llms.txt --jq '.content' | base64 -d`
- **상세 문서**: 서브 패키지 llms.txt에 링크된 `.md` 파일도 동일 방식으로 읽기
  - 예: `gh api repos/JosephNK/flutter_leaf_kit/contents/llms/leaf_component/v2/atoms/text.md --jq '.content' | base64 -d`

### Entry Points

`flutter_leaf_kit` 패키지는 **메인 진입점 + 영역별 좁은 진입점** 9개를 제공합니다. 사용 영역에 맞는 좁은 진입점을 우선 선택하면 (1) 의도가 코드에 드러나고 (2) `architecture_lint` 룰과 자연스럽게 정렬됩니다.

| Entry Point | 사용 영역 |
|-------------|----------|
| `package:flutter_leaf_kit/flutter_leaf_kit.dart` | 일반 presentation (page/widget) — 영역 경계가 모호할 때 |
| `package:flutter_leaf_kit/flutter_leaf_kit_state.dart` | **bloc 레이어** — `Bloc`, `Emitter`, `BlocBaseState`, `BlocScreenConsumer` 등 |
| `package:flutter_leaf_kit/flutter_leaf_kit_component.dart` | UI 위젯 (`LeafText`, `LeafCard`, `LeafAppBar` 등) |
| `package:flutter_leaf_kit/flutter_leaf_kit_route.dart` | 라우팅 |
| `package:flutter_leaf_kit/flutter_leaf_kit_network.dart` | API adapter (`LeafDioSharedClient` 등) |
| `package:flutter_leaf_kit/flutter_leaf_kit_platform.dart` | platform service (`Config`, `Device`, `File` 등) |
| `package:flutter_leaf_kit/flutter_leaf_kit_manager.dart` | manager 의도 — `_platform`의 alias (export 동일) |
| `package:flutter_leaf_kit/flutter_leaf_kit_core.dart` | 유틸리티 (`Cancelable`, `Converter`, `LeafLogging` 등) |
| `package:flutter_leaf_kit/flutter_leaf_kit_datetime.dart` | DateTime extension 의도 — `_core`의 alias (export 동일) |

> **Alias entrypoint 주의**: `*_datetime.dart`/`*_manager.dart`는 의미적 별칭일 뿐 실제 심볼 set은 각각 `core`/`platform`과 동일. 한 파일에서 `*_datetime`과 `*_core`를 동시에 import하면 `ambiguous_export` 충돌이 날 수 있으니 둘 중 하나만 선택할 것.

> **선택 기준**: 단일 영역만 쓰면 sub-entrypoint(`*_state`/`*_network` 등) 우선. 한 화면에서 component + state + route를 함께 쓰면 메인 `flutter_leaf_kit.dart` 사용. Local DB/Platform adapter는 leaf_kit 대신 직접 SDK(drift/sqflite 등) 사용도 무방.

### Usage Rules

각 sub-package의 핵심 API. 추상 분류만 있는 항목(`leaf_core`/`leaf_platform`)은 `llms/{package}/llms.txt` 참조.

| Package | Key API |
|---------|---------|
| **leaf_state** | `LeafScreenStatefulWidget` / `LeafScreenState`로 Screen 정의. `BlocScreenConsumer<BlocType, StateType>`로 BLoC 소비. |
| **leaf_network** | `LeafDioSharedClient.shared.getService<T>()`로 service 호출. Response: `.isSuccessful`, `.isHttpUnauthorisedException`. 파일 업로드: `LeafMultipartFile.fromBytes()`. |
| **leaf_component** | `context.leafColors` / `context.leafTypography`로 색·타이포 접근. 컴포넌트 선택 정책은 **Component Selection** 섹션. |

### Component Selection

Flutter 기본 레이아웃/제스처 위젯(`Container`/`Row`/`Column`/`Stack`/`Padding`/`SizedBox`/`GestureDetector` 등)은 그대로 사용. 그 외 시각 컴포넌트는 `flutter_leaf_kit_component.dart`의 Leaf 컴포넌트 우선.

```dart
import 'package:flutter_leaf_kit/flutter_leaf_kit_component.dart';

// BAD
Text('Hello', style: TextStyle(fontSize: 16));

// GOOD
LeafText('Hello', style: context.leafTypography.bodyLg);
```

전체 컴포넌트 목록은 leaf-kit `llms/leaf_component/llms.txt` 참조. leaf_component에 동등 컴포넌트가 없을 때만 Flutter 기본/외부 패키지 사용 — 그 경우에도 색·타이포는 `context.leafColors`/`context.leafTypography`로 통일.

### Network (API 사용 시)

> 이 섹션은 Remote API를 데이터 소스로 사용하는 경우에 해당합니다. 로컬 DB만 사용하는 프로젝트에서는 적용하지 않습니다.

#### Initialization

`app.dart`에서 `LeafDioSharedClient` 초기화. 토큰 자동 refresh는 interceptor로 구성. 초기화 코드 패턴은 leaf-kit `llms/leaf_network/llms.txt` 참조.

#### Adapter Pattern

```dart
class ProductApiAdapter implements ProductPort {
  @override
  Future<ProductPage> getProducts({required int page, required int limit}) async {
    final service = LeafDioSharedClient.shared.getService<ProductService>();
    final response = await service.getProducts(page: page, limit: limit);

    if (response.isSuccessful && response.data?.data != null) {
      return ProductPage(
        items: response.data!.data!.items.map(_toProduct).toList(),
        total: response.data!.data!.total,
      );
    }
    if (response.isHttpUnauthorisedException) throw response.httpException!;
    throw ServerException(response.error?.error?.message ?? 'Failed');
  }
}
```

### BLoC

`presentation/bloc/`은 `flutter_leaf_kit_state.dart` 기반 상태 관리 레이어. usecase를 호출해 도메인 결과를 상태로 변환하고 view에 노출한다.

#### Dependency Rules

- bloc/ 이벤트 핸들러에 비즈니스 로직 금지 — usecase에 위임

#### Event Named Constructors

`{verb}Requested` 또는 `{verb}Changed` 패턴 사용:

| Action | Pattern | Example |
|--------|---------|---------|
| Initial load | `.loadRequested()` | `ProductEvent.loadRequested()` |
| Pull-to-refresh | `.refreshRequested()` | `ProductEvent.refreshRequested()` |
| Delete | `.deleteRequested()` | `ProductEvent.deleteRequested(id: id)` |
| Form input | `.{field}Changed()` | `LoginEvent.emailChanged(value: email)` |
| Submit | `.submitRequested()` | `LoginEvent.submitRequested()` |

#### Patterns

- `Bloc<Event, State>` 직접 상속 (별도 base class 없음)
- 생성자에서 이벤트 핸들러 등록: `on<EventType>(_handler)`
- 핸들러 네이밍: `_on{EventName}`
- 병렬 요청: `Future.wait()` 사용
- Pull-to-refresh: 이벤트에 `Completer<void>?` 전달해 완료 신호
- Stream 구독: `close()` override에서 반드시 cancel

```dart
class ProductBloc extends Bloc<ProductEvent, ProductState> {
  final GetProductsUseCase getProductsUseCase;

  ProductBloc({required this.getProductsUseCase})
      : super(const ProductInitial()) {
    on<ProductLoadRequested>(_onLoadRequested);
  }

  Future<void> _onLoadRequested(ProductLoadRequested event, Emitter<ProductState> emit) async {
    emit(const ProductLoading());
    try {
      final result = await getProductsUseCase(const GetProductsParams());
      emit(ProductLoaded(items: result.items));
    } on Exception catch (e) {
      emit(ProductError(message: e.toString()));
    }
  }
}
```

#### Communication

| Scenario | Pattern |
|----------|---------|
| Parent → Child BLoC | 생성자 또는 생성 시점 이벤트로 데이터 전달 |
| Sibling BLoCs | `common/events/` event bus — 한쪽이 발행, 다른 쪽이 구독 |
| Global state change (e.g., logout) | `Bloc.observer`가 `addError()` 패턴으로 처리 |

#### DI Registration

| Scope | Registration | Target |
|-------|-------------|--------|
| BLoC | `registerFactory` | 라우트마다 새 인스턴스 |

```dart
sl.registerFactory(() => ProductBloc(getProductsUseCase: sl()));
```

#### Routing with BLoC

`BlocProvider`로 라우트마다 BLoC 생성 + 초기 이벤트 디스패치:

```dart
GoRoute(
  path: '/products',
  pageBuilder: (context, state) => NoTransitionPage<void>(
    child: BlocProvider(
      create: (_) => sl<ProductBloc>()..add(const ProductLoadRequested()),
      child: const ProductScreen(),
    ),
  ),
),
```

#### Error Handling

| Layer | Responsibility |
|-------|---------------|
| BLoC | `on Exception catch (e)` 사용 → 에러 상태 emit. |

#### Test Patterns

- `tearDown`에서 `bloc.close()` 호출
- `setUpAll`에서 Freezed params용 `registerFallbackValue()` 호출

### Error Handling — 401 (API 사용 시)

> 이 섹션은 Remote API를 데이터 소스로 사용하는 경우에 해당합니다.

Adapter는 401에서 `response.httpException!`(=`LeafUnauthorisedException`)을 그대로 throw. 그 외 실패는 `ServerException` 또는 도메인 예외. BLoC에서 `LeafUnauthorisedException`을 catch하여 `addError(e, st)`로 위임 — `Bloc.observer`가 글로벌 logout 처리.

```dart
// BLoC 401 handling pattern
Future<void> _onLoadRequested(ProductLoadRequested event, Emitter<ProductState> emit) async {
  emit(const ProductLoading());
  try {
    final result = await getProductsUseCase(const GetProductsParams());
    emit(ProductLoaded(items: result.items));
  } on LeafUnauthorisedException catch (e, st) {
    addError(e, st);
  } on Exception catch (e) {
    emit(ProductError(message: e.toString()));
  }
}
```

### Presentation

**Screen** (`pages/`): `LeafScreenStatefulWidget` + `LeafScreenState<T>`. body는 `BlocScreenConsumer`로 BLoC 구독, scaffold/app bar는 base 메서드 override.

```dart
import 'package:flutter/material.dart';
import 'package:flutter_leaf_kit/flutter_leaf_kit.dart';

class ProductScreen extends LeafScreenStatefulWidget {
  const ProductScreen({super.key});

  @override
  State<ProductScreen> createState() => _ProductScreenState();
}

class _ProductScreenState extends LeafScreenState<ProductScreen> {
  @override
  Color? get backgroundColor => null;

  @override
  Widget? buildScreen(BuildContext context) {
    return BlocScreenConsumer<ProductBloc, ProductState>(
      builder: (context, state) => buildScaffold(context, state),
      successListener: (context, state) {},
    );
  }

  @override
  PreferredSizeWidget? buildAppBar(BuildContext context, Object? state) =>
      const ProductAppBar();

  @override
  Widget buildBody(BuildContext context, Object? state) => const ProductBodyView();
}
```

**View** (`views/`): StatelessWidget. 한 화면 내 논리적 섹션 분할용.
**Widget** (`widgets/`): StatelessWidget 또는 StatefulWidget. 재사용 컴포넌트.


---

## Project-specific

@CONVENTIONS.PROJECT.md

See [CONVENTIONS.PROJECT.md](./CONVENTIONS.PROJECT.md) for project-specific required reading.
