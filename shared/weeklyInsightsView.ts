import { type ViewBlock, type ViewCard } from "./attendanceMetricsView";
import { sydneyYmd } from "./flow";
import { subgroupLabel } from "./rollcall";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  dayLabel,
  type FollowUpGroupKey,
  type PeriodSummary,
  SECTION_LABELS,
  SECTION_ORDER,
  type TermResult,
  type TermRow,
  type TermSystem,
  type WeeklyCategory,
  type WeeklyFollowUp,
  type WeeklyTerm,
  type YearResult,
} from "./weeklyInsights";

// The campus Insights view, laid out on the server like the rest of Insights
// (see attendanceMetricsView.ts): the app only knows how to draw each block.

export type Pill = { label: string; colour: string };

export type PeopleSortKey = "pct" | "name" | "last";

export type PeopleRow = {
  key: string;
  name: string;
  photo?: string | null;
  section: string;
  /** Filter chips this row matches. */
  tags: string[];
  category: Pill;
  primary: string;
  secondary: string;
  warning?: string;
  pct: number;
  last: number;
};

export type FollowRow = {
  key: string;
  name: string;
  photo?: string | null;
  category: Pill;
  reason: string;
  secondary: string;
};

export type WeeklyBlock =
  | ViewBlock
  | {
      type: "people";
      title: string;
      subtitle?: string;
      sections: { key: string; label: string }[];
      filters: { key: string; label: string; colour?: string }[];
      sorts: { key: PeopleSortKey; label: string }[];
      rows: PeopleRow[];
      emptyText: string;
    }
  | {
      type: "followUpGroups";
      title: string;
      icon: string;
      groups: { key: string; title: string; people: FollowRow[] }[];
      preview: number;
      emptyText: string;
    }
  | {
      type: "memberHeader";
      name: string;
      photo?: string | null;
      lines: string[];
      category?: Pill;
      reason?: string;
      memberId?: string | null;
    }
  | { type: "keyValues"; title: string; rows: { label: string; value: string; link?: string }[] }
  | {
      type: "termHistory";
      title: string;
      rows: { key: string; label: string; primary: string; category: Pill }[];
    }
  | {
      type: "weekGrid";
      title: string;
      subtitle?: string;
      weeks: { label: string; came: boolean }[];
    }
  | {
      type: "eventList";
      title: string;
      rows: { title: string; subtitle: string; tag?: string }[];
      emptyText: string;
    }
  | {
      type: "monthRows";
      title: string;
      subtitle?: string;
      rows: MonthRow[];
      emptyText: string;
    };

export type MonthRow = {
  key: string;
  title: string;
  value: string;
  delta?: { text: string; direction: "up" | "down" | "flat" };
  hint?: string;
  lines: string[];
  splits: { title: string; parts: { label: string; value: number; colour?: string }[] }[];
};

/** A choice in the term picker. `group` (the year), `short` and `slot` let
 *  the picker lay each year out as one row of terms; older apps just list
 *  the labels. */
type WeeklyPeriod = {
  key: string;
  label: string;
  group?: string;
  short?: string;
  kind?: "term" | "year";
  slot?: number;
};

/** The term picker, newest first: each year's terms, then that whole year
 *  ("2026 T3, 2026 T2, 2026 T1, 2026, 2025 T3, …"). */
export function periodOptions(terms: WeeklyTerm[]): WeeklyPeriod[] {
  const years = [...new Set(terms.map((t) => t.year))].sort((a, b) => b - a);
  return years.flatMap((year): WeeklyPeriod[] => [
    ...terms
      .filter((t) => t.year === year)
      .reverse()
      .map((t) => ({
        key: t.key,
        label: `${year} ${withoutYear(t)}`,
        group: String(year),
        short: withoutYear(t),
        kind: "term" as const,
        slot: t.slot,
      })),
    { key: String(year), label: String(year), group: String(year), short: "Year", kind: "year" as const },
  ]);
}

const FOLLOW_UP_PREVIEW = 5;

const termWord = (system: TermSystem) => (system === "terms" ? "term" : "semester");

export const pill = (category: WeeklyCategory): Pill => ({
  label: CATEGORY_META[category].label,
  colour: CATEGORY_META[category].colour,
});

const pctText = (n: number) => `${Math.round(n * 100)}%`;

/** "3 Jun", or "3 Jun 2025" when it isn't `year`. */
export const dateText = (ms: number, year: number): string => {
  const y = sydneyYmd(new Date(ms)).year;
  return y === year ? dayLabel(ms) : `${dayLabel(ms)} ${y}`;
};

/** "Last came T2W5 (3 Jun)": the weekly's term and week, then its date. */
const lastCame = (row: { lastAt: number | null; lastWeekly?: string | null }, year: number) => {
  if (!row.lastAt) return "Hasn't come yet";
  const date = dateText(row.lastAt, year);
  return `Last came ${row.lastWeekly ? `${row.lastWeekly} (${date})` : date}`;
};

export function peopleRows(
  rows: (TermRow & { termKey?: string })[],
  year: number
): PeopleRow[] {
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    photo: r.photo ?? null,
    section: r.section,
    tags: [r.category, ...(r.noCampus ? ["noCampus"] : [])],
    category: pill(r.category),
    primary: `${r.attended}/${r.held} · ${pctText(r.pct)}`,
    secondary: r.window
      ? `${lastCame(r, year)}. Came to ${r.window.attended} of the last ${r.window.held}.`
      : lastCame(r, year),
    warning: r.noCampus && r.section === "campus" ? "No campus set" : undefined,
    pct: r.pct,
    last: r.lastAt ?? 0,
  }));
}

export function peopleBlock(
  title: string,
  rows: PeopleRow[],
  subtitle?: string
): WeeklyBlock {
  const present = new Set(rows.flatMap((r) => r.tags));
  return {
    type: "people",
    title,
    subtitle,
    sections: SECTION_ORDER.map((key) => ({ key, label: SECTION_LABELS[key] })),
    filters: [
      ...CATEGORY_ORDER.filter((c) => present.has(c)).map((c) => ({
        key: c,
        label: CATEGORY_META[c].label,
        colour: CATEGORY_META[c].colour,
      })),
      ...(present.has("noCampus") ? [{ key: "noCampus", label: "No campus set" }] : []),
    ],
    sorts: [
      { key: "pct", label: "Attendance %" },
      { key: "name", label: "Name" },
      { key: "last", label: "Last came" },
    ],
    rows,
    emptyText: "Nobody has come to a weekly yet.",
  };
}

const GROUP_TITLES: Record<FollowUpGroupKey, string> = {
  was_coming: "Was coming, then stopped",
  newcomer: "New and hasn't come back",
  visitor: "Visitors",
};

export function followUpBlocks(people: WeeklyFollowUp[], year: number): WeeklyBlock[] {
  const row = (f: WeeklyFollowUp): FollowRow => ({
    key: f.key,
    name: f.name,
    photo: f.photo ?? null,
    category: pill(f.category),
    reason: f.reason,
    secondary: f.group === "visitor" && f.campus ? `From ${subgroupLabel(f.campus)}` : lastCame(f, year),
  });
  const pick = (g: FollowUpGroupKey, needs?: boolean) =>
    people.filter((p) => p.group === g && (needs === undefined || p.needsFollowUp === needs)).map(row);
  return [
    {
      type: "followUpGroups",
      title: "Needs follow-up",
      icon: "heart-outline",
      groups: [
        { key: "was_coming", title: GROUP_TITLES.was_coming, people: pick("was_coming") },
        { key: "newcomer", title: GROUP_TITLES.newcomer, people: pick("newcomer") },
      ].filter((g) => g.people.length > 0),
      preview: FOLLOW_UP_PREVIEW,
      emptyText: "Nobody needs a follow-up right now.",
    },
    {
      type: "followUpGroups",
      title: "Visitors",
      icon: "airplane-outline",
      groups: [
        { key: "visitor_gone", title: "Haven't come back", people: pick("visitor", true) },
        { key: "visitor_recent", title: "Came recently", people: pick("visitor", false) },
      ].filter((g) => g.people.length > 0),
      preview: FOLLOW_UP_PREVIEW,
      emptyText: "No visitors from other campuses lately.",
    },
  ];
}

export const countDelta = (now: number | null, then: number | null): ViewCard["delta"] => {
  if (now === null || then === null || then === 0) return undefined;
  const pct = Math.round(((now - then) / then) * 100);
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
};

const shareDelta = (now: number | null, then: number | null): ViewCard["delta"] => {
  if (now === null || then === null) return undefined;
  const pts = Math.round((now - then) * 100);
  return { text: `${pts > 0 ? "+" : ""}${pts} pts`, direction: pts > 0 ? "up" : pts < 0 ? "down" : "flat" };
};

const stayedShare = (s: PeriodSummary) => (s.newcomers ? s.newcomersStayed / s.newcomers : null);

/**
 * The summary cards. `lastLabel` names exactly what they're compared with
 * ("T2 2026 up to W4" while a term runs, "2025 up to T3 W4" for the year so
 * far), and `compareNote` says the same in every card's (i).
 */
export function summaryCards(
  s: PeriodSummary,
  last: PeriodSummary | null,
  lastLabel: string | null,
  compareNote?: string,
  /** The jointWeeklies setting: Mega and combined weeklies are counted too. */
  jointCounted = false
): ViewCard[] {
  // The label stays on one line ("T2 2026 up to W4"); a narrow card wraps before it.
  const keep = (label: string) => label.replace(/ /g, "\u00a0").replace(/–/g, "–\u2060");
  const vs = (v: string) => (last && lastLabel ? `vs ${v} in ${keep(lastLabel)}` : undefined);
  const info = (title: string, body: string) => ({
    title,
    body: compareNote && last ? `${body} ${compareNote}` : body,
  });
  const stayed = stayedShare(s);
  const lastStayed = last ? stayedShare(last) : null;
  return [
    {
      label: "Weekly avg",
      value: s.weeklyAvg === null ? "–" : String(s.weeklyAvg),
      delta: countDelta(s.weeklyAvg, last?.weeklyAvg ?? null),
      hint: last?.weeklyAvg != null ? vs(String(last.weeklyAvg)) : undefined,
      info: info(
        "Weekly avg",
        jointCounted
          ? "The average head count at this campus's weeklies, Mega and combined ones with other campuses included. A weekly nobody signed in to isn't counted."
          : "The average head count at this campus's own weeklies. Mega and combined weeklies with other campuses aren't counted, and neither is a weekly nobody signed in to."
      ),
    },
    {
      label: "People",
      value: String(s.people),
      delta: countDelta(s.people, last?.people ?? null),
      hint: last ? vs(String(last.people)) : undefined,
      info: info(
        "People",
        jointCounted
          ? "How many different people came to at least one of this campus's weeklies, Mega and combined ones included."
          : "How many different people came to at least one of this campus's own weeklies. Mega and combined weeklies aren't counted."
      ),
    },
    {
      label: "Regulars",
      value: String(s.regulars),
      delta: countDelta(s.regulars, last?.regulars ?? null),
      hint: last ? vs(String(last.regulars)) : undefined,
      info: info("Regulars", "People who came to at least half the weeklies. Leaders, staff and visitors aren't counted."),
    },
    {
      label: "Newcomers",
      value: String(s.newcomers),
      tone: "positive",
      delta: countDelta(s.newcomers, last?.newcomers ?? null),
      hint: last ? vs(String(last.newcomers)) : undefined,
      info: info("Newcomers", "People who came to their first weekly at this campus in this period."),
    },
    {
      label: "Newcomers who stayed",
      value: stayed === null ? "–" : pctText(stayed),
      delta: shareDelta(stayed, lastStayed),
      hint: s.newcomers ? `${s.newcomersStayed} of ${s.newcomers} came back` : undefined,
      info: info("Newcomers who stayed", "The share of this period's newcomers who came to a second weekly."),
    },
    {
      label: "Campus share",
      value: s.campusShare === null ? "–" : pctText(s.campusShare),
      delta: shareDelta(s.campusShare, last?.campusShare ?? null),
      hint: last?.campusShare != null ? vs(pctText(last.campusShare)) : undefined,
      info: info(
        "Campus share",
        "The share of student sign-ins that came from this campus's own people, counting people with no campus set. Visitors from other campuses make up the rest."
      ),
    },
  ];
}

const THIS_COLOUR = "primary";
// The comparison stays in the background: a see-through grey. Sent as hex
// rather than a token so older app builds draw it the same way.
const LAST_COLOUR = "#9CA3AFA6";

type CategoryPoint = { at: number; label: string; counts: TermResult["byCategory"][number]["counts"] };

/**
 * "W1", "W2", …, one per weekly. A second weekly with the same week number
 * (say a special night in a week the campus didn't count) is "W7·2", so it's
 * never merged with the first.
 */
export function weekLabels(weeklies: { week: number }[]): string[] {
  const seen = new Map<number, number>();
  return weeklies.map(({ week }) => {
    const n = (seen.get(week) ?? 0) + 1;
    seen.set(week, n);
    return n === 1 ? `W${week}` : `W${week}·${n}`;
  });
}

const termPoints = (t: TermResult): CategoryPoint[] => {
  const labels = weekLabels(t.byCategory);
  return t.byCategory.map((p, i) => ({ at: p.at, label: labels[i], counts: p.counts }));
};

function byCategoryChart(points: CategoryPoint[], title: string, subtitle?: string): WeeklyBlock {
  const used = CATEGORY_ORDER.filter((c) => points.some((p) => (p.counts[c] ?? 0) > 0));
  return {
    type: "multiBars",
    title,
    subtitle,
    legend: used.map((c) => ({ key: c, colour: CATEGORY_META[c].colour, label: CATEGORY_META[c].label })),
    points: points.map((p) => ({
      at: p.at,
      label: p.label,
      segments: used.map((c) => ({ key: c, value: p.counts[c] ?? 0, colour: CATEGORY_META[c].colour })),
    })),
    stacked: true,
  };
}

export function buildTermBlocks(input: {
  computedAt: number;
  result: TermResult;
  /** The term before, to compare with. */
  before: TermResult | null;
  running: boolean;
  followUps: WeeklyFollowUp[] | null;
  /** The jointWeeklies setting, for the cards' (i). */
  jointCounted?: boolean;
}): WeeklyBlock[] {
  const { result, before, running } = input;
  const { term } = result;
  const lastWeek = term.weeklies[term.weeklies.length - 1].week;
  // While this term runs, the term before is cut to the same week; say so
  // wherever its numbers appear, so they don't look like its full-term ones.
  const beforeLabel = before ? `${before.term.label}${running ? ` up to W${lastWeek}` : ""}` : null;
  const point = before ? `${before.term.label}${running ? ` up to week ${lastWeek}` : ""}` : null;
  const count = `${term.weeklies.length} weekl${term.weeklies.length === 1 ? "y" : "ies"}${running ? " so far" : ""}`;
  const compareNote = before
    ? running
      ? `Compared with ${point}, the same point in the ${termWord(term.system)}. ${before.term.label}'s own page has its whole ${termWord(term.system)}.`
      : `Compared with ${point}.`
    : undefined;
  const blocks: WeeklyBlock[] = [
    { type: "updated", computedAt: input.computedAt },
    {
      type: "caption",
      text: before
        ? `${term.label}: ${count}, compared with ${point}.`
        : `${term.label}: ${count}. There's no earlier ${termWord(term.system)} to compare with.`,
    },
    {
      type: "cards",
      layout: "grid",
      cards: summaryCards(result.summary, before?.summary ?? null, beforeLabel, compareNote, input.jointCounted),
    },
  ];
  // The week-by-week charts sit near the top, above the follow-up lists.
  // Points line up by label, so a second weekly in one week keeps its own bar.
  type WeekPoint = { at: number; week: number; n: number; now: number; then: number };
  const weeks = new Map<string, WeekPoint>();
  const add = (weeklies: TermResult["term"]["weeklies"], side: "now" | "then") =>
    weekLabels(weeklies).forEach((label, i) => {
      const w = weeklies[i];
      const point = weeks.get(label) ?? { at: w.at, week: w.week, n: i, now: 0, then: 0 };
      point[side] = w.count;
      weeks.set(label, point);
    });
  add(term.weeklies, "now");
  add(before?.term.weeklies ?? [], "then");
  if (before) {
    blocks.push({
      type: "multiBars",
      title: "Week by week",
      subtitle: `Against ${point}`,
      legend: [
        { key: "now", colour: THIS_COLOUR, label: term.label },
        { key: "then", colour: LAST_COLOUR, label: before.term.label },
      ],
      points: [...weeks.entries()]
        .sort((a, b) => a[1].week - b[1].week || a[1].n - b[1].n)
        .map(([label, p]) => ({
          at: p.at,
          label,
          segments: [
            { key: "now", value: p.now, colour: THIS_COLOUR },
            { key: "then", value: p.then, colour: LAST_COLOUR },
          ],
        })),
      stacked: false,
      keepZeros: true,
    });
  }
  blocks.push(byCategoryChart(termPoints(result), "Who came each week", "Head count by category"));
  if (input.followUps) blocks.push(...followUpBlocks(input.followUps, term.year));
  blocks.push(
    peopleBlock(
      "Everyone",
      peopleRows(result.rows, term.year),
      `Everyone who came in ${term.label}${result.rows.some((r) => r.attended === 0) ? ` or the ${termWord(term.system)} before` : ""}.`
    )
  );
  return blocks;
}

/** "T1" or "Sem 1": a term's label without its year. */
const withoutYear = (t: { label: string }) => t.label.split(" ").slice(0, -1).join(" ");
const termName = (t: TermResult) => withoutYear(t.term);

export function buildYearBlocks(input: {
  computedAt: number;
  result: YearResult;
  lastYear: YearResult | null;
  /** How far the year in progress has got ("T3 week 4"), or null for a past year. */
  cut: string | null;
  terms: TermResult[];
  lastYearTerms: TermResult[];
  /** The jointWeeklies setting, for the cards' (i). */
  jointCounted?: boolean;
}): WeeklyBlock[] {
  const { result, lastYear } = input;
  const { cut } = input;
  const shortCut = cut?.replace(" week ", " W");
  const lastLabel = lastYear ? `${lastYear.year}${shortCut ? ` up to ${shortCut}` : ""}` : null;
  const point = lastYear ? `${lastYear.year}${cut ? ` up to ${cut}` : ""}` : null;
  const names = result.terms.map(withoutYear);
  const across = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  const count = `${result.summary.weeklies} weekl${result.summary.weeklies === 1 ? "y" : "ies"} in ${across}`;
  const compareNote = lastYear
    ? cut
      ? `Compared with ${point}, the same point in the year. ${lastYear.year}'s own page has the whole year.`
      : `Compared with ${point}.`
    : undefined;
  const blocks: WeeklyBlock[] = [
    { type: "updated", computedAt: input.computedAt },
    {
      type: "caption",
      text: lastYear
        ? `${result.year}: ${count}, compared with ${point}.`
        : `${result.year}: ${count}. There's no earlier year to compare with.`,
    },
    {
      type: "cards",
      layout: "grid",
      cards: summaryCards(result.summary, lastYear?.summary ?? null, lastLabel, compareNote, input.jointCounted),
    },
  ];
  if (lastYear) {
    const slots = [...new Set([...input.terms, ...input.lastYearTerms].map((t) => t.term.slot))].sort();
    blocks.push({
      type: "multiBars",
      title: `Weekly avg by ${termWord(input.terms[0]?.term.system ?? input.lastYearTerms[0].term.system)}`,
      subtitle: `Against ${point}`,
      legend: [
        { key: "now", colour: THIS_COLOUR, label: String(result.year) },
        { key: "then", colour: LAST_COLOUR, label: String(lastYear.year) },
      ],
      points: slots.map((slot) => {
        const now = input.terms.find((t) => t.term.slot === slot);
        const then = input.lastYearTerms.find((t) => t.term.slot === slot);
        return {
          at: slot,
          label: termName((now ?? then)!),
          segments: [
            { key: "now", value: now?.summary.weeklyAvg ?? 0, colour: THIS_COLOUR },
            { key: "then", value: then?.summary.weeklyAvg ?? 0, colour: LAST_COLOUR },
          ],
        };
      }),
      stacked: false,
      keepZeros: true,
    });
  }
  // One chart per term: a whole year of weeks is too crowded for one.
  for (const t of input.terms) {
    blocks.push(byCategoryChart(termPoints(t), `Who came each week in ${termName(t)}`, "Head count by category"));
  }
  blocks.push(peopleBlock("Everyone", peopleRows(result.rows, result.year), `Everyone who came in ${result.year}.`));
  return blocks;
}

export type MemberEvent = { name: string; at: number; campuses: string; weekly: boolean };

/** The member page: who they are, their category and history at one campus,
 *  and every event they've signed in to. */
export function buildMemberBlocks(input: {
  name: string;
  photo?: string | null;
  memberId?: string | null;
  lines: string[];
  details: { label: string; value: string; link?: string }[];
  history: { term: TermResult["term"]; row: TermRow }[];
  followUp: WeeklyFollowUp | null;
  events: MemberEvent[];
  year: number;
}): WeeklyBlock[] {
  const latest = input.history[0] ?? null;
  const blocks: WeeklyBlock[] = [
    {
      type: "memberHeader",
      name: input.name,
      photo: input.photo ?? null,
      memberId: input.memberId ?? null,
      lines: input.lines,
      category: latest ? pill(latest.row.category) : undefined,
      reason: latest
        ? [
            `${latest.term.label}: ${latest.row.attended}/${latest.row.held} · ${pctText(latest.row.pct)}`,
            lastCame(latest.row, input.year),
            ...(input.followUp ? [input.followUp.reason] : []),
          ].join("\n")
        : undefined,
    },
  ];
  if (input.details.length) blocks.push({ type: "keyValues", title: "Details", rows: input.details });
  if (input.history.length) {
    blocks.push({
      type: "termHistory",
      title: `Weeklies by ${termWord(latest!.term.system)}`,
      rows: input.history.map(({ term, row }) => ({
        key: term.key,
        label: term.label,
        primary: `${row.attended}/${row.held} · ${pctText(row.pct)}`,
        category: pill(row.category),
      })),
    });
    blocks.push({
      type: "weekGrid",
      title: latest!.term.label,
      subtitle: `Weeklies attended this ${termWord(latest!.term.system)}`,
      weeks: weekLabels(latest!.term.weeklies).map((label, i) => ({
        label,
        came: latest!.row.indexes.includes(i),
      })),
    });
  }
  blocks.push({
    type: "eventList",
    title: "Events attended",
    rows: input.events.map((e) => ({
      title: e.name,
      subtitle: `${dateText(e.at, input.year)} · ${e.campuses}`,
      tag: e.weekly ? "Weekly" : undefined,
    })),
    emptyText: "No events yet.",
  });
  return blocks;
}
