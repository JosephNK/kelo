import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../classification.dart';

/// AL_S2: `app/lib/` 안에서 boundary 외 경로 금지 — 구조 일관성 강제.
///
/// `projectBoundaryElements` 패턴에 매칭되지 않는 파일은 `'other'`로 분류되며,
/// `unknownPathIgnores`(부트스트랩/DI/라우터)에도 안 걸리면 위반으로 보고.
/// NestJS `boundaries/no-unknown-files`에 대응. `packages/`, `test/` 등
/// `app/lib/` 외부는 검사 대상이 아니다.
class AlS2UnknownPathLint extends AnalysisRule {
  AlS2UnknownPathLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const code = LintCode(
    'al_s2_unknown_path',
    'File is outside any defined architecture boundary. '
        'Move it under a known layer (see lint-rules-structure-reference.md), '
        'or add a new BoundaryElement to boundary_element.dart.',
    correctionMessage:
        'Place the file under a boundary-mapped path (e.g. '
        'features/<feature>/{domain,infrastructure,presentation}/, '
        'common/{services,exceptions,env,events,extensions,theme,widgets}/), '
        'or extend projectBoundaryElements / unknownPathIgnores.',
    severity: DiagnosticSeverity.ERROR,
  );

  @override
  LintCode get diagnosticCode => code;

  @override
  void registerNodeProcessors(
    RuleVisitorRegistry registry,
    RuleContext context,
  ) {
    registry.addCompilationUnit(this, _Visitor(this, context));
  }
}

class _Visitor extends SimpleAstVisitor<void> {
  _Visitor(this.rule, this.context);

  final AlS2UnknownPathLint rule;
  final RuleContext context;

  @override
  void visitCompilationUnit(CompilationUnit node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (!isInAppLib(filePath)) return;
    if (matchesUnknownPathIgnore(filePath)) return;
    if (classifyLayer(filePath) != 'other') return;

    rule.reportAtToken(node.beginToken);
  }
}
