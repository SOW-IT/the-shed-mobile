#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export CONVEX_AGENT_MODE=anonymous
if [ -f .env.local ] && [ "${CI:-}" != "1" ] && [ "${CI:-}" != "true" ]; then
  cp .env.local .env.local.before-sweep
  echo "Saved your .env.local as .env.local.before-sweep; restore it with: mv .env.local.before-sweep .env.local"
fi
rm -f .env.local

npx convex dev --once
nohup npx convex dev > convex-dev.log 2>&1 &
echo $! > convex-dev.pid

for _ in $(seq 1 60); do
  if curl -sf http://127.0.0.1:3210/version >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -sf http://127.0.0.1:3210/version >/dev/null

node scripts/generate-auth-keys.mjs
npx convex env set -- JWT_PRIVATE_KEY "$(cat jwt_private_key.tmp)"
npx convex env set -- JWKS "$(cat jwks.tmp)"
npx convex env set SITE_URL http://127.0.0.1:3211
npx convex env set E2E_AUTH_ENABLED true
npx convex env set E2E_AUTH_SECRET "${SWEEP_E2E_SECRET:-sweep-only-secret}"
rm -f jwt_private_key.tmp jwks.tmp

node scripts/sweep-seed.mjs

echo "EXPO_PUBLIC_CONVEX_URL=http://127.0.0.1:3210" > .env.local
echo "EXPO_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211" >> .env.local
