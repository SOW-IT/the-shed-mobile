import { DAY_MS } from "./attendanceMetrics";
import { eventStaffYear, sydneyYmd } from "./flow";
import { subgroupMatches } from "./rollcall";

// Insights → Attendance for one campus, built around its weekly meetings.
// Everything here is pure: the nightly build feeds it the stored attendance
// facts and person details, and stores what it returns (see
// convex/weeklyInsights.ts). The words used here are defined in
// docs/context/attendance.md (Term, Regular, Irregular, Newcomer, Visitor).

export type WeeklySettings = {
  /** Share of held weeklies that makes someone Regular (0.5 = half). */
  regularShare: number;
  /** A gap this many days or longer between held weeklies ends a run. */
  termGapDays: number;
  /** Until this many weeklies have been held in a term, last term's count too. */
  carryOverWeeklies: number;
  /** Missing this many held weeklies in a row puts someone who was coming on
   *  follow-up. */
  followUpMisses: number;
  /** Missing this many puts a newcomer on follow-up. */
  newcomerMisses: number;
  /** Newcomers and visitors stay on follow-up only while their last weekly was
   *  one of this many most recent held weeklies. */
  freshWeeklies: number;
  /** A newcomer who has come to this many weeklies, at the Regular share or
   *  above, counts as Regular. */
  newcomerPromoteWeeklies: number;
  /** Someone from another campus is a Visitor until they've come to this many
   *  weeklies in the term. */
  visitorMinWeeklies: number;
  /** Campuses that run terms (T1–T3); everyone else runs semesters. */
  termCampuses: string[];
  /** Whether a weekly tagged with several campuses (a Mega Weeklies) counts
   *  as each campus's weekly. Off: it would start terms early and fill a
   *  campus's numbers with other campuses' people. */
  jointWeeklies: boolean;
  /** Role labels that make someone Staff, alumni & guests. */
  staffRoles: string[];
  /** Role labels that make someone a Leader. */
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
    // The Role option was called Visitor before it became Guest.
    "Visitor",
  ],
  leaderRoles: ["Student Leader", "President", "Vice President", "Executive"],
};

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

// The order people are listed and charted in: the ones who most need a leader's
// attention first.
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

/** Where someone sits in the people list: this campus's people, then other
 *  campuses, then leaders and staff at the bottom. */
export type WeeklySection = "campus" | "other" | "leader" | "staff";

export const SECTION_ORDER: WeeklySection[] = ["campus", "other", "leader", "staff"];

export const SECTION_LABELS: Record<WeeklySection, string> = {
  campus: "This campus",
  other: "Other campuses",
  leader: "Leaders",
  staff: "Staff, alumni & guests",
};

/** The term and week a leader gave a weekly when creating it. */
export type WeeklyMark = { year: number; slot: number; week: number };

export type HeldWeekly = {
  eventId: string;
  at: number;
  count: number;
  name?: string;
  mark?: WeeklyMark | null;
};

export type TermWeekly = { eventId: string; at: number; count: number; week: number };

// Leaders put the term week in a weekly's name: "Weeklies T2W8", "S1W8",
// "s2w9", "WM #9", "WK #13". Semesters don't number the mid-semester break,
// so counting calendar weeks would run ahead of these after it.
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

/** A term's attendance: person key → indexes into `weeklies`. */
export type TermFacts = WeeklyTerm & { attendance: Record<string, number[]> };

export type WeeklyPersonInfo = { campus: string | null; roles: string[] };

export type WeeklyPerson = {
  key: string;
  name: string;
  photo?: string | null;
  memberId?: string | null;
  /** Campus and roles per staff year (Oct–Sep), as Org stores them. */
  infoByYear: Record<string, WeeklyPersonInfo>;
  /** Used for a staff year with no entry. */
  info: WeeklyPersonInfo;
};

const sydneyDay = (ms: number): number => {
  const { year, month, day } = sydneyYmd(new Date(ms));
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
};

/** The Monday that starts a day's week (uni weeks run Monday to Sunday);
 *  day 0 (1 Jan 1970) was a Thursday. */
const weekStart = (day: number): number => day - ((day + 3) % 7);

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const dayLabel = (ms: number): string => {
  const { day, month } = sydneyYmd(new Date(ms));
  return `${day} ${MONTHS[month - 1]}`;
};

// UNSW's terms start in Feb, Jun and Sep; semesters in Feb and Jul. A run of
// weeklies is named by the month it starts in, so a cancelled week that splits
// a term in two still lands both halves in the same term.
const slotFor = (month: number, system: TermSystem): number =>
  system === "terms" ? (month <= 5 ? 1 : month <= 8 ? 2 : 3) : month <= 6 ? 1 : 2;

export const termLabel = (system: TermSystem, slot: number, year: number): string =>
  system === "terms" ? `T${slot} ${year}` : `Sem ${slot} ${year}`;

export const termKey = (system: TermSystem, slot: number, year: number): string =>
  `${year}-${system === "terms" ? "T" : "S"}${slot}`;

/** Groups held weeklies into terms, oldest first. */
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
    // A weekly created with its term keeps it; others take their run's.
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
  // A weekly with no week in its name or mark counts calendar weeks on from
  // the last one that had a week, or from the term's first weekly.
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

/** A weekly's short name: "T3W5" (UNSW terms) or "S2W5" (semesters). */
const weekCode = (system: TermSystem, slot: number, week: number): string =>
  `${system === "terms" ? "T" : "S"}${slot}W${week}`;

export const weeklyName = weekCode;

/** "T2W5 (3 Jun)", or just the date when the weekly isn't known. */
export const weeklyWhen = (at: number, code?: string | null): string =>
  code ? `${code} (${dayLabel(at)})` : dayLabel(at);

/** The terms a weekly on this date can be in: that year's. */
export const termOptions = (system: TermSystem, year: number) =>
  (system === "terms" ? [1, 2, 3] : [1, 2]).map((slot) => ({
    year,
    slot,
    key: termKey(system, slot, year),
    label: termLabel(system, slot, year),
  }));

/** A new weekly's date: a week after the campus's last one, moved on a week at
 *  a time until it isn't in the past. Dates are "YYYY-MM-DD". */
export function nextWeeklyDate(previous: string, today: string): string {
  const [y, m, d] = previous.split("-").map(Number);
  let at = Date.UTC(y, m - 1, d);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  do at += 7 * DAY_MS;
  while (iso(at) < today);
  return iso(at);
}

/** The term and week a new weekly on `at` most likely belongs to, worked out
 *  the same way as Insights from the campus's other weeklies. */
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
  /** Week numbers attended in this term. */
  weeks: number[];
  /** Which of this term's weeklies they came to (indexes into its weeklies):
   *  unlike week numbers, never ambiguous when two weeklies share a week. */
  indexes: number[];
  /** Last weekly here, up to the end of this term. */
  lastAt: number | null;
  /** That weekly's short name ("T2W5"). */
  lastWeekly?: string | null;
  /** First-ever weekly here. */
  firstAt: number | null;
  firstWeekly?: string | null;
  /** While last term still counts (early in a term), the weeklies their
   *  category was judged on. */
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

/** Weeklies attended out of `window` (a list of [term, weekly index]). */
const countIn = (
  window: { facts: TermFacts; index: number }[],
  key: string
): number => window.filter(({ facts, index }) => (facts.attendance[key] ?? []).includes(index)).length;

const windowOf = (facts: TermFacts, upTo = facts.weeklies.length) =>
  facts.weeklies.slice(0, upTo).map((_, index) => ({ facts, index }));

/**
 * Everyone who came to a weekly in `terms[index]` or the term before, with
 * their category for that term. `terms` is every term so far, oldest first;
 * the last one may still be running.
 */
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
    const staff = info.roles.some((r) => settings.staffRoles.includes(r));
    const leader = !otherCampus && info.roles.some((r) => settings.leaderRoles.includes(r));
    const first = firstAt.get(key)?.at ?? null;
    const windowAttended = countIn(regularWindow, key);
    const share = regularWindow.length ? windowAttended / regularWindow.length : 0;
    const regular = share >= settings.regularShare;
    // Leaders move a newcomer who keeps coming up to Regular during the term.
    const isNew =
      first !== null &&
      first >= termStartAt &&
      !(regular && attended >= settings.newcomerPromoteWeeklies);
    const category: WeeklyCategory = staff
      ? "staff"
      : leader
        ? "leader"
        : otherCampus && attended < settings.visitorMinWeeklies
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
  /** Visitors only: true when they haven't been back. */
  needsFollowUp: boolean;
  reason: string;
  lastAt: number | null;
  lastWeekly?: string | null;
  share: number;
};

const timesText = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

const missedText = (n: number) => (n === 1 ? "missed the last weekly" : `missed the last ${n}`);

/**
 * Who to follow up with now, from the latest term's rows: people who were
 * coming but missed the last few weeklies, newcomers who haven't come back,
 * and visitors (the ones not back yet first). Newcomers and visitors drop off
 * once their last weekly is no longer recent.
 */
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
  /** Share of student attendances from this campus's own people. */
  campusShare: number | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

type SummaryRow = {
  key: string;
  category: WeeklyCategory;
  section: WeeklySection;
  attended: number;
  pct: number;
  firstAt: number | null;
};

function summarise(
  weeklies: { eventId: string; count: number }[],
  rows: SummaryRow[],
  attendancesBySection: Record<WeeklySection, number>,
  isNewcomer: (row: SummaryRow) => boolean,
  isRegular: (row: SummaryRow) => boolean = (row) => row.category === "regular"
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
    regulars: present.filter(isRegular).length,
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

/** How far a year has got: its latest term (by slot) and that term's last
 *  week, so last year can be compared up to the same point ("T3 week 4"). */
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

/** A term of another year cut to `cut`: earlier terms whole, the same term up
 *  to the same week, later terms left out (null). */
export const cutToPoint = (facts: TermFacts, cut: YearCut): TermFacts | null =>
  facts.slot < cut.slot ? facts : facts.slot === cut.slot ? truncateTerm(facts, cut.week) : null;

/** A term cut back to its first `maxWeek` weeks, for like-for-like comparisons. */
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
  /** Head count per weekly, split by category. */
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
  // Newcomers promoted to Regular still count as this term's newcomers.
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

/** The term before, cut to the same week when this one is still running. */
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

export type YearResult = {
  year: number;
  terms: WeeklyTerm[];
  rows: YearRow[];
  summary: PeriodSummary;
};

/**
 * A calendar year: each person's share of the year's weeklies, with their
 * category from the latest term they're listed in. `cut` stops the year at a
 * term and week, so a year in progress compares fairly with last year up to
 * the same point ("up to T3 week 4").
 */
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
    rows.push({ ...row, attended, held, pct: held ? attended / held : 0 });
  }
  sortRows(rows);
  // The year's newcomers are everyone whose first-ever weekly was this year,
  // even if their latest term has them as Regular by now.
  const student = new Set<WeeklyCategory>(["newcomer", "regular", "irregular"]);
  const newThisYear = (r: { key: string; category: WeeklyCategory }) =>
    student.has(r.category) && (firstSeen.get(r.key) ?? -1) >= yearStart;
  const regularThisYear = (r: { category: WeeklyCategory; pct: number }) =>
    student.has(r.category) && r.pct >= c.settings.regularShare;
  return {
    year,
    terms: indexes.map((i) => cutTerms[i]),
    rows,
    summary: summarise(weeklies, rows, bySection, newThisYear, regularThisYear),
  };
}
