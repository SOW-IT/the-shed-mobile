import { isPlace, type Place } from "../../shared/world";

/** Where a home's door leads: back to the place you came from, else the Garden. */
export const exitOf = (home: { backTo?: string } | null | undefined): Place =>
  home?.backTo !== undefined && isPlace(home.backTo) && home.backTo !== "home" ? home.backTo : "garden";

export const backFrom = (
  place: Place,
  home: { backTo?: string } | null | undefined,
  homeLoading = false
): { kind: "leave" } | { kind: "wait" } | { kind: "travel"; to: Place } =>
  place !== "home" ? { kind: "leave" } : homeLoading ? { kind: "wait" } : { kind: "travel", to: exitOf(home) };
