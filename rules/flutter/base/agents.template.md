# {{PROJECT_NAME}}

**Before writing code, read:**
- @{{DOCS_DIR}}ARCHITECTURE.md — folder structure (enforced by lint)
- @{{DOCS_DIR}}CONVENTIONS.md — team conventions lint cannot enforce

## Rules

- Architecture and code rules are enforced by lint. After changing code, run `dart analyze` and `dart run kelo_analysis:verify`, and fix errors in code, not in config.
- Never modify or bypass rules on your own — ask the user first. `analysis_options.yaml` and `.kelo/plugins/**` are kelo-managed (edits are blocked), and `// ignore:` comments for kelo rules are rejected by `verify`.
- Commits follow Conventional Commits (enforced by commitlint).

See @AGENTS.PROJECT.md for project-specific guidance.
