// =============================================================================
// architecture_lint — 트리 시각화용 annotation (doc-only, lint 미참조)
// -----------------------------------------------------------------------------
// `boundary_element.dart`의 glob 패턴만으로는 드러나지 않는 하위 폴더/파일
// 의도, placeholder 세그먼트(`<feature>`, `<service>` 등), 단일 파일 노드를
// 트리에 주입하기 위한 doc-only 데이터. lint 동작과 무관하다.
//
// generator(`scripts/flutter/gen-custom-lint-reference.mjs`)가
// `parentPath` 기준으로 boundary 트리의 자식을 override하여 최종 시각화 트리를
// 합성한다. NestJS의 `baseStructureAnnotations`와 동일 모델.
// =============================================================================

class AnnotationNode {
  const AnnotationNode({
    required this.name,
    this.placeholder = false,
    this.inline = false,
    this.note,
    this.children = const [],
  });

  /// 트리에 표시될 세그먼트 이름. placeholder인 경우 `<feature>` 같은 형태.
  final String name;

  /// 가변 세그먼트 표시. 트리에서 `<name>/` 형태로 surface된다.
  final bool placeholder;

  /// 부모 노드 줄에 합쳐 표시한다 (예: `api/<api_name>/`).
  /// 부모의 children이 정확히 1개이고 그 자식이 inline일 때 적용된다.
  final bool inline;

  /// 트리 노드 우측 `# note` 주석.
  final String? note;

  /// 하위 노드.
  final List<AnnotationNode> children;
}

/// 트리 root 라벨. 첫 줄에 prepend된다 (Melos workspace 표시).
const projectStructureRoot = 'Root (Melos workspace)';

/// 부모 경로(슬래시 구분) → override 노드 배열.
///
/// 해당 부모 노드 아래의 glob 자식(`*`/`**`)은 모두 제거되고 override의
/// 노드들이 새 자식으로 들어간다. 동일 이름 자식이 있으면 override가 덮어씀.
const projectStructureAnnotations = <String, List<AnnotationNode>>{
  'app/lib': [
    AnnotationNode(name: 'common', note: '모든 feature 공유'),
    AnnotationNode(name: 'di'),
    AnnotationNode(name: 'features', note: 'Feature 모듈'),
    AnnotationNode(name: 'router'),
    AnnotationNode(name: 'app.dart', note: '앱 root 위젯'),
    AnnotationNode(name: 'main.dart', note: '진입점'),
  ],
  'app/lib/common': [
    AnnotationNode(
      name: 'database',
      note: '로컬 DB 테이블/DAO/마이그레이션',
      children: [
        AnnotationNode(name: 'tables'),
        AnnotationNode(name: 'daos'),
      ],
    ),
    AnnotationNode(name: 'env', note: 'Env 설정 (envied)'),
    AnnotationNode(name: 'events', note: '앱 전역 event bus'),
    AnnotationNode(name: 'exceptions', note: '공용 예외 정의'),
    AnnotationNode(name: 'extensions', note: 'Dart extensions'),
    AnnotationNode(
      name: 'services',
      note: '교차 feature 서비스 — FLAT(thin) 또는 nested(domain-rich) 패턴',
      children: [
        AnnotationNode(
          name: '<service>',
          placeholder: true,
          note: 'Port & Adapter 패턴',
          children: [
            AnnotationNode(
              name: 'entities',
              note: 'nested — Immutable Value Objects',
            ),
            AnnotationNode(
              name: 'ports',
              note: 'Abstract interfaces (*_port.dart)',
            ),
            AnnotationNode(
              name: 'adapters',
              note: 'Port 구현체 (*_adapter.dart)',
            ),
            AnnotationNode(
              name: 'usecases',
              note: 'nested — 비즈니스 로직 (feature가 의존하는 진입점)',
            ),
            AnnotationNode(
              name: 'exceptions',
              note: 'nested — 서비스 자체 도메인 예외',
            ),
            AnnotationNode(
              name: 'support',
              note: '보조 구현 파일 (config/types/helpers 등) — 양 모드 공통',
              children: [
                AnnotationNode(name: '*.dart'),
              ],
            ),
          ],
        ),
      ],
    ),
    AnnotationNode(name: 'theme', note: '디자인 시스템'),
    AnnotationNode(name: 'widgets', note: '공용 재사용 위젯'),
  ],
  'app/lib/di': [
    AnnotationNode(name: 'injection_container.dart', note: 'get_it 설정'),
  ],
  'app/lib/features': [
    AnnotationNode(
      name: '<feature>',
      placeholder: true,
      children: [
        AnnotationNode(
          name: 'domain',
          children: [
            AnnotationNode(name: 'entities', note: 'Immutable Value Objects'),
            AnnotationNode(name: 'exceptions', note: '도메인 예외'),
            AnnotationNode(
              name: 'ports',
              note: 'Abstract interfaces (*_port.dart)',
            ),
            AnnotationNode(
              name: 'usecases',
              note: '비즈니스 로직 (*_usecase.dart)',
            ),
          ],
        ),
        AnnotationNode(
          name: 'infrastructure',
          children: [
            AnnotationNode(
              name: 'adapters',
              note: 'Port 구현체 (*_adapter.dart)',
            ),
          ],
        ),
        AnnotationNode(
          name: 'presentation',
          children: [
            AnnotationNode(name: 'bloc', note: '상태 관리 (선택)'),
            AnnotationNode(name: 'pages', note: 'Screen entry points'),
            AnnotationNode(name: 'views', note: '논리적 뷰 섹션'),
            AnnotationNode(name: 'widgets', note: 'Feature 전용 위젯'),
          ],
        ),
      ],
    ),
  ],
  'app/lib/router': [
    AnnotationNode(name: 'router.dart', note: 'GoRouter 설정'),
  ],
  'packages': [
    AnnotationNode(
      name: '<package>',
      placeholder: true,
      note: '공용 / 자동 생성 패키지',
      children: [
        AnnotationNode(
          name: 'src',
          children: [
            AnnotationNode(
              name: 'api',
              children: [
                AnnotationNode(
                  name: '<api_name>',
                  placeholder: true,
                  inline: true,
                  note: 'OpenAPI 자동 생성 클라이언트',
                  children: [
                    AnnotationNode(name: 'models'),
                    AnnotationNode(name: 'services'),
                    AnnotationNode(name: 'endpoints.dart'),
                  ],
                ),
              ],
            ),
            AnnotationNode(
              name: 'database',
              note: '로컬 DB 테이블/DAO/마이그레이션',
              children: [
                AnnotationNode(name: 'tables'),
                AnnotationNode(name: 'daos'),
              ],
            ),
          ],
        ),
      ],
    ),
  ],
};
