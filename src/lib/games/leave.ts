// When going back from a game needs a confirmation.

/** Only a run in progress is lost by leaving: not the start or game-over screens. */
export const needsLeaveConfirm = (phase: "ready" | "playing" | "over"): boolean => phase === "playing";
