/** The most notices the World's board holds at once. */
export const NOTICES_MAX = 30;
export const NOTICE_TITLE_MAX = 60;
export const NOTICE_TEXT_MAX = 400;

/** A card on the board: an admin's notice, or one of your notifications. */
type BoardCard<N, F> = { kind: "notice"; at: number; notice: N } | { kind: "notification"; at: number; notification: F };

/**
 * The board's order: pinned notices first, newest first (an edit doesn't
 * move one), then your notifications, newest first. Unread notifications
 * stay in time order; the board marks them rather than moving them.
 */
export const boardCards = <N extends { at: number }, F extends { at: number }>(
  notices: readonly N[],
  notifications: readonly F[]
): BoardCard<N, F>[] => [
  ...[...notices].sort((a, b) => b.at - a.at).map((notice) => ({ kind: "notice" as const, at: notice.at, notice })),
  ...[...notifications].sort((a, b) => b.at - a.at).map((notification) => ({ kind: "notification" as const, at: notification.at, notification })),
];
