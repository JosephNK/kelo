#!/bin/bash
# 위험 명령어 차단 훅
# PreToolUse 이벤트에서 실행됨
# 차단 시 사유는 stderr로 출력한다 — exit 2일 때 Claude Code는 stderr만 Claude에게 전달한다.

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ "$TOOL_NAME" = "Bash" ]; then
  # ── 광범위 rm -rf 삭제 차단 ──────────────────────────────────────
  # 조건: 재귀 삭제(-r/-R/--recursive)이면서 대상이 광범위 위험 경로일 때.
  # 위험 대상: /  /*  ~  ~/  $HOME  ${HOME}  $PWD  .  ./  ..  ../  *  .*
  # - 따옴표로 감싸도(rm -rf "$HOME") 실행되므로 따옴표 "문자"만 제거해 검사.
  # - 명령 구분자(; & |)로 세그먼트를 나눠 rm 세그먼트만 검사(타 명령 오탐 방지).
  # - force(-f) 유무와 무관 — rm -r .도 위험하므로 재귀만으로 게이트.
  RM_SCAN=$(printf '%s' "$COMMAND" | sed "s/['\"]//g")
  rm_danger=0
  while IFS= read -r seg; do
    echo "$seg" | grep -qE '(^|\s)rm(\s|$)' || continue
    echo "$seg" | grep -qE '(^|\s)(-[a-zA-Z]*r[a-zA-Z]*|--recursive)(\s|$)' || continue
    if echo "$seg" | grep -qE '\s(/(\s|$)|/\*|~/?(\s|$)|\$\{?HOME\}?/?(\s|$)|\$\{?PWD\}?/?(\s|$)|\.(\s|$)|\./(\s|$)|\.\.(/)?(\s|$)|\*(\s|$)|\.\*)'; then
      rm_danger=1
      break
    fi
  done < <(printf '%s\n' "$RM_SCAN" | tr ';&|' '\n')
  if [ "$rm_danger" = 1 ]; then
    echo "차단: 광범위한 rm 재귀 삭제가 감지되었습니다 (예: rm -rf . / ~ '*' \$HOME)." >&2
    echo "명령어: $COMMAND" >&2
    echo "특정 하위 경로만 삭제하도록 좁히거나, 의도한 광범위 삭제는 사용자가 직접 실행하세요." >&2
    exit 2
  fi

  # ── 외부 DB에 대한 파괴적 SQL 차단 ──────────────────────────────
  # 파괴 구문(DROP DATABASE/SCHEMA/TABLE, TRUNCATE, 무조건 DELETE)이면서 외부
  # 호스트를 가리킬 때만 차단. 호스트 미지정·로컬은 개발 환경으로 보고 허용.
  #  - 호스트 소스: -h/--host 플래그, conn-string host=, DB URI(scheme://...),
  #                PGHOST/PGHOSTADDR/MYSQL_HOST/MYSQL_TCP_ADDR 환경변수
  #  - 로컬 주소: localhost 127.0.0.1 ::1 0.0.0.0
  DESTRUCTIVE_SQL='(DROP\s+(DATABASE|SCHEMA|TABLE)|TRUNCATE\s+(TABLE\s+)?\S|DELETE\s+FROM\s+\S+\s*;)'
  HAS_HOST='(-h\s+\S|--?host[= ]\s*\S|host=\S|(mysql|mariadb|postgres|postgresql|mongodb)://\S|PGHOSTADDR=\S|MYSQL_TCP_ADDR=\S)'
  IS_LOCAL='(-h\s+|--?host[= ]\s*|host=|PGHOSTADDR=|MYSQL_TCP_ADDR=)(localhost|127\.0\.0\.1|::1|0\.0\.0\.0)|(mysql|mariadb|postgres|postgresql|mongodb)://([^@ ]*@)?(localhost|127\.0\.0\.1|::1|0\.0\.0\.0)'
  if echo "$COMMAND" | grep -qiE "$DESTRUCTIVE_SQL"; then
    if echo "$COMMAND" | grep -qiE "$HAS_HOST" && \
       ! echo "$COMMAND" | grep -qiE "$IS_LOCAL"; then
      echo "차단: 외부 DB에 대한 파괴적 SQL이 감지되었습니다." >&2
      echo "명령어: $COMMAND" >&2
      echo "로컬(localhost/127.0.0.1/::1/0.0.0.0) 또는 호스트 미지정만 허용됩니다. 외부 DB 작업은 사용자가 직접 확인 후 실행하세요." >&2
      exit 2
    fi
  fi

  # chmod 777 차단 (0777 포함)
  if echo "$COMMAND" | grep -qE 'chmod\s+0?777'; then
    echo "차단: chmod 777은 보안 정책에 의해 금지되었습니다." >&2
    exit 2
  fi
fi

exit 0
