#!/usr/bin/env bash
set -euo pipefail

webhook_url=$(printf '%s' "${GOOGLE_CHAT_WEBHOOK_URL:-}" | tr -d '[:space:]')
if [ -z "$webhook_url" ]; then
  echo "GOOGLE_CHAT_WEBHOOK_URL is not set, so no Google Chat message was sent."
  exit 0
fi

expo_field() {
  node -p "require('./app.json').expo.$1" 2>/dev/null || echo "?"
}

version=$(expo_field version)
owner=$(expo_field owner)
slug=$(expo_field slug)
subject=$(git log -1 --format=%s 2>/dev/null || echo "")
short_sha=${GITHUB_SHA:0:7}

builds_file="${RUNNER_TEMP:-/tmp}/eas-builds.json"
if ! jq -e 'type == "array"' "$builds_file" >/dev/null 2>&1; then
  echo '[]' > "$builds_file"
fi

case "${JOB_STATUS:-failure}" in
  success) outcome="built and sent to the stores" ;;
  cancelled) outcome="cancelled" ;;
  *) outcome="failed" ;;
esac

message_file="${RUNNER_TEMP:-/tmp}/eas-production-chat.json"
jq -n \
  --arg outcome "$outcome" \
  --arg version "$version" \
  --arg platform "${PLATFORM_INPUT:-both}" \
  --arg subject "$subject" \
  --arg sha "$short_sha" \
  --arg commitUrl "${COMMIT_URL:-}" \
  --arg actor "${ACTOR:-}" \
  --arg ref "${REF_NAME:-}" \
  --arg runUrl "${RUN_URL:-}" \
  --arg buildsUrl "https://expo.dev/accounts/$owner/projects/$slug/builds" \
  --slurpfile builds "$builds_file" '
  def html: gsub("&"; "&amp;") | gsub("<"; "&lt;") | gsub(">"; "&gt;");
  def platformName: if . == "IOS" then "iOS" elif . == "ANDROID" then "Android" else . end;
  ($builds[0]) as $list
  | {
      text: "The SHED \($version) production \($outcome)",
      cardsV2: [{
        cardId: "eas-production",
        card: {
          header: {
            title: "The SHED \($version) production \($outcome)",
            subtitle: "EAS Production, \($platform)"
          },
          sections: [{
            widgets: (
              [
                { decoratedText: { topLabel: "Commit", text: "<a href=\"\($commitUrl)\">\($sha)</a> \($subject | html)", wrapText: true } },
                { decoratedText: { topLabel: "Branch", text: ($ref | html) } },
                { decoratedText: { topLabel: "Started by", text: ($actor | html) } }
              ]
              + [ $list[] | {
                  decoratedText: {
                    topLabel: (.platform | platformName),
                    text: "\(.appVersion // $version) (build \(.appBuildVersion // "?")), \((.status // "unknown") | ascii_downcase)"
                  }
                } ]
              + [ {
                  buttonList: {
                    buttons: (
                      [ { text: "Workflow run", onClick: { openLink: { url: $runUrl } } } ]
                      + [ $list[] | select(.id) | {
                          text: "\(.platform | platformName) build",
                          onClick: { openLink: { url: "\($buildsUrl)/\(.id)" } }
                        } ]
                    )
                  }
                } ]
            )
          }]
        }
      }]
    }' > "$message_file"

if ! curl --fail-with-body -sS -X POST \
  -H "Content-Type: application/json; charset=UTF-8" \
  --data @"$message_file" \
  "$webhook_url" > /dev/null; then
  echo "::warning::Couldn't post the EAS Production result to Google Chat."
fi
