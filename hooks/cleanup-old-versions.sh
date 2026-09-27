#!/usr/bin/env bash
# Cleanup old kelo plugin cache versions on Claude Code session start.
# Keeps only the version this hook is currently running from.
set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$PLUGIN_ROOT" ] || [ ! -d "$PLUGIN_ROOT" ]; then
  exit 0
fi

CACHE_DIR="$(cd "$PLUGIN_ROOT/.." && pwd)"
CURRENT_VERSION="$(basename "$PLUGIN_ROOT")"

# Safety: only operate inside the kelo/kelo cache namespace.
case "$CACHE_DIR" in
  */.claude/plugins/cache/kelo/kelo) ;;
  *) exit 0 ;;
esac

removed=()
for dir in "$CACHE_DIR"/*/; do
  [ -d "$dir" ] || continue
  name="$(basename "$dir")"
  if [ "$name" != "$CURRENT_VERSION" ]; then
    rm -rf -- "$dir" && removed+=("$name")
  fi
done

if [ "${#removed[@]}" -gt 0 ]; then
  echo "[kelo] Cleaned old plugin cache: ${removed[*]} (kept $CURRENT_VERSION)" >&2
fi

exit 0
