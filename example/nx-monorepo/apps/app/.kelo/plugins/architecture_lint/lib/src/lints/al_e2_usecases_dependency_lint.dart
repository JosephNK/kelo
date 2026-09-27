import 'package:analyzer/analysis_rule/analysis_rule.dart';
import 'package:analyzer/analysis_rule/rule_context.dart';
import 'package:analyzer/analysis_rule/rule_visitor_registry.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/error/error.dart';

import '../classification.dart';

/// AL_E2: `entities/`/`ports/`/`exceptions/`만 import 허용 — adapters/presentation 금지.
///
/// 비즈니스 로직을 인프라/UI에서 분리해 UseCase 단독 단위 테스트 가능 유지.
/// 인프라 의존은 `ports/`로 추상화하고 DI로 `adapters/`를 주입한다.
/// stack-specific 추가 차단(예: bloc)은 별도 패키지가 자체 룰로 강제.
class AlE2UsecasesDependencyLint extends AnalysisRule {
  AlE2UsecasesDependencyLint()
      : super(
          name: code.lowerCaseName,
          description: code.problemMessage,
        );

  // common_services 레이어는 forbidden에서 제외 — value-object/config/state/exception
  // 등 공용 서비스의 보조 타입은 usecase에서 자유롭게 import 가능.
  // (common/services 의 adapter 구현체는 별도 'adapters' 레이어로 분류되어 차단됨)
  static const _forbidden = <String>{'adapters', 'presentation'};

  static const code = LintCode(
    'al_e2_usecases_dependency',
    'usecases/ must not import adapters/ or presentation/. '
        'Only entities/, ports/, and exceptions/ are allowed.',
    correctionMessage:
        'Inject dependencies through ports/ and use DI to wire adapters.',
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

  static bool isForbiddenLayer(String layer) => _forbidden.contains(layer);
}

class _Visitor extends SimpleAstVisitor<void> {
  _Visitor(this.rule, this.context);

  final AlE2UsecasesDependencyLint rule;
  final RuleContext context;

  @override
  void visitImportDirective(ImportDirective node) {
    final filePath = getFilePath(node);
    if (filePath == null) return;
    if (classifyLayer(filePath) != 'usecases') return;

    final importUri = node.uri.stringValue;
    if (importUri == null) return;

    final packageName = getProjectPackageName(node);
    final targetLayer = getImportTargetLayer(importUri, filePath, packageName);
    if (targetLayer == null) return;

    if (AlE2UsecasesDependencyLint.isForbiddenLayer(targetLayer)) {
      rule.reportAtNode(node.uri);
    }
  }
}
