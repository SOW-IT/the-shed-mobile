// Notification payloads are server-controlled, so the push-tap handler only
// follows a deep link whose path starts with a route family we actually send
// (see the `url:` fields in convex/requests.ts, comments.ts, events.ts). This
// keeps a malformed or renamed payload from being pushed blindly into the
// navigator. Kept in `shared/` so the same allow-list can be unit-tested
// against the URLs the backend emits (see convex/notifications.test.ts).
export const ALLOWED_DEEP_LINK_PREFIXES = [
  // Request notifications land on the Requests tabs home and select a segment
  // via `?tab=`. `/request/`, `/review` and `/all` remain for older
  // notifications that still carry those legacy redirect URLs.
  "/?",
  "/request/",
  "/review",
  "/all",
  "/notifications",
  "/attendance/",
] as const;

export const isAllowedDeepLink = (url: string): boolean =>
  ALLOWED_DEEP_LINK_PREFIXES.some((prefix) => {
    if (!url.startsWith(prefix)) return false;
    // A prefix that already ends in a boundary char ("/" or the query "?")
    // enforces its own boundary. For bare prefixes like "/review", require the
    // match to end at a real path/query boundary so a payload such as
    // "/reviewevil" can't slip through.
    if (prefix.endsWith("/") || prefix.endsWith("?")) return true;
    const next = url[prefix.length];
    return next === undefined || next === "/" || next === "?" || next === "#";
  });

/**
 * Decide whether a notification tap should navigate, and to where.
 *
 * Returns the allow-listed URL once per notification request id. Callers must
 * clear the OS "last notification response" after a non-null result so cold
 * starts / auth remounts don't keep replaying the same tap into `router.push`
 * (which stacked LoadingState screens forever).
 */
export const consumeNotificationDeepLink = (
  response: {
    notification: {
      request: { identifier: string; content: { data?: unknown } };
    };
  } | null,
  handledIds: Set<string>
): string | null => {
  if (!response) return null;
  const id = response.notification.request.identifier;
  if (!id || handledIds.has(id)) return null;
  handledIds.add(id);

  const data = response.notification.request.content.data;
  const url =
    data && typeof data === "object" && "url" in data
      ? (data as { url?: unknown }).url
      : undefined;
  if (typeof url !== "string" || !isAllowedDeepLink(url)) return null;
  return url;
};
