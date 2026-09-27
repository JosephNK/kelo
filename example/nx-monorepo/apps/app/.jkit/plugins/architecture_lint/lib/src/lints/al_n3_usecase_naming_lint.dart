import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../classification.dart';

/// AL_N3: 클래스명에 `UseCase` 또는 `Params` suffix 필수 (예: `GetUserUseCase`, `GetUserParams`).
///
/// `*UseCase` = Command/Query 객체, `*Params` = 입력 캡슐 — 폴더에 헬퍼·유틸 혼입 방지.
class AlN3UseCaseNamingLint extends AnalysisRule {
  AlN3UseCaseNamingLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const code = LintCode(
    'al_n3_usecase_naming',
    "UseCase classes must end with 'UseCase' or 'Params'.",
    correctionMessage:
        "Rename the class to end with 'UseCase' "
        "(e.g., GetUserUseCase) or 'Params' (e.g., GetUserParams).",
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

  final AlN3UseCaseNamingLint rule;
  final RuleContext context;

  @override
  void visitClassDeclaration(ClassDeclaration node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (classifyLayer(filePath) != 'usecases') return;

    final name = node.namePart.typeName;
    final lex = name.lexeme;
    if (!lex.endsWith('UseCase') && !lex.endsWith('Params')) {
      rule.reportAtToken(name);
    }
  }
}
