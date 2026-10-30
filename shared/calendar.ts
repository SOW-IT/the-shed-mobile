import { pad2 } from "./datetime";
import { sydneyYmd } from "./flow";
import { SOW_SUBGROUP, subgroupLabel, type TagList } from "./rollcall";
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

// Each Sydney day an event touches, so a camp shows on every day it runs.
export const daysOf = (dateStart: number, dateEnd: number): string[] => {
  const first = sydneyDayKey(dateStart);
  const last = sydneyDayKey(Math.max(dateStart, dateEnd - 1));
  const [y, m, d] = first.split("-").map(Number);
  const keys: string[] = [];
  for (let i = 0; i < MAX_SPAN_DAYS; i++) {
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

export const googleEventBody = (
  event: { name: string; dateStart: number; dateEnd: number; subgroups: string[] },
  category: CalendarCategory,
  link: string
) => ({
  summary: event.name,
  description: [
    calendarCategoryLabel(category),
    event.subgroups.map(subgroupLabel).join(", "),
    `Open in THE SHED: ${link}`,
  ].join("\n"),
  start: { dateTime: new Date(event.dateStart).toISOString(), timeZone: "Australia/Sydney" },
  end: { dateTime: new Date(event.dateEnd).toISOString(), timeZone: "Australia/Sydney" },
  colorId: GOOGLE_COLOURS[category],
  status: "confirmed",
});
