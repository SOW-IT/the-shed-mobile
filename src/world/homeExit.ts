import { isPlace, isPrivatePlace, type Place } from "../../shared/world";

/** Where a home's door leads: back to the place you came from, else the Garden. */
export const exitOf = (home: { backTo?: string } | null | undefined): Place =>
  home?.backTo !== undefined && isPlace(home.backTo) && !isPrivatePlace(home.backTo) ? home.backTo : "garden";

export const backFrom = (
  place: Place,
  home: { backTo?: string } | null | undefined,
  homeLoading = false
): { kind: "leave" } | { kind: "wait" } | { kind: "travel"; to: Place; door?: true } => {
  if (place === "backyard") return { kind: "travel", to: "home", door: true };
  if (place !== "home") return { kind: "leave" };
  return homeLoading ? { kind: "wait" } : { kind: "travel", to: exitOf(home) };
};

export const padTrip = (place: Place, padTo: Place, home: { backTo?: string } | null | undefined): { to: Place; door: boolean } => {
  if (place === "home" && padTo !== "backyard") return { to: exitOf(home), door: false };
  return { to: padTo, door: isPrivatePlace(place) && isPrivatePlace(padTo) };
};
