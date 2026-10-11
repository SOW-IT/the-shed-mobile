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
  type WeeklyCategory,
  type WeeklyFollowUp,
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
  | { type: "keyValues"; title: string; rows: { label: string; value: string }[] }
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
    };

export type WeeklyPeriod = { key: string; label: string };

export const FOLLOW_UP_PREVIEW = 5;

export const pill = (category: WeeklyCategory): Pill => ({
  label: CATEGORY_META[category].label,
  colour: CATEGORY_META[category].colour,
});

export const pctText = (n: number) => `${Math.round(n * 100)}%`;

/** "3 Jun", or "3 Jun 2025" when it isn't `year`. */
export const dateText = (ms: number, year: number): string => {
  const y = sydneyYmd(new Date(ms)).year;
  return y === year ? dayLabel(ms) : `${dayLabel(ms)} ${y}`;
};

const lastCame = (row: { lastAt: number | null }, year: number) =>
  row.lastAt ? `Last came ${dateText(row.lastAt, year)}` : "Hasn't come yet";

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
      ? `${lastCame(r, year)} · ${r.window.attended} of the last ${r.window.held} weeklies`
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
      emptyText: "Nobody right now.",
    },
    {
      type: "followUpGroups",
      title: "Visitors",
      icon: "airplane-outline",
      groups: [
        { key: "visitor_gone", title: "Not back since", people: pick("visitor", true) },
        { key: "visitor_recent", title: "Visited recently", people: pick("visitor", false) },
      ].filter((g) => g.people.length > 0),
      preview: FOLLOW_UP_PREVIEW,
      emptyText: "No visitors lately.",
    },
  ];
}

const countDelta = (now: number | null, then: number | null): ViewCard["delta"] => {
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

export function summaryCards(
  s: PeriodSummary,
  last: PeriodSummary | null,
  lastLabel: string | null
): ViewCard[] {
  const vs = (v: string) => (last && lastLabel ? `vs ${v} in ${lastLabel}` : undefined);
  const stayed = stayedShare(s);
  const lastStayed = last ? stayedShare(last) : null;
  return [
    {
      label: "Weekly avg",
      value: s.weeklyAvg === null ? "–" : String(s.weeklyAvg),
      delta: countDelta(s.weeklyAvg, last?.weeklyAvg ?? null),
      hint: last?.weeklyAvg != null ? vs(String(last.weeklyAvg)) : undefined,
      info: { title: "Weekly avg", body: "Average head count at this campus's weekly meetings. A weekly nobody signed in to doesn't count." },
    },
    {
      label: "People",
      value: String(s.people),
      delta: countDelta(s.people, last?.people ?? null),
      hint: last ? vs(String(last.people)) : undefined,
      info: { title: "People", body: "Different people who came to at least one weekly." },
    },
    {
      label: "Regulars",
      value: String(s.regulars),
      delta: countDelta(s.regulars, last?.regulars ?? null),
      hint: last ? vs(String(last.regulars)) : undefined,
      info: { title: "Regulars", body: "People who came to at least half of the weeklies (leaders, staff and visitors aside)." },
    },
    {
      label: "Newcomers",
      value: String(s.newcomers),
      tone: "positive",
      delta: countDelta(s.newcomers, last?.newcomers ?? null),
      hint: last ? vs(String(last.newcomers)) : undefined,
      info: { title: "Newcomers", body: "People whose first-ever weekly here was in this period." },
    },
    {
      label: "Newcomers who stayed",
      value: stayed === null ? "–" : pctText(stayed),
      delta: shareDelta(stayed, lastStayed),
      hint: s.newcomers ? `${s.newcomersStayed} of ${s.newcomers} came 2+ times` : undefined,
      info: { title: "Newcomers who stayed", body: "Of this period's newcomers, the share who came to two or more weeklies." },
    },
    {
      label: "Campus share",
      value: s.campusShare === null ? "–" : pctText(s.campusShare),
      delta: shareDelta(s.campusShare, last?.campusShare ?? null),
      hint: last?.campusShare != null ? vs(pctText(last.campusShare)) : undefined,
      info: { title: "Campus share", body: "Of the students at weeklies, the share from this campus (including people with no campus set)." },
    },
  ];
}

const THIS_COLOUR = "primary";
const LAST_COLOUR = "accent";

type CategoryPoint = { at: number; label: string; counts: TermResult["byCategory"][number]["counts"] };

const termPoints = (t: TermResult, prefix = ""): CategoryPoint[] =>
  t.byCategory.map((p) => ({ at: p.at, label: `${prefix}W${p.week}`, counts: p.counts }));

function byCategoryChart(points: CategoryPoint[], title: string): WeeklyBlock {
  const used = CATEGORY_ORDER.filter((c) => points.some((p) => (p.counts[c] ?? 0) > 0));
  return {
    type: "multiBars",
    title,
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
  lastYear: TermResult | null;
  running: boolean;
  followUps: WeeklyFollowUp[] | null;
}): WeeklyBlock[] {
  const { result, lastYear, running } = input;
  const { term } = result;
  const lastWeek = term.weeklies[term.weeklies.length - 1].week;
  const compare = lastYear
    ? `Compared with ${lastYear.term.label}${running ? ` up to week ${lastWeek}` : ""}.`
    : "Nothing to compare with from last year.";
  const blocks: WeeklyBlock[] = [
    { type: "updated", computedAt: input.computedAt },
    {
      type: "caption",
      text: `${term.label} · ${term.weeklies.length} weekl${term.weeklies.length === 1 ? "y" : "ies"}${running ? " so far" : ""}. ${compare}`,
    },
    { type: "cards", layout: "grid", cards: summaryCards(result.summary, lastYear?.summary ?? null, lastYear?.term.label ?? null) },
  ];
  if (input.followUps) blocks.push(...followUpBlocks(input.followUps, term.year));
  const weeks = new Map<number, { at: number; now: number; then: number }>();
  for (const w of term.weeklies) weeks.set(w.week, { at: w.at, now: w.count, then: 0 });
  for (const w of lastYear?.term.weeklies ?? []) {
    const slot = weeks.get(w.week) ?? { at: w.at, now: 0, then: 0 };
    slot.then = w.count;
    weeks.set(w.week, slot);
  }
  if (lastYear) {
    blocks.push({
      type: "multiBars",
      title: "Week by week",
      subtitle: `${term.label} vs ${lastYear.term.label}`,
      legend: [
        { key: "now", colour: THIS_COLOUR, label: term.label },
        { key: "then", colour: LAST_COLOUR, label: lastYear.term.label },
      ],
      points: [...weeks.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([week, p]) => ({
          at: p.at,
          label: `W${week}`,
          segments: [
            { key: "now", value: p.now, colour: THIS_COLOUR },
            { key: "then", value: p.then, colour: LAST_COLOUR },
          ],
        })),
      stacked: false,
      keepZeros: true,
    });
  }
  blocks.push(byCategoryChart(termPoints(result), "Who came each week"));
  blocks.push(
    peopleBlock(
      "Everyone",
      peopleRows(result.rows, term.year),
      `Everyone who came in ${term.label}${result.rows.some((r) => r.attended === 0) ? " or the term before" : ""}.`
    )
  );
  return blocks;
}

export function buildYearBlocks(input: {
  computedAt: number;
  result: YearResult;
  lastYear: YearResult | null;
  upTo: number | null;
  terms: TermResult[];
  lastYearTerms: TermResult[];
}): WeeklyBlock[] {
  const { result, lastYear } = input;
  const lastLabel = lastYear ? String(lastYear.year) : null;
  const caption = lastYear
    ? `Compared with ${lastYear.year}${input.upTo ? ` up to ${dayLabel(input.upTo)}` : ""}.`
    : "Nothing to compare with from last year.";
  const blocks: WeeklyBlock[] = [
    { type: "updated", computedAt: input.computedAt },
    {
      type: "caption",
      text: `${result.year} · ${result.terms.map((t) => t.label.split(" ")[0]).join(", ")} · ${result.summary.weeklies} weeklies. ${caption}`,
    },
    { type: "cards", layout: "grid", cards: summaryCards(result.summary, lastYear?.summary ?? null, lastLabel) },
  ];
  if (lastYear) {
    const name = (t: TermResult) => t.term.label.split(" ").slice(0, -1).join(" ");
    const slots = [...new Set([...input.terms, ...input.lastYearTerms].map((t) => t.term.slot))].sort();
    blocks.push({
      type: "multiBars",
      title: "Weekly avg by term",
      subtitle: `${result.year} vs ${lastYear.year}`,
      legend: [
        { key: "now", colour: THIS_COLOUR, label: String(result.year) },
        { key: "then", colour: LAST_COLOUR, label: String(lastYear.year) },
      ],
      points: slots.map((slot) => {
        const now = input.terms.find((t) => t.term.slot === slot);
        const then = input.lastYearTerms.find((t) => t.term.slot === slot);
        return {
          at: slot,
          label: name((now ?? then)!),
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
  blocks.push(
    byCategoryChart(
      input.terms.flatMap((t) => termPoints(t, `${t.term.label.split(" ").slice(0, -1).join(" ")} `)),
      "Who came each week"
    )
  );
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
  details: { label: string; value: string }[];
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
            ...(input.followUp ? [input.followUp.reason] : []),
          ].join(" · ")
        : undefined,
    },
  ];
  if (input.details.length) blocks.push({ type: "keyValues", title: "Details", rows: input.details });
  if (input.history.length) {
    blocks.push({
      type: "termHistory",
      title: "Weeklies by term",
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
      subtitle: "Weeklies held this term",
      weeks: latest!.term.weeklies.map((w) => ({
        label: `W${w.week}`,
        came: latest!.row.weeks.includes(w.week),
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
