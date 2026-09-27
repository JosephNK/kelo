import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../helpers.dart';

/// LK_E6: feature 간 bloc/ cross-import 금지.
///
/// bloc은 단일 feature 내부 상태 — 다른 feature에서 직접 구독하면 결합도가
/// feature 단위를 깨뜨린다. cross-feature 통신은 entities/event-bus/DI로.
class LkE6NoCrossBlocLint extends AnalysisRule {
  LkE6NoCrossBlocLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const code = LintCode(
    'lk_e6_no_cross_bloc',
    'Cross-feature bloc/ imports are not allowed. '
        'BLoC is feature-internal state — use entities, event bus, or DI '
        'for cross-feature communication.',
    correctionMessage:
        'Move shared types to entities/ or use a feature-agnostic event bus. '
        "Never subscribe directly to another feature's BLoC.",
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
}

class _Visitor extends SimpleAstVisitor<void> {
  _Visitor(this.rule, this.context);

  final LkE6NoCrossBlocLint rule;
  final RuleContext context;

  @override
  void visitImportDirective(ImportDirective node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    final currentFeature = extractFeature(filePath);
    if (currentFeature == null) return;

    final importUri = node.uri.stringValue;
    if (importUri == null) return;
    if (isDartImport(importUri)) return;

    final projectPkg = getProjectPackageName(node);
    final targetFeature = getImportTargetFeature(
      importUri,
      filePath,
      projectPkg,
    );
    if (targetFeature == null || targetFeature == currentFeature) return;

    final targetLayer = getImportTargetLayer(importUri, filePath, projectPkg);
    if (targetLayer == 'bloc') {
      rule.reportAtNode(node.uri);
    }
  }
}
