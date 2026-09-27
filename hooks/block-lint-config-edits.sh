#!/bin/bash
# lint 설정 파일 보호 훅
# PreToolUse 이벤트에서 실행됨 (Edit/Write/MultiEdit + Bash)
#
# kelo가 생성·관리하는 lint 진입점 파일을 에이전트가 직접 수정하지 못하게 차단한다.
# 규칙 변경은 kelo 패키지에서, 프로젝트 전용 규칙 추가는 eslint.project.config.mjs에서 한다.
#
# 보호 대상:
#   - eslint.config.mjs, stylelint.config.mjs, analysis_options.yaml 중 kelo 관리 헤더
#     ("Managed by kelo" 등)가 있는 파일 — 모노레포 루트 설정처럼 kelo가 만들지 않은 같은
#     이름의 파일은 대상이 아니다
#   - .kelo/plugins/** (vendored Flutter lint plugins, 항상)
#
# kelo.lint.json은 대상이 아니다: stacks는 sync가 갱신하고, ignores·boundary* 는 프로젝트가
# 직접 편집하는 키다. 규칙을 사실상 끄는 넓은 제외 패턴은 kelo 패키지가 로드 단계에서 거부한다.
#
# 예외:
#   - kelo 저장소 자체(rules/ + .claude-plugin/plugin.json 보유) 내부 경로
#   - KELO_ALLOW_LINT_CONFIG_EDIT=1 환경변수 (사용자가 의도적으로 허용할 때)
#   - init/sync가 실행하는 kelo gen-*.mjs 스크립트 (Bash 검사는 쓰기 패턴만 대상)

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

[ "$KELO_ALLOW_LINT_CONFIG_EDIT" = "1" ] && exit 0

PROTECTED_WORD_RE='(eslint\.config\.mjs|stylelint\.config\.mjs|analysis_options\.yaml|\.kelo/plugins)'
MANAGED_HEADER_RE='Managed by (kelo|jkit)|GENERATED FILE - DO NOT MODIFY'

# 경로가 kelo 저장소 내부인지 (example/ 검증 프로젝트 포함)
is_kelo_repo_path() {
  local dir
  dir=$(dirname "$1")
  while [ -n "$dir" ] && [ "$dir" != "/" ] && [ "$dir" != "." ]; do
    if [ -f "$dir/.claude-plugin/plugin.json" ] && [ -d "$dir/rules" ]; then
      return 0
    fi
    dir=$(dirname "$dir")
  done
  return 1
}

# kelo가 관리하는 파일인지: .kelo/plugins 아래이거나, 보호 파일명이면서 상단에 kelo 관리 헤더가 있다.
# 아직 없는 파일(새로 만드는 경우)은 관리 대상이 아니다.
is_managed() {
  local p="$1"
  case "$p" in
    */.kelo/plugins/* | .kelo/plugins/*) return 0 ;;
  esac
  echo "$p" | grep -qE '(^|/)(eslint\.config\.mjs|stylelint\.config\.mjs|analysis_options\.yaml)$' || return 1
  [ -f "$p" ] || return 1
  head -n 10 "$p" 2>/dev/null | grep -qE "$MANAGED_HEADER_RE"
}

block() {
  echo "차단: kelo가 관리하는 lint 설정 파일은 수정할 수 없습니다 ($1)." >&2
  echo "- kelo 규칙 변경/완화: kelo 저장소에서 규칙을 수정하고 배포하세요." >&2
  echo "- 프로젝트 전용 규칙 추가: eslint.project.config.mjs에 작성하세요." >&2
  echo "- 제외 경로·boundary 확장: kelo.lint.json의 ignores/boundaryIgnores/boundaryElements를 편집하세요." >&2
  echo "- 스택 변경: /kelo:<framework>-sync 를 실행하세요." >&2
  echo "- lint 에러는 설정이 아니라 코드를 수정해 해결하세요." >&2
  exit 2
}

case "$TOOL_NAME" in
  Edit | Write | MultiEdit)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
    if [ -n "$FILE_PATH" ] && ! is_kelo_repo_path "$FILE_PATH" && is_managed "$FILE_PATH"; then
      block "$FILE_PATH"
    fi
    ;;
  Bash)
    COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
    CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
    if [ -n "$CWD" ] && is_kelo_repo_path "$CWD/x"; then
      exit 0
    fi
    # 상대 경로는 CWD 기준으로 해석한다
    resolve() {
      case "$1" in
        /*) echo "$1" ;;
        *) echo "${CWD:-.}/$1" ;;
      esac
    }
    # 세그먼트에 등장한 보호 파일 중 kelo 관리 파일이 하나라도 있는지
    segment_targets_managed() {
      local tok
      for tok in $(echo "$1" | grep -oE "[^[:space:]\"'<>]*${PROTECTED_WORD_RE}[^[:space:]\"'<>]*"); do
        is_managed "$(resolve "$tok")" && return 0
      done
      return 1
    }
    # 보호 파일명이 등장하는 세그먼트에서 쓰기 패턴만 차단 (읽기와 kelo gen-*.mjs 실행은 허용)
    WRITE_RE="(>>?[[:space:]]*[^[:space:]]*${PROTECTED_WORD_RE})|(sed[[:space:]]+(-[a-zA-Z]*[[:space:]]+)*-[a-zA-Z]*i)|(perl[[:space:]]+-[a-zA-Z]*i)|(^|[[:space:]])(tee|mv|rm|truncate|ln)([[:space:]]|$)"
    CP_RE='(^|[[:space:]])cp([[:space:]]|$)'
    while IFS= read -r seg; do
      echo "$seg" | grep -qE "$PROTECTED_WORD_RE" || continue
      if echo "$seg" | grep -qE "$WRITE_RE" && segment_targets_managed "$seg"; then
        block "$seg"
      fi
      # cp는 보호 파일이 복사 대상(마지막 인자)일 때만 쓰기다. 원본으로 읽는 복사는 허용.
      if echo "$seg" | grep -qE "$CP_RE"; then
        dest=$(echo "$seg" | awk '{print $NF}')
        if echo "$dest" | grep -qE "$PROTECTED_WORD_RE"; then
          # 디렉터리로 복사하는 경우도 있으니 대상 파일 자체 또는 .kelo/plugins 경로면 관리 대상으로 본다
          if is_managed "$(resolve "$dest")" || echo "$dest" | grep -qE '(^|/)\.kelo/plugins'; then
            block "$seg"
          fi
        fi
      fi
    done < <(printf '%s\n' "$COMMAND" | tr ';&|' '\n')
    ;;
esac

exit 0
