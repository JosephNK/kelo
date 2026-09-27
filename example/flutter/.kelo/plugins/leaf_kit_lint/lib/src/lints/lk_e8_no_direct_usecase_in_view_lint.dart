import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../helpers.dart';

/// LK_E8: presentation/{pages,views,widgets}에서 usecases/ 직접 import 금지.
/// (bloc/은 예외 — bloc은 usecase를 직접 호출해야 한다)
///
/// View 레이어가 UseCase를 직접 호출하면 BLoC 경유 상태 관리가 우회된다.
/// 데이터/상태 흐름: view → bloc(event) → usecase → repository.
class LkE8NoDirectUsecaseInViewLint extends AnalysisRule {
  LkE8NoDirectUsecaseInViewLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const code = LintCode(
    'lk_e8_no_direct_usecase_in_view',
    'pages/ / views/ / widgets/ must not import usecases/ directly. '
        'Dispatch a bloc event instead — UseCase is called from BLoC.',
    correctionMessage:
        'Define a bloc event and call the UseCase from the bloc handler. '
        'View should only emit events and consume state.',
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

  final LkE8NoDirectUsecaseInViewLint rule;
  final RuleContext context;

  @override
  void visitImportDirective(ImportDirective node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (!isPresentationViewFile(filePath)) return;

    final importUri = node.uri.stringValue;
    if (importUri == null) return;
    if (isDartImport(importUri)) return;

    final projectPkg = getProjectPackageName(node);
    final targetLayer = getImportTargetLayer(importUri, filePath, projectPkg);
    if (targetLayer == 'usecases') {
      rule.reportAtNode(node.uri);
    }
  }
}
