#!/bin/bash
# lint 설정 파일 보호 훅
# PreToolUse 이벤트에서 실행됨 (Edit/Write/MultiEdit + Bash)
#
# kelo가 생성·관리하는 lint 진입점 파일을 에이전트가 직접 수정하지 못하게 차단한다.
# 규칙 변경은 kelo 패키지에서, 프로젝트 전용 규칙 추가는 eslint.project.config.mjs에서 한다.
#
# 보호 대상 (파일명 기준):
#   eslint.config.mjs, stylelint.config.mjs, kelo.lint.json, analysis_options.yaml,
#   .kelo/plugins/** (vendored Flutter lint plugins)
#
# 예외:
#   - kelo 저장소 자체(rules/ + .claude-plugin/plugin.json 보유) 내부 경로
#   - KELO_ALLOW_LINT_CONFIG_EDIT=1 환경변수 (사용자가 의도적으로 허용할 때)
#   - init/sync가 실행하는 kelo gen-*.mjs 스크립트 (Bash 검사는 쓰기 패턴만 대상)

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

[ "$KELO_ALLOW_LINT_CONFIG_EDIT" = "1" ] && exit 0

PROTECTED_RE='((^|/)(eslint\.config\.mjs|stylelint\.config\.mjs|kelo\.lint\.json|analysis_options\.yaml)$)|((^|/)\.kelo/plugins/)'
PROTECTED_WORD_RE='(eslint\.config\.mjs|stylelint\.config\.mjs|kelo\.lint\.json|analysis_options\.yaml|\.kelo/plugins)'

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

block() {
  echo "차단: kelo가 관리하는 lint 설정 파일은 수정할 수 없습니다 ($1)." >&2
  echo "- kelo 규칙 변경/완화: kelo 저장소에서 규칙을 수정하고 배포하세요." >&2
  echo "- 프로젝트 전용 규칙 추가: eslint.project.config.mjs에 작성하세요." >&2
  echo "- 스택 변경: /kelo:<framework>-sync 를 실행하세요." >&2
  echo "- lint 에러는 설정이 아니라 코드를 수정해 해결하세요." >&2
  exit 2
}

case "$TOOL_NAME" in
  Edit | Write | MultiEdit)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
    if echo "$FILE_PATH" | grep -qE "$PROTECTED_RE" && ! is_kelo_repo_path "$FILE_PATH"; then
      block "$FILE_PATH"
    fi
    ;;
  Bash)
    COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
    CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
    if [ -n "$CWD" ] && is_kelo_repo_path "$CWD/x"; then
      exit 0
    fi
    # 보호 파일명이 등장하는 세그먼트에서 쓰기 패턴만 차단 (읽기와 kelo gen-*.mjs 실행은 허용)
    WRITE_RE="(>>?[[:space:]]*[^[:space:]]*${PROTECTED_WORD_RE})|(sed[[:space:]]+(-[a-zA-Z]*[[:space:]]+)*-[a-zA-Z]*i)|(perl[[:space:]]+-[a-zA-Z]*i)|(^|[[:space:]])(tee|mv|rm|truncate|ln)([[:space:]]|$)"
    CP_RE='(^|[[:space:]])cp([[:space:]]|$)'
    while IFS= read -r seg; do
      echo "$seg" | grep -qE "$PROTECTED_WORD_RE" || continue
      echo "$seg" | grep -qE "$WRITE_RE" && block "$seg"
      # cp는 보호 파일이 복사 대상(마지막 인자)일 때만 쓰기다. 원본으로 읽는 복사는 허용.
      if echo "$seg" | grep -qE "$CP_RE"; then
        dest=$(echo "$seg" | awk '{print $NF}')
        echo "$dest" | grep -qE "$PROTECTED_WORD_RE" && block "$seg"
      fi
    done < <(printf '%s\n' "$COMMAND" | tr ';&|' '\n')
    ;;
esac

exit 0
