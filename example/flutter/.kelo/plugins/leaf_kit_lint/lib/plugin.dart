import 'package:analysis_server_plugin/plugin.dart';
import 'package:analysis_server_plugin/registry.dart';

import 'src/lints/lk_e2_no_bloc_in_usecases_lint.dart';
import 'src/lints/lk_e3_bloc_dependency_lint.dart';
import 'src/lints/lk_e6_no_cross_bloc_lint.dart';
import 'src/lints/lk_e8_no_direct_usecase_in_view_lint.dart';
import 'src/lints/lk_e9_preferred_widget_lint.dart';

final class LeafKitLintPlugin extends Plugin {
  @override
  String get name => 'leaf_kit_lint';

  @override
  void register(PluginRegistry registry) {
    registry
      ..registerWarningRule(LkE2NoBlocInUsecasesLint())
      ..registerWarningRule(LkE3BlocDependencyLint())
      ..registerWarningRule(LkE6NoCrossBlocLint())
      ..registerWarningRule(LkE8NoDirectUsecaseInViewLint())
      ..registerWarningRule(LkE9PreferredWidgetLint());
  }
}
