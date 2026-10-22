import { DAY_MS } from "./attendanceMetrics";
import { eventStaffYear, sydneyYmd } from "./flow";
import { subgroupMatches } from "./rollcall";
import { round1 } from "./numbers";

export type WeeklySettings = {
  regularShare: number;
  termGapDays: number;
  carryOverWeeklies: number;
  followUpMisses: number;
  newcomerMisses: number;
  freshWeeklies: number;
  newcomerPromoteWeeklies: number;
  visitorMinWeeklies: number;
  termCampuses: string[];
  jointWeeklies: boolean;
  staffRoles: string[];
  leaderRoles: string[];
};

export const DEFAULT_WEEKLY_SETTINGS: WeeklySettings = {
  regularShare: 0.5,
  termGapDays: 18,
  carryOverWeeklies: 4,
  followUpMisses: 2,
  newcomerMisses: 1,
  freshWeeklies: 4,
  newcomerPromoteWeeklies: 4,
  visitorMinWeeklies: 2,
  termCampuses: ["University of New South Wales"],
  jointWeeklies: false,
  staffRoles: [
    "Staff",
    "Head of Department",
    "Head of Division",
    "Director",
    "Senior Chaplain",
    "Junior Chaplain",
    "Intern Chaplain",
    "Chaplain",
    "Outsource",
    "Alumni",
    "Guest",
  ],
  leaderRoles: ["Student Leader", "President", "Vice President", "Executive"],
};

export const MARKED_VISITOR = "Visitor";

export type TermSystem = "terms" | "semesters";

export const termSystemFor = (subgroup: string, settings: WeeklySettings): TermSystem =>
  settings.termCampuses.some((c) => subgroupMatches(c, subgroup)) ? "terms" : "semesters";

export type WeeklyCategory =
  | "irregular"
  | "newcomer"
  | "regular"
  | "visitor"
  | "leader"
  | "staff";

export const CATEGORY_ORDER: WeeklyCategory[] = [
  "irregular",
  "newcomer",
  "regular",
  "visitor",
  "leader",
  "staff",
];

export const CATEGORY_META: Record<WeeklyCategory, { label: string; colour: string }> = {
  irregular: { label: "Irregular", colour: "#D97706" },
  newcomer: { label: "Newcomer", colour: "#8B5CF6" },
  regular: { label: "Regular", colour: "#16A34A" },
  visitor: { label: "Visitor", colour: "#3B82F6" },
  leader: { label: "Leader", colour: "#DC2626" },
  staff: { label: "Staff, alumni & guests", colour: "#6B7280" },
};

export type WeeklySection = "campus" | "other" | "leader" | "staff";

export const SECTION_ORDER: WeeklySection[] = ["campus", "other", "leader", "staff"];

export const SECTION_LABELS: Record<WeeklySection, string> = {
  campus: "This campus",
  other: "Other campuses",
  leader: "Leaders",
  staff: "Staff, alumni & guests",
};

export type WeeklyMark = { year: number; slot: number; week: number };

export type HeldWeekly = {
  eventId: string;
  at: number;
  count: number;
  name?: string;
  mark?: WeeklyMark | null;
};

export type TermWeekly = { eventId: string; at: number; count: number; week: number };

const WEEK_IN_NAME = [
  /\b[TS]\s?\d\s?W(?:EEK)?\s?(\d{1,2})\b/i,
  /\bW[MK]?\s?#\s?(\d{1,2})\b/i,
  /\bWEEK\s?(\d{1,2})\b/i,
];

export const WEEK_MAX = 14;

export const weekFromName = (name?: string): number | null => {
  for (const pattern of WEEK_IN_NAME) {
    const n = Number(pattern.exec(name ?? "")?.[1]);
    if (n >= 1 && n <= 20) return n;
  }
  return null;
};

export type WeeklyTerm = {
  key: string;
  label: string;
  year: number;
  slot: number;
  system: TermSystem;
  weeklies: TermWeekly[];
};

export type TermFacts = WeeklyTerm & { attendance: Record<string, number[]> };

export type WeeklyPersonInfo = { campus: string | null; roles: string[] };

export type WeeklyPerson = {
  key: string;
  name: string;
  photo?: string | null;
  memberId?: string | null;
  infoByYear: Record<string, WeeklyPersonInfo>;
  info: WeeklyPersonInfo;
};

const sydneyDay = (ms: number): number => {
  const { year, month, day } = sydneyYmd(new Date(ms));
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
};

const weekStart = (day: number): number => day - ((day + 3) % 7);

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const dayLabel = (ms: number): string => {
  const { day, month } = sydneyYmd(new Date(ms));
  return `${day} ${MONTHS[month - 1]}`;
};

const slotFor = (month: number, system: TermSystem): number =>
  system === "terms" ? (month <= 5 ? 1 : month <= 8 ? 2 : 3) : month <= 6 ? 1 : 2;

export const termLabel = (system: TermSystem, slot: number, year: number): string =>
  system === "terms" ? `T${slot} ${year}` : `Sem ${slot} ${year}`;

export const termKey = (system: TermSystem, slot: number, year: number): string =>
  `${year}-${system === "terms" ? "T" : "S"}${slot}`;

export function deriveTerms(
  weeklies: HeldWeekly[],
  system: TermSystem,
  gapDays: number
): WeeklyTerm[] {
  const sorted = [...weeklies].sort((a, b) => a.at - b.at);
  const terms: WeeklyTerm[] = [];
  let runStart: HeldWeekly | null = null;
  let previous: HeldWeekly | null = null;
  for (const weekly of sorted) {
    if (!previous || sydneyDay(weekly.at) - sydneyDay(previous.at) >= gapDays) {
      runStart = weekly;
    }
    previous = weekly;
    const { year, month } = sydneyYmd(new Date(runStart!.at));
    const slot = weekly.mark?.slot ?? slotFor(month, system);
    const termYear = weekly.mark?.year ?? year;
    const key = termKey(system, slot, termYear);
    let term = terms.find((t) => t.key === key);
    if (!term) {
      term = { key, label: termLabel(system, slot, termYear), year: termYear, slot, system, weeklies: [] };
      terms.push(term);
    }
    term.weeklies.push({
      eventId: weekly.eventId,
      at: weekly.at,
      count: weekly.count,
      week: weekly.mark?.week ?? weekFromName(weekly.name) ?? 0,
    });
  }
  terms.sort((a, b) => a.weeklies[0].at - b.weeklies[0].at);
  for (const term of terms) term.weeklies.sort((a, b) => a.at - b.at);
  for (const term of terms) {
    const weeks = term.weeklies.map((w) => weekStart(sydneyDay(w.at)) / 7);
    const named = term.weeklies.map((w) => w.week);
    term.weeklies.forEach((weekly, i) => {
      if (named[i]) return;
      let before = -1;
      for (let j = 0; j < i; j++) if (named[j] > 0) before = j;
      weekly.week = before >= 0 ? named[before] + weeks[i] - weeks[before] : weeks[i] - weeks[0] + 1;
    });
  }
  return terms;
}

const weekCode = (system: TermSystem, slot: number, week: number): string =>
  `${system === "terms" ? "T" : "S"}${slot}W${week}`;

export const weeklyName = weekCode;

export const weeklyWhen = (at: number, code?: string | null): string =>
  code ? `${code} (${dayLabel(at)})` : dayLabel(at);

export const termOptions = (system: TermSystem, year: number) =>
  (system === "terms" ? [1, 2, 3] : [1, 2]).map((slot) => ({
    year,
    slot,
    key: termKey(system, slot, year),
    label: termLabel(system, slot, year),
  }));

export function nextWeeklyDate(previous: string, today: string): string {
  const [y, m, d] = previous.split("-").map(Number);
  let at = Date.UTC(y, m - 1, d);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  do at += 7 * DAY_MS;
  while (iso(at) < today);
  return iso(at);
}

export function suggestWeekly(
  weeklies: HeldWeekly[],
  at: number,
  system: TermSystem,
  gapDays: number
): WeeklyMark & { key: string; label: string } {
  const NEW = "__new__";
  const terms = deriveTerms([...weeklies, { eventId: NEW, at, count: 1 }], system, gapDays);
  const term = terms.find((t) => t.weeklies.some((w) => w.eventId === NEW))!;
  const { year, month } = sydneyYmd(new Date(at));
  if (term.year !== year) {
    const slot = slotFor(month, system);
    return { year, slot, week: 1, key: termKey(system, slot, year), label: termLabel(system, slot, year) };
  }
  const week = Math.min(Math.max(term.weeklies.find((w) => w.eventId === NEW)!.week, 1), WEEK_MAX);
  return { year: term.year, slot: term.slot, week, key: term.key, label: term.label };
}

export type TermRow = {
  key: string;
  name: string;
  photo?: string | null;
  memberId?: string | null;
  category: WeeklyCategory;
  section: WeeklySection;
  campus: string | null;
  noCampus: boolean;
  attended: number;
  held: number;
  pct: number;
  weeks: number[];
  indexes: number[];
  lastAt: number | null;
  lastWeekly?: string | null;
  firstAt: number | null;
  firstWeekly?: string | null;
  window?: { attended: number; held: number };
};

type Classify = {
  subgroup: string;
  settings: WeeklySettings;
  persons: Map<string, WeeklyPerson>;
};

const infoAt = (person: WeeklyPerson | undefined, at: number): WeeklyPersonInfo =>
  person?.infoByYear[String(eventStaffYear(at))] ?? person?.info ?? { campus: null, roles: [] };

const attendedIn = (facts: TermFacts | undefined, key: string): Set<number> =>
  new Set(facts?.attendance[key] ?? []);

const countIn = (
  window: { facts: TermFacts; index: number }[],
  key: string
): number => window.filter(({ facts, index }) => (facts.attendance[key] ?? []).includes(index)).length;

const windowOf = (facts: TermFacts, upTo = facts.weeklies.length) =>
  facts.weeklies.slice(0, upTo).map((_, index) => ({ facts, index }));

export function termRows(terms: TermFacts[], index: number, c: Classify): TermRow[] {
  const term = terms[index];
  const previous = index > 0 ? terms[index - 1] : undefined;
  const { settings } = c;
  const lastWeeklyAt = term.weeklies[term.weeklies.length - 1].at;

  type Seen = { at: number; code: string };
  const firstAt = new Map<string, Seen>();
  const lastAt = new Map<string, Seen>();
  for (const facts of terms.slice(0, index + 1)) {
    for (const [key, indexes] of Object.entries(facts.attendance)) {
      for (const i of indexes) {
        const w = facts.weeklies[i];
        const seen = { at: w.at, code: weekCode(facts.system, facts.slot, w.week) };
        if (!firstAt.has(key) || w.at < firstAt.get(key)!.at) firstAt.set(key, seen);
        if (!lastAt.has(key) || w.at > lastAt.get(key)!.at) lastAt.set(key, seen);
      }
    }
  }

  const regularWindow = [
    ...(term.weeklies.length < settings.carryOverWeeklies && previous ? windowOf(previous) : []),
    ...windowOf(term),
  ];
  const termStartAt = term.weeklies[0].at;
  const keys = new Set([
    ...Object.keys(term.attendance),
    ...Object.keys(previous?.attendance ?? {}),
  ]);
  const rows: TermRow[] = [];
  for (const key of keys) {
    const person = c.persons.get(key);
    const info = infoAt(person, lastWeeklyAt);
    const here = attendedIn(term, key);
    const attended = here.size;
    const otherCampus = !!info.campus && !subgroupMatches(info.campus, c.subgroup);
    const markedVisitor = info.roles.includes(MARKED_VISITOR);
    const staff = !markedVisitor && info.roles.some((r) => settings.staffRoles.includes(r));
    const leader = !otherCampus && info.roles.some((r) => settings.leaderRoles.includes(r));
    const first = firstAt.get(key)?.at ?? null;
    const windowAttended = countIn(regularWindow, key);
    const share = regularWindow.length ? windowAttended / regularWindow.length : 0;
    const regular = share >= settings.regularShare;
    const isNew =
      first !== null &&
      first >= termStartAt &&
      !(regular && attended >= settings.newcomerPromoteWeeklies);
    const category: WeeklyCategory = staff
      ? "staff"
      : leader
        ? "leader"
        : markedVisitor || (otherCampus && attended < settings.visitorMinWeeklies)
          ? "visitor"
          : isNew
            ? "newcomer"
            : regular
              ? "regular"
              : "irregular";
    const section: WeeklySection =
      category === "staff" ? "staff" : category === "leader" ? "leader" : otherCampus ? "other" : "campus";
    rows.push({
      key,
      name: person?.name ?? "Unknown",
      photo: person?.photo ?? null,
      memberId: person?.memberId ?? null,
      category,
      section,
      campus: info.campus,
      noCampus: !info.campus,
      attended,
      held: term.weeklies.length,
      pct: term.weeklies.length ? attended / term.weeklies.length : 0,
      weeks: [...here].sort((a, b) => a - b).map((i) => term.weeklies[i].week),
      indexes: [...here].sort((a, b) => a - b),
      lastAt: lastAt.get(key)?.at ?? null,
      lastWeekly: lastAt.get(key)?.code ?? null,
      firstAt: first,
      firstWeekly: firstAt.get(key)?.code ?? null,
      ...(regularWindow.length > term.weeklies.length
        ? { window: { attended: windowAttended, held: regularWindow.length } }
        : {}),
    });
  }
  return sortRows(rows);
}

const sortRows = <R extends { section: WeeklySection; category: WeeklyCategory; pct: number; name: string }>(
  rows: R[]
): R[] =>
  rows.sort(
    (a, b) =>
      SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) ||
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      b.pct - a.pct ||
      a.name.localeCompare(b.name)
  );

export type FollowUpGroupKey = "was_coming" | "newcomer" | "visitor";

export type WeeklyFollowUp = {
  key: string;
  name: string;
  photo?: string | null;
  memberId?: string | null;
  category: WeeklyCategory;
  campus?: string | null;
  group: FollowUpGroupKey;
  needsFollowUp: boolean;
  reason: string;
  lastAt: number | null;
  lastWeekly?: string | null;
  share: number;
};

const timesText = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

const missedText = (n: number) => (n === 1 ? "missed the last weekly" : `missed the last ${n}`);

export function followUps(
  terms: TermFacts[],
  rows: TermRow[],
  c: Classify
): WeeklyFollowUp[] {
  const { settings } = c;
  const term = terms[terms.length - 1];
  const previous = terms.length > 1 ? terms[terms.length - 2] : undefined;
  const all = [...(previous ? windowOf(previous) : []), ...windowOf(term)];
  const atOf = (w: { facts: TermFacts; index: number }) => w.facts.weeklies[w.index].at;
  const freshFrom = atOf(all[Math.max(0, all.length - settings.freshWeeklies)]);
  const missedLast = (key: string, n: number) =>
    all.length > n && countIn(all.slice(-n), key) === 0;

  const missN = settings.followUpMisses;
  const before = all.slice(0, Math.max(0, all.length - missN));
  const thisTerm = before.filter(({ facts }) => facts === term);
  const comingWindow = thisTerm.length < settings.carryOverWeeklies ? before : thisTerm;

  const out: WeeklyFollowUp[] = [];
  for (const row of rows) {
    if (row.category === "staff") continue;
    const base = {
      key: row.key,
      name: row.name,
      photo: row.photo,
      memberId: row.memberId,
      category: row.category,
      lastAt: row.lastAt,
      lastWeekly: row.lastWeekly,
    };
    const fresh = (row.lastAt ?? 0) >= freshFrom;
    if (row.category === "visitor") {
      if (row.attended === 0 || !fresh) continue;
      const missed = missedLast(row.key, missN);
      const when = weeklyWhen(row.lastAt!, row.lastWeekly);
      out.push({
        ...base,
        campus: row.campus,
        group: "visitor",
        needsFollowUp: missed,
        reason: missed ? `Visited ${when} and hasn't come back` : `Visited ${when}`,
        share: 0,
      });
      continue;
    }
    const came = countIn(comingWindow, row.key);
    const share = comingWindow.length ? came / comingWindow.length : 0;
    if (missedLast(row.key, missN) && share >= settings.regularShare) {
      out.push({
        ...base,
        group: "was_coming",
        needsFollowUp: true,
        reason: `Came to ${came} of ${comingWindow.length}, then ${missedText(missN)}`,
        share,
      });
    } else if (
      row.category === "newcomer" &&
      fresh &&
      missedLast(row.key, settings.newcomerMisses)
    ) {
      out.push({
        ...base,
        group: "newcomer",
        needsFollowUp: true,
        reason: `New at ${weeklyWhen(row.firstAt!, row.firstWeekly)}. Came ${timesText(row.attended)}, then ${missedText(settings.newcomerMisses)}`,
        share,
      });
    }
  }
  const groupRank: Record<FollowUpGroupKey, number> = { was_coming: 0, newcomer: 1, visitor: 2 };
  return out.sort(
    (a, b) =>
      groupRank[a.group] - groupRank[b.group] ||
      Number(b.needsFollowUp) - Number(a.needsFollowUp) ||
      b.share - a.share ||
      (b.lastAt ?? 0) - (a.lastAt ?? 0)
  );
}

export type PeriodSummary = {
  weeklies: number;
  weeklyAvg: number | null;
  people: number;
  regulars: number;
  newcomers: number;
  newcomersStayed: number;
  campusShare: number | null;
};

type SummaryRow = {
  key: string;
  category: WeeklyCategory;
  section: WeeklySection;
  attended: number;
  firstAt: number | null;
};

function summarise(
  weeklies: { eventId: string; count: number }[],
  rows: SummaryRow[],
  attendancesBySection: Record<WeeklySection, number>,
  isNewcomer: (row: SummaryRow) => boolean
): PeriodSummary {
  const total = weeklies.reduce((s, w) => s + w.count, 0);
  const present = rows.filter((r) => r.attended > 0);
  const newcomers = present.filter(isNewcomer);
  const students =
    attendancesBySection.campus + attendancesBySection.other + attendancesBySection.leader;
  return {
    weeklies: weeklies.length,
    weeklyAvg: weeklies.length ? round1(total / weeklies.length) : null,
    people: present.length,
    regulars: present.filter((r) => r.category === "regular").length,
    newcomers: newcomers.length,
    newcomersStayed: newcomers.filter((r) => r.attended >= 2).length,
    campusShare: students
      ? Math.round(
          ((attendancesBySection.campus + attendancesBySection.leader) / students) * 1000
        ) / 1000
      : null,
  };
}

const sectionTotals = (facts: TermFacts, rows: TermRow[]): Record<WeeklySection, number> => {
  const bySection: Record<WeeklySection, number> = { campus: 0, other: 0, leader: 0, staff: 0 };
  const sectionOf = new Map(rows.map((r) => [r.key, r.section]));
  for (const [key, indexes] of Object.entries(facts.attendance)) {
    bySection[sectionOf.get(key) ?? "campus"] += indexes.length;
  }
  return bySection;
};

export type YearCut = { slot: number; week: number; name: string };

export function yearCutOf(terms: TermFacts[], year: number): YearCut | null {
  const inYear = terms.filter((t) => t.year === year);
  const latest = inYear[inYear.length - 1];
  if (!latest) return null;
  return {
    slot: latest.slot,
    week: latest.weeklies[latest.weeklies.length - 1].week,
    name: latest.label.split(" ").slice(0, -1).join(" "),
  };
}

export const cutToPoint = (facts: TermFacts, cut: YearCut): TermFacts | null =>
  facts.slot < cut.slot ? facts : facts.slot === cut.slot ? truncateTerm(facts, cut.week) : null;

export const truncateTerm = (facts: TermFacts, maxWeek: number): TermFacts | null => {
  const keep = facts.weeklies.map((w, i) => (w.week <= maxWeek ? i : -1)).filter((i) => i >= 0);
  if (keep.length === 0) return null;
  const remap = new Map(keep.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  const attendance: Record<string, number[]> = {};
  for (const [key, indexes] of Object.entries(facts.attendance)) {
    const kept = indexes.filter((i) => remap.has(i)).map((i) => remap.get(i)!);
    if (kept.length) attendance[key] = kept;
  }
  return { ...facts, weeklies: keep.map((i) => facts.weeklies[i]), attendance };
};

export type TermResult = {
  term: WeeklyTerm;
  rows: TermRow[];
  summary: PeriodSummary;
  byCategory: { at: number; week: number; counts: Partial<Record<WeeklyCategory, number>> }[];
};

export function computeTerm(terms: TermFacts[], index: number, c: Classify): TermResult {
  const facts = terms[index];
  const rows = termRows(terms, index, c);
  const categoryOf = new Map(rows.map((r) => [r.key, r.category]));
  const byCategory = facts.weeklies.map((w, i) => {
    const counts: Partial<Record<WeeklyCategory, number>> = {};
    for (const [key, indexes] of Object.entries(facts.attendance)) {
      if (!indexes.includes(i)) continue;
      const cat = categoryOf.get(key) ?? "irregular";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return { at: w.at, week: w.week, counts };
  });
  const termStart = facts.weeklies[0].at;
  const newHere = (r: { category: WeeklyCategory; firstAt?: number | null }) =>
    (r.category === "newcomer" || r.category === "regular") && (r.firstAt ?? -1) >= termStart;
  return {
    term: facts,
    rows,
    summary: summarise(facts.weeklies, rows, sectionTotals(facts, rows), newHere),
    byCategory,
  };
}

export function termBefore(
  terms: TermFacts[],
  index: number,
  running: boolean,
  c: Classify
): TermResult | null {
  if (index < 1) return null;
  const before = index - 1;
  if (!running) return computeTerm(terms, before, c);
  const maxWeek = terms[index].weeklies[terms[index].weeklies.length - 1].week;
  const cut = truncateTerm(terms[before], maxWeek);
  if (!cut) return null;
  return computeTerm([...terms.slice(0, before), cut], before, c);
}

export type YearRow = TermRow & { termKey: string };

const STUDENT_CATEGORIES = new Set<WeeklyCategory>(["newcomer", "regular", "irregular"]);

const yearCategory = (latest: WeeklyCategory, yearShare: number, regularShare: number): WeeklyCategory =>
  !STUDENT_CATEGORIES.has(latest)
    ? latest
    : yearShare >= regularShare
      ? "regular"
      : latest === "newcomer"
        ? "newcomer"
        : "irregular";

export type YearResult = {
  year: number;
  terms: WeeklyTerm[];
  rows: YearRow[];
  summary: PeriodSummary;
};

export function computeYear(
  terms: TermFacts[],
  year: number,
  c: Classify,
  cut?: YearCut
): YearResult | null {
  const cutTerms: TermFacts[] = [];
  for (const t of terms) {
    if (t.year > year) break;
    const kept = t.year < year || cut === undefined ? t : cutToPoint(t, cut);
    if (kept) cutTerms.push(kept);
  }
  const indexes = cutTerms.map((t, i) => (t.year === year ? i : -1)).filter((i) => i >= 0);
  if (indexes.length === 0) return null;
  const latest = new Map<string, YearRow>();
  const counts = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let held = 0;
  const weeklies: { eventId: string; count: number }[] = [];
  const bySection: Record<WeeklySection, number> = { campus: 0, other: 0, leader: 0, staff: 0 };
  for (const i of indexes) {
    const facts = cutTerms[i];
    const rows = termRows(cutTerms, i, c);
    for (const row of rows) latest.set(row.key, { ...row, termKey: facts.key });
    const sectionOf = new Map(rows.map((r) => [r.key, r.section]));
    for (const [key, list] of Object.entries(facts.attendance)) {
      counts.set(key, (counts.get(key) ?? 0) + list.length);
      bySection[sectionOf.get(key) ?? "campus"] += list.length;
    }
    for (const row of rows) if (row.firstAt !== null) firstSeen.set(row.key, row.firstAt);
    held += facts.weeklies.length;
    weeklies.push(...facts.weeklies);
  }
  const yearStart = cutTerms[indexes[0]].weeklies[0].at;
  const rows: YearRow[] = [];
  for (const [key, row] of latest) {
    const attended = counts.get(key) ?? 0;
    if (attended === 0) continue;
    const pct = held ? attended / held : 0;
    rows.push({ ...row, category: yearCategory(row.category, pct, c.settings.regularShare), attended, held, pct });
  }
  sortRows(rows);
  const newThisYear = (r: { key: string; category: WeeklyCategory }) =>
    STUDENT_CATEGORIES.has(r.category) && (firstSeen.get(r.key) ?? -1) >= yearStart;
  return {
    year,
    terms: indexes.map((i) => cutTerms[i]),
    rows,
    summary: summarise(weeklies, rows, bySection, newThisYear),
  };
}
