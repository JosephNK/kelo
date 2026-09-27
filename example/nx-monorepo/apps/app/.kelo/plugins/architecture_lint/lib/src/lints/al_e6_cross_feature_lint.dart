import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../classification.dart';
import '../constants.dart';

/// AL_E6: feature 간 cross-import는 `entities/`와 다른 feature `domain/`만 허용.
///
/// feature 모듈 독립성 보장 — 결합은 entities 수준으로만.
/// 금지 타깃은 `crossFeatureForbidden` (ports·adapters·usecases).
/// 예외: `presentation/`이 다른 feature `domain/` 접근 허용 (DI/이벤트 버스 권장).
/// stack-specific 추가 차단(예: bloc)은 별도 패키지가 자체 룰로 강제.
class AlE6CrossFeatureLint extends AnalysisRule {
  AlE6CrossFeatureLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const code = LintCode(
    'al_e6_cross_feature',
    'Cross-feature imports of internal layers (ports/, adapters/, '
        'usecases/) are not allowed. '
        'Use DI or event bus for cross-feature communication.',
    correctionMessage:
        'Share types via entities/, inject dependencies through DI, '
        'or use an event bus for cross-feature communication.',
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

  final AlE6CrossFeatureLint rule;
  final RuleContext context;

  @override
  void visitImportDirective(ImportDirective node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    final currentFeature = extractFeature(filePath);
    if (currentFeature == null) return;

    final importUri = node.uri.stringValue;
    if (importUri == null) return;

    final projectPkg = getProjectPackageName(node);

    final targetFeature = getImportTargetFeature(
      importUri,
      filePath,
      projectPkg,
    );
    if (targetFeature == null || targetFeature == currentFeature) return;

    final targetLayer = getImportTargetLayer(importUri, filePath, projectPkg);

    if (targetLayer == 'entities') return;

    final currentLayer = classifyLayer(filePath);
    if (currentLayer == 'presentation') {
      if (isImportFromDomain(importUri, filePath, projectPkg)) {
        return;
      }
    }

    if (targetLayer != null && crossFeatureForbidden.contains(targetLayer)) {
      rule.reportAtNode(node.uri);
    }
  }
}
