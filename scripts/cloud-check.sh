#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."

failed=()
step() {
  local name="$1"; shift
  printf '\n==> %s: %s\n' "$name" "$*"
  local start=$SECONDS
  if "$@"; then
    printf '<== %s passed (%ss)\n' "$name" "$((SECONDS - start))"
  else
    printf '<== %s FAILED (%ss)\n' "$name" "$((SECONDS - start))"
    failed+=("$name")
  fi
}

lock_hash="$(sha256sum package-lock.json | cut -d' ' -f1)"
stamp="node_modules/.cloud-check-lock"
if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$lock_hash" ]; then
  step "Install" npm ci --no-audit --no-fund
  if [ ${#failed[@]} -gt 0 ]; then
    printf '\nCloud check FAILED: npm ci\n'
    exit 1
  fi
  echo "$lock_hash" > "$stamp"
fi

printf 'Branch %s at %s, node %s\n' "$(git rev-parse --abbrev-ref HEAD)" "$(git rev-parse --short HEAD)" "$(node -v)"

step "Expo deps match SDK" env EXPO_OFFLINE=1 npx expo install --check
if [ -f knip.jsonc ] || [ -f knip.json ]; then
  step "Lint" npx eslint . --max-warnings 0
  step "Knip" npx knip
else
  step "Lint" npm run lint
fi
step "Typecheck" npx tsc --noEmit
step "Unit tests" npm run test:coverage

if [ ${#failed[@]} -gt 0 ]; then
  printf '\nCloud check FAILED: %s\n' "${failed[*]}"
  exit 1
fi
printf '\nCloud check passed\n'
