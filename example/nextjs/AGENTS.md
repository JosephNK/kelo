# example-nextjs

**Before writing code, read:**
- @docs/ARCHITECTURE.md — folder structure (enforced by lint)
- @docs/CONVENTIONS.md — team conventions lint cannot enforce

## Rules

- Architecture and code rules are enforced by lint. After changing code, run the lint script (`kelo-lint-nextjs`) and fix errors in code, not in config.
- Never modify or bypass rules on your own — ask the user first. `eslint.config.mjs` / `stylelint.config.mjs` are kelo-managed (edits are blocked) and `eslint-disable` comments are ignored.
- Project-specific additions: extra ESLint rules → `eslint.project.config.mjs` (add-only); excluded paths, boundary extensions, extra banned packages → `kelo.lint.json`.
- Commits follow Conventional Commits (enforced by commitlint).

See @AGENTS.PROJECT.md for project-specific guidance.
