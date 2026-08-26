#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

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

: "${APP_ID:=au.org.sow.theshed}"
: "${SCHEME:=theshedmobile}"
: "${TARGET:=.maestro}"

ENV_ARGS=()
if [ -f .maestro/.env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue ;; esac
    ENV_ARGS+=(--env "$line")
  done < .maestro/.env
fi

if [ "$#" -eq 0 ]; then
  set -- "$TARGET"
fi

echo "▶ maestro test  (APP_ID=$APP_ID, SCHEME=$SCHEME, DEV_CLIENT=true)"
exec maestro test \
  ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} \
  --env APP_ID="$APP_ID" \
  --env SCHEME="$SCHEME" \
  --env DEV_CLIENT=true \
  "$@"
