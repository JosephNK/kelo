# Git & GitHub Guide

## Commit

Always use the `/kelo:commit` command when committing.

```bash
# Auto-generate commit message from changes
/kelo:commit

# Specify commit message directly
/kelo:commit Add login form validation

# Auto mode: generate and commit without confirmation (for automation pipelines)
/kelo:commit --auto
/kelo:commit --auto Add login form validation
```

- `/kelo:commit` analyzes changes and suggests 3 commit messages
- Does not commit until the user selects one
- `--auto` skips confirmation and commits immediately with the best message
- Commit messages are written in Korean by default, following conventional commit format

### Commit Types

| Type       | Description              |
| ---------- | ------------------------ |
| `feat`     | New feature              |
| `fix`      | Bug fix                  |
| `refactor` | Refactoring              |
| `perf`     | Performance improvement  |
| `docs`     | Documentation change     |
| `test`     | Add/modify tests         |
| `chore`    | Build, config, deps, etc |

## Branch

```bash
# Feature branch
git checkout -b feat/<feature-name>

# Bug fix branch
git checkout -b fix/<bug-name>
```

## Pull Request

```bash
# Create PR
gh pr create --title "title" --body "description"

# List PRs
gh pr list

# View PR status
gh pr view <number>
```

## `.gitignore` Rules for `.claude/`

**CRITICAL**: Never add blanket `.claude/` or `.claude` to `.gitignore`.

The `.claude/` directory holds both team-shared and personal files:

| Path | Tracked? | Purpose |
|------|----------|---------|
| `.claude/settings.json` | Yes | Team-wide Claude Code settings |
| `.claude/commands/` | Yes | Team-shared slash commands |
| `.claude/agents/` | Yes | Team-shared subagents |
| `.claude/hooks/` | Yes | Team-shared hooks |
| `.claude/settings.local.json` | No | Personal overrides |
| `.claude/sessions/` | No | Local session state |
| `.claude/todos/` | No | Local task cache |

Correct `.gitignore` entries:

```
.claude/settings.local.json
.claude/sessions/
.claude/todos/
```

Forbidden entries (will break team sharing of commands/agents/hooks):

```
.claude/        # ❌ excludes team commands/agents
.claude         # ❌ same issue
```

## Common Commands

```bash
# Check status
git status
git log --oneline -10

# View changes
git diff
git diff --cached

# Discard changes
git restore <file>          # discard unstaged changes
git restore --staged <file>  # unstage
```
