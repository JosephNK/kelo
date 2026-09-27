// =============================================================================
// architecture_lint — 경로/레이어 분류 유틸
// -----------------------------------------------------------------------------
// 파일 경로를 받아 어떤 아키텍처 레이어에 속하는지, 어떤 feature에 속하는지
// 판정한다. 모든 E/N/S 룰이 이 헬퍼를 통해 대상 파일을 필터링.
//
// 전제 프로젝트 구조:
//   lib/
//   └── features/<feature>/
//       ├── domain/entities/
//       ├── domain/ports/
//       ├── domain/usecases/
//       ├── domain/exceptions/
//       ├── data/adapters/
//       ├── presentation/
//       │   ├── bloc/
//       │   ├── pages/
//       │   ├── views/
//       │   └── widgets/
//       └── ...
// =============================================================================

import 'package:analyzer/dart/ast/ast.dart';
import 'package:glob/glob.dart';
import 'package:path/path.dart' as p;

import 'boundary_element.dart';
import 'constants.dart';

/// 입력 path를 boundary 패턴 매칭에 맞게 root-relative 형태로 정규화.
///
/// boundary 패턴은 `app/lib/...` 또는 `packages/...`로 시작하지만, lint runtime
/// 입력은 절대 경로 / package URI inner / 상대 경로 normalize 결과 등 형태가
/// 다양하다. 이 함수가 모든 입력을 패턴과 매칭 가능한 형태로 통일한다.
///
/// 다운스트림 앱의 실제 root 폴더 이름(`app`/`mobile`/`client` 등)이 무엇이든
/// boundary 패턴 매칭 측면에서 항상 `app/`으로 통일된다.
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

/// 경로에서 레이어 이름을 추출.
///
/// `_normalizeInputPath`로 입력을 정규화한 뒤 `projectBoundaryElements`의
/// glob 패턴과 순차 매칭한다. 매칭되는 element가 없으면 `'other'` 반환.
String classifyLayer(String filePath) {
  final normalized = _normalizeInputPath(filePath);
  for (final el in projectBoundaryElements) {
    for (final pattern in el.patterns) {
      if (Glob(pattern).matches(normalized)) {
        return el.layer;
      }
    }
  }
  return 'other';
}

/// 입력 파일이 `app/lib/` 하위인지 검사 (정규화 후).
/// S2 룰이 lint 적용 범위를 `app/lib/` 안으로만 제한할 때 사용.
bool isInAppLib(String filePath) {
  return _normalizeInputPath(filePath).startsWith('app/lib/');
}

/// 입력 파일이 `presentation/views/` 또는 `presentation/pages/`에 있는지 검사.
///
/// AL_E9 룰이 widget 추출 강제 대상 파일을 필터링할 때 사용한다.
/// `widgets/`는 sub-widget의 합법 위치이므로 제외.
bool isInPresentationViewOrPage(String filePath) {
  final normalized = filePath.replaceAll('\\', '/');
  return normalized.contains('/presentation/views/') ||
      normalized.contains('/presentation/pages/');
}

/// 입력 파일이 codegen 산출물(`*.g.dart`, `*.freezed.dart` 등)인지 검사.
/// `generatedFileSuffixes` 중 하나로 끝나면 true.
bool isGeneratedFile(String filePath) {
  final normalized = filePath.replaceAll('\\', '/');
  for (final suffix in generatedFileSuffixes) {
    if (normalized.endsWith(suffix)) return true;
  }
  return false;
}

/// 입력 파일이 `unknownPathIgnores`의 어느 glob과도 매칭하는지 검사.
bool matchesUnknownPathIgnore(String filePath) {
  final normalized = _normalizeInputPath(filePath);
  for (final pattern in unknownPathIgnores) {
    if (Glob(pattern).matches(normalized)) return true;
  }
  return false;
}

/// `features/<name>/...` 경로에서 feature 이름을 추출.
/// features 세그먼트를 찾지 못하면 null (features 바깥 파일).
String? extractFeature(String filePath) {
  final normalized = filePath.replaceAll('\\', '/');
  final parts = normalized.split('/');

  for (var i = 0; i < parts.length - 1; i++) {
    if (parts[i] == 'features') {
      return parts[i + 1];
    }
  }
  return null;
}

/// AST 노드에서 파일의 절대 경로를 얻는다. (CompilationUnit 루트에서 조회)
String? getFilePath(AstNode node) {
  final unit = node.root;
  if (unit is CompilationUnit) {
    // ignore: experimental_member_use
    return unit.declaredFragment?.source.fullName;
  }
  return null;
}

/// 현재 파일이 속한 프로젝트의 package 이름을 추출한다.
/// pubspec.yaml의 `name:` 필드와 동일한 값이 반환된다.
/// (E1/E4 룰에서 "내 프로젝트 imports는 허용" 판정에 사용)
String? getProjectPackageName(AstNode node) {
  final unit = node.root;
  if (unit is CompilationUnit) {
    // ignore: experimental_member_use
    final fragment = unit.declaredFragment;
    final uri = fragment?.source.uri;
    if (uri != null && uri.scheme == 'package') {
      return uri.pathSegments.first;
    }
    // Fallback: try from library
    final libraryUri = fragment?.element.firstFragment.source.uri;
    if (libraryUri != null && libraryUri.scheme == 'package') {
      return libraryUri.pathSegments.first;
    }
  }
  return null;
}

/// `package:dio/dio.dart` 같은 URI에서 패키지 이름(`dio`)만 추출.
/// package: 스킴이 아니면 null.
String? extractImportPackageName(String importUri) {
  if (importUri.startsWith('package:')) {
    return importUri.substring(8).split('/').first;
  }
  return null;
}

/// 화이트리스트 entry에 import URI가 매칭되는지 검사.
///
/// entry에 `/`가 있으면 풀 inner path 매칭(`flutter_leaf_kit/foo.dart`처럼
/// 특정 엔트리포인트만 허용), 없으면 패키지명 매칭(`equatable`처럼 패키지 전체 허용).
/// 한 Set에서 두 형태 혼용 가능.
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

/// Dart SDK import 여부 (`dart:core`, `dart:async` 등).
/// 대부분 룰에서 SDK imports는 항상 허용하므로 조기 반환에 사용.
bool isDartImport(String importUri) {
  return importUri.startsWith('dart:');
}

/// 프로젝트 내부를 가리키는 package import에서 대상 레이어를 판정.
///
/// 예: `package:my_app/features/auth/domain/ports/auth_port.dart`
///     → `package:` prefix를 제거한 inner 경로에 classifyLayer 적용
///     → `'ports'` 반환
String? getImportLayerFromPackageUri(String importUri, String? packageName) {
  if (packageName == null) return null;

  final pkg = extractImportPackageName(importUri);
  if (pkg != packageName) return null;

  final inner = importUri.substring('package:$packageName/'.length);
  return classifyLayer(inner);
}

/// 프로젝트 내부 package import가 속한 feature 이름 판정 (E6 룰에서 사용).
String? getImportFeatureFromPackageUri(String importUri, String? packageName) {
  if (packageName == null) return null;

  final pkg = extractImportPackageName(importUri);
  if (pkg != packageName) return null;

  final inner = importUri.substring('package:$packageName/'.length);
  return extractFeature(inner);
}

/// 상대 경로 import(`../foo/bar.dart`)의 대상 레이어를 해석.
/// 현재 파일 디렉토리를 기준으로 정규화하여 classifyLayer 적용.
String? resolveRelativeImportLayer(String importUri, String currentFilePath) {
  if (importUri.startsWith('package:') || importUri.startsWith('dart:')) {
    return null;
  }
  final currentDir = p.dirname(currentFilePath);
  final resolved = p.normalize(p.join(currentDir, importUri));
  return classifyLayer(resolved);
}

/// 상대 경로 import가 속한 feature 이름 판정.
/// `..` 로 상위로 올라간 결과는 null로 반환 (feature 밖)
String? resolveRelativeImportFeature(String importUri, String currentFilePath) {
  if (importUri.startsWith('package:') || importUri.startsWith('dart:')) {
    return null;
  }
  final currentDir = p.dirname(currentFilePath);
  final resolved = p.normalize(p.join(currentDir, importUri));
  if (resolved.startsWith('..')) return null;
  return extractFeature(resolved);
}

/// import 대상 레이어 통합 조회 (상대 경로와 package 모두 처리).
String? getImportTargetLayer(
  String importUri,
  String currentFilePath,
  String? packageName,
) {
  final layer = resolveRelativeImportLayer(importUri, currentFilePath);
  if (layer != null) return layer;
  return getImportLayerFromPackageUri(importUri, packageName);
}

/// import 대상 feature 통합 조회 (상대 경로와 package 모두 처리).
String? getImportTargetFeature(
  String importUri,
  String currentFilePath,
  String? packageName,
) {
  final feature = resolveRelativeImportFeature(importUri, currentFilePath);
  if (feature != null) return feature;
  return getImportFeatureFromPackageUri(importUri, packageName);
}

/// import 대상 경로에 `/domain/` 세그먼트가 포함되어 있는지 확인.
/// E6 룰에서 "presentation/bloc이 다른 feature의 domain 접근은 허용"을 판정할 때 사용.
bool isImportFromDomain(
  String importUri,
  String currentFilePath,
  String? packageName,
) {
  if (!importUri.startsWith('package:') && !importUri.startsWith('dart:')) {
    final currentDir = p.dirname(currentFilePath);
    final resolved = p.normalize(p.join(currentDir, importUri));
    return '/$resolved/'.contains('/domain/');
  }
  if (packageName != null) {
    final pkg = extractImportPackageName(importUri);
    if (pkg == packageName) {
      final inner = importUri.substring('package:$packageName/'.length);
      return '/$inner/'.contains('/domain/');
    }
  }
  return false;
}
