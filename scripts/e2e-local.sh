#!/usr/bin/env bash
#
# Run the Maestro E2E suite locally without fiddling with PATH/env each time.
#
#   npm run e2e:local                       # whole suite (dev-client defaults)
#   npm run e2e:local -- --include-tags smoke
#   npm run e2e:local -- .maestro/00-launch-and-gating/live-smoke.yaml
#
# It puts Maestro + its JRE on PATH, applies the local dev-client defaults
# (APP_ID/SCHEME for the dev build, DEV_CLIENT=true so the Expo dev-menu is
# auto-dismissed and state is NOT cleared), loads .maestro/.env if present, and
# forwards any extra args to `maestro test`.
set -euo pipefail
cd "$(dirname "$0")/.."

# ── Maestro + JRE on PATH (no shell-profile edits needed) ────────────────────
if [ -z "${JAVA_HOME:-}" ]; then
  if command -v /usr/libexec/java_home >/dev/null 2>&1 && /usr/libexec/java_home >/dev/null 2>&1; then
    JAVA_HOME="$(/usr/libexec/java_home)"
  elif [ -d /opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home ]; then
    JAVA_HOME="/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home"
  fi
fi
export JAVA_HOME
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}$HOME/.maestro/bin:$PATH"
export MAESTRO_CLI_NO_ANALYTICS=1

if ! command -v maestro >/dev/null 2>&1; then
  echo "✗ Maestro not found. Install it once with:" >&2
  echo "    curl -fsSL https://get.maestro.mobile.dev | bash" >&2
  exit 1
fi
if ! command -v java >/dev/null 2>&1; then
  echo "✗ Java not found (Maestro needs a JRE). On macOS: brew install openjdk" >&2
  exit 1
fi

# ── Local dev-client defaults (override by exporting before you run) ──────────
: "${APP_ID:=au.org.sow.theshed}"        # the dev build's bundle id
: "${SCHEME:=theshedmobile}"             # its deep-link scheme
: "${TARGET:=.maestro}"                  # default: the whole suite

# This Maestro build only supports `--env KEY=VALUE` (no `--env-file`), so read
# .maestro/.env and forward each non-comment line as its own --env flag.
ENV_ARGS=()
if [ -f .maestro/.env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue ;; esac
    ENV_ARGS+=(--env "$line")
  done < .maestro/.env
fi

# If no args are given, run the default target; otherwise forward everything.
if [ "$#" -eq 0 ]; then
  set -- "$TARGET"
fi

echo "▶ maestro test  (APP_ID=$APP_ID, SCHEME=$SCHEME, DEV_CLIENT=true)"
# ${ENV_ARGS[@]+…} guards against empty-array expansion under `set -u` on the
# bash 3.2 that ships with macOS.
exec maestro test \
  ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} \
  --env APP_ID="$APP_ID" \
  --env SCHEME="$SCHEME" \
  --env DEV_CLIENT=true \
  "$@"
