#!/bin/bash
# Destructive git 명령어 가드 훅 — PreToolUse(Bash) 이벤트에서 실행됨
#
# 원칙: 막기보다 "복구 가능하게 만든 뒤 허용"한다.
#   - 작업 트리 변경을 버리는 명령(reset --hard, checkout --/-f, restore, switch -f)
#     → 변경분을 refs/kelo/backup/<시각>-<이름> 에 저장한 뒤 허용
#   - stash drop/clear, 머지·push 안 된 브랜치 branch -D → 지워질 커밋을 백업 ref로 남긴 뒤 허용
#   - clean -f → 지워질 untracked 파일을 .git/kelo-backup/ 에 tar로 보관한 뒤 허용
#   - update-ref -d → 지울 ref를 백업 후 허용
#   - 로컬 히스토리 재작성(rebase, commit --amend, filter-branch)은 허용 — reflog·refs/original로
#     되돌릴 수 있고, 공유 히스토리를 바꾸는 force push는 아래에서 막는다
#   - 차단: 보호 브랜치 force push·원격 삭제, push --mirror, 복구 수단을 없애는
#     filter-repo·reflog delete/expire
# 보호 브랜치: 원격 기본 브랜치 + KELO_PROTECTED_BRANCHES(정규식, 기본 main|master|develop|
# development|production|prod|release/*). 백업은 30일 뒤 자동 정리.
# 복구: git stash apply <ref> (작업 트리) / git branch <이름> <ref> (브랜치) / tar -xzf <파일> (clean)
#
# 차단 사유는 stderr로 출력한다 — exit 2일 때 Claude Code는 stderr만 Claude에게 전달한다.
# 백업 안내는 stdout JSON systemMessage로 사용자에게 보인다.

set -u

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi
[ -n "$CWD" ] && [ -d "$CWD" ] && cd "$CWD"

# 매칭 전용 문자열: 따옴표 안 내용을 제거해 커밋 메시지 등에 든 플래그 오탐을 막는다.
MATCH=$(printf '%s' "$COMMAND" | sed -E "s/\"[^\"]*\"//g; s/'[^']*'//g")
G='(^|[;&|`(]|[[:space:]])git[[:space:]]+'

block() {
  {
    echo "차단: 되돌릴 수 없는 git 작업이 감지되었습니다."
    echo "사유: $1"
    echo "명령어: $COMMAND"
    [ -n "${2:-}" ] && echo "권장: $2"
    echo ""
    echo "사용자가 의도하는 작업이라면 사용자가 직접 터미널에 입력해 실행하세요."
  } >&2
  exit 2
}

in_repo() { git rev-parse --git-dir >/dev/null 2>&1; }

# ─── 백업 ─────────────────────────────────────────────────────────
NOTES=""
TS=$(date +%Y%m%d-%H%M%S)

note() { NOTES="${NOTES}${NOTES:+ / }$1"; }

backup_ref() { # <이름> <sha>
  local ref="refs/kelo/backup/${TS}-$1"
  git update-ref "$ref" "$2" 2>/dev/null || return 1
  note "$ref"
}

# 추적 파일의 수정분(index + 작업 트리)을 커밋 객체로 저장. 작업 트리는 건드리지 않는다.
backup_worktree() { # <이름>
  local sha
  sha=$(git stash create 2>/dev/null) || return 1
  [ -z "$sha" ] && return 0 # 버릴 변경 없음
  backup_ref "$1" "$sha" || return 1
  note "복구: git stash apply refs/kelo/backup/${TS}-$1"
}

prune_backups() {
  local cutoff ref day
  cutoff=$(date -v-30d +%Y%m%d 2>/dev/null || date -d '30 days ago' +%Y%m%d 2>/dev/null) || return 0
  git for-each-ref --format='%(refname)' refs/kelo/backup 2>/dev/null | while read -r ref; do
    day=${ref#refs/kelo/backup/}
    day=${day%%-*}
    [ "$day" \< "$cutoff" ] && git update-ref -d "$ref" 2>/dev/null
  done
  local dir
  dir="$(git rev-parse --git-dir 2>/dev/null)/kelo-backup"
  [ -d "$dir" ] && find "$dir" -type f -mtime +30 -delete 2>/dev/null
  return 0
}

# ─── 보호 브랜치 ──────────────────────────────────────────────────
PROTECTED_RE="${KELO_PROTECTED_BRANCHES:-^(main|master|develop|development|production|prod|release/.*)$}"
DEFAULT_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')

is_protected() { # <브랜치>
  [ -z "$1" ] && return 1
  [ -n "$DEFAULT_BRANCH" ] && [ "$1" = "$DEFAULT_BRANCH" ] && return 0
  echo "$1" | grep -qE "$PROTECTED_RE"
}

CURRENT_BRANCH=$(git symbolic-ref --quiet --short HEAD 2>/dev/null)

# 명령 구분자 전까지 `git <sub>` 뒤 인자 (첫 매칭 세그먼트)
args_of() { # <sub 정규식>
  printf '%s' "$MATCH" | tr ';&|' '\n\n\n' | grep -E "${G}$1" | head -1 |
    sed -E "s/.*git[[:space:]]+$1[[:space:]]*//"
}

# ─── 항상 차단: 복구 수단 자체를 없앰 ───────────────────────────────
if echo "$MATCH" | grep -qE "${G}filter-repo\b"; then
  block "filter-repo는 히스토리를 재작성하면서 reflog·이전 객체·origin 설정을 지워 되돌릴 수 없습니다." \
    "로컬 재작성은 git filter-branch(refs/original에 이전 ref 보존)로. filter-repo는 사용자가 직접."
fi
if echo "$MATCH" | grep -qE "${G}reflog[[:space:]]+(delete|expire)\b"; then
  block "reflog delete/expire는 복구용 reflog를 지웁니다." "reflog 정리는 사용자가 직접."
fi

# ─── 원격 공유 히스토리: 보호 브랜치 force push·삭제만 차단 ─────────
# rebase·amend 등 로컬 재작성은 막지 않는다. 바뀐 히스토리를 원격에 반영하려면 force push가
# 필요하고, 그것을 여기서 보호 브랜치에 한해 막는다.
if echo "$MATCH" | grep -qE "${G}push\b"; then
  PUSH_ARGS=$(args_of push)
  FORCE=0
  echo " $PUSH_ARGS" | grep -qE '[[:space:]](-f|--force|--force-with-lease|--force-if-includes)\b|[[:space:]]-[a-zA-Z]*f[a-zA-Z]*\b' && FORCE=1
  DELETE=0
  echo " $PUSH_ARGS" | grep -qE '[[:space:]](-d|--delete)\b' && DELETE=1
  if echo " $PUSH_ARGS" | grep -qE '[[:space:]]--mirror\b'; then
    block "push --mirror는 원격의 모든 ref를 로컬 상태로 덮어씁니다." "필요한 브랜치만 push하세요."
  fi
  # 위치 인자: 원격 다음부터 refspec
  POS=$(echo "$PUSH_ARGS" | tr ' ' '\n' | grep -vE '^(-|$)')
  REFSPECS=$(echo "$POS" | tail -n +2)
  TARGETS=""
  for spec in $REFSPECS; do
    case "$spec" in +*) FORCE=1 ;; :*) DELETE=1 ;; esac
    dst=${spec#+}
    dst=${dst##*:}
    dst=${dst#refs/heads/}
    [ "$dst" = "HEAD" ] && dst=$CURRENT_BRANCH
    TARGETS="$TARGETS $dst"
  done
  [ -z "$REFSPECS" ] && TARGETS=$CURRENT_BRANCH
  if [ "$FORCE" = 1 ] || [ "$DELETE" = 1 ]; then
    for t in $TARGETS; do
      if is_protected "$t"; then
        if [ "$DELETE" = 1 ]; then
          block "보호 브랜치($t)를 원격에서 삭제합니다." "보호 브랜치 삭제는 사용자가 직접."
        fi
        block "보호 브랜치($t)에 force push하면 공유 히스토리를 덮어씁니다." \
          "기능 브랜치에서 작업한 뒤 PR로 합치세요. 보호 브랜치 force push는 사용자가 직접."
      fi
    done
  fi
fi

# ─── 작업 트리 변경을 버리는 명령: 백업 후 허용 ────────────────────
DISCARD=""
echo "$MATCH" | grep -qE "${G}reset[[:space:]]+([^;&|]*[[:space:]])?(--hard|--merge|--keep)\b" && DISCARD="reset"
echo "$MATCH" | grep -qE "${G}checkout\b[^;&|]*([[:space:]]--([[:space:]]|$)|[[:space:]]\.([[:space:]]|$)|[[:space:]](-f|--force)\b)" && DISCARD="checkout"
echo "$MATCH" | grep -qE "${G}restore\b" && DISCARD="restore"
echo "$MATCH" | grep -qE "${G}switch\b[^;&|]*[[:space:]](-f|--force|--discard-changes)\b" && DISCARD="switch"
if [ -n "$DISCARD" ] && in_repo; then
  backup_worktree "$DISCARD" ||
    block "git $DISCARD 전에 변경분을 백업하지 못했습니다." "변경을 커밋하거나 사용자가 직접 실행."
fi

# ─── stash drop / clear: 지울 stash를 백업 후 허용 ─────────────────
if echo "$MATCH" | grep -qE "${G}stash[[:space:]]+drop\b" && in_repo; then
  target=$(args_of 'stash[[:space:]]+drop' | tr ' ' '\n' | grep -vE '^(-|$)' | head -1)
  sha=$(git rev-parse --verify --quiet "${target:-stash@{0}}" 2>/dev/null)
  if [ -n "$sha" ]; then
    backup_ref "stash-drop" "$sha" || block "stash drop 전에 백업하지 못했습니다." ""
    note "복구: git stash apply refs/kelo/backup/${TS}-stash-drop"
  fi
fi
if echo "$MATCH" | grep -qE "${G}stash[[:space:]]+clear\b" && in_repo; then
  i=0
  for sha in $(git stash list --format=%H 2>/dev/null); do
    backup_ref "stash-clear-$i" "$sha" || block "stash clear 전에 백업하지 못했습니다." ""
    i=$((i + 1))
  done
  [ "$i" -gt 0 ] && note "복구: git stash apply refs/kelo/backup/${TS}-stash-clear-<n>"
fi

# ─── update-ref -d: 지울 ref를 백업 후 허용 (kelo 백업 ref 정리는 그대로) ─
if echo "$MATCH" | grep -qE "${G}update-ref[[:space:]]+(-d|--delete)\b" && in_repo; then
  target=$(args_of 'update-ref[[:space:]]+(-d|--delete)' | tr ' ' '\n' | grep -vE '^(-|$)' | head -1)
  case "$target" in
  refs/kelo/backup/* | "") ;;
  *)
    sha=$(git rev-parse --verify --quiet "$target" 2>/dev/null)
    if [ -n "$sha" ]; then
      name=$(echo "$target" | sed 's#^refs/##; s#/#-#g')
      backup_ref "ref-$name" "$sha" || block "update-ref -d 전에 백업하지 못했습니다." ""
      note "복구: git update-ref $target refs/kelo/backup/${TS}-ref-$name"
    fi
    ;;
  esac
fi

# ─── branch -D: 머지·push 안 된 브랜치는 백업 후 허용 ───────────────
if echo "$MATCH" | grep -qE "${G}branch[[:space:]]+(-D\b|.*--delete.*--force\b|.*--force.*--delete\b)" && in_repo; then
  for b in $(args_of branch | tr ' ' '\n' | grep -vE '^(-|$)'); do
    git branch --merged HEAD 2>/dev/null | sed 's/^[*+ ]*//' | grep -qx "$b" && continue
    sha=$(git rev-parse --verify --quiet "refs/heads/$b" 2>/dev/null) || continue
    [ -n "$(git branch -r --contains "$b" 2>/dev/null)" ] && continue
    backup_ref "branch-$b" "$sha" || block "branch -D $b 전에 백업하지 못했습니다." ""
    note "복구: git branch $b refs/kelo/backup/${TS}-branch-$b"
  done
fi

# ─── clean -f: 지워질 untracked 파일을 tar로 보관 후 허용 ───────────
if echo "$MATCH" | grep -qE "${G}clean\b[^;&|]*[[:space:]](-[a-zA-Z]*f[a-zA-Z]*|--force)\b" &&
  ! echo "$MATCH" | grep -qE "${G}clean\b[^;&|]*[[:space:]](-[a-zA-Z]*n[a-zA-Z]*|--dry-run)\b" && in_repo; then
  # 같은 옵션으로 dry-run 해 지워질 목록을 얻는다 (-f 제거, -n 추가)
  DRY=""
  for tok in $(args_of clean); do
    case "$tok" in
    --force) ;;
    -*) tok=$(echo "$tok" | sed -E 's/^(-[a-zA-Z]*)f/\1/'); [ "$tok" != "-" ] && DRY="$DRY $tok" ;;
    *) DRY="$DRY $tok" ;;
    esac
  done
  # shellcheck disable=SC2086
  LIST=$(git clean -n $DRY 2>/dev/null | sed -n 's/^Would remove //p')
  if [ -n "$LIST" ]; then
    DIR="$(git rev-parse --git-dir)/kelo-backup"
    mkdir -p "$DIR" && FILE="$DIR/clean-${TS}.tar.gz"
    echo "$LIST" | tr '\n' '\0' | xargs -0 tar -czf "$FILE" 2>/dev/null ||
      block "git clean 전에 untracked 파일을 백업하지 못했습니다." "지울 파일을 git clean -n으로 확인한 뒤 사용자가 직접."
    note "$FILE (복구: tar -xzf <파일>)"
  fi
fi

if [ -n "$NOTES" ]; then
  prune_backups
  jq -n --arg m "[kelo] 실행 전 백업: $NOTES" '{systemMessage: $m}'
fi
exit 0
