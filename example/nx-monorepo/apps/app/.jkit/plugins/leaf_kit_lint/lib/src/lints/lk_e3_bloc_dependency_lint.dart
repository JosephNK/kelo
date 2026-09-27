import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../constants.dart';
import '../helpers.dart';

/// LK_E3: bloc/은 `blocAllowedPackages` + `leafKitBlocAllowed` entrypoint만 허용 — `adapters/`/`ports/` 직접 import 차단. freezed 스택 활성 시 `freezedStackBlocAllowed`(=`freezed_annotation`)가 화이트리스트에 자동 합쳐짐.
///
/// bloc은 상태 관리 + 이벤트 처리만 담당 — 인프라(`adapters/`)/추상 인터페이스
/// (`ports/`) 직접 의존 시 책임 분리 위반. 데이터 접근은 UseCase 경유.
/// freezed 스택(=pubspec의 `freezed_annotation` 의존성) 감지 시 freezed_lint의
/// FZ_E2가 강제하는 `@freezed` Event/State 작성을 위해 import를 자동 허용.
class LkE3BlocDependencyLint extends AnalysisRule {
  LkE3BlocDependencyLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const _forbidden = <String>{'adapters', 'ports'};

  static const code = LintCode(
    'lk_e3_bloc_dependency',
    'bloc/ may only import flutter, flutter_bloc, bloc, equatable, meta, '
        'collection, or flutter_leaf_kit_state.dart / flutter_leaf_kit_core.dart. '
        'adapters/ and ports/ direct imports are not allowed.',
    correctionMessage:
        'Inject UseCase via constructor and call it from bloc — '
        'never reach for adapters/ or ports/ directly.',
    severity: DiagnosticSeverity.ERROR,
  );

  @override
  LintCode get diagnosticCode => code;

  @override
  void registerNodeProcessors(
    RuleVisitorRegistry registry,
    RuleContext context,
  ) {
    registry.addImportDirective(this, _Visitor(this, context));
  }

  static bool isForbiddenLayer(String layer) => _forbidden.contains(layer);
}

class _Visitor extends SimpleAstVisitor<void> {
  _Visitor(this.rule, this.context);

  final LkE3BlocDependencyLint rule;
  final RuleContext context;

  @override
  void visitImportDirective(ImportDirective node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (!isBlocFile(filePath)) return;

    final importUri = node.uri.stringValue;
    if (importUri == null) return;
    if (isDartImport(importUri)) return;

    final importPkg = extractImportPackageName(importUri);
    final projectPkg = getProjectPackageName(node);

    // External package — must match whitelist or leaf_kit allowed entry.
    if (importPkg != null && importPkg != projectPkg) {
      if (matchesPackageEntry(importUri, leafKitBlocAllowed)) return;
      if (blocAllowedPackages.contains(importPkg)) return;
      // freezed 스택 활성 시 `freezed_annotation` import 자동 허용 (FZ_E2 interop).
      if (freezedStackBlocAllowed.contains(importPkg) &&
          projectHasFreezedStack(filePath)) {
        return;
      }
      rule.reportAtNode(node.uri);
      return;
    }

    final targetLayer = getImportTargetLayer(importUri, filePath, projectPkg);
    if (targetLayer == null) return;
    if (LkE3BlocDependencyLint.isForbiddenLayer(targetLayer)) {
      rule.reportAtNode(node.uri);
    }
  }
}
