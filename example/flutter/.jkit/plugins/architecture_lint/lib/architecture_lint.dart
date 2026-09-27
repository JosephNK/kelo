/// JKit Flutter — Architecture Lint Package (Base)
///
/// Flutter 프로젝트의 Clean Architecture + Feature-first 구조를 정적 분석으로 강제.
/// `analysis_server_plugin` 기반으로 IDE 및 `dart analyze` / `flutter analyze`에서 동작.
/// stack-specific 룰(예: bloc)은 별도 패키지로 분리.
///
/// ## 룰 요약 (13종)
///
/// ### 의존성 규칙 (AL_E1~AL_E9 base) — ERROR
/// - **AL_E1** `al_e1_entities_import`        : entities/는 codegen 어노테이션만 import 허용
/// - **AL_E2** `al_e2_usecases_dependency`    : usecases/는 entities/ports/exceptions만 참조
/// - **AL_E4** `al_e4_domain_no_sdk`          : 도메인 레이어에 외부 인프라 SDK 금지
/// - **AL_E5** `al_e5_ports_no_framework`     : ports/에 프레임워크 패키지 금지 (flutter 포함)
/// - **AL_E6** `al_e6_cross_feature`          : 다른 feature의 내부 레이어 cross-import 금지
/// - **AL_E7** `al_e7_no_bare_catch`          : bare `catch (e)` 금지 (타입 명시 강제)
/// - **AL_E8** `al_e8_presentation_dependency`: presentation/은 adapters/ports 및 인프라 SDK 직접 import 금지
/// - **AL_E9** `al_e9_no_private_widget_in_views`: presentation/views/ 및 presentation/pages/에 private widget 클래스 선언 금지
///
/// ### 네이밍 규칙 (AL_N1~AL_N3) — WARNING
/// - **AL_N1** `al_n1_port_naming`          : Port 클래스 이름은 `Port` 접미사
/// - **AL_N2** `al_n2_adapter_naming`       : Adapter 클래스 이름은 `Adapter` 접미사
/// - **AL_N3** `al_n3_usecase_naming`       : UseCase 클래스는 `UseCase` 또는 `Params` 접미사
///
/// ### 사이즈/구조 규칙 (AL_S1~AL_S2)
/// - **AL_S1** `al_s1_file_size`            : 파일당 800줄 이하 (WARNING)
/// - **AL_S2** `al_s2_unknown_path`         : `app/lib/` 안에서 boundary 외 경로 금지 (ERROR)
library architecture_lint;

export 'src/boundary_element.dart';
export 'src/classification.dart';
export 'src/constants.dart';
export 'src/structure_annotation.dart';
export 'plugin.dart';
