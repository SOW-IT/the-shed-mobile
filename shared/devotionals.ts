import { parseBibleReference } from "./bible";
import { parseDayKey } from "./calendar";
import { dateInputFromMs, pad2 } from "./datetime";

export const MAX_PASSAGE_LENGTH = 120;
export const MAX_NOTES_LENGTH = 20_000;
export const MAX_PRAYER_LENGTH = 20_000;

export type DevotionalContent = {
  passage: string;
  notes: string;
  prayerPoints: string;
};

export type DevotionalEntry = DevotionalContent & {
  date: string;
  updatedAt: number;
};

export type LocalDevotionalDraft = DevotionalEntry & {
  dirty: boolean;
  base: number | null;
  conflict: boolean;
  savedAt?: number;
};

export const EMPTY_DEVOTIONAL: DevotionalContent = {
  passage: "",
  notes: "",
  prayerPoints: "",
};

export const todayDevotionalDate = (now = Date.now()): string => dateInputFromMs(now);

const EARLIEST_OFFSET_MS = 14 * 60 * 60 * 1000;
const LATEST_OFFSET_MS = 12 * 60 * 60 * 1000;

const utcDayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

export const latestDevotionalDate = (now: number): string => utcDayKey(now + EARLIEST_OFFSET_MS);

export const earliestTodayDevotionalDate = (now: number): string => utcDayKey(now - LATEST_OFFSET_MS);

export const validateTodayDevotionalDate = (
  date: unknown,
  now: number
): { ok: true; date: string } | { ok: false; error: string } => {
  const parsed = parseDayKey(date);
  if (!parsed) return { ok: false, error: "Invalid date." };
  if (parsed < earliestTodayDevotionalDate(now) || parsed > latestDevotionalDate(now)) {
    return { ok: false, error: "That isn't today's date. Check your device's clock." };
  }
  return { ok: true, date: parsed };
};

export const isFutureDevotionalDate = (date: string, today: string): boolean => date > today;

export const validateDevotionalDate = (
  date: unknown,
  today: string
): { ok: true; date: string } | { ok: false; error: string } => {
  const parsed = parseDayKey(date);
  if (!parsed) return { ok: false, error: "Invalid date." };
  if (isFutureDevotionalDate(parsed, today)) {
    return { ok: false, error: "Future days can't be edited." };
  }
  return { ok: true, date: parsed };
};

export const validateDevotionalMonth = (year: number, month: number): boolean =>
  Number.isInteger(year) && year >= 1970 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;

export const monthBounds = (year: number, month: number): { from: string; to: string } => {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const ym = `${year}-${pad2(month)}`;
  return { from: `${ym}-01`, to: `${ym}-${pad2(days)}` };
};

export const hasDevotionalContent = (content: DevotionalContent): boolean =>
  content.passage.trim().length > 0 || content.notes.trim().length > 0 || content.prayerPoints.trim().length > 0;

export const sameDevotionalContent = (a: DevotionalContent, b: DevotionalContent): boolean =>
  a.passage === b.passage && a.notes === b.notes && a.prayerPoints === b.prayerPoints;

export const validateDevotionalInput = (
  input: DevotionalContent
): { ok: true; normalized: DevotionalContent } | { ok: false; error: string } => {
  const rawPassage = input.passage.trim();
  if (rawPassage.length > MAX_PASSAGE_LENGTH) {
    return { ok: false, error: `Passage can be at most ${MAX_PASSAGE_LENGTH} characters.` };
  }
  let passage = "";
  if (rawPassage.length > 0) {
    const parsed = parseBibleReference(rawPassage);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (parsed.formatted.length > MAX_PASSAGE_LENGTH) {
      return { ok: false, error: `Passage can be at most ${MAX_PASSAGE_LENGTH} characters.` };
    }
    passage = parsed.formatted;
  }
  if (input.notes.length > MAX_NOTES_LENGTH) {
    return { ok: false, error: `Notes can be at most ${MAX_NOTES_LENGTH} characters.` };
  }
  if (input.prayerPoints.length > MAX_PRAYER_LENGTH) {
    return { ok: false, error: `Prayer can be at most ${MAX_PRAYER_LENGTH} characters.` };
  }
  return {
    ok: true,
    normalized: {
      passage,
      notes: input.notes,
      prayerPoints: input.prayerPoints,
    },
  };
};

export const parseDraftStore = (raw: string): Record<string, LocalDevotionalDraft> => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, LocalDevotionalDraft> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (parseDayKey(key) === null || !value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      if (
        typeof row.passage !== "string" ||
        typeof row.notes !== "string" ||
        typeof row.prayerPoints !== "string" ||
        typeof row.updatedAt !== "number" ||
        !Number.isFinite(row.updatedAt) ||
        typeof row.dirty !== "boolean"
      ) {
        continue;
      }
      const base = typeof row.base === "number" && Number.isFinite(row.base) ? row.base : null;
      out[key] = {
        date: key,
        passage: row.passage,
        notes: row.notes,
        prayerPoints: row.prayerPoints,
        updatedAt: row.updatedAt,
        dirty: row.dirty,
        base,
        conflict: row.dirty && row.conflict === true,
        ...(typeof row.savedAt === "number" && Number.isFinite(row.savedAt) ? { savedAt: row.savedAt } : {}),
      };
    }
    return out;
  } catch {
    return {};
  }
};

const contentOf = (entry: DevotionalContent): DevotionalContent => ({
  passage: entry.passage,
  notes: entry.notes,
  prayerPoints: entry.prayerPoints,
});

export const pickDisplayDevotional = (
  local: LocalDevotionalDraft | undefined,
  remote: DevotionalEntry | null | undefined
): DevotionalContent => {
  if (local?.dirty) return contentOf(local);
  if (remote !== undefined) return remote ? contentOf(remote) : EMPTY_DEVOTIONAL;
  return local ? contentOf(local) : EMPTY_DEVOTIONAL;
};

export const mergeMonthDevotionals = (
  remote: readonly DevotionalEntry[] | undefined,
  drafts: Readonly<Record<string, LocalDevotionalDraft>>,
  year: number,
  month: number
): Map<string, DevotionalEntry> => {
  const { from, to } = monthBounds(year, month);
  const inMonth = (date: string) => date >= from && date <= to;
  const byDate = new Map<string, DevotionalEntry>();
  const show = (entry: DevotionalEntry) => {
    if (hasDevotionalContent(entry)) byDate.set(entry.date, { date: entry.date, ...contentOf(entry), updatedAt: entry.updatedAt });
    else byDate.delete(entry.date);
  };
  if (remote) {
    for (const row of remote) if (inMonth(row.date)) show(row);
  }
  for (const draft of Object.values(drafts)) {
    if (!inMonth(draft.date)) continue;
    if (draft.dirty || !remote) show(draft);
  }
  return byDate;
};
