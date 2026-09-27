// =============================================================================
// kelo_analysis:verify — 소비 프로젝트가 kelo 분석 규칙을 약화하지 않았는지 검사.
//
//   dart run kelo_analysis:verify [-p <project-dir>]
//
// 검사 항목 (위반 시 exit 1):
//   - kelo_analysis에 의존하는 패키지(같은 폴더 pubspec.yaml 기준)의
//     analysis_options.yaml이 package:kelo_analysis를 include하는지
//   - kelo가 켠 linter 규칙을 `false`로 끄는지
//   - kelo가 지정한 analyzer.errors severity를 낮추는지
//   - kelo가 켠 analyzer.language 옵션(strict-casts 등)을 끄는지
//   - kelo plugin(architecture_lint 등)의 diagnostics를 `false`로 끄는지
//   - 추가한 analyzer.exclude가 lib/ 소스 파일을 분석에서 빼는지
//   - kelo plugin이 절대 경로/git 으로 등록됐는지, vendoring된 복사본
//     (.kelo/plugins/<pkg>)이 .kelo-vendor.json 해시와 다른지
//   - 소스의 `// ignore:` / `// ignore_for_file:` 주석이 kelo 규칙을 끄는지
//     (생성 파일 *.g.dart, *.freezed.dart 등 kelo exclude 대상은 제외)
// =============================================================================

import 'dart:io';
import 'dart:isolate';

import 'package:crypto/crypto.dart';
import 'package:yaml/yaml.dart';

const _optionsFile = 'analysis_options.yaml';
const _keloInclude = 'package:kelo_analysis/';
const _pluginCodePrefixes = ['al_', 'lk_', 'fz_'];
const _keloPlugins = {'architecture_lint', 'leaf_kit_lint', 'freezed_lint'};
const _vendorManifest = '.kelo-vendor.json';
const _skipDirs = {
  '.dart_tool',
  '.git',
  'build',
  'node_modules',
  'android',
  'ios',
  'macos',
  'linux',
  'windows',
  'web',
  '.fvm',
};
const _severityRank = {'ignore': 0, 'info': 1, 'warning': 2, 'error': 3};

Future<void> main(List<String> args) async {
  var projectDir = Directory.current.path;
  for (var i = 0; i < args.length; i++) {
    if (args[i] == '-p' && i + 1 < args.length) {
      projectDir = args[++i];
    } else if (args[i] == '-h' || args[i] == '--help') {
      stdout.writeln('Usage: dart run kelo_analysis:verify [-p <project-dir>]');
      return;
    }
  }

  final policy = await _loadPolicy();
  final root = Directory(projectDir).absolute;
  final violations = <String>[];

  final optionFiles = _findFiles(root, (p) => p.endsWith('/$_optionsFile'));
  if (optionFiles.isEmpty) {
    violations.add('${root.path}: $_optionsFile가 없습니다.');
  }
  for (final file in optionFiles) {
    _checkOptionsFile(file, root.path, policy, violations);
  }

  final sources = _findFiles(
    root,
    (p) => p.endsWith('.dart') && !policy.isExcluded(p),
  );
  for (final file in sources) {
    _checkIgnoreComments(file, root.path, policy, violations);
  }

  if (violations.isEmpty) {
    stdout.writeln(
      'kelo_analysis:verify — OK (${optionFiles.length} options file(s), '
      '${sources.length} source file(s))',
    );
    return;
  }
  stderr.writeln('kelo_analysis:verify — kelo 규칙을 약화하는 설정이 있습니다:');
  for (final v in violations) {
    stderr.writeln('  - $v');
  }
  stderr.writeln('kelo 규칙 변경은 kelo 저장소에서 하세요. 프로젝트에서는 규칙 추가만 허용됩니다.');
  exitCode = 1;
}

class _Policy {
  _Policy(this.enabledRules, this.errors, this.language, this.excludes);

  final Set<String> enabledRules;
  final Map<String, String> errors;
  final Map<String, bool> language;
  final List<RegExp> excludes;

  bool isKeloRule(String code) =>
      enabledRules.contains(code) ||
      errors.containsKey(code) ||
      _pluginCodePrefixes.any(code.startsWith);

  bool isExcluded(String path) => excludes.any((re) => re.hasMatch(path));
}

Future<_Policy> _loadPolicy() async {
  final uri = await Isolate.resolvePackageUri(
    Uri.parse('${_keloInclude}analysis_options.yaml'),
  );
  if (uri == null) {
    stderr.writeln('kelo_analysis 패키지를 찾을 수 없습니다 (pub get 필요).');
    exit(2);
  }
  final doc = loadYaml(File.fromUri(uri).readAsStringSync()) as YamlMap;
  final analyzer = doc['analyzer'] as YamlMap?;
  final linterRules = (doc['linter'] as YamlMap?)?['rules'];

  final enabled = <String>{};
  if (linterRules is YamlMap) {
    linterRules.forEach((k, v) {
      if (v == true) enabled.add('$k');
    });
  } else if (linterRules is YamlList) {
    enabled.addAll(linterRules.map((e) => '$e'));
  }

  final errors = <String, String>{};
  (analyzer?['errors'] as YamlMap?)?.forEach((k, v) => errors['$k'] = '$v');

  final language = <String, bool>{};
  (analyzer?['language'] as YamlMap?)?.forEach((k, v) {
    if (v is bool) language['$k'] = v;
  });

  final excludes = <RegExp>[
    for (final g in (analyzer?['exclude'] as YamlList?) ?? const [])
      _globToRegExp('$g'),
  ];

  return _Policy(enabled, errors, language, excludes);
}

void _checkOptionsFile(
  File file,
  String root,
  _Policy policy,
  List<String> violations,
) {
  final where = file.path.substring(root.length + 1);
  final Object? doc;
  try {
    doc = loadYaml(file.readAsStringSync());
  } on YamlException catch (e) {
    violations.add('$where: YAML 파싱 실패 (${e.message})');
    return;
  }
  if (doc is! YamlMap) {
    violations.add('$where: kelo_analysis include가 없습니다.');
    return;
  }

  if (_dependsOnKelo(file.parent) && !_reachesKelo(file, <String>{})) {
    violations.add(
      '$where: include가 package:kelo_analysis/analysis_options.yaml에 연결되지 않습니다.',
    );
  }

  final rules = (doc['linter'] as YamlMap?)?['rules'];
  if (rules is YamlMap) {
    rules.forEach((k, v) {
      if (v == false && policy.enabledRules.contains('$k')) {
        violations.add('$where: linter.rules.$k: false');
      }
    });
  }

  final analyzer = doc['analyzer'] as YamlMap?;
  (analyzer?['errors'] as YamlMap?)?.forEach((k, v) {
    final code = '$k';
    final keloLevel =
        policy.errors[code] ??
        (policy.enabledRules.contains(code) ? 'info' : null);
    if (keloLevel == null && !_pluginCodePrefixes.any(code.startsWith)) return;
    final minRank = _severityRank[keloLevel ?? 'info'] ?? 0;
    final rank = _severityRank['$v'];
    if (rank != null && rank < minRank) {
      violations.add('$where: analyzer.errors.$code: $v');
    }
  });
  (analyzer?['language'] as YamlMap?)?.forEach((k, v) {
    if (policy.language['$k'] == true && v == false) {
      violations.add('$where: analyzer.language.$k: false');
    }
  });

  // analyzer.exclude — kelo가 이미 제외하는 생성 파일 외에 lib/ 소스를 가리면 위반
  final excludes = (analyzer?['exclude'] as YamlList?) ?? const [];
  for (final glob in excludes.map((e) => '$e')) {
    final re = _globToRegExp(glob);
    final hidden =
        _findFiles(
              file.parent,
              (p) => p.endsWith('.dart') && !policy.isExcluded(p),
            )
            .map((f) => f.path.substring(file.parent.path.length + 1))
            .where((rel) => rel.startsWith('lib/') && re.hasMatch(rel));
    if (hidden.isNotEmpty) {
      violations.add(
        '$where: analyzer.exclude "$glob"가 lib/ 소스를 제외합니다 (예: ${hidden.first})',
      );
    }
  }

  final plugins = doc['plugins'];
  if (plugins is YamlMap) {
    plugins.forEach((name, entry) {
      if (_keloPlugins.contains('$name') && entry is YamlMap) {
        _checkVendoredPlugin(file, where, '$name', entry, violations);
      }
      final diagnostics = entry is YamlMap ? entry['diagnostics'] : null;
      if (diagnostics is! YamlMap) return;
      diagnostics.forEach((code, enabled) {
        if (enabled == false && _pluginCodePrefixes.any('$code'.startsWith)) {
          violations.add('$where: plugins.$name.diagnostics.$code: false');
        }
      });
    });
  }
}

// kelo plugin 등록 방식과 vendoring 복사본 무결성을 검사한다.
void _checkVendoredPlugin(
  File optionsFile,
  String where,
  String name,
  YamlMap entry,
  List<String> violations,
) {
  if (entry['git'] != null) {
    violations.add(
      '$where: plugins.$name이 git 으로 등록됨 (진단이 동작하지 않음) — /kelo:flutter-sync로 재생성하세요.',
    );
    return;
  }
  final rel = entry['path'];
  if (rel is! String) return;
  if (rel.startsWith('/') || RegExp(r'^[A-Za-z]:[\\/]').hasMatch(rel)) {
    violations.add(
      '$where: plugins.$name.path가 절대 경로($rel) — 다른 PC/CI에서 동작하지 않음. /kelo:flutter-sync로 재생성하세요.',
    );
    return;
  }
  final dir = Directory.fromUri(optionsFile.parent.absolute.uri.resolve(rel));
  final manifestFile = File('${dir.path}/$_vendorManifest');
  if (!manifestFile.existsSync()) {
    violations.add('$where: plugins.$name 복사본에 $_vendorManifest가 없습니다 ($rel).');
    return;
  }
  final expected = <String, String>{};
  final manifest = loadYaml(manifestFile.readAsStringSync());
  final files = manifest is YamlMap ? manifest['files'] : null;
  if (files is YamlMap) {
    files.forEach((k, v) => expected['$k'] = '$v');
  }
  final actual = <String, String>{};
  for (final entity in dir.listSync(recursive: true, followLinks: false)) {
    if (entity is! File) continue;
    final relPath = entity.path
        .substring(dir.path.length)
        .replaceAll('\\', '/');
    final key = relPath.startsWith('/') ? relPath.substring(1) : relPath;
    if (key == _vendorManifest) continue;
    actual[key] = sha256.convert(entity.readAsBytesSync()).toString();
  }
  final changed = <String>[
    for (final k in {...expected.keys, ...actual.keys})
      if (expected[k] != actual[k]) k,
  ]..sort();
  if (changed.isNotEmpty) {
    violations.add(
      '$where: vendoring된 $name 복사본이 변경됨 (${changed.take(3).join(', ')}'
      '${changed.length > 3 ? ' 외 ${changed.length - 3}개' : ''}) — 직접 수정 금지, /kelo:flutter-sync로 재생성하세요.',
    );
  }
}

// 같은 폴더의 pubspec.yaml이 kelo_analysis에 의존하는지 (workspace 루트처럼
// kelo 규칙을 적용하지 않는 패키지의 options 파일은 include 검사 대상이 아니다).
bool _dependsOnKelo(Directory dir) {
  final pubspec = File('${dir.path}/pubspec.yaml');
  if (!pubspec.existsSync()) return false;
  final Object? doc;
  try {
    doc = loadYaml(pubspec.readAsStringSync());
  } on YamlException {
    return false;
  }
  if (doc is! YamlMap) return false;
  for (final key in ['dependencies', 'dev_dependencies']) {
    final deps = doc[key];
    if (deps is YamlMap && deps.containsKey('kelo_analysis')) return true;
  }
  return false;
}

// include 체인을 따라가 package:kelo_analysis에 도달하는지 확인한다.
bool _reachesKelo(File file, Set<String> seen) {
  if (!seen.add(file.absolute.path) || !file.existsSync()) return false;
  final Object? doc;
  try {
    doc = loadYaml(file.readAsStringSync());
  } on YamlException {
    return false;
  }
  if (doc is! YamlMap) return false;
  final include = doc['include'];
  final targets = include is YamlList
      ? include.map((e) => '$e').toList()
      : [if (include != null) '$include'];
  for (final t in targets) {
    if (t.startsWith(_keloInclude)) return true;
    if (!t.startsWith('package:')) {
      final next = File.fromUri(file.absolute.uri.resolve(t));
      if (_reachesKelo(next, seen)) return true;
    }
  }
  return false;
}

final _ignoreComment = RegExp(r'//\s*ignore(_for_file)?\s*:\s*([^\n]*)');

void _checkIgnoreComments(
  File file,
  String root,
  _Policy policy,
  List<String> violations,
) {
  final lines = file.readAsLinesSync();
  for (var i = 0; i < lines.length; i++) {
    final m = _ignoreComment.firstMatch(lines[i]);
    if (m == null) continue;
    final codes = m
        .group(2)!
        .split(',')
        .map((c) => c.trim().split(RegExp(r'\s')).first)
        .map((c) => c.contains('|') ? c.split('|').last : c)
        .where((c) => c.isNotEmpty && policy.isKeloRule(c));
    for (final code in codes) {
      final rel = file.path.substring(root.length + 1);
      violations.add('$rel:${i + 1}: // ignore: $code');
    }
  }
}

List<File> _findFiles(Directory root, bool Function(String path) accept) {
  final out = <File>[];
  void walk(Directory dir) {
    for (final entity in dir.listSync(followLinks: false)) {
      final name = entity.uri.pathSegments.lastWhere((s) => s.isNotEmpty);
      if (entity is Directory) {
        if (_skipDirs.contains(name) || name.startsWith('.')) continue;
        walk(entity);
      } else if (entity is File && accept(entity.path)) {
        out.add(entity);
      }
    }
  }

  walk(root);
  out.sort((a, b) => a.path.compareTo(b.path));
  return out;
}

// analyzer.exclude glob(`**/*.g.dart` 등)을 경로 매칭용 정규식으로 변환.
RegExp _globToRegExp(String glob) {
  final buf = StringBuffer();
  for (var i = 0; i < glob.length; i++) {
    final c = glob[i];
    if (c == '*') {
      final isDouble = i + 1 < glob.length && glob[i + 1] == '*';
      if (isDouble) {
        buf.write('.*');
        i++;
        if (i + 1 < glob.length && glob[i + 1] == '/') i++;
      } else {
        buf.write('[^/]*');
      }
    } else if ('.+?^\$()[]{}|\\'.contains(c)) {
      buf.write('\\$c');
    } else {
      buf.write(c);
    }
  }
  return RegExp('${buf.toString()}\$');
}
