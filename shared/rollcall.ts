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

/** True when a sub-group id refers to the org-wide SOW group. */
export const isOrgWideSubgroup = (subgroup: string): boolean =>
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

/**
 * A campus's recurring weekly-meeting slot, used to pre-fill the schedule when
 * an event is tagged "Weekly Meeting" (mirrors the time-to-rollcall defaults).
 */
export type WeeklyMeetingSlot = {
  /** 0=Sun … 6=Sat. */
  weekday: number;
  startHour: number;
  endHour: number;
};

/** The tag name that triggers the weekly-meeting schedule pre-fill. */
export const WEEKLY_MEETING_TAG_NAME = "Weekly Meeting";

// Keyed by campus acronym (see DISPLAY_ACRONYMS): Macquarie meets Wed 4–6pm,
// UNSW Wed 5–7pm, UTS and USyd Tue 5–7pm.
const WEEKLY_MEETING_SLOTS: Record<string, WeeklyMeetingSlot> = {
  MACQ: { weekday: 3, startHour: 16, endHour: 18 },
  UNSW: { weekday: 3, startHour: 17, endHour: 19 },
  UTS: { weekday: 2, startHour: 17, endHour: 19 },
  USYD: { weekday: 2, startHour: 17, endHour: 19 },
};

/** The weekly-meeting slot for a sub-group, or null when it has none. */
export const weeklyMeetingSlot = (subgroup: string): WeeklyMeetingSlot | null =>
  WEEKLY_MEETING_SLOTS[subgroupLabel(subgroup)] ?? null;

/** The next date (today or later) that falls on `weekday`, at local midnight. */
export const nextDateForWeekday = (weekday: number, from = new Date()): Date => {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  return d;
};

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

/** Event date + time span as shown in the events list, e.g.
 *  "24.06.25, 5:00 pm - 7:00 pm". */
export const formatEventRange = (startMs: number, endMs: number): string => {
  const twoDigit = (value: number) => String(value).padStart(2, "0");
  const start = new Date(startMs);
  const end = new Date(endMs);
  const date = `${twoDigit(start.getDate())}.${twoDigit(
    start.getMonth() + 1
  )}.${String(start.getFullYear()).slice(-2)}`;
  const time = (dateValue: Date) =>
    dateValue
      .toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      .toLowerCase();
  return `${date}, ${time(start)} - ${time(end)}`;
};

/** Clock time for a sign-in row, e.g. "5:03 PM". */
export const formatSignInTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * Turn an email local part like `first.last@sow.org.au` into a readable
 * "First Last". Splits on the usual separators (`.`, `_`, `-`, `+`) and
 * title-cases each word. Returns null when the address doesn't look like a
 * name (e.g. synthetic `@legacy.invalid` or numeric handles).
 */
export const displayNameFromEmail = (email: string): string | null => {
  const local = email.split("@")[0]?.trim();
  if (!local) return null;
  const words = local
    .split(/[._\-+]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  // Skip anything that isn't a multi-word alphabetic name (e.g. "admin", "u12345").
  if (words.length < 2 || !words.every((w) => /^[a-z]+$/i.test(w))) return null;
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
};

/**
 * The name to show for a person. Uses their stored name unless it's missing or
 * is just their email address, in which case it derives "First Last" from the
 * email's local part (falling back to the raw email when that isn't possible).
 */
export const personDisplayName = (
  name: string | null | undefined,
  email: string | null | undefined
): string => {
  const trimmed = name?.trim();
  const lowerEmail = email?.trim().toLowerCase();
  if (trimmed && trimmed.toLowerCase() !== lowerEmail) return trimmed;
  if (lowerEmail) return displayNameFromEmail(lowerEmail) ?? lowerEmail;
  return trimmed ?? "";
};

/**
 * Stable identity key for a roster/attendance row, joining the backend roster
 * against the signed-in set on the screen. A staff person keys on their email,
 * an attendance-only member on their member id; empty string when neither is
 * set. The email is lowercased defensively so a single non-canonical address
 * anywhere in the pipeline can't split one person into two keys (a row that
 * shows as both signed-in and not). Use this everywhere a key is built — never
 * re-derive `staff:${email}` inline — so the join stays enforced, not assumed.
 */
export const personKey = (row: {
  email?: string | null;
  memberId?: string | null;
}): string =>
  row.email
    ? `staff:${row.email.toLowerCase()}`
    : row.memberId
      ? `member:${row.memberId}`
      : "";

/** True once the scheduled event window has closed — roll-call edits need an explicit unlock. */
export const eventHasEnded = (dateEnd: number, now = Date.now()): boolean => now > dateEnd;

/**
 * Whether a sign-in may be reversed (signed out) on a given event.
 *
 * Ongoing/future events are reversible. On a *finished* event the genuine
 * roll-call is locked: anyone signed in before or during the event can't be
 * signed out. Only a sign-in recorded AFTER the event ended — a retroactive
 * addition — can be undone, so a mistaken late add isn't trapped.
 */
export const canReverseSignIn = (
  event: { dateEnd: number },
  signInTime: number,
  now = Date.now()
): boolean => !eventHasEnded(event.dateEnd, now) || signInTime > event.dateEnd;

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
