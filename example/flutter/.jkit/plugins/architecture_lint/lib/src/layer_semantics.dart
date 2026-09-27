// =============================================================================
// architecture_lint — 레이어 정형 메타데이터
// -----------------------------------------------------------------------------
// 각 아키텍처 레이어의 책임·포함 파일 종류·대표 코드 형태 (doc-only).
// lint 런타임에는 참조되지 않으며, gen-custom-lint-reference.mjs가
// 파싱하여 lint-rules-reference.md의 "레이어 글로서리" 섹션을 생성한다.
//
// Forbids/Allowed/Naming은 lints/*.dart의 룰 doc + getter에서 도출되므로
// 여기엔 두지 않는다 (단일 source 원칙).
// =============================================================================

class LayerSemantics {
  const LayerSemantics({
    required this.role,
    required this.contains,
    required this.example,
  });

  /// 레이어 책임 한 줄 — "무엇을 담당하는 곳인가".
  final String role;

  /// 포함되는 파일 종류와 suffix.
  final List<String> contains;

  /// 대표 코드 스니펫.
  final String example;
}

/// 레이어 키는 classification.dart의 `_layerMarkers` 값과 일치해야 한다.
const layerSemantics = <String, LayerSemantics>{
  'entities': LayerSemantics(
    role: '도메인 Entity · Value Object · 공용 타입. 프레임워크 비의존 순수 Dart로 '
        '비즈니스 규칙의 단일 진실 공급원이자 가장 안정적인 레이어.',
    contains: [
      'Entity — `*.dart`',
      'Value Object — `*.dart`',
      '도메인 상수·공용 타입 — `*.dart`',
    ],
    example: '''
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
}''',
  ),

  'ports': LayerSemantics(
    role: '도메인과 인프라 사이의 abstract interface. 도메인 타입만 시그니처에 노출하여 '
        '구현 교체·테스트 용이성을 보장.',
    contains: [
      'Port — `*_port.dart` (`abstract class {Name}Port`)',
    ],
    example: '''
// ports/product_port.dart
abstract class ProductPort {
  Future<ProductPage> getProducts({required int page, required int limit});
  Future<Product> getProductById({required String id});
}''',
  ),

  'usecases': LayerSemantics(
    role: '비즈니스 로직 단위. Port를 주입받아 도메인 동작을 조합하며, '
        'UI/인프라 없이 단독 단위 테스트 가능.',
    contains: [
      'UseCase — `*_usecase.dart` (`class {Verb}{Noun}UseCase`)',
      'UseCase Params — inline 또는 `*_params.dart` (`class {Verb}{Noun}Params`)',
    ],
    example: '''
// usecases/get_products_usecase.dart
class GetProductsUseCase {
  const GetProductsUseCase({required this.productPort});
  final ProductPort productPort;

  Future<ProductPage> call(GetProductsParams params) =>
      productPort.getProducts(page: params.page, limit: params.limit);
}''',
  ),

  'adapters': LayerSemantics(
    role: 'Port 구현체. Remote API · Local DB · Platform SDK 등 외부 데이터 소스와 통신하고 '
        'raw 데이터 → Entity 변환을 책임진다.',
    contains: [
      'Adapter — `*_adapter.dart` (`class {Name}Adapter implements {Name}Port`)',
      '변환 메서드 — `_to{Entity}()`, `_parse{Name}()`',
    ],
    example: '''
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
}''',
  ),

  'bloc': LayerSemantics(
    role: 'UI 상태 관리 (flutter_bloc). UseCase를 호출하여 데이터를 받고 '
        'Event → State 전환만 담당하는 얇은 계층.',
    contains: [
      'Bloc/Cubit — `*_bloc.dart` / `*_cubit.dart`',
      'Event — `*_event.dart`',
      'State — `*_state.dart`',
    ],
    example: '''
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
}''',
  ),

  'exceptions': LayerSemantics(
    role: '도메인 특화 예외. UseCase 경계에서 throw하고 presentation에서 사용자 메시지로 매핑.',
    contains: [
      'Exception — `*_exception.dart` (`class {Name}Exception implements Exception`)',
    ],
    example: '''
// exceptions/server_exception.dart
class ServerException implements Exception {
  const ServerException(this.message);
  final String message;
  @override
  String toString() => message;
}''',
  ),

  'presentation': LayerSemantics(
    role: 'UI 레이어. Screen(라우트 진입점) · View(논리적 섹션) · Widget(재사용 컴포넌트)으로 분할. '
        'Bloc을 통해 상태를 구독하고 사용자 입력을 이벤트로 전달.',
    contains: [
      'Screen (라우트 진입점) — `*_screen.dart` (`pages/`)',
      'View (StatelessWidget 섹션) — `*_view.dart` (`views/`)',
      'Widget (재사용 컴포넌트) — `*_{purpose}.dart` (`widgets/`)',
    ],
    example: '''
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
}''',
  ),
};
