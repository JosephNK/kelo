import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../helpers.dart';

const preferredWidgets = <String, String>{
  'CustomScrollView': 'LeafScrollView',
  'SingleChildScrollView': 'LeafScrollView',
  'ListView': 'LeafListView',
  'ListView.builder': 'LeafListView',
  'ListView.separated': 'LeafListView',
  'SliverList': 'LeafListView',
  'SliverList.separated': 'LeafListView',
  'GridView': 'LeafGridView',
  'GridView.builder': 'LeafGridView',
  'Text': 'LeafText',
  'Text.rich': 'LeafText.rich',
  'Switch': 'LeafSwitch',
  'CupertinoSwitch': 'LeafSwitch',
};

/// LK_E9: presentation/{pages,views,widgets}와 common/widgets에서 금지 위젯 직접 생성 금지 — leaf-kit 권장 위젯 사용 (`CustomScrollView`/`SingleChildScrollView` → `LeafScrollView`, `ListView`/`ListView.builder`/`ListView.separated`/`SliverList`/`SliverList.separated` → `LeafListView`, `GridView`/`GridView.builder` → `LeafGridView`, `Text`/`Text.rich` → `LeafText`/`LeafText.rich`, `Switch`/`CupertinoSwitch` → `LeafSwitch`).
///
/// leaf-kit UI 표준화 — raw Flutter 위젯 직접 사용을 막고 공통 래퍼로 수렴시켜
/// 스크롤/레이아웃 동작과 유지보수 기준을 일관되게 맞춘다.
class LkE9PreferredWidgetLint extends AnalysisRule {
  LkE9PreferredWidgetLint()
    : super(name: code.lowerCaseName, description: code.problemMessage);

  static const code = LintCode(
    'lk_e9_preferred_widget',
    'pages/ / views/ / widgets/ must not create restricted widgets directly. '
        'Use the leaf-kit preferred widget instead.',
    correctionMessage:
        'Replace the restricted widget with the matching leaf-kit wrapper.',
    severity: DiagnosticSeverity.ERROR,
  );

  @override
  LintCode get diagnosticCode => code;

  @override
  void registerNodeProcessors(
    RuleVisitorRegistry registry,
    RuleContext context,
  ) {
    registry.addInstanceCreationExpression(this, _Visitor(this, context));
  }
}

class _Visitor extends SimpleAstVisitor<void> {
  _Visitor(this.rule, this.context);

  final LkE9PreferredWidgetLint rule;
  final RuleContext context;

  @override
  void visitInstanceCreationExpression(InstanceCreationExpression node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (!isPreferredWidgetLintTargetFile(filePath)) return;

    final widgetName = node.constructorName.type.toSource().split('.').last;
    final ctorName = node.constructorName.name?.name;
    final lookupKey = ctorName == null ? widgetName : '$widgetName.$ctorName';

    final preferred =
        preferredWidgets[lookupKey] ?? preferredWidgets[widgetName];
    if (preferred == null) return;

    rule.reportAtNode(
      node.constructorName.type,
      arguments: [widgetName, preferred],
    );
  }
}
