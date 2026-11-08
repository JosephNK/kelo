#!/usr/bin/env bash
# 로컬 체크아웃 검증용: kelo 체크아웃의 패키지를 tarball로 만들어
# .local-packages/에 둔다. pnpm-workspace.yaml의 overrides가 이 tarball을 가리킨다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KELO="$(cd "$ROOT/../.." && pwd)"
OUT="$ROOT/.local-packages"
rm -rf "$OUT" && mkdir -p "$OUT"
for fw in nestjs nextjs; do
  # 버전 없는 고정 파일명으로 저장 — pnpm-workspace.yaml overrides가 이 이름을 가리킨다
  tgz=$(npm pack "$KELO/rules/$fw" --pack-destination "$OUT" --silent | tail -1)
  mv "$OUT/$tgz" "$OUT/eslint-config-kelo-$fw.tgz"
done
ls "$OUT"
# tarball 내용이 바뀌면 lockfile 체크섬이 달라지므로 pnpm install 전에 갱신:
#   pnpm install --no-frozen-lockfile
