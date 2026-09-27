// =============================================================================
// architecture_lint — 상수 모음
// -----------------------------------------------------------------------------
// 린트 규칙들이 참조하는 패키지 화이트리스트/블랙리스트와 레이어 집합.
// 신규 의존성 추가 시 이 파일만 수정하면 모든 룰에 일관되게 반영된다.
// =============================================================================

/// entities/ 레이어에서 **유일하게 허용되는** 외부 패키지들.
///
/// entities는 순수 Dart 도메인 모델이어야 하지만, 코드 생성(freezed/json) 기반
/// 불변 모델 정의는 현실적으로 필요. 따라서 코드 생성 어노테이션 패키지만 예외 허용.
/// 런타임 로직을 포함한 패키지(dio, flutter 등)는 여기 들어오면 안 됨.
const codegenPackages = <String>{
  'freezed_annotation',
  'json_annotation',
  'meta',
  'collection',
};

/// 도메인 레이어에서 금지되는 "인프라" 패키지 목록.
///
/// 이 패키지들은 외부 세계(네트워크/DB/저장소/Firebase 등)와 직접 통신하므로
/// 도메인(entities/ports/usecases/exceptions)에 섞이면 테스트 용이성과 이식성이 깨진다.
/// adapters/ 레이어에서 Port 구현체로만 사용해야 한다.
const infraPackages = <String>{
  // ── Remote API 클라이언트 ─────────────────────────────────
  'dio',
  'http',
  'retrofit',
  'chopper',
  // ── 로컬 DB ────────────────────────────────────────────────
  'drift',
  'sqflite',
  'isar',
  'hive',
  'hive_flutter',
  'floor',
  'objectbox',
  // ── 키-값/보안 저장소 ─────────────────────────────────────
  'flutter_secure_storage',
  'shared_preferences',
  // ── Firebase 계열 ─────────────────────────────────────────
  'firebase_core',
  'firebase_auth',
  'firebase_messaging',
  'cloud_firestore',
};

/// ports/ 레이어에서 금지되는 "프레임워크" 패키지 목록.
///
/// Port는 도메인 인터페이스이므로 인프라 SDK는 물론 flutter(위젯/BuildContext 등)
/// 도 시그니처에 노출되면 안 된다. (flutter 자체도 "프레임워크"로 분류하여 차단)
const frameworkPackages = <String>{...infraPackages, 'flutter'};

/// "도메인 레이어"로 간주되는 디렉토리 이름 집합.
/// E4 룰(도메인 순수성 검사)이 이 집합에 속한 파일에만 적용된다.
const domainLayers = <String>{'entities', 'ports', 'usecases', 'exceptions'};

/// 다른 feature에서 cross-import 하면 안 되는 내부 레이어 (base).
///
/// feature 간 결합을 entities(공용 도메인 타입) 수준으로만 제한하여
/// 기능 모듈을 독립적으로 변경/삭제할 수 있도록 한다.
/// ports/adapters/usecases는 feature 전용 내부 계약이므로 cross-import 금지.
/// stack-specific 추가 차단(예: bloc)은 별도 패키지가 자체 룰로 강제.
const crossFeatureForbidden = <String>{'ports', 'adapters', 'usecases'};

/// S1 룰 — 파일당 최대 라인 수.
/// 800줄을 넘으면 단일 책임 위반 가능성이 높아 분할 권장.
const maxFileLines = 800;

/// S1 룰에서 라인 수 검사를 건너뛰는 자동 생성 파일 suffix.
///
/// build_runner / freezed / auto_route / injectable / mockito가 만들어내는
/// 파일은 사람이 분할할 수 없고 800줄을 쉽게 넘기므로 검사 제외.
const generatedFileSuffixes = <String>{
  '.g.dart',
  '.freezed.dart',
  '.gr.dart',
  '.config.dart',
  '.mocks.dart',
};
