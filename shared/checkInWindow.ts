import { SIGN_IN_UNDO_GRACE_MS } from "./rollcall";

const OPENS_BEFORE_MS = 2 * 60 * 60 * 1000;

export type CheckInPhase = "before" | "open" | "after";

export const checkInWindow = (event: { dateStart: number; dateEnd: number }) => ({
  opensAt: event.dateStart - OPENS_BEFORE_MS,
  closesAt: event.dateEnd + SIGN_IN_UNDO_GRACE_MS,
});

export const phaseBetween = (
  window: { opensAt: number; closesAt: number },
  now: number = Date.now()
): CheckInPhase => (now < window.opensAt ? "before" : now > window.closesAt ? "after" : "open");

export const checkInPhase = (
  event: { dateStart: number; dateEnd: number },
  now: number = Date.now()
): CheckInPhase => phaseBetween(checkInWindow(event), now);

export const checkInOpen = (event: { dateStart: number; dateEnd: number }, now: number = Date.now()): boolean =>
  checkInPhase(event, now) === "open";
