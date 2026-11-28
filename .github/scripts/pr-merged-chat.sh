#!/usr/bin/env bash
# Posts each pull request merged to main to Google Chat, named by the version
# it shipped in. Run by release-version.yml after it numbered main:
#   RELEASED=true, RELEASE_VERSION, RELEASED_COMMITS: the merges it numbered.
#   TRIGGER_SHA: the push's commit. Posted with its own version when it raised
#     the version itself (a manual bump) or when main isn't being numbered
#     (RELEASE_CONFIGURED isn't true). A merge another run is numbering, and
#     the bot's own release commit, are skipped.
set -euo pipefail

webhook_url=$(printf '%s' "${GOOGLE_CHAT_WEBHOOK_URL:-}" | tr -d '[:space:]')
if [ -z "$webhook_url" ]; then
  echo "GOOGLE_CHAT_WEBHOOK_URL is not set, so no Google Chat message was sent."
  exit 0
fi

bot_email="41898282+github-actions[bot]@users.noreply.github.com"
server_url="${GITHUB_SERVER_URL:-https://github.com}"

post() {
  local sha=$1 version=$2 pr number
  pr=$(gh api "repos/${GITHUB_REPOSITORY}/commits/${sha}/pulls" \
    --jq '[.[] | select(.merged_at != null and .base.ref == "main")][0].number // empty' 2>/dev/null || true)
  if [ -z "$pr" ]; then
    echo "${sha:0:7} came from no merged pull request, so it isn't posted."
    return 0
  fi
  number=$pr
  pr=$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${number}")

  local message_file="${RUNNER_TEMP:-/tmp}/pr-merged-chat-${number}.json"
  jq -n \
    --argjson pr "$pr" \
    --arg version "$version" \
    --arg sha "${sha:0:7}" \
    --arg commitUrl "${server_url}/${GITHUB_REPOSITORY}/commit/${sha}" \
    --arg actionsUrl "${ACTIONS_URL:-}" '
    def html: gsub("&"; "&amp;") | gsub("<"; "&lt;") | gsub(">"; "&gt;");
    ($pr.number | tostring) as $number |
    $pr.title as $title |
    $pr.html_url as $prUrl |
    $pr.user.login as $author |
    ($pr.merged_by.login // "?") as $mergedBy |
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
    echo "::warning::Couldn't post the merge of #${number} to Google Chat."
  fi
}

if [ "${RELEASED:-}" = "true" ]; then
  for sha in ${RELEASED_COMMITS:-}; do
    post "$sha" "$RELEASE_VERSION"
  done
fi

trigger=${TRIGGER_SHA:-}
if [ -z "$trigger" ] || [[ " ${RELEASED_COMMITS:-} " == *" ${trigger} "* ]] \
  || ! git cat-file -e "${trigger}^{commit}" 2>/dev/null \
  || [ "$(git log -1 --format=%ae "$trigger")" = "$bot_email" ]; then
  exit 0
fi
if [ "${RELEASE_CONFIGURED:-}" != "true" ] || [ "$(node scripts/release-version.mjs pending "$trigger")" = "false" ]; then
  post "$trigger" "$(node scripts/release-version.mjs version "$trigger")"
fi
