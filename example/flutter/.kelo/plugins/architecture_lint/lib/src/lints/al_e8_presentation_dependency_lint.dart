import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../classification.dart';
import '../constants.dart';

/// AL_E8: presentation/은 `adapters`/`ports` 직접 import 및 인프라 SDK import 금지.
///
/// UI(pages/views/widgets)는 인프라 SDK(`infraPackages`: dio·sqflite·firebase 등)를
/// 직접 다루지 않는다. 허용은 entities/·exceptions/·common/·di/·router/ 및 그 외 외부 UI 라이브러리.
/// stack-specific 추가 차단(예: bloc 경유 강제)은 별도 패키지가 자체 룰로 강제.
class AlE8PresentationDependencyLint extends AnalysisRule {
  AlE8PresentationDependencyLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const _forbidden = <String>{'adapters', 'ports'};

  static const code = LintCode(
    'al_e8_presentation_dependency',
    'presentation/ must not import adapters/, ports/, or '
        'infrastructure SDK packages.',
    correctionMessage:
        'Access data through a state/controller layer that calls a UseCase. '
        'Keep presentation/ thin — only widgets, UI state subscription, and '
        'event dispatch.',
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

  final AlE8PresentationDependencyLint rule;
  final RuleContext context;

  @override
  void visitImportDirective(ImportDirective node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (classifyLayer(filePath) != 'presentation') return;

    final importUri = node.uri.stringValue;
    if (importUri == null) return;

    if (isDartImport(importUri)) return;

    final importPkg = extractImportPackageName(importUri);
    final projectPkg = getProjectPackageName(node);

    // External package — block only infrastructure SDKs.
    if (importPkg != null && importPkg != projectPkg) {
      if (infraPackages.contains(importPkg)) {
        rule.reportAtNode(node.uri);
      }
      return;
    }

    final targetLayer = getImportTargetLayer(importUri, filePath, projectPkg);
    if (targetLayer == null) return;

    if (AlE8PresentationDependencyLint.isForbiddenLayer(targetLayer)) {
      rule.reportAtNode(node.uri);
    }
  }
}
