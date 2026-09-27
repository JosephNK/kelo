# Flutter Build and Fix

Incrementally fix build and analysis errors with minimal, safe changes.

## Step 1: Run Build & Analysis

Run Flutter build and static analysis:

```bash
# Static analysis (lint + type checks + kelo analyzer plugin rules)
# Use `dart analyze`, not `flutter analyze` — flutter analyze drops analyzer
# plugin diagnostics (flutter/flutter#187999).
dart analyze --fatal-infos

# Build check (iOS)
flutter build ios --no-codesign

# Build check (Android)
flutter build appbundle --debug

# Dart format check
dart format --set-exit-if-changed .
```

## Step 2: Parse and Group Errors

1. Run the build/analysis command and capture output
2. Group errors by file path
3. Sort by dependency order (fix imports/types before logic errors)
4. Count total errors for progress tracking

## Step 3: Fix Loop (One Error at a Time)

For each error:

1. **Read the file** — Use Read tool to see error context (10 lines around the error)
2. **Diagnose** — Identify root cause (missing import, wrong type, syntax error)
3. **Fix minimally** — Use Edit tool for the smallest change that resolves the error
4. **Re-run analysis** — `dart analyze --fatal-infos` to verify the error is gone and no new errors introduced
5. **Move to next** — Continue with remaining errors

## Step 4: Guardrails

Stop and ask the user if:
- A fix introduces **more errors than it resolves**
- The **same error persists after 3 attempts** (likely a deeper issue)
- The fix requires **architectural changes** (not just a build fix)
- Build errors stem from **missing dependencies** (need `flutter pub get`, `flutter pub add`, etc.)

## Step 5: Summary

Show results:
- Errors fixed (with file paths)
- Errors remaining (if any)
- New errors introduced (should be zero)
- Suggested next steps for unresolved issues

## Recovery Strategies

| Situation | Action |
|-----------|--------|
| Missing import/package | Check `pubspec.yaml`; suggest `flutter pub add` or add import |
| Type mismatch | Read both type definitions; fix the narrower type |
| Null safety error | Add null check, use `?`, `!`, or provide default value |
| Missing override | Add `@override` annotation or implement required method |
| Deprecated API | Find replacement API in Flutter/Dart docs |
| Code generation outdated | Run `dart run build_runner build --delete-conflicting-outputs` |
| Platform config issue | Check `android/`, `ios/` config files against working defaults |

Fix one error at a time for safety. Prefer minimal diffs over refactoring.
