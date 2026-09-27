// =============================================================================
// architecture_lint — boundary 정의 (lint 동작 + doc 트리 단일 source)
// -----------------------------------------------------------------------------
// 각 BoundaryElement는 하나의 논리 레이어를 정의하고, glob 패턴들로 경계를
// 표현한다. 12개 룰(E/N/S)이 이 데이터를 통해 path → layer 분류를 수행하며,
// generator(`scripts/flutter/gen-custom-lint-reference.mjs`)도 동일
// 데이터를 읽어 `lint-rules-structure-reference.md`의 트리 + 매핑 표를 합성.
//
// NestJS의 `baseBoundaryElements` (eslint-plugin-boundaries)와 동일 모델.
// =============================================================================

class BoundaryElement {
  const BoundaryElement({
    required this.layer,
    required this.patterns,
    this.note,
  });

  /// 논리 레이어 이름. 12개 lint가 이 값으로 layer를 식별한다.
  final String layer;

  /// glob 패턴 배열. 한 layer가 여러 위치에 흩어져도 patterns로 묶는다.
  final List<String> patterns;

  /// 선택. `## 레이어별 경로 매핑` 표의 "비고" 컬럼에 사용된다.
  final String? note;
}

/// 프로젝트 boundary 정의. lint 분류 + 트리 leaf 합성의 source-of-truth.
///
/// 패턴은 Melos workspace root 기준 root-relative path. lint runtime에서는
/// 입력 path를 동일 root 기준으로 정규화한 뒤 매칭한다.
const projectBoundaryElements = <BoundaryElement>[
  BoundaryElement(
    layer: 'entities',
    patterns: [
      'app/lib/features/**/domain/entities/**',
      // nested cross-cutting subsystem (auth/gatekeeper 등 도메인-rich)
      'app/lib/common/services/*/entities/**',
    ],
    note: 'Immutable Value Objects',
  ),
  BoundaryElement(
    layer: 'ports',
    patterns: [
      'app/lib/features/**/domain/ports/**',
      // 교차 feature 서비스의 port 인터페이스도 ports 레이어로 분류 — usecase 의존 허용
      // FLAT/nested 모두 ports/ 하위에 둔다.
      'app/lib/common/services/*/ports/**',
    ],
    note: 'Abstract interfaces (*_port.dart)',
  ),
  BoundaryElement(
    layer: 'usecases',
    patterns: [
      'app/lib/features/**/domain/usecases/**',
      // nested cross-cutting subsystem 의 usecase — feature가 의존 허용 진입점
      'app/lib/common/services/*/usecases/**',
    ],
    note: '비즈니스 로직 (*_usecase.dart)',
  ),
  BoundaryElement(
    layer: 'adapters',
    patterns: [
      'app/lib/features/**/infrastructure/adapters/**',
      // 교차 feature 서비스의 adapter 구현체도 adapters 레이어로 분류 — DI 외 직접 의존 차단
      // FLAT/nested 모두 adapters/ 하위에 둔다.
      'app/lib/common/services/*/adapters/**',
    ],
    note: 'Port 구현체 (*_adapter.dart)',
  ),
  BoundaryElement(
    layer: 'bloc',
    patterns: ['app/lib/features/**/presentation/bloc/**'],
    note: '상태 관리 (선택)',
  ),
  BoundaryElement(
    layer: 'exceptions',
    patterns: [
      'app/lib/features/**/domain/exceptions/**',
      'app/lib/common/exceptions/**',
      // nested cross-cutting subsystem 자체 도메인 예외
      'app/lib/common/services/*/exceptions/**',
    ],
    note: '도메인 예외 + 공용 예외',
  ),
  BoundaryElement(
    layer: 'presentation',
    patterns: [
      'app/lib/features/**/presentation/pages/**',
      'app/lib/features/**/presentation/views/**',
      'app/lib/features/**/presentation/widgets/**',
    ],
    note: 'pages / views / widgets 통합',
  ),
  BoundaryElement(
    layer: 'common_services',
    patterns: [
      // 보조 파일은 support/ 하위로 강제 — 직속 ad-hoc 파일은 unknown layer로
      // 떨어져 S2 위반. port/adapter 파일도 ports/adapters 하위에 둔다.
      'app/lib/common/services/*/support/**',
    ],
    note: 'support/ 보조 파일 — 교차 feature 서비스',
  ),
  BoundaryElement(
    layer: 'common',
    patterns: [
      'app/lib/common/database/**',
      'app/lib/common/env/**',
      'app/lib/common/events/**',
      'app/lib/common/extensions/**',
      'app/lib/common/theme/**',
      'app/lib/common/widgets/**',
    ],
    note: '공용 — lint 룰 적용 없음',
  ),
];

/// `S2` 룰이 통과시키는 합법 path glob — boundary 외 경로지만 허용된다.
///
/// NestJS의 `baseBoundaryIgnores`에 대응. boundary 패턴에 enumerate 되지 않지만
/// `app/lib/` 안에 합법으로 존재하는 부트스트랩(main/app)·DI·라우터 등.
const unknownPathIgnores = <String>[
  'app/lib/main.dart',
  'app/lib/app.dart',
  'app/lib/di/**',
  'app/lib/router/**',
];
