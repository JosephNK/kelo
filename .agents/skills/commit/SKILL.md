---
name: commit
description: Git 커밋 메시지 자동 생성. 변경 사항을 분석하고 한국어 커밋 메시지 3개를 제안한다. MUST be invoked whenever the user expresses intent to commit in Korean or English — including but not limited to "커밋", "커밋 하자", "커밋해", "커밋해줘", "커밋 부탁", "지금 커밋", "이거 커밋", "commit", "commit this", "let's commit", "make a commit", "please commit". Trigger on any user message whose primary intent is to create a git commit, even without the slash command. Do NOT fall back to running raw git commands directly when this skill is available — always invoke this skill first.
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*), Bash(git reset:*)
origin: Kelo
---

## Current State

- Git status: !`git status`
- Staged changes: !`git diff --cached`
- Unstaged changes: !`git diff`
- Recent commits: !`git log --oneline -5`

## Arguments

**$ARGUMENTS**

## Mode Detection

| Argument | Behavior                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------- |
| (none)   | Analyze changes and auto-generate commit message; ask before splitting if multiple concerns detected |
| text     | Use the provided text as subject, generate body from changes                                        |
| `--auto` | Auto mode: split into multiple commits if needed, generate best messages, commit without confirmation |

> `--auto` can be combined with other arguments: `/kelo:commit --auto Add login form validation`
> When text argument is combined with `--auto` and split is needed, the text is used as the **first commit's subject**; remaining commits get auto-generated subjects.

---

## Common Rules

1. If there are no changes, do not commit and notify the user
2. Automatically stage changes to **tracked** files (modified/deleted/renamed) without asking. **Untracked files follow the Untracked File Policy below — never sweep them in with `git add -A` / `git add .`**
3. **Only ask the user for confirmation on commit message selection (and split confirmation in interactive mode)**
4. **Never add auto-generated text like "Generated with Claude Code" or "Co-Authored-By" to commit messages**
5. **Do not explain language choice reasoning or decision process. Present commit messages concisely**
6. **When splitting commits, never use `git add -A` / `git add .` between groups — always `git reset` first, then `git add <specific files>` for that group only**

---

## Untracked File Policy

Untracked files can hold secrets or local-only data (env files with tokens, keys, scratch notes). Decide per file (`git status --porcelain --untracked-files=all`):

1. **Never stage** files that look sensitive, even in `--auto` mode: `.env*` (except `.env.example` / `.env.sample`), `*.pem`, `*.key`, `*.p12`, `*.keystore`, `id_rsa*`, and names containing `secret`, `token`, `credential`, or `password`. Also skip anything that would be ignored by `.gitignore` rules (`git check-ignore`).
2. **Stage** untracked files that are clearly part of the current change: new source/test/doc files referenced by or belonging to the same feature as the tracked changes, or produced by the generators run for this change.
3. **Otherwise do not stage** — untracked files that are unrelated to the diff (e.g. a directory that already existed untracked before this work) stay out.
4. Always list every untracked file that was **not** staged, with the reason (sensitive / unrelated / ignored), in the report — without printing file contents.

In interactive mode, show the untracked files you plan to stage, and ask before committing when it is unclear whether a file belongs to the change (rule 2 vs 3).

---

## Split Detection Criteria

Analyze the diff and decide whether the changes should be **split into multiple commits**. Split when ANY of these signals is strong:

1. **Multiple unrelated `type`s required** — e.g., a `feat` change + a `fix` change + a `docs` change in the same diff. A single commit cannot honestly carry more than one type.
2. **Unrelated feature/domain scopes** — changes touching two or more independent features, modules, or product surfaces that have no causal link (e.g., `auth/` + `billing/` with no shared symbol).
3. **Mixed concerns** — refactor + new feature, or formatting/rename + behavior change. The reader should be able to revert one without losing the other.
4. **Generated artifacts vs source** — when both source files (e.g., `eslint.rules.mjs`) and their generated outputs (e.g., `lint-rules-reference.md`) are modified, prefer a single commit (they belong together). Do NOT split source from its regenerated artifact.

Do NOT split when:

- All changes serve **one logical intent**, even across many files (e.g., a feature touching UI + service + test).
- Changes are a refactor + its test updates for the same refactor.
- Version bump + changelog + lockfile updates from one release.
- Source change + its directly regenerated documentation/artifact.

### Group Construction

When splitting:

1. Assign each changed file (or new untracked file) to **exactly one group**.
2. Each group must produce a single, coherent commit message with one `type`.
3. Order groups so that **dependencies come first** — e.g., a refactor that another group's feature depends on goes earlier.
4. If a single file legitimately belongs to two concerns (rare), keep it with the higher-impact group rather than splitting hunks.

### Worked Examples

**Split** (3 commits):

```
Group 1 — feat: 로그인 화면 추가
  src/features/auth/login.tsx
  src/features/auth/login.test.tsx
Group 2 — fix: 결제 금액 반올림 오류 수정
  src/features/billing/calculator.ts
Group 3 — docs: README 설치 가이드 갱신
  README.md
```

**Do NOT split** (single commit):

```
feat: 로그인 화면 추가
  src/features/auth/login.tsx           # UI
  src/features/auth/login.service.ts    # service
  src/features/auth/login.test.tsx      # test
  src/features/auth/types.ts            # supporting types
```

**Do NOT split** (single commit — source + generated):

```
chore: lint 규칙 갱신
  rules/nextjs/base/eslint.rules.mjs    # source
  lint-rules-reference.md               # generated artifact
```

## Commit Message Generation Rules

Analyze changes and generate messages in the appropriate language and format.

**CRITICAL: Commit messages MUST be written in Korean by default. Use English ONLY when the user explicitly writes in English.**

Language selection based on user input:

- If user message is in Korean → Korean
- If user message is in English → English
- If no input → Korean (default)

**When no argument is provided:**

```
type: 한국어 제목
- 한국어 본문
```

**When an argument is provided:**

```
type: 사용자 입력
- 한국어 본문
```

Types:

- `feat`: 새 기능
- `fix`: 버그 수정
- `refactor`: 리팩토링
- `perf`: 성능 개선
- `docs`: 문서 변경
- `test`: 테스트 추가/수정
- `chore`: 빌드, 설정, 의존성 등

**예시: `/kelo:commit 커밋 커맨드 업데이트` 실행 시**

```
1. chore: 커밋 커맨드 업데이트
   - Claude 커스텀 커밋 커맨드 추가
2. feat: 커밋 커맨드 업데이트
   - Claude Code용 커밋 커맨드 설정 추가
3. chore: 커밋 커맨드 업데이트
   - .claude/commands 디렉토리 및 커밋 스킬 추가
```

---

## Subject-case Constraints (commitlint)

`@commitlint/config-conventional`의 `subject-case` 룰이 다음 case를 **금지**합니다. 위반 시 `commit-msg` 훅이 커밋을 차단합니다.

| Case | 예시 | 상태 |
| ---- | ---- | ---- |
| sentence-case | `feat: Add login form` | ❌ |
| start-case | `feat: Add Login Form` | ❌ |
| pascal-case | `feat: AddLoginForm` | ❌ |
| upper-case | `feat: ADD LOGIN FORM` | ❌ |
| lower-case | `feat: add login form` | ✅ |
| 한국어 | `feat: 로그인 화면 추가` | ✅ |

### 적용 규칙

1. **type/scope 뒤 콜론 다음의 subject(첫 줄 본문)** 에만 적용된다. body 라인은 영향 없음.
2. **한국어로 시작하는 subject는 안전**하다 — 한글에는 case 개념이 없음.
3. **subject가 영문으로 시작하면 반드시 lowercase**로 한다. 첫 문자 대문자 금지 (sentence-case 차단됨).
4. **PascalCase 식별자(`UserPromptSubmit`, `BlocProvider` 등)로 subject를 시작하지 않는다**. 한국어 단어로 시작해 식별자는 중간에 배치하거나, 식별자를 백틱으로 감싸 lowercase 단어 뒤에 둔다.
5. 약자(예: `API`, `URL`, `JSON`)도 subject 첫 토큰으로 두면 upper-case 검출 위험이 있으므로 lowercase(`api`, `url`, `json`)로 쓰거나 한국어 단어를 먼저 둔다.

### 안전 패턴

✅ 통과 가능
- `feat: 로그인 화면 추가`
- `fix(api): null 체크 누락 수정`
- `chore(deps): bump axios to 1.7.0`
- `feat: 커밋 의도 감지 UserPromptSubmit 훅 추가` (한국어 시작, 식별자 중간)

❌ 차단됨
- `feat: Add login form` — sentence-case
- `fix: Fix Bug` — start-case
- `feat: UserPromptSubmit 훅 추가` — pascal-case 시작
- `feat: API 응답 처리` — upper-case 시작 (`api 응답 처리`로 수정)
- `chore: NEW FEATURE` — upper-case

### Pre-commit Sanitization (필수)

Step 2(메시지 제안)에서 각 후보를 사용자에게 보여주기 **전에** subject 라인이 위 규칙을 위반하는지 검사한다:

1. subject = `<type>(<scope>):` 뒤 첫 줄 텍스트
2. 만약 첫 토큰이 ASCII 알파벳으로 시작하면, 그 토큰의 첫 문자가 lowercase인지 확인. 아니면 lowercase로 변환하거나 한국어 단어로 시작하도록 재작성.
3. 모든 단어가 대문자로만 구성된 토큰(`API`, `JSON` 등)이 subject 시작 위치에 있으면 lowercase로 변환하거나 한국어 단어를 앞에 배치.
4. PascalCase 식별자가 첫 토큰이면 한국어 단어를 앞에 배치.

---

## Required Procedure

**If `--auto` flag is present → follow Auto Procedure, otherwise → follow Interactive Procedure.**

---

### Interactive Procedure (default)

#### Step 1: Analyze and Summarize Changes

Show the user:

- List of changed files
- Summary of key changes
- **Apply Split Detection Criteria** (above) and decide: single commit, or N-way split?

#### Step 2: Split Decision (only if split signals detected)

If the analysis suggests splitting, present the proposed groups **before** generating messages:

```
변경 사항이 N개의 독립된 관심사로 보입니다. 분리 커밋을 권장합니다.

[Group 1] feat — 로그인 기능
  - src/features/auth/login.tsx
  - src/features/auth/login.test.tsx

[Group 2] fix — 결제 반올림 오류
  - src/features/billing/calculator.ts

[Group 3] docs — 설치 가이드
  - README.md

분리 진행 방식 선택:
  Y. N개로 분리 커밋 (권장)
  n. 단일 커밋으로 진행
  0. 취소
```

- `Y` → Step 3을 각 그룹마다 순차 반복 (Group 1, 2, 3 순서로)
- `n` → 분리하지 않고 전체를 단일 커밋으로 진행 (Step 3 한 번)
- `0` → 종료

**Skip Step 2 entirely** when split is not recommended — go directly to Step 3 with all changes as a single group.

#### Step 3: Suggest Commit Messages (per group)

For the current group (or the entire diff if not splitting):

1. Show which files belong to this commit (only relevant when splitting).
2. **Suggest 3 commit messages** for this group's changes:

   1. First suggestion
   2. Second suggestion
   3. Third suggestion

3. **Before showing**, validate each subject against the Subject-case Constraints section above. If any candidate would trigger sentence-case / start-case / pascal-case / upper-case, rewrite it (lowercase the leading English token, or move Korean to the front) **before** presenting to the user.

Guide the user to select 1, 2, or 3, or cancel with 0.

#### Step 4: User Selection (Required)

**Always get user confirmation before committing each group:**

- Select 1, 2, or 3
- Input 0 or "cancel" to abort

If the user cancels mid-split (e.g., Group 2 of 3 is cancelled), stop further commits but **do not undo** already-committed groups. Report which groups committed and which were skipped.

#### Step 5: Execute Commit (per group)

For each group:

1. `git reset` to clear any pre-staged state (only when splitting).
2. `git add <files-in-this-group>` — stage **only** the files for this group.
3. `git commit -m "<selected message>"`.
4. Verify the commit succeeded; if `commit-msg` hook rejects (subject-case violation, etc.), report the error and stop the loop — do not proceed to next group until resolved.

After all groups complete (or single commit completes), show `git log --oneline -N` for the new commits as confirmation.

---

### Auto Procedure (`--auto`)

Commit automatically without user confirmation. Used by automation pipelines (e.g. story-orchestrate). **Auto mode handles splitting on its own** — no prompts.

#### Step 1: Stage & Analyze

1. `git add -u` to stage tracked changes, then `git add <path>` for each untracked file allowed by the **Untracked File Policy** (never `git add -A` / `git add .`).
2. Analyze the staged diff.
3. **Apply Split Detection Criteria** (above) and decide: single commit, or N-way split?
4. If split: construct ordered groups per Group Construction rules.

#### Step 2: Generate & Commit (loop per group)

If split was decided, repeat the following for each group in order. If no split, run once over all changes.

1. **Reset staging** (only when splitting): `git reset` to unstage everything before this group.
2. **Stage this group's files**: `git add <files-in-this-group>` — files only, not `-A`.
3. **Generate one best commit message** for this group, following commit message rules (Korean, type prefix, body).
   - If a text argument was passed alongside `--auto`:
     - **No split** → use text as the subject.
     - **Split** → use text as the **first group's** subject only; subsequent groups get auto-generated subjects.
4. **Validate subject** against Subject-case Constraints. If it would trigger sentence/start/pascal/upper-case, rewrite before committing.
5. `git commit -m "<message>"` — commit immediately, no confirmation.
6. If the `commit-msg` hook rejects, **stop the loop**, report the failure, and do not undo prior commits in the same run.

#### Step 3: Report

- Output the commit hash and subject for **every** commit produced (1 line per commit).
- List untracked files that were left unstaged and why (Untracked File Policy rule 4).
- If split: also print the split decision summary (group count + reason in one short sentence).
- If no changes existed, report "no changes" and exit without committing.
