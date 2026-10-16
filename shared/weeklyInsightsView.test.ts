import { describe, expect, test } from "vitest";
import {
  computeTerm,
  computeYear,
  DEFAULT_WEEKLY_SETTINGS,
  deriveTerms,
  followUps,
  type PeriodSummary,
  termBefore,
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
  periodOptions,
  periodPicker,
  pill,
  weekLabels,
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
      secondary: "Last came T1W1 (18 Feb)",
      warning: "No campus set",
    });
    expect(rows.find((r) => r.key === "Di")!.secondary).toBe("Last came T1W3 (5 Mar 2025)");
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
    expect(rows[0].secondary).toBe("Last came T2W1 (4 Jun). Came to 4 of the last 4.");
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
    const cards = summaryCards(s, { ...s, weeklyAvg: 8, people: 20, regulars: 10, newcomers: 0, campusShare: 0.85 });
    const byLabel = Object.fromEntries(cards.map((card) => [card.label, card]));
    expect(byLabel["Weekly avg"]).toMatchObject({ value: "10", delta: { text: "+25%", direction: "up" }, hint: "vs 8" });
    expect(byLabel.People.hint).toBe("vs 20");
    expect(cards.every((card) => card.tone === undefined)).toBe(true);
    expect(byLabel.People.delta).toEqual({ text: "0%", direction: "flat" });
    expect(byLabel.Regulars.delta).toEqual({ text: "-50%", direction: "down" });
    expect(byLabel.Newcomers.delta).toBeUndefined();
    expect(byLabel["Newcomers who stayed"]).toMatchObject({ value: "50%", hint: "2 of 4 came back", delta: undefined });
    expect(byLabel["Campus share"]).toMatchObject({ value: "80%", delta: { text: "-5 pts", direction: "down" } });
  });

  test("the (i) follows the jointWeeklies setting", () => {
    const off = summaryCards(s, null);
    const on = summaryCards(s, null, undefined, true);
    expect(off[0].info!.body).toMatch(/Mega and combined weeklies with other campuses aren't counted/);
    expect(on[0].info!.body).toMatch(/Mega and combined ones with other campuses included/);
    expect(on[1].info!.body).toMatch(/Mega and combined ones included/);
  });

  test("with nothing to compare, or nothing yet", () => {
    const empty: PeriodSummary = { weeklies: 0, weeklyAvg: null, people: 0, regulars: 0, newcomers: 0, newcomersStayed: 0, campusShare: null };
    const cards = summaryCards(empty, null);
    expect(cards.map((card) => card.value)).toEqual(["–", "0", "0", "0", "–", "–"]);
    expect(cards.every((card) => card.delta === undefined && card.hint === undefined)).toBe(true);
    const up = summaryCards({ ...s, campusShare: 0.9 }, { ...s, newcomersStayed: 1, weeklyAvg: null });
    expect(up.find((card) => card.label === "Campus share")!.delta!.direction).toBe("up");
    expect(up.find((card) => card.label === "Newcomers who stayed")!.delta!.text).toBe("+25 pts");
    expect(up.find((card) => card.label === "Weekly avg")!.hint).toBeUndefined();
    expect(summaryCards(s, s).find((card) => card.label === "Campus share")!.delta!.direction).toBe("flat");
  });
});

describe("term view", () => {
  test("a running term: so far, compared to the same week, with follow-ups", () => {
    const result = computeTerm(terms, 1, c);
    const blocks = buildTermBlocks({
      computedAt: 1,
      result,
      before: termBefore(terms, 1, true, c),
      running: true,
      followUps: followUps(terms, result.rows, c),
    });
    expect(blocks[1]).toEqual({ type: "caption", text: "T1 2026: 4 weeklies so far, compared with T1 2025 up to week 4." });
    const cards = byType(blocks, "cards")[0].cards;
    expect(cards[0].hint).toBe("vs 2");
    expect(cards[0].info!.body).toBe(
      "The average head count at this campus's own weeklies. Mega and combined weeklies with other campuses aren't counted, and neither is a weekly nobody signed in to. Compared with T1 2025 up to week 4, the same point in the term. T1 2025's own page has its whole term."
    );
    expect(cards[1].info!.body).toMatch(/Mega and combined weeklies aren't counted\. Compared with T1 2025 up to week 4/);
    expect(byType(blocks, "multiBars")[0]).toMatchObject({
      subtitle: "Against T1 2025 up to week 4",
      legend: [{ label: "T1 2026" }, { label: "T1 2025", colour: "#9CA3AFA6" }],
    });
    expect(byType(blocks, "followUpGroups")).toHaveLength(2);
    const charts = byType(blocks, "multiBars");
    expect(charts.map((b) => b.title)).toEqual(["Week by week", "Who came each week"]);
    // Charts first, then the follow-up lists, then everyone.
    expect(blocks.slice(2).map((b) => b.type)).toEqual([
      "cards",
      "multiBars",
      "multiBars",
      "followUpGroups",
      "followUpGroups",
      "people",
    ]);
    expect(charts[0].points.map((p) => p.label)).toEqual(["W1", "W2", "W3", "W4"]);
    expect(charts[0].points[3].segments.map((sg) => sg.value)).toEqual([1, 0]);
    expect(byType(blocks, "people")[0].subtitle).toBe("Everyone who came in T1 2026 or the term before.");
  });

  test("a semester campus says semester, not term", () => {
    const sems = terms.map((t) => ({ ...t, system: "semesters" as const }));
    const blocks = buildTermBlocks({
      computedAt: 1,
      result: computeTerm(sems, 1, c),
      before: computeTerm(sems, 0, c),
      running: true,
      followUps: null,
    });
    expect(byType(blocks, "people")[0].subtitle).toBe("Everyone who came in T1 2026 or the semester before.");
    expect(byType(blocks, "cards")[0].cards[0].info?.body).toContain("the same point in the semester");
    const alone = buildTermBlocks({ computedAt: 1, result: computeTerm(sems, 0, c), before: null, running: false, followUps: null });
    expect(byType(alone, "caption")[0].text).toBe("T1 2025: 3 weeklies.");
    const ana = computeTerm(sems, 1, c).rows.find((r) => r.key === "Ana")!;
    const member = buildMemberBlocks({ name: "Ana", lines: [], details: [], history: [{ term: sems[1], row: ana }], followUp: null, events: [], year: 2026, current: true });
    expect(byType(member, "termHistory")[0].title).toBe("Weeklies by semester");
    expect(byType(member, "weekGrid")[0].subtitle).toBe("Weeklies attended this semester");
  });

  test("a finished term: compared with the whole term before", () => {
    const blocks = buildTermBlocks({
      computedAt: 1,
      result: computeTerm(terms, 1, c),
      before: termBefore(terms, 1, false, c),
      running: false,
      followUps: null,
    });
    expect(blocks[1]).toEqual({ type: "caption", text: "T1 2026: 4 weeklies, compared with T1 2025." });
    const cards = byType(blocks, "cards")[0].cards;
    expect(cards[0].hint).toBe("vs 2");
    expect(cards[0].info!.body).toMatch(/signed in to\. Compared with T1 2025\.$/);
    expect(byType(blocks, "multiBars")[0].subtitle).toBe("Against T1 2025");
  });

  test("a finished term with no term before it", () => {
    const one = build([[wed(2026, 2, 18), ["Ana"]]]);
    const blocks = buildTermBlocks({ computedAt: 1, result: computeTerm(one, 0, c), before: null, running: false, followUps: null });
    expect(blocks[1]).toEqual({ type: "caption", text: "T1 2026: 1 weekly." });
    expect(byType(blocks, "cards")[0].cards.every((card) => card.hint === undefined || !card.hint.startsWith("vs"))).toBe(true);
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
      lastYear: computeYear(terms, 2025, c, { slot: 1, week: 2, name: "T1" }),
      cut: "T1 week 2",
      terms: [computeTerm(terms, 1, c)],
      lastYearTerms: [computeTerm(terms, 0, c)],
    });
    expect(blocks[1]).toEqual({ type: "caption", text: "2026: 4 weeklies in T1, compared with 2025 up to T1 week 2." });
    const cards = byType(blocks, "cards")[0].cards;
    expect(cards[0].hint).toMatch(/^vs [\d.]+$/);
    expect(cards[0].info!.body).toMatch(/Compared with 2025 up to T1 week 2, the same point in the year/);
    const [byTerm, byCat] = byType(blocks, "multiBars");
    expect(byTerm).toMatchObject({ subtitle: "Against 2025 up to T1 week 2", legend: [{ label: "2026" }, { label: "2025" }] });
    expect(byTerm.points).toMatchObject([{ label: "T1", segments: [{ value: 1.5 }, { value: 2 }] }]);
    expect(byCat).toMatchObject({ title: "Who came each week in T1", subtitle: "Head count by category" });
    expect(byCat.points[0].label).toBe("W1");
    expect(byType(blocks, "people")[0].subtitle).toBe("Everyone who came in 2026.");
  });

  test("a full past year, and a first year with nothing before it", () => {
    const full = buildYearBlocks({
      computedAt: 1,
      result: computeYear(terms, 2026, c)!,
      lastYear: computeYear(terms, 2025, c),
      cut: null,
      terms: [computeTerm(terms, 1, c)],
      lastYearTerms: [],
    });
    expect((full[1] as { text: string }).text).toBe("2026: 4 weeklies in T1, compared with 2025.");
    const fullCards = byType(full, "cards")[0].cards;
    expect(fullCards[0].hint).toMatch(/^vs [\d.]+$/);
    expect(fullCards[0].info!.body).toMatch(/Compared with 2025\.$/);
    expect(byType(full, "multiBars")[0].points[0].segments[1].value).toBe(0);
    const first = buildYearBlocks({
      computedAt: 1,
      result: computeYear(terms, 2025, c)!,
      lastYear: null,
      cut: null,
      terms: [computeTerm(terms, 0, c)],
      lastYearTerms: [],
    });
    expect((first[1] as { text: string }).text).toBe("2025: 3 weeklies in T1.");
    // Nothing to compare with: the (i) only explains the number.
    expect(byType(first, "cards")[0].cards[0].info!.body).toMatch(/signed in to\.$/);
    expect(byType(first, "multiBars")).toHaveLength(1);
  });
});

describe("two weeklies in one week", () => {
  // A special night marked week 2, then the campus's own "week 2" a week later.
  const held = [wed(2026, 3, 4), wed(2026, 3, 11), wed(2026, 3, 18)].map((at, i) => ({
    eventId: `d${i}`,
    at,
    count: [3, 2, 4][i],
    mark: { year: 2026, slot: 1, week: [1, 2, 2][i] },
  }));
  const dup = deriveTerms(held, "terms", 18).map((t) => ({
    ...t,
    attendance: { Ana: [0, 1], Ben: [0, 2], Cy: [0, 2] },
  }));

  test("labels keep them apart", () => {
    expect(weekLabels([{ week: 1 }, { week: 2 }, { week: 2 }, { week: 3 }, { week: 2 }])).toEqual([
      "W1",
      "W2",
      "W2·2",
      "W3",
      "W2·3",
    ]);
  });

  test("each gets its own bar and its own box in the week grid", () => {
    const result = computeTerm(dup, 0, c);
    const blocks = buildTermBlocks({ computedAt: 1, result, before: null, running: false, followUps: null });
    const [byCat] = byType(blocks, "multiBars");
    expect(byCat.points.map((p) => p.label)).toEqual(["W1", "W2", "W2·2"]);
    const ana = result.rows.find((r) => r.key === "Ana")!;
    const member = buildMemberBlocks({ name: "Ana", lines: [], details: [], history: [{ term: dup[0], row: ana }], followUp: null, events: [], year: 2026 });
    // Ana came to the first week-2 weekly only.
    expect(byType(member, "weekGrid")[0].weeks).toEqual([
      { label: "W1", came: true },
      { label: "W2", came: true },
      { label: "W2·2", came: false },
    ]);
  });

  test("the week-by-week chart lines both up against the term before", () => {
    const next = [...dup, ...build([[wed(2026, 6, 3), ["Ana"]], [wed(2026, 6, 10), ["Ana", "Ben"]]]).map((t) => ({ ...t }))];
    const blocks = buildTermBlocks({
      computedAt: 1,
      result: computeTerm(next, 1, c),
      before: termBefore(next, 1, false, c),
      running: false,
      followUps: null,
    });
    const chart = byType(blocks, "multiBars").find((b) => b.title === "Week by week")!;
    expect(chart.points.map((p) => [p.label, p.segments.map((sg) => sg.value)])).toEqual([
      ["W1", [1, 3]],
      ["W2", [2, 2]],
      ["W2·2", [0, 4]],
    ]);
  });
});

describe("semester years", () => {
  test("the caption names each semester", () => {
    const held = [wed(2026, 3, 4), wed(2026, 8, 5)].map((at, i) => ({ eventId: `s${i}`, at, count: 1 }));
    const sems = deriveTerms(held, "semesters", 18).map((t) => ({ ...t, attendance: { Ana: [0] } }));
    const blocks = buildYearBlocks({
      computedAt: 1,
      result: computeYear(sems, 2026, c)!,
      lastYear: null,
      cut: null,
      terms: [computeTerm(sems, 0, c), computeTerm(sems, 1, c)],
      lastYearTerms: [],
    });
    expect((blocks[1] as { text: string }).text).toBe("2026: 2 weeklies in Sem 1 and Sem 2.");
  });
});

describe("term picker", () => {
  test("newest first, each year's terms then the whole year", () => {
    const three = build([
      [wed(2025, 9, 17), ["Ana"]],
      [wed(2026, 3, 4), ["Ana"]],
      [wed(2026, 6, 10), ["Ana"]],
    ]);
    expect(periodOptions(three)).toEqual([
      { key: "2026-T2", label: "2026 T2", group: "2026", short: "T2", kind: "term", slot: 2 },
      { key: "2026-T1", label: "2026 T1", group: "2026", short: "T1", kind: "term", slot: 1 },
      { key: "2026", label: "2026", group: "2026", short: "Year", kind: "year" },
      { key: "2025-T3", label: "2025 T3", group: "2025", short: "T3", kind: "term", slot: 3 },
      { key: "2025", label: "2025", group: "2025", short: "Year", kind: "year" },
    ]);
    expect(periodOptions([])).toEqual([]);
  });

  test("the picker says term or semester, as the campus counts them", () => {
    expect(periodPicker("terms")).toEqual({ pickerTitle: "Term or year", pickerLabel: "Term" });
    expect(periodPicker("semesters")).toEqual({ pickerTitle: "Semester or year", pickerLabel: "Semester" });
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
      current: true,
    });
    expect(blocks.map((b) => b.type)).toEqual(["memberHeader", "keyValues", "termHistory", "weekGrid", "eventList"]);
    expect(blocks[0]).toMatchObject({
      category: { label: "Regular" },
      reason: "T1 2026: 4/4 · 100%\nLast came T1W4 (11 Mar)\nCame to 4 of 4, then missed the last 2",
      photo: null,
    });
    expect(byType(blocks, "weekGrid")[0]).toMatchObject({ subtitle: "Weeklies attended this term" });
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
    expect((withRow[0] as { reason: string }).reason).toBe("T1 2026: 4/4 · 100%\nLast came T1W4 (11 Mar)");
    expect(byType(withRow, "weekGrid")[0]).toMatchObject({ title: "T1 2026", subtitle: "Weeklies attended" });
  });
});
