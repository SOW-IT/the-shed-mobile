import { pad2 } from "./datetime";
import { acronym, sydneyYmd, universityColour } from "./flow";
import { isOrgWideSubgroup, SOW_SUBGROUP, subgroupLabel, type TagList } from "./rollcall";
import { sowModeOf } from "./sowInsights";

export type CalendarCategory =
  | "twig"
  | "ppn"
  | "weekly"
  | "campus"
  | "sow"
  | "marketing"
  | "deadline"
  | "other";

// TWIG and PPN come from an event's tags and Weekly from its term and week,
// so Insights and the calendar always agree; the rest can be picked.
export const PICKABLE_CATEGORIES = ["campus", "sow", "marketing", "deadline", "other"] as const;
export type PickableCategory = (typeof PICKABLE_CATEGORIES)[number];

// A calendar-only entry has no tags or term, so it can be any category but Weekly.
export const ENTRY_CATEGORIES = ["twig", "ppn", "campus", "sow", "marketing", "deadline", "other"] as const;
export type EntryCategory = (typeof ENTRY_CATEGORIES)[number];

export const MAX_ENTRY_NAME = 120;
export const MAX_ENTRY_NOTES = 1000;

export const CALENDAR_CATEGORIES: { key: CalendarCategory; label: string }[] = [
  { key: "twig", label: "TWIG" },
  { key: "ppn", label: "PPN" },
  { key: "weekly", label: "Weekly" },
  { key: "campus", label: "Campus event" },
  { key: "sow", label: "SOW event" },
  { key: "marketing", label: "Marketing" },
  { key: "deadline", label: "Deadline" },
  { key: "other", label: "Other" },
];

export const calendarCategoryLabel = (key: CalendarCategory): string =>
  CALENDAR_CATEGORIES.find((c) => c.key === key)?.label as string;

export const calendarCategoryOf = (
  event: { category?: PickableCategory; weekly?: unknown; subgroups: string[] },
  tags: { name: string; list?: TagList }[]
): CalendarCategory => {
  const sow = sowModeOf(tags);
  if (sow) return sow;
  if (event.weekly) return "weekly";
  if (event.category) return event.category;
  return event.subgroups.includes(SOW_SUBGROUP) ? "sow" : "campus";
};

// A Weekly or Campus event at one campus wears that campus's colour; at
// several, or at one without a colour, it keeps its category's.
export const campusColourOf = (
  category: CalendarCategory,
  subgroups: string[]
): string | undefined =>
  (category === "weekly" || category === "campus") &&
  subgroups.length === 1 &&
  !isOrgWideSubgroup(subgroups[0])
    ? universityColour(subgroups[0])
    : undefined;

export type EntryInput = {
  name: string;
  dateStart: number;
  dateEnd: number;
  subgroups: string[];
  notes?: string;
};

export const normalizeEntry = <E extends EntryInput>(entry: E): E => ({
  ...entry,
  name: entry.name.trim(),
  subgroups: [...new Set(entry.subgroups)],
  notes: entry.notes?.trim() || undefined,
});

export const entryProblem = (entry: EntryInput, validSubgroups: string[]): string | null => {
  if (!entry.name) return "Give it a name.";
  if (entry.name.length > MAX_ENTRY_NAME) return `The name can be at most ${MAX_ENTRY_NAME} characters.`;
  if (entry.dateEnd <= entry.dateStart) return "It has to end after it starts.";
  if (entry.dateEnd - entry.dateStart > MAX_SPAN_DAYS * DAY_MS) {
    return `It can run for at most ${MAX_SPAN_DAYS} days.`;
  }
  if (entry.subgroups.length === 0) return "Pick at least one campus, or SOW.";
  const unknown = entry.subgroups.find((s) => !validSubgroups.includes(s));
  if (unknown) return `"${unknown}" isn't a campus this year.`;
  if ((entry.notes?.length ?? 0) > MAX_ENTRY_NOTES) {
    return `Notes can be at most ${MAX_ENTRY_NOTES} characters.`;
  }
  return null;
};

// "2026-11-20" from a link, or null if it isn't a real day.
export const parseDayKey = (value: unknown): string | null => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return keyOfUtc(Date.UTC(y, m - 1, d)) === value ? value : null;
};

export const sydneyDayKey = (ms: number): string => {
  const { year, month, day } = sydneyYmd(new Date(ms));
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

const DAY_MS = 86_400_000;
const keyOfUtc = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

export type GridDay = { key: string; day: number; inMonth: boolean };

// Weeks start on Monday. `month` is 1-12.
export const monthGrid = (year: number, month: number): GridDay[][] => {
  const first = Date.UTC(year, month - 1, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Math.ceil((lead + days) / 7) * 7;
  const weeks: GridDay[][] = [];
  for (let i = 0; i < cells; i++) {
    const ms = first + (i - lead) * DAY_MS;
    const d = new Date(ms);
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({
      key: keyOfUtc(ms),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month - 1,
    });
  }
  return weeks;
};

// A window wide enough to cover the grid in any time zone; the screen keys
// events by their Sydney day.
export const monthWindow = (year: number, month: number): { from: number; to: number } => {
  const grid = monthGrid(year, month);
  const firstKey = grid[0][0].key;
  const lastKey = grid[grid.length - 1][6].key;
  const [fy, fm, fd] = firstKey.split("-").map(Number);
  const [ly, lm, ld] = lastKey.split("-").map(Number);
  return { from: Date.UTC(fy, fm - 1, fd) - DAY_MS, to: Date.UTC(ly, lm - 1, ld) + 2 * DAY_MS };
};

export const shiftMonth = (year: number, month: number, by: number) => {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};

const MAX_SPAN_DAYS = 31;
// Only guards against a runaway loop: attendance events have no length limit.
const MAX_DAYS_SHOWN = 366;

// Ending at midnight doesn't count the next day.
const lastDayKey = (dateStart: number, dateEnd: number) =>
  sydneyDayKey(Math.max(dateStart, dateEnd - 1));

// Each Sydney day an event touches, so a camp shows on every day it runs.
export const daysOf = (dateStart: number, dateEnd: number): string[] => {
  const first = sydneyDayKey(dateStart);
  const last = lastDayKey(dateStart, dateEnd);
  const [y, m, d] = first.split("-").map(Number);
  const keys: string[] = [];
  for (let i = 0; i < MAX_DAYS_SHOWN; i++) {
    const key = keyOfUtc(Date.UTC(y, m - 1, d) + i * DAY_MS);
    keys.push(key);
    if (key >= last) break;
  }
  return keys;
};

export const eventsByDay = <E extends { dateStart: number; dateEnd: number }>(
  events: E[]
): Map<string, E[]> => {
  const byDay = new Map<string, E[]>();
  for (const event of [...events].sort((a, b) => a.dateStart - b.dateStart)) {
    for (const key of daysOf(event.dateStart, event.dateEnd)) {
      byDay.set(key, [...(byDay.get(key) ?? []), event]);
    }
  }
  return byDay;
};

export type WeekBar<E> = {
  event: E;
  // Columns, Monday = 0.
  start: number;
  span: number;
  row: number;
  fromBefore: boolean;
  toAfter: boolean;
};

// A week of the month laid out like a wall calendar: an event running several
// days is one bar across them, on one row. Only `rows` rows fit; the last one
// gives way to "+N more" on any day with events that don't fit.
export const weekLayout = <E extends { dateStart: number; dateEnd: number }>(
  week: string[],
  byDay: Map<string, E[]>,
  rows: number
): { bars: WeekBar<E>[]; more: number[] } => {
  const placed = new Map<E, WeekBar<E>>();
  week.forEach((key, col) => {
    for (const event of byDay.get(key) ?? []) {
      const bar = placed.get(event);
      if (bar) {
        bar.span = col - bar.start + 1;
      } else {
        placed.set(event, {
          event,
          start: col,
          span: 1,
          row: 0,
          fromBefore: sydneyDayKey(event.dateStart) < week[0],
          toAfter: lastDayKey(event.dateStart, event.dateEnd) > week[week.length - 1],
        });
      }
    }
  });
  const columns = (bar: WeekBar<E>) => Array.from({ length: bar.span }, (_, i) => bar.start + i);
  // Longer bars first, so a camp keeps one row and the day's evening slots in beside it.
  const bars = [...placed.values()].sort(
    (a, b) => a.start - b.start || b.span - a.span || a.event.dateStart - b.event.dateStart
  );
  const taken: Set<number>[] = [];
  for (const bar of bars) {
    while (columns(bar).some((col) => taken[bar.row]?.has(col))) bar.row++;
    taken[bar.row] ??= new Set();
    for (const col of columns(bar)) taken[bar.row].add(col);
  }
  const crowded = new Set(bars.filter((bar) => bar.row >= rows).flatMap(columns));
  const fits = (bar: WeekBar<E>) =>
    bar.row < rows - 1 || (bar.row === rows - 1 && !columns(bar).some((col) => crowded.has(col)));
  return {
    bars: bars.filter(fits),
    more: week.map(
      (_, col) => bars.filter((bar) => !fits(bar) && columns(bar).includes(col)).length
    ),
  };
};

// Google Calendar event ids must use the characters 0-9 and a-v; hex of the
// Convex id fits, and lets every change find the same Google event again.
export const googleEventId = (eventId: string): string =>
  [...eventId].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");

// Google Calendar's event colours (1-11).
const GOOGLE_COLOURS: Record<CalendarCategory, string> = {
  twig: "10",
  ppn: "2",
  weekly: "7",
  campus: "9",
  sow: "11",
  marketing: "6",
  deadline: "4",
  other: "8",
};

// The nearest of Google's colours to each campus's.
const GOOGLE_CAMPUS_COLOURS: Record<string, string> = {
  USYD: "4",
  UNSW: "2",
  UTS: "9",
  MACQ: "5",
  ACU: "3",
  WSU: "11",
};

const googleColourOf = (category: CalendarCategory, subgroups: string[]): string =>
  (campusColourOf(category, subgroups) && GOOGLE_CAMPUS_COLOURS[acronym(subgroups[0])]) ||
  GOOGLE_COLOURS[category];

export const googleEventBody = (
  event: { name: string; dateStart: number; dateEnd: number; subgroups: string[] },
  category: CalendarCategory,
  link: string,
  notes?: string
) => ({
  summary: event.name,
  description: [
    calendarCategoryLabel(category),
    event.subgroups.map(subgroupLabel).join(", "),
    notes ?? "",
    `Open in THE SHED: ${link}`,
  ]
    .filter(Boolean)
    .join("\n"),
  start: { dateTime: new Date(event.dateStart).toISOString(), timeZone: "Australia/Sydney" },
  end: { dateTime: new Date(event.dateEnd).toISOString(), timeZone: "Australia/Sydney" },
  colorId: googleColourOf(category, event.subgroups),
  status: "confirmed",
});
