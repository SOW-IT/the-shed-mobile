import { describe, expect, test } from "vitest";
import {
  computeTerm,
  computeYear,
  DEFAULT_WEEKLY_SETTINGS,
  deriveTerms,
  followUps,
  type PeriodSummary,
  sameTermLastYear,
  type TermFacts,
  type WeeklyPerson,
} from "./weeklyInsights";
import {
  buildMemberBlocks,
  buildTermBlocks,
  buildYearBlocks,
  dateText,
  followUpBlocks,
  peopleBlock,
  peopleRows,
  pill,
  summaryCards,
  type WeeklyBlock,
} from "./weeklyInsightsView";

const UNSW = "University of New South Wales";
const wed = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 7);

let n = 0;
function build(entries: [number, string[]][]): TermFacts[] {
  const held = entries.map(([at, keys]) => ({ eventId: `e${n++}`, at, count: keys.length, keys }));
  return deriveTerms(held, "terms", 18).map((t) => {
    const attendance: Record<string, number[]> = {};
    t.weeklies.forEach((w, i) => {
      for (const key of held.find((h) => h.eventId === w.eventId)!.keys) (attendance[key] ??= []).push(i);
    });
    return { ...t, attendance };
  });
}

const person = (key: string, campus: string | null = UNSW, roles: string[] = []): WeeklyPerson => ({
  key,
  name: key,
  infoByYear: {},
  info: { campus, roles },
});

const c = {
  subgroup: UNSW,
  settings: DEFAULT_WEEKLY_SETTINGS,
  persons: new Map(
    [person("Ana"), person("Ben", null), person("Cy", "University of Sydney"), person("Di", UNSW, ["Staff"])].map(
      (p) => [p.key, p]
    )
  ),
};

const T1_2025 = [wed(2025, 2, 19), wed(2025, 2, 26), wed(2025, 3, 5)];
const T1_2026 = [wed(2026, 2, 18), wed(2026, 2, 25), wed(2026, 3, 4), wed(2026, 3, 11)];
const terms = build([
  ...T1_2025.map((at) => [at, ["Ana", "Di"]] as [number, string[]]),
  ...T1_2026.map((at, i) => [at, ["Ana", ...(i === 0 ? ["Ben", "Cy"] : [])]] as [number, string[]]),
]);

const byType = <T extends WeeklyBlock["type"]>(blocks: WeeklyBlock[], type: T) =>
  blocks.filter((b): b is Extract<WeeklyBlock, { type: T }> => b.type === type);

describe("people list", () => {
  test("rows carry category, share, last seen and the no-campus warning", () => {
    const rows = peopleRows(computeTerm(terms, 1, c).rows, 2026);
    const ben = rows.find((r) => r.key === "Ben")!;
    expect(ben).toMatchObject({
      tags: ["newcomer", "noCampus"],
      category: { label: "Newcomer" },
      primary: "1/4 · 25%",
      secondary: "Last came 18 Feb",
      warning: "No campus set",
    });
    expect(rows.find((r) => r.key === "Di")!.secondary).toBe("Last came 5 Mar 2025");
    const block = peopleBlock("Everyone", rows, "sub");
    expect(block).toMatchObject({ type: "people", subtitle: "sub" });
    if (block.type !== "people") throw new Error();
    // Only the categories present get a filter chip, plus "No campus set".
    expect(block.filters.map((f) => f.key)).toEqual(["newcomer", "regular", "visitor", "staff", "noCampus"]);
    expect(peopleBlock("x", []).type === "people" && (peopleBlock("x", []) as { filters: unknown[] }).filters).toEqual([]);
  });

  test("early in a term, the row says which weeklies its category counted", () => {
    const early = build([
      ...T1_2025.map((at) => [at, ["Ana"]] as [number, string[]]),
      [wed(2025, 6, 4), ["Ana"]],
    ]);
    const rows = peopleRows(computeTerm(early, 1, c).rows, 2025);
    expect(rows[0].secondary).toBe("Last came 4 Jun · 4 of the last 4 weeklies");
  });

  test("helpers", () => {
    expect(pill("leader")).toEqual({ label: "Leader", colour: "#DC2626" });
    expect(dateText(wed(2026, 3, 4), 2026)).toBe("4 Mar");
    expect(dateText(wed(2025, 3, 4), 2026)).toBe("4 Mar 2025");
  });
});

describe("follow-ups", () => {
  test("groups the lists and leaves empty groups out", () => {
    const [needs, visitors] = followUpBlocks(
      [
        { key: "a", name: "A", category: "regular", group: "was_coming", needsFollowUp: true, reason: "r", lastAt: wed(2026, 3, 4), share: 1 },
        { key: "v", name: "V", category: "visitor", group: "visitor", needsFollowUp: false, reason: "Visited", lastAt: null, share: 0 },
        { key: "w", name: "W", category: "visitor", campus: "University of Sydney", group: "visitor", needsFollowUp: false, reason: "Visited", lastAt: null, share: 0 },
      ],
      2026
    );
    expect(needs).toMatchObject({ type: "followUpGroups", title: "Needs follow-up" });
    if (needs.type !== "followUpGroups" || visitors.type !== "followUpGroups") throw new Error();
    expect(needs.groups.map((g) => g.key)).toEqual(["was_coming"]);
    expect(needs.groups[0].people[0]).toMatchObject({ name: "A", secondary: "Last came 4 Mar" });
    expect(visitors.groups.map((g) => g.key)).toEqual(["visitor_recent"]);
    expect(visitors.groups[0].people[0].secondary).toBe("Hasn't come yet");
    expect(visitors.groups[0].people[1].secondary).toBe("From USYD");
  });
});

describe("cards", () => {
  const s: PeriodSummary = { weeklies: 4, weeklyAvg: 10, people: 20, regulars: 5, newcomers: 4, newcomersStayed: 2, campusShare: 0.8 };
  test("compare with last year in % for counts and points for shares", () => {
    const cards = summaryCards(s, { ...s, weeklyAvg: 8, people: 20, regulars: 10, newcomers: 0, campusShare: 0.85 }, "T1 2025");
    const byLabel = Object.fromEntries(cards.map((card) => [card.label, card]));
    expect(byLabel["Weekly avg"]).toMatchObject({ value: "10", delta: { text: "+25%", direction: "up" }, hint: "vs 8 in T1 2025" });
    expect(byLabel.People.delta).toEqual({ text: "0%", direction: "flat" });
    expect(byLabel.Regulars.delta).toEqual({ text: "-50%", direction: "down" });
    expect(byLabel.Newcomers.delta).toBeUndefined();
    expect(byLabel["Newcomers who stayed"]).toMatchObject({ value: "50%", hint: "2 of 4 came 2+ times", delta: undefined });
    expect(byLabel["Campus share"]).toMatchObject({ value: "80%", delta: { text: "-5 pts", direction: "down" } });
  });

  test("with nothing to compare, or nothing yet", () => {
    const empty: PeriodSummary = { weeklies: 0, weeklyAvg: null, people: 0, regulars: 0, newcomers: 0, newcomersStayed: 0, campusShare: null };
    const cards = summaryCards(empty, null, null);
    expect(cards.map((card) => card.value)).toEqual(["–", "0", "0", "0", "–", "–"]);
    expect(cards.every((card) => card.delta === undefined && card.hint === undefined)).toBe(true);
    const up = summaryCards({ ...s, campusShare: 0.9 }, { ...s, newcomersStayed: 1, weeklyAvg: null }, "x");
    expect(up.find((card) => card.label === "Campus share")!.delta!.direction).toBe("up");
    expect(up.find((card) => card.label === "Newcomers who stayed")!.delta!.text).toBe("+25 pts");
    expect(up.find((card) => card.label === "Weekly avg")!.hint).toBeUndefined();
    expect(summaryCards(s, s, "x").find((card) => card.label === "Campus share")!.delta!.direction).toBe("flat");
  });
});

describe("term view", () => {
  test("a running term: so far, compared to the same week, with follow-ups", () => {
    const result = computeTerm(terms, 1, c);
    const blocks = buildTermBlocks({
      computedAt: 1,
      result,
      lastYear: sameTermLastYear(terms, 1, true, c),
      running: true,
      followUps: followUps(terms, result.rows, c),
    });
    expect(blocks[1]).toEqual({ type: "caption", text: "T1 2026 · 4 weeklies so far. Compared with T1 2025 up to week 4." });
    expect(byType(blocks, "followUpGroups")).toHaveLength(2);
    const charts = byType(blocks, "multiBars");
    expect(charts.map((b) => b.title)).toEqual(["Week by week", "Who came each week"]);
    expect(charts[0].points.map((p) => p.label)).toEqual(["W1", "W2", "W3", "W4"]);
    expect(charts[0].points[3].segments.map((sg) => sg.value)).toEqual([1, 0]);
    expect(byType(blocks, "people")[0].subtitle).toBe("Everyone who came in T1 2026 or the term before.");
  });

  test("a finished term with nothing from last year", () => {
    const one = build([[wed(2026, 2, 18), ["Ana"]]]);
    const blocks = buildTermBlocks({ computedAt: 1, result: computeTerm(one, 0, c), lastYear: null, running: false, followUps: null });
    expect(blocks[1]).toEqual({ type: "caption", text: "T1 2026 · 1 weekly. Nothing to compare with from last year." });
    expect(byType(blocks, "followUpGroups")).toHaveLength(0);
    expect(byType(blocks, "multiBars").map((b) => b.title)).toEqual(["Who came each week"]);
    expect(byType(blocks, "people")[0].subtitle).toBe("Everyone who came in T1 2026.");
  });
});

describe("year view", () => {
  test("compared with last year to the same day, by term", () => {
    const blocks = buildYearBlocks({
      computedAt: 1,
      result: computeYear(terms, 2026, c)!,
      lastYear: computeYear(terms, 2025, c, wed(2025, 3, 1)),
      upTo: wed(2025, 3, 1),
      terms: [computeTerm(terms, 1, c)],
      lastYearTerms: [computeTerm(terms, 0, c)],
    });
    expect(blocks[1]).toEqual({ type: "caption", text: "2026 · T1 · 4 weeklies. Compared with 2025 up to 1 Mar." });
    const [byTerm, byCat] = byType(blocks, "multiBars");
    expect(byTerm.points).toMatchObject([{ label: "T1", segments: [{ value: 1.5 }, { value: 2 }] }]);
    expect(byCat.points[0].label).toBe("T1 W1");
    expect(byType(blocks, "people")[0].subtitle).toBe("Everyone who came in 2026.");
  });

  test("a full past year, and a first year with nothing before it", () => {
    const full = buildYearBlocks({
      computedAt: 1,
      result: computeYear(terms, 2026, c)!,
      lastYear: computeYear(terms, 2025, c),
      upTo: null,
      terms: [computeTerm(terms, 1, c)],
      lastYearTerms: [],
    });
    expect((full[1] as { text: string }).text).toMatch(/Compared with 2025\.$/);
    expect(byType(full, "multiBars")[0].points[0].segments[1].value).toBe(0);
    const first = buildYearBlocks({
      computedAt: 1,
      result: computeYear(terms, 2025, c)!,
      lastYear: null,
      upTo: null,
      terms: [computeTerm(terms, 0, c)],
      lastYearTerms: [],
    });
    expect((first[1] as { text: string }).text).toMatch(/Nothing to compare with/);
    expect(byType(first, "multiBars")).toHaveLength(1);
  });
});

describe("member page", () => {
  test("header, details, history, week grid and events", () => {
    const result = computeTerm(terms, 1, c);
    const ana = result.rows.find((r) => r.key === "Ana")!;
    const blocks = buildMemberBlocks({
      name: "Ana",
      memberId: "m1",
      lines: ["UNSW", "Member"],
      details: [{ label: "Year", value: "2" }],
      history: [{ term: terms[1], row: ana }],
      followUp: { key: "Ana", name: "Ana", category: "regular", group: "was_coming", needsFollowUp: true, reason: "Came to 4 of 4, then missed the last 2", lastAt: null, share: 1 },
      events: [
        { name: "Weeklies T1W1", at: wed(2026, 2, 18), campuses: "UNSW", weekly: true },
        { name: "Camp", at: wed(2025, 7, 1), campuses: "SOW", weekly: false },
      ],
      year: 2026,
    });
    expect(blocks.map((b) => b.type)).toEqual(["memberHeader", "keyValues", "termHistory", "weekGrid", "eventList"]);
    expect(blocks[0]).toMatchObject({
      category: { label: "Regular" },
      reason: "T1 2026: 4/4 · 100% · Came to 4 of 4, then missed the last 2",
      photo: null,
    });
    expect(byType(blocks, "weekGrid")[0].weeks.every((w) => w.came)).toBe(true);
    expect(byType(blocks, "eventList")[0].rows).toEqual([
      { title: "Weeklies T1W1", subtitle: "18 Feb · UNSW", tag: "Weekly" },
      { title: "Camp", subtitle: "1 Jul 2025 · SOW", tag: undefined },
    ]);
  });

  test("someone with no weeklies here", () => {
    const blocks = buildMemberBlocks({ name: "X", lines: [], details: [], history: [], followUp: null, events: [], year: 2026 });
    expect(blocks.map((b) => b.type)).toEqual(["memberHeader", "eventList"]);
    expect(blocks[0]).toMatchObject({ category: undefined, reason: undefined, memberId: null });
    const withRow = buildMemberBlocks({
      name: "Ana",
      lines: [],
      details: [],
      history: [{ term: terms[1], row: computeTerm(terms, 1, c).rows.find((r) => r.key === "Ana")! }],
      followUp: null,
      events: [],
      year: 2026,
    });
    expect((withRow[0] as { reason: string }).reason).toBe("T1 2026: 4/4 · 100%");
  });
});
