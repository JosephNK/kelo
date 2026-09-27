import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../classification.dart';
import '../constants.dart';

/// AL_E4: 도메인 레이어(entities/ports/usecases/exceptions)는 인프라 SDK import 금지.
///
/// 테스트 가능성·이식성 보장 — 인프라 접근은 `adapters/`에서만.
/// 금지 목록은 `infraPackages` (dio·http·drift·sqflite·firebase 계열 등).
class AlE4DomainNoSdkLint extends AnalysisRule {
  AlE4DomainNoSdkLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const code = LintCode(
    'al_e4_domain_no_sdk',
    'External SDK packages must not be imported in domain layers '
        '(entities/, ports/, usecases/, exceptions/).',
    correctionMessage:
        'Move infrastructure dependencies to adapters/ and define '
        'abstractions in ports/.',
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

  final AlE4DomainNoSdkLint rule;
  final RuleContext context;

  @override
  void visitImportDirective(ImportDirective node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    final layer = classifyLayer(filePath);
    if (!domainLayers.contains(layer)) return;

    final importUri = node.uri.stringValue;
    if (importUri == null) return;

    final packageName = extractImportPackageName(importUri);
    if (packageName == null) return;

    final projectPkg = getProjectPackageName(node);
    if (packageName == projectPkg) return;

    if (infraPackages.contains(packageName)) {
      rule.reportAtNode(node.uri);
    }
  }
}
