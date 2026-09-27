import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../classification.dart';
import '../constants.dart';

/// AL_S1: 파일당 800줄 초과 금지 (codegen 산출물 `*.g.dart` 등 제외) — 단일 책임 위반 신호.
///
/// 800은 경험적 임계치. 한계값은 `maxFileLines` 상수로 조정 가능.
/// 제외 대상은 `generatedFileSuffixes` (build_runner/freezed/auto_route/injectable/mockito).
class AlS1FileSizeLint extends AnalysisRule {
  AlS1FileSizeLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const code = LintCode(
    'al_s1_file_size',
    'File exceeds the maximum line count ($maxFileLines lines). '
        'Consider splitting into smaller files.',
    correctionMessage:
        'Split this file into smaller, focused files by responsibility.',
    severity: DiagnosticSeverity.WARNING,
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

  final AlS1FileSizeLint rule;
  final RuleContext context;

  @override
  void visitCompilationUnit(CompilationUnit node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (isGeneratedFile(filePath)) return;

    final lineCount = node.lineInfo.lineCount;
    if (lineCount > maxFileLines) {
      rule.reportAtToken(node.beginToken);
    }
  }
}
