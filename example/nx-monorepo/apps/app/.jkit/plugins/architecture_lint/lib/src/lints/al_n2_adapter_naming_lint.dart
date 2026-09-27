import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../classification.dart';

/// AL_N2: 클래스명에 `Adapter` suffix 필수 (예: `AuthAdapter`, `ApiUserAdapter`).
///
/// Port ↔ Adapter 역할을 이름에서 구분 (예: `AuthPort` ↔ `AuthAdapter`).
class AlN2AdapterNamingLint extends AnalysisRule {
  AlN2AdapterNamingLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const code = LintCode(
    'al_n2_adapter_naming',
    "Adapter classes must end with 'Adapter'.",
    correctionMessage:
        "Rename the class to end with 'Adapter' "
        "(e.g., AuthAdapter, ApiUserAdapter).",
    severity: DiagnosticSeverity.WARNING,
  );

  @override
  LintCode get diagnosticCode => code;

  @override
  void registerNodeProcessors(
    RuleVisitorRegistry registry,
    RuleContext context,
  ) {
    registry.addClassDeclaration(this, _Visitor(this, context));
  }
}

class _Visitor extends SimpleAstVisitor<void> {
  _Visitor(this.rule, this.context);

  final AlN2AdapterNamingLint rule;
  final RuleContext context;

  @override
  void visitClassDeclaration(ClassDeclaration node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (classifyLayer(filePath) != 'adapters') return;

    final name = node.namePart.typeName;
    if (!name.lexeme.endsWith('Adapter')) {
      rule.reportAtToken(name);
    }
  }
}
