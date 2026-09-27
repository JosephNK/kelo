#!/usr/bin/env bash
# 배포 전 검증용: kelo 체크아웃의 패키지를 tarball로 만들어
# .local-packages/에 둔다. pnpm-workspace.yaml의 overrides가 이 tarball을 가리킨다.
# (npm 배포 후에는 overrides와 이 스크립트를 지우면 레지스트리 버전을 쓴다.)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KELO="$(cd "$ROOT/../.." && pwd)"
mkdir -p "$ROOT/.local-packages"
for fw in nestjs nextjs; do
  npm pack "$KELO/rules/$fw" --pack-destination "$ROOT/.local-packages" --silent
done
ls "$ROOT/.local-packages"
# 같은 버전으로 다시 만든 경우 lockfile 체크섬이 달라지므로 이것만 갱신:
#   pnpm update -r eslint-config-kelo-nestjs eslint-config-kelo-nextjs
# (update가 앱 package.json 표기를 file: 로 바꾸므로 ^<version>으로 되돌린 뒤 pnpm install)
