#!/usr/bin/env bash
set -euo pipefail

webhook_url=$(printf '%s' "${GOOGLE_CHAT_WEBHOOK_URL:-}" | tr -d '[:space:]')
if [ -z "$webhook_url" ]; then
  echo "GOOGLE_CHAT_WEBHOOK_URL is not set, so no Google Chat message was sent."
  exit 0
fi

version=$(node -p "require('./app.json').expo.version" 2>/dev/null || echo "?")
short_sha=${MERGE_SHA:0:7}

message_file="${RUNNER_TEMP:-/tmp}/pr-merged-chat.json"
jq -n \
  --arg version "$version" \
  --arg number "${PR_NUMBER:-}" \
  --arg title "${PR_TITLE:-}" \
  --arg prUrl "${PR_URL:-}" \
  --arg author "${PR_AUTHOR:-}" \
  --arg mergedBy "${MERGED_BY:-}" \
  --arg sha "$short_sha" \
  --arg commitUrl "${COMMIT_URL:-}" \
  --arg actionsUrl "${ACTIONS_URL:-}" '
  def html: gsub("&"; "&amp;") | gsub("<"; "&lt;") | gsub(">"; "&gt;");
  {
    text: "The SHED \($version) merged: #\($number) \($title)",
    cardsV2: [{
      cardId: "pr-merged",
      card: {
        header: {
          title: "The SHED \($version) merged",
          subtitle: "#\($number) by \($author)"
        },
        sections: [{
          widgets: [
            { decoratedText: { topLabel: "Pull request", text: "<a href=\"\($prUrl)\">#\($number)</a> \($title | html)", wrapText: true } },
            { decoratedText: { topLabel: "Merged by", text: ($mergedBy | html) } },
            { decoratedText: { topLabel: "Commit", text: "<a href=\"\($commitUrl)\">\($sha)</a>" } },
            { textParagraph: { text: "Web and the backend deploy now. Phones get JavaScript changes over the air once EAS Update finishes; native changes wait for a store build." } },
            { buttonList: { buttons: [
              { text: "Pull request", onClick: { openLink: { url: $prUrl } } },
              { text: "Deploys", onClick: { openLink: { url: $actionsUrl } } }
            ] } }
          ]
        }]
      }
    }]
  }' > "$message_file"

if ! curl --fail-with-body -sS --connect-timeout 10 --max-time 20 -X POST \
  -H "Content-Type: application/json; charset=UTF-8" \
  --data @"$message_file" \
  "$webhook_url" > /dev/null; then
  echo "::warning::Couldn't post the merge of #${PR_NUMBER:-?} to Google Chat."
fi
