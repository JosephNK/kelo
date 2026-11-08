# Lint Rules Reference (flutter/base)

## 레이어 글로서리 (Layer Glossary)

각 레이어의 책임·포함 파일·제약·대표 코드 형태. `boundary_element.dart`의 `projectBoundaryElements`로 분류된 파일별 룰 적용 범위를 `layer_semantics.dart`(Role/Contains/Example) + `lints/*.dart`(Constraints)로 채운다.

### `entities`

**Role** — 도메인 Entity · Value Object · 공용 타입. 프레임워크 비의존 순수 Dart로 비즈니스 규칙의 단일 진실 공급원이자 가장 안정적인 레이어.

**Contains**

- Entity — `*.dart`
- Value Object — `*.dart`
- 도메인 상수·공용 타입 — `*.dart`

**Constraints**

- `AL_E1` (error) — codegen annotation 패키지만 외부 import 허용 — 도메인 순수성 유지.

```dart
// entities/order.dart
class Order {
  const Order({
    required this.id,
    required this.items,
    required this.status,
  });

  final String id;
  final List<OrderItem> items;
  final OrderStatus status;
}
```

### `ports`

**Role** — 도메인과 인프라 사이의 abstract interface. 도메인 타입만 시그니처에 노출하여 구현 교체·테스트 용이성을 보장.

**Contains**

- Port — `*_port.dart` (`abstract class {Name}Port`)

**Constraints**

- `AL_E5` (error) — framework 패키지(flutter/dio 등) import 금지 — 시그니처에 framework 타입 노출 차단.
- `AL_N1` (warning) — 클래스명에 `Port` suffix 필수 (예: `AuthPort`, `UserRepositoryPort`).

```dart
// ports/product_port.dart
abstract class ProductPort {
  Future<ProductPage> getProducts({required int page, required int limit});
  Future<Product> getProductById({required String id});
}
```

### `usecases`

**Role** — 비즈니스 로직 단위. Port를 주입받아 도메인 동작을 조합하며, UI/인프라 없이 단독 단위 테스트 가능.

**Contains**

- UseCase — `*_usecase.dart` (`class {Verb}{Noun}UseCase`)
- UseCase Params — inline 또는 `*_params.dart` (`class {Verb}{Noun}Params`)

**Constraints**

- `AL_E2` (error) — `entities/`/`ports/`/`exceptions/`만 import 허용 — adapters/presentation 금지.
- `AL_N3` (warning) — 클래스명에 `UseCase` 또는 `Params` suffix 필수 (예: `GetUserUseCase`, `GetUserParams`).

```dart
// usecases/get_products_usecase.dart
class GetProductsUseCase {
  const GetProductsUseCase({required this.productPort});
  final ProductPort productPort;

  Future<ProductPage> call(GetProductsParams params) =>
      productPort.getProducts(page: params.page, limit: params.limit);
}
```

### `adapters`

**Role** — Port 구현체. Remote API · Local DB · Platform SDK 등 외부 데이터 소스와 통신하고 raw 데이터 → Entity 변환을 책임진다.

**Contains**

- Adapter — `*_adapter.dart` (`class {Name}Adapter implements {Name}Port`)
- 변환 메서드 — `_to{Entity}()`, `_parse{Name}()`

**Constraints**

- `AL_N2` (warning) — 클래스명에 `Adapter` suffix 필수 (예: `AuthAdapter`, `ApiUserAdapter`).

```dart
// adapters/product_api_adapter.dart
class ProductApiAdapter implements ProductPort {
  @override
  Future<ProductPage> getProducts({required int page, required int limit}) async {
    final res = await apiClient.getProducts(page: page, limit: limit);
    if (res.isSuccessful && res.data != null) {
      return ProductPage(items: res.data!.items.map(_toProduct).toList(), total: res.data!.total);
    }
    throw ServerException(res.error?.message ?? 'Failed');
  }

  Product _toProduct(ProductDto dto) => Product(id: dto.id, name: dto.name);
}
```

### `bloc`

**Role** — UI 상태 관리 (flutter_bloc). UseCase를 호출하여 데이터를 받고 Event → State 전환만 담당하는 얇은 계층.

**Contains**

- Bloc/Cubit — `*_bloc.dart` / `*_cubit.dart`
- Event — `*_event.dart`
- State — `*_state.dart`

```dart
// bloc/product_bloc.dart
class ProductBloc extends Bloc<ProductEvent, ProductState> {
  ProductBloc({required this.getProducts}) : super(const ProductInitial()) {
    on<ProductLoadRequested>((event, emit) async {
      emit(const ProductLoading());
      final page = await getProducts(GetProductsParams(page: event.page));
      emit(ProductLoaded(page));
    });
  }

  final GetProductsUseCase getProducts;
}
```

### `exceptions`

**Role** — 도메인 특화 예외. UseCase 경계에서 throw하고 presentation에서 사용자 메시지로 매핑.

**Contains**

- Exception — `*_exception.dart` (`class {Name}Exception implements Exception`)

```dart
// exceptions/server_exception.dart
class ServerException implements Exception {
  const ServerException(this.message);
  final String message;
  @override
  String toString() => message;
}
```

### `presentation`

**Role** — UI 레이어. Screen(라우트 진입점) · View(논리적 섹션) · Widget(재사용 컴포넌트)으로 분할. Bloc을 통해 상태를 구독하고 사용자 입력을 이벤트로 전달.

**Contains**

- Screen (라우트 진입점) — `*_screen.dart` (`pages/`)
- View (StatelessWidget 섹션) — `*_view.dart` (`views/`)
- Widget (재사용 컴포넌트) — `*_{purpose}.dart` (`widgets/`)

**Constraints**

- `AL_E8` (error) — presentation/은 `adapters`/`ports` 직접 import 및 인프라 SDK import 금지.

```dart
// pages/product_screen.dart
class ProductScreen extends StatelessWidget {
  const ProductScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => sl<ProductBloc>()..add(const ProductLoadRequested(page: 1)),
      child: const ProductBodyView(),
    );
  }
}
```

## 규칙 (Rules)

base 룰 13개. stack-specific 룰(예: bloc)은 별도 패키지에 분리. 시각화된 의존 다이어그램은 `lint-rules-diagram.md` 참조.

| ID | Severity | Layer | 설명 | 참조 |
| --- | --- | --- | --- | --- |
| AL_E1 | error | `entities` | codegen annotation 패키지만 외부 import 허용 — 도메인 순수성 유지. | `codegenPackages` |
| AL_E2 | error | `usecases` | `entities/`/`ports/`/`exceptions/`만 import 허용 — adapters/presentation 금지. | — |
| AL_E4 | error | `domainLayers` | 도메인 레이어(entities/ports/usecases/exceptions)는 인프라 SDK import 금지. | `infraPackages`, `domainLayers` |
| AL_E5 | error | `ports` | framework 패키지(flutter/dio 등) import 금지 — 시그니처에 framework 타입 노출 차단. | `frameworkPackages`, `infraPackages` |
| AL_E6 | error | (all features) | feature 간 cross-import는 `entities/`와 다른 feature `domain/`만 허용. | `crossFeatureForbidden` |
| AL_E7 | error | (all) | bare `catch` 금지 — `on ExceptionType catch (e)` 형태 강제. | — |
| AL_E8 | error | `presentation` | presentation/은 `adapters`/`ports` 직접 import 및 인프라 SDK import 금지. | `infraPackages` |
| AL_E9 | error | (all) | presentation/views/와 presentation/pages/에서 private widget 클래스 선언 금지. | — |
| AL_N1 | warning | `ports` | 클래스명에 `Port` suffix 필수 (예: `AuthPort`, `UserRepositoryPort`). | — |
| AL_N2 | warning | `adapters` | 클래스명에 `Adapter` suffix 필수 (예: `AuthAdapter`, `ApiUserAdapter`). | — |
| AL_N3 | warning | `usecases` | 클래스명에 `UseCase` 또는 `Params` suffix 필수 (예: `GetUserUseCase`, `GetUserParams`). | — |
| AL_S1 | warning | (all) | 파일당 800줄 초과 금지 (codegen 산출물 `*.g.dart` 등 제외) — 단일 책임 위반 신호. | `maxFileLines`, `generatedFileSuffixes` |
| AL_S2 | error | `other` | `app/lib/` 안에서 boundary 외 경로 금지 — 구조 일관성 강제. | — |

## 패키지 화이트/블랙리스트

### `codegenPackages`

entities/ 레이어에서 **유일하게 허용되는** 외부 패키지들.

entities는 순수 Dart 도메인 모델이어야 하지만, 코드 생성(freezed/json) 기반
불변 모델 정의는 현실적으로 필요. 따라서 코드 생성 어노테이션 패키지만 예외 허용.
런타임 로직을 포함한 패키지(dio, flutter 등)는 여기 들어오면 안 됨.

- `freezed_annotation`
- `json_annotation`
- `meta`
- `collection`

### `infraPackages`

도메인 레이어에서 금지되는 "인프라" 패키지 목록.

이 패키지들은 외부 세계(네트워크/DB/저장소/Firebase 등)와 직접 통신하므로
도메인(entities/ports/usecases/exceptions)에 섞이면 테스트 용이성과 이식성이 깨진다.
adapters/ 레이어에서 Port 구현체로만 사용해야 한다.

- `dio`
- `http`
- `retrofit`
- `chopper`
- `drift`
- `sqflite`
- `isar`
- `hive`
- `hive_flutter`
- `floor`
- `objectbox`
- `flutter_secure_storage`
- `shared_preferences`
- `firebase_core`
- `firebase_auth`
- `firebase_messaging`
- `cloud_firestore`

### `frameworkPackages`

ports/ 레이어에서 금지되는 "프레임워크" 패키지 목록.

Port는 도메인 인터페이스이므로 인프라 SDK는 물론 flutter(위젯/BuildContext 등)
도 시그니처에 노출되면 안 된다. (flutter 자체도 "프레임워크"로 분류하여 차단)

- `flutter`
- `dio`
- `http`
- `retrofit`
- `chopper`
- `drift`
- `sqflite`
- `isar`
- `hive`
- `hive_flutter`
- `floor`
- `objectbox`
- `flutter_secure_storage`
- `shared_preferences`
- `firebase_core`
- `firebase_auth`
- `firebase_messaging`
- `cloud_firestore`

## 레이어 집합 상수

### `domainLayers`

"도메인 레이어"로 간주되는 디렉토리 이름 집합.
E4 룰(도메인 순수성 검사)이 이 집합에 속한 파일에만 적용된다.

- `entities`
- `ports`
- `usecases`
- `exceptions`

### `crossFeatureForbidden`

다른 feature에서 cross-import 하면 안 되는 내부 레이어 (base).

feature 간 결합을 entities(공용 도메인 타입) 수준으로만 제한하여
기능 모듈을 독립적으로 변경/삭제할 수 있도록 한다.
ports/adapters/usecases는 feature 전용 내부 계약이므로 cross-import 금지.
stack-specific 추가 차단(예: bloc)은 별도 패키지가 자체 룰로 강제.

- `ports`
- `adapters`
- `usecases`

## 자동 생성 파일 제외 패턴

### `generatedFileSuffixes`

S1 룰에서 라인 수 검사를 건너뛰는 자동 생성 파일 suffix.

build_runner / freezed / auto_route / injectable / mockito가 만들어내는
파일은 사람이 분할할 수 없고 800줄을 쉽게 넘기므로 검사 제외.

- `.g.dart`
- `.freezed.dart`
- `.gr.dart`
- `.config.dart`
- `.mocks.dart`


# Lint Rules — Structure Reference (flutter/base)

## 개요

아키텍처 boundary 정의 — 각 layer ↔ 경로 패턴 매핑. `boundary_element.dart`의 `projectBoundaryElements`가 lint 분류와 doc 트리의 단일 source이며, `structure_annotation.dart`가 placeholder/하위 폴더 의도를 트리에 보강한다.

## 프로젝트 구조

> 아래 트리는 **대표 구조 예시**입니다. lint는 glob(`**`, `*`) 기반으로 매칭하므로 `<feature>`, `<service>`, `<package>` 같은 placeholder 세그먼트의 실제 이름은 프로젝트마다 다를 수 있습니다.

```
Root (Melos workspace)
├── app/
│   └── lib/
│       ├── common/                       # 모든 feature 공유
│       │   ├── database/                 # 로컬 DB 테이블/DAO/마이그레이션
│       │   │   ├── tables/
│       │   │   └── daos/
│       │   ├── env/                      # Env 설정 (envied)
│       │   ├── events/                   # 앱 전역 event bus
│       │   ├── exceptions/               # 공용 예외 정의
│       │   ├── extensions/               # Dart extensions
│       │   ├── services/                 # 교차 feature 서비스 — FLAT(thin) 또는 nested(domain-rich) 패턴
│       │   │   └── <service>/            # Port & Adapter 패턴
│       │   │       ├── entities/         # nested — Immutable Value Objects
│       │   │       ├── ports/            # Abstract interfaces (*_port.dart)
│       │   │       ├── adapters/         # Port 구현체 (*_adapter.dart)
│       │   │       ├── usecases/         # nested — 비즈니스 로직 (feature가 의존하는 진입점)
│       │   │       ├── exceptions/       # nested — 서비스 자체 도메인 예외
│       │   │       └── support/          # 보조 구현 파일 (config/types/helpers 등) — 양 모드 공통
│       │   │           └── *.dart
│       │   ├── theme/                    # 디자인 시스템
│       │   └── widgets/                  # 공용 재사용 위젯
│       ├── di/
│       │   └── injection_container.dart  # get_it 설정
│       ├── features/                     # Feature 모듈
│       │   └── <feature>/
│       │       ├── domain/
│       │       │   ├── entities/         # Immutable Value Objects
│       │       │   ├── exceptions/       # 도메인 예외
│       │       │   ├── ports/            # Abstract interfaces (*_port.dart)
│       │       │   └── usecases/         # 비즈니스 로직 (*_usecase.dart)
│       │       ├── infrastructure/
│       │       │   └── adapters/         # Port 구현체 (*_adapter.dart)
│       │       └── presentation/
│       │           ├── bloc/             # 상태 관리 (선택)
│       │           ├── pages/            # Screen entry points
│       │           ├── views/            # 논리적 뷰 섹션
│       │           └── widgets/          # Feature 전용 위젯
│       ├── router/
│       │   └── router.dart               # GoRouter 설정
│       ├── app.dart                      # 앱 root 위젯
│       └── main.dart                     # 진입점
└── packages/
    └── <package>/                        # 공용 / 자동 생성 패키지
        └── src/
            ├── api/<api_name>/           # OpenAPI 자동 생성 클라이언트
            │   ├── models/
            │   ├── services/
            │   └── endpoints.dart
            └── database/                 # 로컬 DB 테이블/DAO/마이그레이션
                ├── tables/
                └── daos/
```

## 레이어별 경로 매핑

| 레이어 | 경로 패턴 | 비고 |
| --- | --- | --- |
| `entities` | `app/lib/features/**/domain/entities/**` / `app/lib/common/services/*/entities/**` | Immutable Value Objects |
| `ports` | `app/lib/features/**/domain/ports/**` / `app/lib/common/services/*/ports/**` | Abstract interfaces (*_port.dart) |
| `usecases` | `app/lib/features/**/domain/usecases/**` / `app/lib/common/services/*/usecases/**` | 비즈니스 로직 (*_usecase.dart) |
| `adapters` | `app/lib/features/**/infrastructure/adapters/**` / `app/lib/common/services/*/adapters/**` | Port 구현체 (*_adapter.dart) |
| `bloc` | `app/lib/features/**/presentation/bloc/**` | 상태 관리 (선택) |
| `exceptions` | `app/lib/features/**/domain/exceptions/**` / `app/lib/common/exceptions/**` / `app/lib/common/services/*/exceptions/**` | 도메인 예외 + 공용 예외 |
| `presentation` | `app/lib/features/**/presentation/pages/**` / `app/lib/features/**/presentation/views/**` / `app/lib/features/**/presentation/widgets/**` | pages / views / widgets 통합 |
| `common_services` | `app/lib/common/services/*/support/**` | support/ 보조 파일 — 교차 feature 서비스 |
| `common` | `app/lib/common/database/**` / `app/lib/common/env/**` / `app/lib/common/events/**` / `app/lib/common/extensions/**` / `app/lib/common/theme/**` / `app/lib/common/widgets/**` | 공용 — lint 룰 적용 없음 |

## Ignore 패턴 (S2)

`S2` 룰이 통과시키는 합법 path glob — boundary 외 경로지만 허용된다 (부트스트랩·DI·라우터 등). NestJS의 `baseBoundaryIgnores`에 대응.

- `app/lib/main.dart`
- `app/lib/app.dart`
- `app/lib/di/**`
- `app/lib/router/**`


# Lint Rules Reference (flutter/leaf-kit)

## 개요

`leaf-kit` 컨벤션을 선택한 프로젝트의 추가 룰. base의 `architecture_lint`와 함께 `analysis_options.yaml`의 `plugins:` 섹션에 등록 — Dart analysis server가 두 패키지를 독립 isolate로 로드한다. leaf_kit_lint은 base의 boundary 정의 위에 bloc + leaf_kit 전용 의존성 제약만 추가한다.

## 규칙 (Rules)

leaf-kit 룰 5개. base 룰과 함께 모두 적용된다 (base 12개 + leaf-kit 5개).

| ID | Severity | Layer | 설명 |
| --- | --- | --- | --- |
| LK_E2 | error | `usecases` | usecases/는 bloc/ import 금지. |
| LK_E3 | error | `bloc` | bloc/은 `blocAllowedPackages` + `leafKitBlocAllowed` entrypoint만 허용 — `adapters/`/`ports/` 직접 import 차단. freezed 스택 활성 시 `freezedStackBlocAllowed`(=`freezed_annotation`)가 화이트리스트에 자동 합쳐짐. |
| LK_E6 | error | (all) | feature 간 bloc/ cross-import 금지. |
| LK_E8 | error | `presentation` | presentation/{pages,views,widgets}에서 usecases/ 직접 import 금지. |
| LK_E9 | error | `presentation`, `common/widgets` | presentation/{pages,views,widgets}와 common/widgets에서 금지 위젯 직접 생성 금지 — leaf-kit 권장 위젯 사용 (`CustomScrollView`/`SingleChildScrollView` → `LeafScrollView`, `ListView`/`ListView.builder`/`ListView.separated`/`SliverList`/`SliverList.separated` → `LeafListView`, `GridView`/`GridView.builder` → `LeafGridView`, `Text`/`Text.rich` → `LeafText`/`LeafText.rich`, `Switch`/`CupertinoSwitch` → `LeafSwitch`). |

## bloc 화이트리스트 (LK_E3 참조)

LK_E3 룰이 bloc/ 레이어에서 허용하는 외부 의존성. 리스트 외 패키지는 bloc/에서 import 시 ERROR. `freezedStackBlocAllowed`는 freezed 스택 활성 시(=프로젝트 pubspec.yaml에 `freezed_annotation` 의존성) 자동 합쳐진다.

### `blocAllowedPackages`

bloc/ 레이어에서 허용되는 외부 패키지.

bloc은 상태 관리 + 이벤트 처리만 담당하므로 의존은 좁게 유지.
`flutter_leaf_kit_state.dart`/`flutter_leaf_kit_core.dart`는 별도로
`leafKitBlocAllowed`로 명시 허용.

- `flutter`
- `flutter_bloc`
- `bloc`
- `equatable`
- `meta`
- `collection`

### `leafKitBlocAllowed`

bloc/에서 허용되는 leaf_kit entrypoint (full-path entry).

flutter_leaf_kit의 메인 entrypoint(`flutter_leaf_kit.dart`) 대신 영역별
좁은 entrypoint만 허용. presentation/bloc은 상태/이벤트만 다루므로
component/network/route entrypoint는 차단.

- `flutter_leaf_kit/flutter_leaf_kit_state.dart`
- `flutter_leaf_kit/flutter_leaf_kit_core.dart`

### `freezedStackBlocAllowed`

freezed 스택 활성 시 `blocAllowedPackages`에 자동 합쳐지는 패키지.

프로젝트 pubspec.yaml에 `freezed_annotation` 의존성이 있으면(=freezed 스택
활성 신호) LK_E3가 bloc/에서 해당 import를 자동 허용. freezed_lint의 FZ_E2
가 bloc/ Event/State에 `@freezed` 적용을 강제하므로 두 스택을 같이 쓰는
프로젝트의 정상 사용 케이스. 감지는 `helpers.dart`의
`projectHasFreezedStack()`이 담당.

- `freezed_annotation`

