import { pad2 } from "./datetime";
import { DISPLAY_ACRONYMS, UNIVERSITY_COLOURS, universityColour } from "./flow";

export const SOW_SUBGROUP = "SOW";

export const ALL_SUBGROUP = SOW_SUBGROUP;

export const SOW_SUBGROUP_ALIASES = new Set(["ALL", SOW_SUBGROUP]);

export const canonicalSubgroup = (subgroup: string): string =>
  subgroup === "ALL" ? SOW_SUBGROUP : subgroup;

export const normalizeSubgroups = (subgroups: string[]): string[] => {
  const out: string[] = [];
  for (const subgroup of subgroups) {
    const canonical = canonicalSubgroup(subgroup);
    if (!out.includes(canonical)) out.push(canonical);
  }
  return out;
};

export const subgroupMatches = (a: string, b: string): boolean =>
  canonicalSubgroup(a) === canonicalSubgroup(b);

export const eventIncludesSubgroup = (
  eventSubgroups: string[],
  subgroup: string
): boolean =>
  normalizeSubgroups(eventSubgroups).includes(canonicalSubgroup(subgroup));

export const isOrgWideSubgroup = (subgroup: string): boolean =>
  canonicalSubgroup(subgroup) === SOW_SUBGROUP;

export const subgroupLabel = (subgroup: string): string =>
  isOrgWideSubgroup(subgroup)
    ? "SOW"
    : (DISPLAY_ACRONYMS[subgroup] ?? subgroup);

export const subgroupColour = (subgroup: string): string =>
  isOrgWideSubgroup(subgroup)
    ? UNIVERSITY_COLOURS.SOW
    : (universityColour(subgroup) ?? "#64748b");

export type WeeklyMeetingSlot = {
  weekday: number;
  startHour: number;
  endHour: number;
};

export const WEEKLY_MEETING_TAG_NAME = "Weekly Meeting";

const WEEKLY_MEETING_SLOTS: Record<string, WeeklyMeetingSlot> = {
  MACQ: { weekday: 3, startHour: 16, endHour: 18 },
  UNSW: { weekday: 3, startHour: 17, endHour: 19 },
  UTS: { weekday: 2, startHour: 17, endHour: 19 },
  USYD: { weekday: 2, startHour: 17, endHour: 19 },
};

export const weeklyMeetingSlot = (subgroup: string): WeeklyMeetingSlot | null =>
  WEEKLY_MEETING_SLOTS[subgroupLabel(subgroup)] ?? null;

export const nextDateForWeekday = (weekday: number, from = new Date()): Date => {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  return d;
};

export const contrastingText = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#000000" : "#ffffff";
};

export const defaultEventWindow = (): { dateStart: number; dateEnd: number } => {
  const dateStart = Date.now();
  return { dateStart, dateEnd: dateStart + 2 * 60 * 60 * 1000 };
};

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

export const formatEventRange = (startMs: number, endMs: number): string => {
  const start = new Date(startMs);
  const end = new Date(endMs);
  const date = `${pad2(start.getDate())}.${pad2(
    start.getMonth() + 1
  )}.${String(start.getFullYear()).slice(-2)}`;
  const time = (dateValue: Date) =>
    dateValue
      .toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      .toLowerCase();
  return `${date}, ${time(start)} - ${time(end)}`;
};

export const formatSignInTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

export const capitalizeMemberName = (value: string): string =>
  value.replace(/(^|\s)\S/g, (ch) => ch.toUpperCase());

export const displayNameFromEmail = (email: string): string | null => {
  const local = email.split("@")[0]?.trim();
  if (!local) return null;
  const words = local
    .split(/[._\-+]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length < 2 || !words.every((w) => /^[a-z]+$/i.test(w))) return null;
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
};

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

export const personKey = (row: {
  email?: string | null;
  memberId?: string | null;
}): string =>
  row.email
    ? `staff:${row.email.toLowerCase()}`
    : row.memberId
      ? `member:${row.memberId}`
      : "";

export const eventHasEnded = (dateEnd: number, now = Date.now()): boolean => now > dateEnd;

export const canReverseSignIn = (
  event: { dateEnd: number },
  signInTime: number,
  now = Date.now()
): boolean => !eventHasEnded(event.dateEnd, now) || signInTime > event.dateEnd;

export type AttendanceFrequencyScore = {
  tagMatches: number;
  subgroupMatches: number;
  total: number;
  latest: number;
};

export const memberMatchesEventCampus = (
  eventSubgroups: ReadonlySet<string>,
  member: { university?: string; campuses: string[] }
): boolean => {
  const labels = [member.university, ...member.campuses].filter(
    (label): label is string => Boolean(label)
  );
  return labels.some((label) => eventSubgroups.has(label));
};

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

export type ProfileAssignment = {
  role: string;
  university?: string;
};

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
