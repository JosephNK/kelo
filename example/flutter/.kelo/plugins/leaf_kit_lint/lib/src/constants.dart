// =============================================================================
// leaf_kit_lint — 상수 모음
// -----------------------------------------------------------------------------
// bloc/ 레이어에서 허용되는 외부 패키지 화이트리스트 + leaf_kit 전용 entrypoint.
// architecture_lint와 분리되어 leaf_kit_lint 패키지가 자체 소유.
// =============================================================================

/// bloc/ 레이어에서 허용되는 외부 패키지.
///
/// bloc은 상태 관리 + 이벤트 처리만 담당하므로 의존은 좁게 유지.
/// `flutter_leaf_kit_state.dart`/`flutter_leaf_kit_core.dart`는 별도로
/// `leafKitBlocAllowed`로 명시 허용.
const blocAllowedPackages = <String>{
  'flutter',
  'flutter_bloc',
  'bloc',
  'equatable',
  'meta',
  'collection',
};

/// bloc/에서 허용되는 leaf_kit entrypoint (full-path entry).
///
/// flutter_leaf_kit의 메인 entrypoint(`flutter_leaf_kit.dart`) 대신 영역별
/// 좁은 entrypoint만 허용. presentation/bloc은 상태/이벤트만 다루므로
/// component/network/route entrypoint는 차단.
const leafKitBlocAllowed = <String>{
  'flutter_leaf_kit/flutter_leaf_kit_state.dart',
  'flutter_leaf_kit/flutter_leaf_kit_core.dart',
};

/// freezed 스택 활성 시 `blocAllowedPackages`에 자동 합쳐지는 패키지.
///
/// 프로젝트 pubspec.yaml에 `freezed_annotation` 의존성이 있으면(=freezed 스택
/// 활성 신호) LK_E3가 bloc/에서 해당 import를 자동 허용. freezed_lint의 FZ_E2
/// 가 bloc/ Event/State에 `@freezed` 적용을 강제하므로 두 스택을 같이 쓰는
/// 프로젝트의 정상 사용 케이스. 감지는 `helpers.dart`의
/// `projectHasFreezedStack()`이 담당.
const freezedStackBlocAllowed = <String>{'freezed_annotation'};
