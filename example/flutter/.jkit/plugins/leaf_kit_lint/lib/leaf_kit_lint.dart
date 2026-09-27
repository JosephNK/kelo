/// JKit Flutter — Leaf Kit Lint Package (bloc + leaf_kit specific)
///
/// `leaf-kit` 컨벤션 스택을 선택한 프로젝트의 추가 룰. `architecture_lint` (base)와
/// 함께 동작 — 두 패키지 모두 `analysis_options.yaml`의 `plugins:` 섹션에 등록.
///
/// ## 룰 요약 (5종) — ERROR
///
/// - **LK_E2** `lk_e2_no_bloc_in_usecases`     : usecases/는 bloc/ import 금지
/// - **LK_E3** `lk_e3_bloc_dependency`         : bloc/은 화이트리스트 + leaf_kit 전용 entrypoint만
/// - **LK_E6** `lk_e6_no_cross_bloc`           : feature 간 bloc/ cross-import 금지
/// - **LK_E8** `lk_e8_no_direct_usecase_in_view`: presentation/{pages,views,widgets} → usecases/ 직접 import 금지
/// - **LK_E9** `lk_e9_preferred_widget`       : presentation/{pages,views,widgets} → 금지 위젯 직접 생성 금지 (`CustomScrollView` → `LeafScrollView`)
library leaf_kit_lint;

export 'plugin.dart';
