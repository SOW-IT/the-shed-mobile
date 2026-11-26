import { parseDayKey } from "./calendar";
import { SYDNEY_TIME_ZONE } from "./flow";

export const DEVOTIONAL_SHARING_LEVELS = ["count", "passage", "everything"] as const;
export type DevotionalSharingLevel = (typeof DEVOTIONAL_SHARING_LEVELS)[number];

export const MAX_GROUP_NAME_LENGTH = 80;

const SHARING_LEVEL_RANK: Record<DevotionalSharingLevel, number> = {
  count: 0,
  passage: 1,
  everything: 2,
};

export const SHARING_LEVEL_LABELS: Record<DevotionalSharingLevel, string> = {
  count: "Count only",
  passage: "Passage",
  everything: "Everything",
};

export const INVITE_SHARING_NOTE = "Shares from the day you join.";

export const SHARING_LEVEL_DESCRIPTIONS: Record<DevotionalSharingLevel, string> = {
  count: "Whether you did it that day",
  passage: "Done plus the passage",
  everything: "Done, passage, Notes and Prayer",
};

const isDevotionalSharingLevel = (value: unknown): value is DevotionalSharingLevel =>
  typeof value === "string" && (DEVOTIONAL_SHARING_LEVELS as readonly string[]).includes(value);

export const effectiveSharingLevel = (
  groupLevel: DevotionalSharingLevel,
  personalLevel: DevotionalSharingLevel | null | undefined
): DevotionalSharingLevel => {
  if (!personalLevel) return groupLevel;
  return SHARING_LEVEL_RANK[personalLevel] < SHARING_LEVEL_RANK[groupLevel] ? personalLevel : groupLevel;
};

export const highestSharingLevel = (
  levels: readonly DevotionalSharingLevel[]
): DevotionalSharingLevel | null => {
  let best: DevotionalSharingLevel | null = null;
  for (const level of levels) {
    if (!best || SHARING_LEVEL_RANK[level] > SHARING_LEVEL_RANK[best]) best = level;
  }
  return best;
};

export const isDevotionalDone = (entry: { passage?: string } | null | undefined): boolean =>
  Boolean(entry?.passage && entry.passage.trim().length > 0);

export const isDateInRange = (date: string, startDate: string, endDate: string): boolean =>
  date >= startDate && date <= endDate;

export const validateGroupInput = (input: {
  name: string;
  startDate: string;
  endDate: string;
  sharingLevel: unknown;
}):
  | { ok: true; normalized: { name: string; startDate: string; endDate: string; sharingLevel: DevotionalSharingLevel } }
  | { ok: false; error: string } => {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the group a name." };
  if (name.length > MAX_GROUP_NAME_LENGTH) {
    return { ok: false, error: `Group name can be at most ${MAX_GROUP_NAME_LENGTH} characters.` };
  }
  const startDate = parseDayKey(input.startDate);
  if (!startDate) return { ok: false, error: "Choose a valid start date." };
  const endDate = parseDayKey(input.endDate);
  if (!endDate) return { ok: false, error: "Choose a valid end date." };
  if (endDate < startDate) {
    return { ok: false, error: "End date must be on or after the start date." };
  }
  if (!isDevotionalSharingLevel(input.sharingLevel)) {
    return { ok: false, error: "Choose a sharing level." };
  }
  return {
    ok: true,
    normalized: {
      name,
      startDate,
      endDate,
      sharingLevel: input.sharingLevel,
    },
  };
};

export const firstNameOf = (name: string | null | undefined): string => {
  const first = (name ?? "").trim().split(/\s+/).filter(Boolean)[0];
  return first || "Someone";
};

let sydneyParts: Intl.DateTimeFormat | null = null;

export const sydneyDateTime = (ms: number): { date: string; hour: number; minute: number } => {
  sydneyParts ??= new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = sydneyParts.formatToParts(ms);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")) % 24,
    minute: Number(part("minute")),
  };
};

type CompletionTier = "neutral" | "zero" | "low" | "mid" | "high" | "full";

export const completionTier = (done: number, total: number, future: boolean): CompletionTier => {
  if (future || total <= 0) return "neutral";
  if (done >= total) return "full";
  if (done <= 0) return "zero";
  const ratio = done / total;
  if (ratio >= 0.75) return "high";
  if (ratio >= 0.5) return "mid";
  return "low";
};

export const initialGroupMonth = (
  today: string,
  startDate: string,
  endDate: string
): { year: number; month: number } => {
  const anchor = today < startDate ? startDate : today > endDate ? endDate : today;
  const [year, month] = anchor.split("-").map(Number);
  return { year, month };
};

export const monthWithinRange = (
  year: number,
  month: number,
  startDate: string,
  endDate: string
): { hasPrev: boolean; hasNext: boolean } => {
  const [sy, sm] = startDate.split("-").map(Number);
  const [ey, em] = endDate.split("-").map(Number);
  const current = year * 12 + month;
  return {
    hasPrev: current > sy * 12 + sm,
    hasNext: current < ey * 12 + em,
  };
};

export const monthOverlapsRange = (year: number, month: number, startDate: string, endDate: string): boolean => {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  return key >= startDate.slice(0, 7) && key <= endDate.slice(0, 7);
};

export const formatGroupDateRange = (startDate: string, endDate: string): string => {
  const fmt = (key: string, includeYear: boolean) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      ...(includeYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  };
  if (startDate === endDate) return fmt(startDate, true);
  const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4);
  return `${fmt(startDate, !sameYear)} - ${fmt(endDate, true)}`;
};
