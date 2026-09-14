export const ALLOWED_DEEP_LINK_PREFIXES = [
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
    if (prefix.endsWith("/") || prefix.endsWith("?")) return true;
    const next = url[prefix.length];
    return next === undefined || next === "/" || next === "?" || next === "#";
  });

// Identifies one "open this request's thread" deep link. The same link opens
// the thread once; a notification tap adds a fresh `reopen` token, which makes
// a new key so the thread opens again.
export const threadDeepLinkKey = (
  focusId: string | undefined,
  thread: unknown,
  reopen: string | undefined
): string | null => (focusId && thread === "1" ? `${focusId}|${reopen ?? ""}` : null);

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
