/// Kelo Flutter — Freezed Lint Package (freezed convention enforcement)
///
/// `freezed` 컨벤션 스택을 선택한 프로젝트의 추가 룰. `architecture_lint` (base)와
/// 함께 동작 — 두 패키지 모두 `analysis_options.yaml`의 `plugins:` 섹션에 등록.
///
/// ## 룰 요약 (3종) — ERROR
///
/// - **FZ_E1** `fz_e1_entities_freezed`         : entities/ 클래스는 `@freezed` 필수
/// - **FZ_E2** `fz_e2_bloc_event_state_freezed` : bloc/의 `*Event`/`*State` 클래스는 `@freezed` 필수
/// - **FZ_E3** `fz_e3_usecase_params_freezed`   : usecases/의 `*Params` 클래스는 `@freezed` 필수
library freezed_lint;

export 'plugin.dart';
