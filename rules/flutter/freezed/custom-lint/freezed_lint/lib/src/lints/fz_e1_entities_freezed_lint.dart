import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../helpers.dart';

/// FZ_E1: entities/ 클래스는 `@freezed` annotation 필수 — 도메인 모델 불변성 보장.
///
/// codegen 산출물(`.freezed.dart`/`.g.dart`)과 `_` 프리픽스 private class는 검사 제외.
class FzE1EntitiesFreezedLint extends AnalysisRule {
  FzE1EntitiesFreezedLint()
    : super(name: code.lowerCaseName, description: code.problemMessage);

  static const code = LintCode(
    'fz_e1_entities_freezed',
    'entities/ classes must be annotated with @freezed.',
    correctionMessage:
        'Add @freezed and convert to abstract class with const factory + _\$ClassName mixin '
        '(e.g., `@freezed abstract class User with _\$User { const factory User({...}) = _User; }`).',
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

  final FzE1EntitiesFreezedLint rule;
  final RuleContext context;

  @override
  void visitClassDeclaration(ClassDeclaration node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (isGeneratedFile(filePath)) return;
    if (!isEntitiesFile(filePath)) return;

    final nameToken = node.namePart.typeName;
    if (nameToken.lexeme.startsWith('_')) return;

    if (hasFreezedAnnotation(node)) return;
    rule.reportAtToken(nameToken);
  }
}
