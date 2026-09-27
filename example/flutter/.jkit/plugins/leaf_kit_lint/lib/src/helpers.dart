// =============================================================================
// leaf_kit_lint — 경로/import 헬퍼 (self-contained)
// -----------------------------------------------------------------------------
// architecture_lint와 독립적으로 동작하기 위해 패키지 내부에서 자체 path 분류.
// 룰 5개(LK_E2/E3/E6/E8/E9)가 필요로 하는 최소 헬퍼만 포함.
//
// 전제 프로젝트 구조 (architecture_lint와 동일):
//   app/lib/features/<feature>/
//     ├── domain/usecases/
//     ├── infrastructure/adapters/
//     ├── domain/ports/
//     └── presentation/{bloc,pages,views,widgets}/
// =============================================================================

import 'dart:io';

import 'package:analyzer/dart/ast/ast.dart';
import 'package:path/path.dart' as p;

/// 입력 path를 root-relative `app/lib/...` 형태로 정규화.
///
/// 다양한 입력(절대 경로 / package URI inner / 상대 경로)을 단일 형태로 통일.
/// architecture_lint와 동일 규칙으로 정규화하여 분류 일관성 유지.
String _normalizeInputPath(String filePath) {
  final raw = filePath.replaceAll('\\', '/');

  final pkgIdx = raw.indexOf('/packages/');
  if (pkgIdx >= 0) return raw.substring(pkgIdx + 1);
  if (raw.startsWith('packages/')) return raw;

  final libIdx = raw.indexOf('/lib/');
  if (libIdx >= 0) return 'app${raw.substring(libIdx)}';
  if (raw.startsWith('lib/')) return 'app/$raw';

  if (RegExp(r'^(features|common|di|router)/').hasMatch(raw)) {
    return 'app/lib/$raw';
  }

  return raw;
}

/// 파일이 bloc 레이어인지 — `.../features/<f>/presentation/bloc/...`
bool isBlocFile(String filePath) {
  final n = _normalizeInputPath(filePath);
  return RegExp(r'^app/lib/features/[^/]+/presentation/bloc/').hasMatch(n);
}

/// 파일이 usecases 레이어인지 — `.../features/<f>/domain/usecases/...`
bool isUsecaseFile(String filePath) {
  final n = _normalizeInputPath(filePath);
  return RegExp(r'^app/lib/features/[^/]+/domain/usecases/').hasMatch(n);
}

/// 파일이 presentation의 view 레이어인지 — pages/views/widgets.
/// bloc/은 제외 (LK_E8은 bloc 경유 강제이므로 bloc/은 직접 의존 허용).
bool isPresentationViewFile(String filePath) {
  final n = _normalizeInputPath(filePath);
  return RegExp(
    r'^app/lib/features/[^/]+/presentation/(pages|views|widgets)/',
  ).hasMatch(n);
}

/// LK_E9 권장 위젯 룰 대상 파일인지 — feature presentation + common widgets.
bool isPreferredWidgetLintTargetFile(String filePath) {
  final n = _normalizeInputPath(filePath);
  return RegExp(
        r'^app/lib/features/[^/]+/presentation/(pages|views|widgets)/',
      ).hasMatch(n) ||
      RegExp(r'^app/lib/common/widgets/').hasMatch(n);
}

/// path에서 import 대상 inner-layer 추출.
///
/// 'bloc' / 'usecases' / 'adapters' / 'ports' 중 매칭되는 첫 번째 반환.
/// architecture_lint의 boundary 매칭과 달리 leaf_kit_lint은 4개 레이어만 식별.
/// `common/services/<svc>/`는 FLAT/nested 모두 `ports/`·`adapters/`·`usecases/`
/// 하위 패턴으로 인식 — base의 `boundary_element.dart` 매핑과 일치시켜
/// LK_E3가 cross-cutting subsystem 의 ports/adapters에 대한 bloc 직접 의존도
/// 차단하도록 한다.
String? _classifyInnerPath(String innerPath) {
  if (RegExp(r'features/[^/]+/presentation/bloc/').hasMatch(innerPath)) {
    return 'bloc';
  }
  if (RegExp(r'features/[^/]+/domain/usecases/').hasMatch(innerPath) ||
      RegExp(r'common/services/[^/]+/usecases/').hasMatch(innerPath)) {
    return 'usecases';
  }
  if (RegExp(r'features/[^/]+/infrastructure/adapters/').hasMatch(innerPath) ||
      RegExp(r'common/services/[^/]+/adapters/').hasMatch(innerPath)) {
    return 'adapters';
  }
  if (RegExp(r'features/[^/]+/domain/ports/').hasMatch(innerPath) ||
      RegExp(r'common/services/[^/]+/ports/').hasMatch(innerPath)) {
    return 'ports';
  }
  return null;
}

/// `features/<name>/...` 경로에서 feature 이름을 추출.
String? extractFeature(String filePath) {
  final n = filePath.replaceAll('\\', '/');
  final parts = n.split('/');
  for (var i = 0; i < parts.length - 1; i++) {
    if (parts[i] == 'features') return parts[i + 1];
  }
  return null;
}

/// 현재 파일의 프로젝트 package 이름.
String? getProjectPackageName(AstNode node) {
  final unit = node.root;
  if (unit is CompilationUnit) {
    // ignore: experimental_member_use
    final fragment = unit.declaredFragment;
    final uri = fragment?.source.uri;
    if (uri != null && uri.scheme == 'package') {
      return uri.pathSegments.first;
    }
    // ignore: experimental_member_use
    final libraryUri = fragment?.element.firstFragment.source.uri;
    if (libraryUri != null && libraryUri.scheme == 'package') {
      return libraryUri.pathSegments.first;
    }
  }
  return null;
}

/// AST 노드에서 파일의 절대 경로를 얻는다 (CompilationUnit 루트에서 조회).
String? getFilePath(AstNode node) {
  final unit = node.root;
  if (unit is CompilationUnit) {
    // ignore: experimental_member_use
    return unit.declaredFragment?.source.fullName;
  }
  return null;
}

/// `package:dio/dio.dart` → `dio`.
String? extractImportPackageName(String importUri) {
  if (importUri.startsWith('package:')) {
    return importUri.substring(8).split('/').first;
  }
  return null;
}

/// Dart SDK import 여부.
bool isDartImport(String importUri) {
  return importUri.startsWith('dart:');
}

/// 화이트리스트 entry에 import URI가 매칭되는지.
///
/// entry에 `/`가 있으면 풀 inner path 매칭(`flutter_leaf_kit/foo.dart`),
/// 없으면 패키지명 매칭(`equatable`).
bool matchesPackageEntry(String importUri, Set<String> entries) {
  if (!importUri.startsWith('package:')) return false;
  final inner = importUri.substring('package:'.length);
  final pkg = inner.split('/').first;
  for (final entry in entries) {
    if (entry.contains('/')) {
      if (inner == entry) return true;
    } else {
      if (pkg == entry) return true;
    }
  }
  return false;
}

/// import 대상 레이어 통합 조회 (상대 경로 + package import 모두 처리).
///
/// 'bloc' / 'usecases' / 'adapters' / 'ports' 중 하나, 또는 null.
String? getImportTargetLayer(
  String importUri,
  String currentFilePath,
  String? packageName,
) {
  if (isDartImport(importUri)) return null;

  if (importUri.startsWith('package:')) {
    if (packageName == null) return null;
    final pkg = extractImportPackageName(importUri);
    if (pkg != packageName) return null;
    final inner = importUri.substring('package:$packageName/'.length);
    return _classifyInnerPath(inner);
  }

  // Relative import — resolve against current file dir
  final currentDir = p.dirname(currentFilePath);
  final resolved = p.normalize(p.join(currentDir, importUri));
  return _classifyInnerPath(resolved);
}

/// pubspec.yaml이 있는 가장 가까운 상위 디렉토리(=프로젝트 루트)를 찾는다.
///
/// analyzer는 파일 단위로 lint를 실행하므로 import directive 방문 시 파일
/// 절대 경로로부터 상위로 거슬러 올라가 탐색.
String? findProjectRootFromFile(String filePath) {
  var dir = p.dirname(filePath);
  while (true) {
    if (File(p.join(dir, 'pubspec.yaml')).existsSync()) {
      return dir;
    }
    final parent = p.dirname(dir);
    if (parent == dir) return null;
    dir = parent;
  }
}

final _freezedStackCache = <String, bool>{};
final _freezedAnnotationDepRe = RegExp(
  r'^\s*freezed_annotation\s*:',
  multiLine: true,
);

/// 프로젝트 pubspec.yaml에 `freezed_annotation` 의존성이 등록되어 있는지.
///
/// freezed 스택(=`/jkit:flutter-init`에서 freezed 컨벤션 선택) 활성 신호로
/// 사용. LK_E3가 bloc/에서 `freezed_annotation` import를 조건부 허용할 때
/// 호출. 결과는 프로젝트 루트 단위로 캐시(같은 isolate 내 1회 read).
bool projectHasFreezedStack(String filePath) {
  final root = findProjectRootFromFile(filePath);
  if (root == null) return false;
  final cached = _freezedStackCache[root];
  if (cached != null) return cached;

  final pubspec = File(p.join(root, 'pubspec.yaml'));
  if (!pubspec.existsSync()) {
    _freezedStackCache[root] = false;
    return false;
  }
  final raw = pubspec.readAsStringSync();
  final hit = _freezedAnnotationDepRe.hasMatch(raw);
  _freezedStackCache[root] = hit;
  return hit;
}

/// import 대상 feature 통합 조회.
String? getImportTargetFeature(
  String importUri,
  String currentFilePath,
  String? packageName,
) {
  if (isDartImport(importUri)) return null;

  if (importUri.startsWith('package:')) {
    if (packageName == null) return null;
    final pkg = extractImportPackageName(importUri);
    if (pkg != packageName) return null;
    final inner = importUri.substring('package:$packageName/'.length);
    return extractFeature(inner);
  }

  final currentDir = p.dirname(currentFilePath);
  final resolved = p.normalize(p.join(currentDir, importUri));
  if (resolved.startsWith('..')) return null;
  return extractFeature(resolved);
}
