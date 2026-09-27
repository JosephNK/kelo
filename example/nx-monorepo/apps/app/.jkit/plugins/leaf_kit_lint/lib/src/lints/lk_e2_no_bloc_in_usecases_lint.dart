import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../helpers.dart';

/// LK_E2: usecases/는 bloc/ import 금지.
///
/// 의존 방향 역전 방지 — UseCase는 BLoC을 알 필요 없다 (presentation이
/// usecase를 호출). bloc → usecase는 정상, usecase → bloc은 archi 위반.
class LkE2NoBlocInUsecasesLint extends AnalysisRule {
  LkE2NoBlocInUsecasesLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const code = LintCode(
    'lk_e2_no_bloc_in_usecases',
    'usecases/ must not import bloc/ — UseCase belongs to domain layer '
        'and must not depend on presentation state management.',
    correctionMessage:
        'Remove bloc/ import. UseCase should expose pure domain interfaces '
        'and be called from bloc, not the other way around.',
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

  final LkE2NoBlocInUsecasesLint rule;
  final RuleContext context;

  @override
  void visitImportDirective(ImportDirective node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (!isUsecaseFile(filePath)) return;

    final importUri = node.uri.stringValue;
    if (importUri == null) return;
    if (isDartImport(importUri)) return;

    final projectPkg = getProjectPackageName(node);
    final targetLayer = getImportTargetLayer(importUri, filePath, projectPkg);
    if (targetLayer == 'bloc') {
      rule.reportAtNode(node.uri);
    }
  }
}
