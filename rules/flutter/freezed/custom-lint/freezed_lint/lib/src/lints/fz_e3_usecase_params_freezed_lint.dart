import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../helpers.dart';

/// FZ_E3: usecases/의 `*Params` 클래스는 `@freezed` annotation 필수 — 입력 모델 불변성.
///
/// codegen 산출물과 `_` 프리픽스 private class는 검사 제외.
class FzE3UsecaseParamsFreezedLint extends AnalysisRule {
  FzE3UsecaseParamsFreezedLint()
    : super(name: code.lowerCaseName, description: code.problemMessage);

  static const code = LintCode(
    'fz_e3_usecase_params_freezed',
    'usecases/ Params classes must be annotated with @freezed.',
    correctionMessage:
        'Add @freezed and convert to abstract class with const factory + _\$ClassName mixin '
        '(e.g., `@freezed abstract class FooParams with _\$FooParams { const factory FooParams({...}) = _FooParams; }`).',
    severity: DiagnosticSeverity.ERROR,
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

  final FzE3UsecaseParamsFreezedLint rule;
  final RuleContext context;

  @override
  void visitClassDeclaration(ClassDeclaration node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (isGeneratedFile(filePath)) return;
    if (!isUsecaseFile(filePath)) return;

    final nameToken = node.namePart.typeName;
    final name = nameToken.lexeme;
    if (name.startsWith('_')) return;
    if (!name.endsWith('Params')) return;

    if (hasFreezedAnnotation(node)) return;
    rule.reportAtToken(nameToken);
  }
}
