import 'package:analysis_server_plugin/plugin.dart';
import 'package:analysis_server_plugin/registry.dart';

import 'src/lints/al_e1_entities_import_lint.dart';
import 'src/lints/al_e2_usecases_dependency_lint.dart';
import 'src/lints/al_e4_domain_no_sdk_lint.dart';
import 'src/lints/al_e5_ports_no_framework_lint.dart';
import 'src/lints/al_e6_cross_feature_lint.dart';
import 'src/lints/al_e7_no_bare_catch_lint.dart';
import 'src/lints/al_e8_presentation_dependency_lint.dart';
import 'src/lints/al_e9_no_private_widget_in_views_lint.dart';
import 'src/lints/al_n1_port_naming_lint.dart';
import 'src/lints/al_n2_adapter_naming_lint.dart';
import 'src/lints/al_n3_usecase_naming_lint.dart';
import 'src/lints/al_s1_file_size_lint.dart';
import 'src/lints/al_s2_unknown_path_lint.dart';

/// Analyzer plugin entry point for `architecture_lint`.
///
/// Registered via `lib/main.dart` top-level `plugin` variable that the Dart
/// analysis server discovers when the package is listed in a project's
/// `analysis_options.yaml` `plugins:` section.
final class ArchitectureLintPlugin extends Plugin {
  @override
  String get name => 'architecture_lint';

  @override
  void register(PluginRegistry registry) {
    registry
      ..registerWarningRule(AlE1EntitiesImportLint())
      ..registerWarningRule(AlE2UsecasesDependencyLint())
      ..registerWarningRule(AlE4DomainNoSdkLint())
      ..registerWarningRule(AlE5PortsNoFrameworkLint())
      ..registerWarningRule(AlE6CrossFeatureLint())
      ..registerWarningRule(AlE7NoBareCatchLint())
      ..registerWarningRule(AlE8PresentationDependencyLint())
      ..registerWarningRule(AlE9NoPrivateWidgetInViewsLint())
      ..registerWarningRule(AlN1PortNamingLint())
      ..registerWarningRule(AlN2AdapterNamingLint())
      ..registerWarningRule(AlN3UseCaseNamingLint())
      ..registerWarningRule(AlS1FileSizeLint())
      ..registerWarningRule(AlS2UnknownPathLint());
  }
}
