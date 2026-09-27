#!/bin/bash
# 커밋 의도 감지 → kelo:commit 스킬 강제 안내 훅
# UserPromptSubmit 이벤트에서 실행됨

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')

# 이미 명시적으로 스킬을 호출 중이면 스킵
if echo "$PROMPT" | grep -qE '/kelo:commit\b'; then
  exit 0
fi

HIT=0

# 한국어 패턴: 동사형 커밋 요청
if echo "$PROMPT" | grep -qE '커밋\s*(해|하자|해줘|해주세요|부탁|좀|할게|할래|하지|할까|시켜|진행|진행해|진행하자|마무리|마무리해|올려|올려줘|날려|날려줘|찍어|찍어줘)'; then
  HIT=1
# 한국어 패턴: 지시어 + 커밋
elif echo "$PROMPT" | grep -qE '(지금|이거|이걸|이번|이번에|변경사항을?|변경된|수정사항을?|이|그)\s*커밋'; then
  HIT=1
# 영어 패턴: 의도형 커밋 요청
elif echo "$PROMPT" | grep -qiE "(let'?s|please|gonna|going to|wanna|want to)\s+commit\b"; then
  HIT=1
elif echo "$PROMPT" | grep -qiE 'commit\s+(this|it|the\s+changes|now|please|stuff)'; then
  HIT=1
elif echo "$PROMPT" | grep -qiE 'make\s+a\s+commit\b'; then
  HIT=1
fi

if [ "$HIT" = "1" ]; then
  cat <<'EOF'
[kelo hook] User intent detected: 커밋(commit). MUST invoke the `kelo:commit` skill via the Skill tool BEFORE running any raw git commands. Do NOT execute `git commit` directly through Bash unless the user explicitly opts out of the skill.
EOF
fi

exit 0
