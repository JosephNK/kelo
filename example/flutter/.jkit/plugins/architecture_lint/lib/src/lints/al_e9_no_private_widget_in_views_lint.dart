import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../classification.dart';

/// AL_E9: presentation/views/와 presentation/pages/에서 private widget 클래스 선언 금지.
///
/// 화면 구성 통일성을 위해 sub-widget은 항상 `presentation/widgets/`로 추출한다.
/// `class _Foo extends StatelessWidget` / `extends StatefulWidget` 패턴 차단.
/// `State<T>` 동반 클래스는 자동 제외 (StatelessWidget/StatefulWidget 직접 상속이 아니므로).
class AlE9NoPrivateWidgetInViewsLint extends AnalysisRule {
  AlE9NoPrivateWidgetInViewsLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  /// 검사 대상 supertype. 직접 상속만 검사하여 false positive 차단.
  /// 간접 상속(예: `LeafScreenStatefulWidget` → `StatefulWidget`)은 의도적으로 미검사.
  static const _widgetSupertypes = <String>{
    'StatelessWidget',
    'StatefulWidget',
  };

  static const code = LintCode(
    'al_e9_no_private_widget_in_views',
    'presentation/views/ and presentation/pages/ must not declare private '
        'widget classes (_Xxx extends StatelessWidget|StatefulWidget).',
    correctionMessage:
        'Move the private widget to presentation/widgets/ as a public class. '
        'Keep view/page files free of inline widget declarations to enforce '
        'a consistent file structure.',
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

  final AlE9NoPrivateWidgetInViewsLint rule;
  final RuleContext context;

  @override
  void visitClassDeclaration(ClassDeclaration node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (!isInPresentationViewOrPage(filePath)) return;

    final name = node.namePart.typeName;
    if (!name.lexeme.startsWith('_')) return;

    final extendsClause = node.extendsClause;
    if (extendsClause == null) return;

    final superName = extendsClause.superclass.name.lexeme;
    if (!AlE9NoPrivateWidgetInViewsLint._widgetSupertypes.contains(superName)) {
      return;
    }

    rule.reportAtToken(name);
  }
}
