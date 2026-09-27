import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../helpers.dart';

/// FZ_E2: bloc/의 `*Event`/`*State` 클래스는 `@freezed` annotation 필수 — sealed 패턴 강제.
///
/// codegen 산출물과 `_` 프리픽스 private class는 검사 제외.
class FzE2BlocEventStateFreezedLint extends AnalysisRule {
  FzE2BlocEventStateFreezedLint()
    : super(name: code.lowerCaseName, description: code.problemMessage);

  static const code = LintCode(
    'fz_e2_bloc_event_state_freezed',
    'bloc/ Event and State classes must be annotated with @freezed.',
    correctionMessage:
        'Add @freezed and convert to sealed class with named factory constructors '
        '(e.g., `@freezed sealed class FooEvent with _\$FooEvent { const factory FooEvent.x() = _X; }`).',
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

  final FzE2BlocEventStateFreezedLint rule;
  final RuleContext context;

  @override
  void visitClassDeclaration(ClassDeclaration node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (isGeneratedFile(filePath)) return;
    if (!isBlocFile(filePath)) return;

    final nameToken = node.namePart.typeName;
    final name = nameToken.lexeme;
    if (name.startsWith('_')) return;
    if (!name.endsWith('Event') && !name.endsWith('State')) return;

    if (hasFreezedAnnotation(node)) return;
    rule.reportAtToken(nameToken);
  }
}
