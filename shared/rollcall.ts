/**
 * Pure, shared helpers for the roll-call (attendance) feature — no Convex or
 * React Native imports, so the backend and the app agree on one source of
 * truth. Ported from time-to-rollcall's model files, decoupled from Firestore.
 */

import { DISPLAY_ACRONYMS } from "./flow";

/**
 * The synthetic sub-group covering the whole org. Stored verbatim in an event's
 * `subgroups` array and listed alongside the per-year campuses; never the name
 * of a real `universities` row.
 */
export const ALL_SUBGROUP = "ALL";

/** Short label for a sub-group: a campus acronym (USYD…) or "ALL" unchanged. */
export const subgroupLabel = (subgroup: string): string =>
  subgroup === ALL_SUBGROUP ? ALL_SUBGROUP : (DISPLAY_ACRONYMS[subgroup] ?? subgroup);

/** A sensible default new-event window: starts now, runs two hours. */
export const defaultEventWindow = (): { dateStart: number; dateEnd: number } => {
  const dateStart = Date.now();
  return { dateStart, dateEnd: dateStart + 2 * 60 * 60 * 1000 };
};

/** Short, friendly event date+time label, e.g. "Wed 24 Jun · 5:00 PM". */
export const formatEventDate = (dateStart: number): string => {
  const d = new Date(dateStart);
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
};

/** Clock time for a sign-in row, e.g. "5:03 PM". */
export const formatSignInTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
