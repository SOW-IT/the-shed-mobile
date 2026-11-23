// When going back from a game needs a confirmation.

/** Only a run in progress is lost by leaving: not the start or game-over screens. */
export const needsLeaveConfirm = (phase: "ready" | "playing" | "over"): boolean => phase === "playing";

/**
 * On web, a touch that starts this close to the left or right edge of the
 * screen is where a phone's browser starts its swipe back (or forward).
 */
export const SWIPE_EDGE = 24;

/** Whether a touch at x on a screen this wide starts at a swipe-back edge. */
export const atSwipeEdge = (x: number, screenWidth: number): boolean =>
  x <= SWIPE_EDGE || x >= screenWidth - SWIPE_EDGE;
