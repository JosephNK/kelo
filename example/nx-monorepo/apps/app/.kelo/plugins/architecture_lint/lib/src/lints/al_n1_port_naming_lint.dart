import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../classification.dart';

/// AL_N1: 클래스명에 `Port` suffix 필수 (예: `AuthPort`, `UserRepositoryPort`).
///
/// 클래스명만으로 레이어 역할을 즉시 식별 — grep/리뷰 효율.
class AlN1PortNamingLint extends AnalysisRule {
  AlN1PortNamingLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const code = LintCode(
    'al_n1_port_naming',
    "Port classes must end with 'Port'.",
    correctionMessage:
        "Rename the class to end with 'Port' "
        "(e.g., AuthPort, UserRepositoryPort).",
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

  final AlN1PortNamingLint rule;
  final RuleContext context;

  @override
  void visitClassDeclaration(ClassDeclaration node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (classifyLayer(filePath) != 'ports') return;

    final name = node.namePart.typeName;
    if (!name.lexeme.endsWith('Port')) {
      rule.reportAtToken(name);
    }
  }
}
