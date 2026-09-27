import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../classification.dart';
import '../constants.dart';

/// AL_E1: codegen annotation 패키지만 외부 import 허용 — 도메인 순수성 유지.
///
/// 외부 런타임 의존성 차단. 허용 목록은 `codegenPackages` (freezed_annotation·json_annotation·meta·collection).
class AlE1EntitiesImportLint extends AnalysisRule {
  AlE1EntitiesImportLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  static const code = LintCode(
    'al_e1_entities_import',
    'entities/ must only import codegen annotations '
        '(freezed_annotation, json_annotation, meta, collection).',
    correctionMessage:
        'Remove the import or move this code to the adapters/ layer.',
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

  final AlE1EntitiesImportLint rule;
  final RuleContext context;

  @override
  void visitImportDirective(ImportDirective node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (classifyLayer(filePath) != 'entities') return;

    final importUri = node.uri.stringValue;
    if (importUri == null) return;

    if (isDartImport(importUri)) return;
    if (!importUri.startsWith('package:')) return;

    final packageName = extractImportPackageName(importUri);
    if (packageName == null) return;

    final projectPackage = getProjectPackageName(node);
    if (packageName == projectPackage) return;

    if (codegenPackages.contains(packageName)) return;

    rule.reportAtNode(node.uri);
  }
}
