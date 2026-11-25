import { isPlace, type Place } from "../../shared/world";

/** Where a home's door leads: back to the place you came from, else the Garden. */
export const exitOf = (home: { backTo?: string } | null | undefined): Place =>
  home?.backTo !== undefined && isPlace(home.backTo) && home.backTo !== "home" ? home.backTo : "garden";

export const backFrom = (place: Place, home: { backTo?: string } | null | undefined): { kind: "leave" } | { kind: "travel"; to: Place } =>
  place === "home" ? { kind: "travel", to: exitOf(home) } : { kind: "leave" };
