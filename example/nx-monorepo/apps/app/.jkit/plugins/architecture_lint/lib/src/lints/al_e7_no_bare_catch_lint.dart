import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

/// AL_E7: bare `catch` 금지 — `on ExceptionType catch (e)` 형태 강제.
///
/// 의도한 예외만 처리하고 프로그래밍 오류(`Error` 계열)는 전파한다.
class AlE7NoBareCatchLint extends AnalysisRule {
  AlE7NoBareCatchLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const code = LintCode(
    'al_e7_no_bare_catch',
    "Bare catch is not allowed. Use 'on ExceptionType catch (e)' instead.",
    correctionMessage:
        "Specify the exception type: 'on SpecificException catch (e)'.",
    severity: DiagnosticSeverity.ERROR,
  );

  @override
  LintCode get diagnosticCode => code;

  @override
  void registerNodeProcessors(
    RuleVisitorRegistry registry,
    RuleContext context,
  ) {
    registry.addCatchClause(this, _Visitor(this, context));
  }
}

class _Visitor extends SimpleAstVisitor<void> {
  _Visitor(this.rule, this.context);

  final AlE7NoBareCatchLint rule;
  final RuleContext context;

  @override
  void visitCatchClause(CatchClause node) {
    if (node.exceptionType != null) return;
    final keyword = node.catchKeyword;
    if (keyword != null) {
      rule.reportAtToken(keyword);
    } else {
      rule.reportAtNode(node);
    }
  }
}
