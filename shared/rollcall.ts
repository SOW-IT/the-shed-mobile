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
export const SOW_SUBGROUP = "SOW";

/** @deprecated Alias for {@link SOW_SUBGROUP}; legacy data may still use "ALL". */
export const ALL_SUBGROUP = SOW_SUBGROUP;

/** Legacy stored ids for the org-wide sub-group. */
export const SOW_SUBGROUP_ALIASES = new Set(["ALL", SOW_SUBGROUP]);

/** Canonical stored id for a sub-group (campus name or {@link SOW_SUBGROUP}). */
export const canonicalSubgroup = (subgroup: string): string =>
  subgroup === "ALL" ? SOW_SUBGROUP : subgroup;

/** De-duplicated sub-groups with legacy "ALL" values folded to {@link SOW_SUBGROUP}. */
export const normalizeSubgroups = (subgroups: string[]): string[] => {
  const out: string[] = [];
  for (const subgroup of subgroups) {
    const canonical = canonicalSubgroup(subgroup);
    if (!out.includes(canonical)) out.push(canonical);
  }
  return out;
};

/** True when two subgroup ids refer to the same campus or org-wide group. */
export const subgroupMatches = (a: string, b: string): boolean =>
  canonicalSubgroup(a) === canonicalSubgroup(b);

/** True when an event's sub-groups include the asked-for campus or org-wide group. */
export const eventIncludesSubgroup = (
  eventSubgroups: string[],
  subgroup: string
): boolean =>
  normalizeSubgroups(eventSubgroups).includes(canonicalSubgroup(subgroup));

const isOrgWideSubgroup = (subgroup: string): boolean =>
  canonicalSubgroup(subgroup) === SOW_SUBGROUP;

/** Short label for a sub-group: a campus acronym (USYD…) or "SOW" for org-wide. */
export const subgroupLabel = (subgroup: string): string =>
  isOrgWideSubgroup(subgroup)
    ? "SOW"
    : (DISPLAY_ACRONYMS[subgroup] ?? subgroup);

/** Brand colour for a sub-group; org-wide SOW uses the whole-org colour. */
export const subgroupColour = (subgroup: string): string =>
  isOrgWideSubgroup(subgroup)
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

/** Historical attendance counts used to rank likely attendees for an event. */
export type AttendanceFrequencyScore = {
  tagMatches: number;
  subgroupMatches: number;
  total: number;
  latest: number;
};

/** True when a member's campus metadata or org assignment matches the event's sub-groups. */
export const memberMatchesEventCampus = (
  eventSubgroups: ReadonlySet<string>,
  member: { university?: string; campuses: string[] }
): boolean => {
  const labels = [member.university, ...member.campuses].filter(
    (label): label is string => Boolean(label)
  );
  return labels.some((label) => eventSubgroups.has(label));
};

/**
 * Sort roster rows for an event: same-tag history, same sub-group history, campus
 * match, overall attendance, recency, then name.
 */
export const compareAttendanceFrequency = (
  aScore: AttendanceFrequencyScore | undefined,
  bScore: AttendanceFrequencyScore | undefined,
  aCampusMatch: boolean,
  bCampusMatch: boolean,
  aName: string,
  bName: string
): number => {
  const tagDelta = (bScore?.tagMatches ?? 0) - (aScore?.tagMatches ?? 0);
  if (tagDelta !== 0) return tagDelta;
  const subgroupDelta =
    (bScore?.subgroupMatches ?? 0) - (aScore?.subgroupMatches ?? 0);
  if (subgroupDelta !== 0) return subgroupDelta;
  const campusDelta = Number(bCampusMatch) - Number(aCampusMatch);
  if (campusDelta !== 0) return campusDelta;
  const totalDelta = (bScore?.total ?? 0) - (aScore?.total ?? 0);
  if (totalDelta !== 0) return totalDelta;
  const latestDelta = (bScore?.latest ?? 0) - (aScore?.latest ?? 0);
  if (latestDelta !== 0) return latestDelta;
  return aName.localeCompare(bName);
};

/** Minimal assignment shape for picking a default campus filter. */
export type ProfileAssignment = {
  role: string;
  university?: string;
};

/**
 * Default events sub-group for attendance: the viewer's campus when listed,
 * otherwise the org-wide "SOW" entry (first in the list).
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
