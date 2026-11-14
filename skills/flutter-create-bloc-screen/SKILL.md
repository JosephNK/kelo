---
name: flutter-create-bloc-screen
description: Generates Flutter Screen files with BLoC. Use for requests like "Create Login screen", "Generate Settings screen", "Add new page".
argument-hint: "<ScreenName> [-entry <dir>] [-path <dir>]"
---

# Flutter Screen Generation Skill

Generates new Screen files along with BLoC files in a Flutter project.

## Arguments

- First value of `$ARGUMENTS`: Screen name (required, e.g. Login, Settings)
- `-entry <dir>`: Entry directory override (optional, e.g. `-entry app`). If omitted, resolved as described in Workflow step 1.
- `-path <dir>`: Parent feature path (optional, e.g. `-path user`, `-path account`). The screen name (snake_case) is automatically appended under this path.

## Workflow

1. **Parse arguments and resolve entry**: Extract Screen name, `-entry`, and `-path` from `$ARGUMENTS`.
   - `{entry}` = `-entry` value if given; otherwise `entryDir` from `kelo.yaml`; otherwise `app` if `app/lib/` exists, else `.` (project root).
   - If `-path <dir>` is present, use it as parent directory (screen name is appended automatically)
   - **Preconditions** — templates import `flutter_leaf_kit` and `freezed_annotation`. Check `{entry}/pubspec.yaml` has both `flutter_leaf_kit` and `freezed` dependencies; if either is missing, stop and tell the user (this skill targets the leaf-kit + freezed stacks).
2. **Determine path**:
   - `{feature_dir}` = `{path_value}/{screen_name_snake_case}` if `-path` is provided, otherwise `{screen_name_snake_case}`
   - Final path: `{entry}/lib/features/{feature_dir}/presentation/pages`
   - Example (with -path): `Settings -entry app -path user` → `app/lib/features/user/settings/presentation/pages/settings_screen.dart`
   - Example (no -path): `Login -entry app` → `app/lib/features/login/presentation/pages/login_screen.dart`
   - Example (entry `.`): `Login` → `lib/features/login/presentation/pages/login_screen.dart`
3. **Determine views path**:
   - Create views folder under the presentation folder
   - Example: `{entry}/lib/features/{feature_path}/presentation/views/`
4. **Determine BLoC path**:
   - Create bloc folder under the presentation folder (sibling of pages)
   - Example: `{entry}/lib/features/{feature_path}/presentation/bloc/`
5. **Resolve package name**: Read `{entry}/pubspec.yaml` and extract the `name:` field as `<package>`. This is required for emitting `package:` imports per `always_use_package_imports` lint.
6. **Generate templates**: Generate template code with the following commands. `<feature_dir>` = `{path_value}/{screen_name_snake_case}` if `-path` provided, otherwise `{screen_name_snake_case}`.

   ```bash
   # Screen template (package imports)
   cd ${CLAUDE_PLUGIN_ROOT} && node scripts/flutter/template/flutter-screen-template.mjs <ScreenName> --package <package> --feature-dir <feature_dir>

   # View templates
   cd ${CLAUDE_PLUGIN_ROOT} && node scripts/flutter/template/flutter-app-bar-template.mjs <ScreenName>
   cd ${CLAUDE_PLUGIN_ROOT} && node scripts/flutter/template/flutter-body-view-template.mjs <ScreenName>

   # BLoC templates
   cd ${CLAUDE_PLUGIN_ROOT} && node scripts/flutter/template/flutter-bloc-template.mjs <ScreenName> bloc
   cd ${CLAUDE_PLUGIN_ROOT} && node scripts/flutter/template/flutter-bloc-template.mjs <ScreenName> event
   cd ${CLAUDE_PLUGIN_ROOT} && node scripts/flutter/template/flutter-bloc-template.mjs <ScreenName> state
   ```

7. **Generate filenames**: Convert Screen name to snake_case
8. **Create directories**: Create directories with mkdir -p if they don't exist
9. **Save files**: Create files at the specified paths
10. **Run code generation**: Run build_runner in the entry folder (freezed 코드 생성)
    ```bash
    (cd {entry} && dart run build_runner build --delete-conflicting-outputs)
    ```

    - If `{entry}` is `.`, run in the project root
11. **Register DI**: Add BLoC registration to `{entry}/lib/di/injection_container.dart` (created by `/kelo:flutter-app-scaffold`; if the file does not exist, skip this step and report it)
    - Generate DI registration template:
      ```bash
      cd ${CLAUDE_PLUGIN_ROOT} && node scripts/flutter/template/flutter-di-template.mjs <ScreenName> <feature_dir> --package <package>
      ```
    - Add the import at the top of the file (with other BLoC imports). Use `package:<package>/...` form to satisfy `always_use_package_imports`.
    - Add `sl.registerFactory({ScreenName}Bloc.new);` in the `// BLoCs` section of `setupDependencies()` (tearoff form — avoids `unnecessary_lambdas`).
    - If the BLoC already exists in DI, confirm with the user before proceeding (use AskUserQuestion with options: ["Yes, overwrite", "No, skip"])
12. **Register route**: Add route to `{entry}/lib/router/router.dart` (if the file does not exist, skip this step and report it)
    - Ask the user whether to use NoTransitionPage before adding the route (use AskUserQuestion with options: ["Yes", "No"])
    - Generate route template:

      ```bash
      # Default (using builder)
      cd ${CLAUDE_PLUGIN_ROOT} && node scripts/flutter/template/flutter-route-template.mjs <ScreenName> <path>

      # NoTransitionPage wrapping (using pageBuilder)
      cd ${CLAUDE_PLUGIN_ROOT} && node scripts/flutter/template/flutter-route-template.mjs <ScreenName> <path> -nt
      ```

    - `<path>` rule:
      - Route segments use kebab-case of the Screen name (URL convention; file names stay snake_case)
      - If `-path` is provided: `/{path_value}/{screen_name_kebab_case}` (e.g. `-path user` + `Settings` → `/user/settings`, `-path user` + `NotificationSettings` → `/user/notification-settings`)
      - If `-path` is absent: `/{screen_name_kebab_case}` (e.g. `Login` → `/login`, `UserSettings` → `/user-settings`)
      - Exception: Use `/` for the first route (home)
    - Insert generated code inside the `routes: <RouteBase>[...]` array (append after existing routes)
    - Add required imports to router.dart (use `package:` form to satisfy `always_use_package_imports`):
      ```dart
      // {feature_dir} = {path_value}/{screen_name_snake_case} if -path provided, otherwise {screen_name_snake_case}
      import 'package:<package>/features/{feature_dir}/presentation/bloc/{screen_name_snake_case}_bloc.dart';
      import 'package:<package>/features/{feature_dir}/presentation/pages/{screen_name_snake_case}_screen.dart';
      ```
    - If a route for the same Screen already exists, confirm with the user before proceeding (use AskUserQuestion with options: ["Yes, overwrite route", "No, skip route"])

## Generated Files

When running `/flutter-create-bloc-screen Login -entry app`:

```
app/lib/features/login/presentation/
├── bloc/
│   ├── login_bloc.dart
│   ├── login_bloc.freezed.dart  ← Auto-generated by build_runner
│   ├── login_event.dart
│   └── login_state.dart
├── pages/
│   └── login_screen.dart
└── views/
    ├── login_app_bar.dart
    └── login_body_view.dart
```

When running `/flutter-create-bloc-screen Settings -entry app -path user`:

```
app/lib/features/user/settings/presentation/
├── bloc/
│   ├── settings_bloc.dart
│   ├── settings_bloc.freezed.dart  ← Auto-generated by build_runner
│   ├── settings_event.dart
│   └── settings_state.dart
├── pages/
│   └── settings_screen.dart
└── views/
    ├── settings_app_bar.dart
    └── settings_body_view.dart
```

## Filename Conversion Rules

- PascalCase → snake_case
- Includes appropriate suffix for each file type
- Example: `Login` → `login_screen.dart`, `login_bloc.dart`, `login_app_bar.dart`, `login_body_view.dart`
- Example: `UserSettings` → `user_settings_screen.dart`, `user_settings_bloc.dart`, `user_settings_app_bar.dart`, `user_settings_body_view.dart`

## Usage Examples

```
/flutter-create-bloc-screen Login -entry app
→ Create app/lib/features/login/presentation/pages/login_screen.dart
→ Create app/lib/features/login/presentation/bloc/login_bloc.dart
→ Create app/lib/features/login/presentation/bloc/login_event.dart
→ Create app/lib/features/login/presentation/bloc/login_state.dart
→ Create app/lib/features/login/presentation/views/login_app_bar.dart
→ Create app/lib/features/login/presentation/views/login_body_view.dart
→ Route path: /login

/flutter-create-bloc-screen Login
→ Create {entryDir}/lib/features/login/presentation/pages/login_screen.dart (entry from kelo.yaml)
→ Create lib/features/login/presentation/bloc/login_bloc.dart
→ ...

/flutter-create-bloc-screen Settings -entry app -path user
→ Create app/lib/features/user/settings/presentation/pages/settings_screen.dart
→ Create app/lib/features/user/settings/presentation/bloc/settings_bloc.dart
→ Create app/lib/features/user/settings/presentation/bloc/settings_event.dart
→ Create app/lib/features/user/settings/presentation/bloc/settings_state.dart
→ Create app/lib/features/user/settings/presentation/views/settings_app_bar.dart
→ Create app/lib/features/user/settings/presentation/views/settings_body_view.dart
→ Route path: /user/settings

/flutter-create-bloc-screen Profile -entry app -path account
→ Create app/lib/features/account/profile/presentation/pages/profile_screen.dart
→ Create app/lib/features/account/profile/presentation/bloc/profile_bloc.dart
→ Create app/lib/features/account/profile/presentation/bloc/profile_event.dart
→ Create app/lib/features/account/profile/presentation/bloc/profile_state.dart
→ Create app/lib/features/account/profile/presentation/views/profile_app_bar.dart
→ Create app/lib/features/account/profile/presentation/views/profile_body_view.dart
→ Route path: /account/profile
```

## Notes

- `{feature_dir}` = `{path_value}/{screen_name_snake_case}` if `-path` provided, otherwise `{screen_name_snake_case}`
- `-path` supports nested directories (e.g. `-path user`, `-path account/sub`)
- Creates directories first if the path doesn't exist
- If a file already exists, confirms with the user before overwriting (use AskUserQuestion with options: ["Yes, overwrite", "No, skip"])
- BLoC folder is created at the same level as pages (under presentation)
