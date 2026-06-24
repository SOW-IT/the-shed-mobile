/**
 * Pure, shared helpers for the roll-call (attendance) feature — no Convex or
 * React Native imports, so the backend and the app agree on one source of
 * truth. Ported from time-to-rollcall's model files, decoupled from Firestore.
 */

import { DISPLAY_ACRONYMS, UNIVERSITY_COLOURS, universityColour } from "./flow";

/**
 * The synthetic sub-group covering the whole org. Stored verbatim in an event's
 * `subgroups` array and listed alongside the per-year campuses; never the name
 * of a real `universities` row.
 */
export const ALL_SUBGROUP = "ALL";

/** Short label for a sub-group: a campus acronym (USYD…) or "SOW" for org-wide. */
export const subgroupLabel = (subgroup: string): string =>
  subgroup === ALL_SUBGROUP ? "SOW" : (DISPLAY_ACRONYMS[subgroup] ?? subgroup);

/** Brand colour for a sub-group; the synthetic ALL uses the whole-org SOW colour. */
export const subgroupColour = (subgroup: string): string =>
  subgroup === ALL_SUBGROUP
    ? UNIVERSITY_COLOURS.SOW
    : (universityColour(subgroup) ?? "#64748b");

/** Text colour that reads on a solid campus brand background. */
export const contrastingText = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#000000" : "#ffffff";
};

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

/** True once the scheduled event window has closed — roll-call edits need an explicit unlock. */
export const eventHasEnded = (dateEnd: number, now = Date.now()): boolean => now > dateEnd;

/** Minimal assignment shape for picking a default campus filter. */
export type ProfileAssignment = {
  role: string;
  university?: string;
};

/**
 * Default events sub-group for attendance: the viewer's campus when listed,
 * otherwise the org-wide "ALL" entry (first in the list).
 */
export const defaultAttendanceSubgroup = (
  subgroups: string[],
  assignments: ProfileAssignment[] | undefined
): string | null => {
  if (subgroups.length === 0) return null;
  for (const a of assignments ?? []) {
    const university = a.university?.trim();
    if (university && subgroups.includes(university)) return university;
  }
  return subgroups[0];
};
