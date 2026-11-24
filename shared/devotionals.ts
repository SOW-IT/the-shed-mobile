import { parseBibleReference } from "./bible";
import { parseDayKey, sydneyDayKey } from "./calendar";
import { pad2 } from "./datetime";

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
};

export const EMPTY_DEVOTIONAL: DevotionalContent = {
  passage: "",
  notes: "",
  prayerPoints: "",
};

export const todayDevotionalDate = (now = Date.now()): string => sydneyDayKey(now);

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
    passage = parsed.formatted;
  }
  if (input.notes.length > MAX_NOTES_LENGTH) {
    return { ok: false, error: `Notes can be at most ${MAX_NOTES_LENGTH} characters.` };
  }
  if (input.prayerPoints.length > MAX_PRAYER_LENGTH) {
    return { ok: false, error: `Prayer points can be at most ${MAX_PRAYER_LENGTH} characters.` };
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
      out[key] = {
        date: key,
        passage: row.passage,
        notes: row.notes,
        prayerPoints: row.prayerPoints,
        updatedAt: row.updatedAt,
        dirty: row.dirty,
      };
    }
    return out;
  } catch {
    return {};
  }
};

export const pickDisplayDevotional = (
  local: LocalDevotionalDraft | undefined,
  remote: DevotionalEntry | null | undefined
): DevotionalContent => {
  if (local && (local.dirty || !remote || local.updatedAt >= remote.updatedAt)) {
    return {
      passage: local.passage,
      notes: local.notes,
      prayerPoints: local.prayerPoints,
    };
  }
  if (remote) {
    return {
      passage: remote.passage,
      notes: remote.notes,
      prayerPoints: remote.prayerPoints,
    };
  }
  return EMPTY_DEVOTIONAL;
};

export const mergeMonthDevotionals = (
  remote: readonly DevotionalEntry[],
  drafts: Readonly<Record<string, LocalDevotionalDraft>>,
  year: number,
  month: number
): Map<string, DevotionalEntry> => {
  const { from, to } = monthBounds(year, month);
  const byDate = new Map<string, DevotionalEntry>();
  for (const row of remote) {
    if (row.date >= from && row.date <= to && hasDevotionalContent(row)) {
      byDate.set(row.date, row);
    }
  }
  for (const draft of Object.values(drafts)) {
    if (draft.date < from || draft.date > to) continue;
    const existing = byDate.get(draft.date);
    if (!draft.dirty && existing && existing.updatedAt >= draft.updatedAt) continue;
    if (hasDevotionalContent(draft)) {
      byDate.set(draft.date, {
        date: draft.date,
        passage: draft.passage,
        notes: draft.notes,
        prayerPoints: draft.prayerPoints,
        updatedAt: draft.updatedAt,
      });
    } else if (draft.dirty) {
      byDate.delete(draft.date);
    }
  }
  return byDate;
};
