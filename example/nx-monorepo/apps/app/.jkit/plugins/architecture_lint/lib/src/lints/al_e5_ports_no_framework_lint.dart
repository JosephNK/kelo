import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../classification.dart';
import '../constants.dart';

/// AL_E5: framework 패키지(flutter/dio 등) import 금지 — 시그니처에 framework 타입 노출 차단.
///
/// Port는 추상 인터페이스이므로 도메인 타입만 사용해 구현 교체·테스트 용이성 유지.
/// 금지 목록은 `frameworkPackages` (= `infraPackages` + flutter; BuildContext·dio Response 등 누출 방지).
class AlE5PortsNoFrameworkLint extends AnalysisRule {
  AlE5PortsNoFrameworkLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const code = LintCode(
    'al_e5_ports_no_framework',
    'ports/ must not import framework packages (dio, flutter, etc.). '
        'Use domain types only.',
    correctionMessage:
        'Define port interfaces using only domain types (entities, '
        'exceptions). Framework types belong in adapters/.',
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

  final AlE5PortsNoFrameworkLint rule;
  final RuleContext context;

  @override
  void visitImportDirective(ImportDirective node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (classifyLayer(filePath) != 'ports') return;

    final importUri = node.uri.stringValue;
    if (importUri == null) return;

    final packageName = extractImportPackageName(importUri);
    if (packageName == null) return;

    final projectPkg = getProjectPackageName(node);
    if (packageName == projectPkg) return;

    if (frameworkPackages.contains(packageName)) {
      rule.reportAtNode(node.uri);
    }
  }
}
