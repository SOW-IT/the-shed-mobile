import { describe, expect, test } from "vitest";
import {
  campusIn,
  computePpn,
  computeTwig,
  isRunning,
  isSowMode,
  roleIn,
  sowModeOf,
  type SowEvent,
  type SowPeople,
} from "./sowInsights";
import { buildPpnBlocks, buildTwigBlocks } from "./sowInsightsView";
import type { WeeklyPerson } from "./weeklyInsights";
import type { WeeklyBlock } from "./weeklyInsightsView";

const UNSW = "University of New South Wales";
const USYD = "University of Sydney";
const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 8);
const NOW = at(2026, 11, 20);
const RULES = { regularShare: 0.5, followUpMisses: 2 };

const person = (key: string, infoByYear: WeeklyPerson["infoByYear"], campus: string | null = null): WeeklyPerson => ({
  key,
  name: key.toUpperCase(),
  infoByYear,
  info: { campus, roles: [] },
});

const leader = (campus: string) => ({ campus, roles: ["Student Leader"] });
const staff = { campus: null, roles: ["Staff"] };

const people: SowPeople = new Map([
  ["a", person("a", { "2027": leader(UNSW) })],
  ["b", person("b", { "2027": leader(USYD) })],
  ["c", person("c", { "2027": leader(UNSW) })],
  ["s", person("s", { "2027": staff })],
]);

const event = (id: string, when: number, who: string[]): SowEvent => ({ id, name: id, at: when, people: who });

const pick = <K extends WeeklyBlock["type"]>(blocks: WeeklyBlock[], type: K) =>
  blocks.filter((b): b is Extract<WeeklyBlock, { type: K }> => b.type === type);

describe("which events count", () => {
  test("TWIG is the Other-events TWIG tag without PPN; PPN needs both", () => {
    expect(sowModeOf([{ name: "TWIG" }])).toBe("twig");
    expect(sowModeOf([{ name: "TWIG", list: "events" }, { name: "PPN", list: "events" }])).toBe("ppn");
    expect(sowModeOf([{ name: "TWIG" }, { name: "PPN", list: "weeklies" }])).toBe("twig");
    expect(sowModeOf([{ name: "PPN" }])).toBeNull();
    expect(sowModeOf([{ name: "TWIG", list: "weeklies" }])).toBeNull();
    expect(isSowMode("twig")).toBe(true);
    expect(isSowMode("campuses")).toBe(false);
  });

  test("a leader has a university role that staff year; anyone else with a profile is staff", () => {
    expect(roleIn(people.get("a"), 2027)).toBe("leader");
    expect(roleIn(people.get("a"), 2026)).toBe("none");
    expect(roleIn(people.get("s"), 2027)).toBe("staff");
    expect(roleIn(undefined, 2027)).toBe("none");
    expect(campusIn(person("m", {}, USYD), 2027)).toBe(USYD);
    expect(campusIn(undefined, 2027)).toBeNull();
    expect(isRunning(2027, NOW)).toBe(true);
    expect(isRunning(2026, NOW)).toBe(false);
  });
});

describe("TWIG", () => {
  const events = [
    event("t1", at(2026, 10, 5), ["a", "b", "c", "s", "x"]),
    event("t2", at(2026, 10, 12), ["a", "c"]),
    event("t3", at(2026, 10, 19), ["b"]),
    event("t4", at(2026, 10, 26), ["b"]),
    event("t5", at(2026, 11, 2), []),
  ];

  test("regulars who missed the last two are followed up, most recent first", () => {
    const result = computeTwig({ year: 2027, events, lastEvents: [], people, now: NOW, rules: RULES });
    expect(result.summary).toEqual({ held: 4, avg: 1.8, people: 3, regulars: 3 });
    expect(result.last).toBeNull();
    expect(result.lastLabel).toBeNull();
    expect(result.followUp.map((r) => r.key)).toEqual(["a", "c"]);
    expect(result.byCampus).toEqual([
      { campus: UNSW, value: 4 },
      { campus: USYD, value: 3 },
    ]);
    expect(result.noRoll.map((e) => e.id)).toEqual(["t5"]);
  });

  test("a finished year is compared whole and has no follow-up", () => {
    const past = computeTwig({
      year: 2027,
      events,
      lastEvents: [event("l1", at(2025, 10, 6), ["a"])],
      people,
      now: at(2027, 11, 1),
      rules: RULES,
    });
    expect(past.running).toBe(false);
    expect(past.lastLabel).toBe("staff year 2026");
    expect(past.followUp).toEqual([]);
  });

  test("the view shows cards, bars, campuses, follow-up, everyone and no-roll TWIGs", () => {
    const result = computeTwig({
      year: 2027,
      events,
      lastEvents: [
        event("l1", at(2025, 10, 6), ["a"]),
        event("l2", at(2025, 10, 13), ["a"]),
        event("l3", at(2025, 10, 20), ["a"]),
        event("l4", at(2025, 10, 27), ["a"]),
        event("l5", at(2025, 11, 3), ["a"]),
      ],
      people,
      now: NOW,
      rules: RULES,
    });
    const blocks = buildTwigBlocks({ result, people, missesForFollowUp: 2 });
    expect(blocks.map((b) => b.type)).toEqual([
      "caption",
      "cards",
      "multiBars",
      "breakdown",
      "followUpGroups",
      "people",
      "eventList",
    ]);
    expect(pick(blocks, "caption")[0].text).toBe(
      "Staff year 2027: 4 TWIGs so far, compared with staff year 2026, to 20 Nov 2025. Only campus leaders are counted."
    );
    const cards = pick(blocks, "cards")[0].cards;
    expect(cards[0].info?.body).toContain("Compared with staff year 2026, to 20 Nov 2025: the same point in last staff year.");
    expect(cards.map((c) => c.hint)).toEqual(["vs 0", "vs 0", "vs 0"]);
    expect(pick(blocks, "multiBars")[0].points.map((p) => p.label)).toEqual(["5 Oct", "12 Oct", "19 Oct", "26 Oct", "#5"]);
    const rows = pick(blocks, "people")[0].rows;
    expect(rows.find((r) => r.key === "x")).toMatchObject({
      name: "Unknown",
      section: "none",
      warning: "No staff profile for 2027",
      category: { label: "No staff profile" },
    });
    expect(rows.find((r) => r.key === "x")?.subgroup).toBeUndefined();
    expect(rows.find((r) => r.key === "s")).toMatchObject({ category: { label: "Organiser" }, dimmed: true, badge: undefined });
    expect(rows.find((r) => r.key === "a")).toMatchObject({
      category: { label: "UNSW" },
      tags: ["leader", "regular"],
      badge: { label: "Regular", colour: "#16A34A" },
      dimmed: undefined,
      subgroup: UNSW,
      secondary: "Last came 12 Oct 2026",
    });
    expect(pick(blocks, "people")[0].subtitle).toBe(
      "Everyone who came to a TWIG in staff year 2027, and campus leaders who haven't yet."
    );
    expect(pick(blocks, "followUpGroups")[0].groups[0].people.map((p) => [p.key, p.subgroup])).toEqual([
      ["a", UNSW],
      ["c", UNSW],
    ]);
    expect(pick(blocks, "people")[0].filters.map((f) => f.key)).toEqual(["leader", "staff", "none", "regular"]);
  });

  test("with nothing to compare and nobody to follow up, the view says so", () => {
    const result = computeTwig({
      year: 2027,
      events: [event("t1", at(2026, 10, 5), ["a"])],
      lastEvents: [],
      people,
      now: NOW,
      rules: RULES,
    });
    const blocks = buildTwigBlocks({ result, people, missesForFollowUp: 2 });
    expect(pick(blocks, "caption")[0].text).toBe(
      "Staff year 2027: 1 TWIG so far. There's no earlier staff year to compare with. Only campus leaders are counted."
    );
    expect(pick(blocks, "multiBars")[0].legend.map((l) => l.key)).toEqual(["now"]);
    expect(pick(blocks, "followUpGroups")[0].groups).toEqual([]);
    expect(pick(blocks, "eventList")).toEqual([]);
    const cards = pick(blocks, "cards")[0].cards;
    expect(cards.filter((c) => c.label !== "Regulars").every((c) => !c.hint)).toBe(true);
    expect(cards.find((c) => c.label === "Regulars")).toMatchObject({ value: "–", hint: "After 3 TWIGs" });
    expect(result.rows.every((r) => !r.regular)).toBe(true);

    const nothing = computeTwig({ year: 2027, events: [], lastEvents: [], people, now: NOW, rules: RULES });
    expect(buildTwigBlocks({ result: nothing, people, missesForFollowUp: 2 }).map((b) => b.type)).toEqual(["empty"]);
  });

  test("last year with no roll by this date is said plainly, not compared with zero", () => {
    const result = computeTwig({
      year: 2027,
      events: [event("t1", at(2026, 10, 12), ["a"])],
      lastEvents: [event("l0", at(2025, 10, 13), []), event("l1", at(2026, 1, 5), ["a"])],
      people,
      now: at(2026, 10, 15),
      rules: RULES,
    });
    expect(result.last).toBeNull();
    expect(result.lastLabel).toBe("staff year 2026, to 15 Oct 2025");
    const blocks = buildTwigBlocks({ result, people, missesForFollowUp: 2 });
    expect(pick(blocks, "caption")[0].text).toBe(
      "Staff year 2027: 1 TWIG so far. No TWIG had a roll in staff year 2026, to 15 Oct 2025, so there's nothing to compare with yet. Only campus leaders are counted."
    );
    expect(
      pick(blocks, "cards")[0].cards.every((c) => !c.delta && (c.label === "Regulars" || !c.hint))
    ).toBe(true);
    expect(pick(blocks, "followUpGroups")[0].emptyText).toBe("Follow-up starts once 3 TWIGs have a roll.");
    expect(pick(blocks, "multiBars")[0].points.map((p) => p.segments.map((x) => x.value))).toEqual([[1, 0]]);
  });

  test("campus leaders who never came are listed as 0 of n; others on the roster are not", () => {
    const roster: SowPeople = new Map([...people, ["d", person("d", { "2027": leader(USYD) })]]);
    const result = computeTwig({
      year: 2027,
      events,
      lastEvents: [],
      people: roster,
      now: NOW,
      rules: RULES,
      roster: ["a", "d", "s", "gone"],
    });
    expect(result.rows.filter((r) => r.key === "a")).toHaveLength(1);
    expect(result.rows.map((r) => r.key)).not.toContain("gone");
    expect(result.rows.find((r) => r.key === "d")).toMatchObject({ attended: 0, held: 4, pct: 0, regular: false });
    expect(result.summary.people).toBe(3);
    const block = pick(buildTwigBlocks({ result, people: roster, missesForFollowUp: 2 }), "people")[0];
    expect(block.rows.find((r) => r.key === "d")).toMatchObject({
      primary: "0/4 · 0%",
      secondary: "Hasn't come to a TWIG yet",
      tags: ["leader", "notYet"],
      section: "leader",
    });
    expect(block.filters.map((f) => f.key)).toEqual(["leader", "staff", "none", "regular", "notYet"]);
  });

  test("a row opens a campus page only for a real campus, not SOW", () => {
    const sowPeople: SowPeople = new Map([["o", person("o", { "2027": leader("SOW") })]]);
    const result = computeTwig({
      year: 2027,
      events: [event("t1", at(2026, 10, 5), ["o"])],
      lastEvents: [],
      people: sowPeople,
      now: NOW,
      rules: RULES,
    });
    const [row] = pick(buildTwigBlocks({ result, people: sowPeople, missesForFollowUp: 2 }), "people")[0].rows;
    expect(row.key).toBe("o");
    expect(row.subgroup).toBeUndefined();
  });

  test("a past year's cards say what they're compared with", () => {
    const result = computeTwig({
      year: 2026,
      events: [event("t1", at(2025, 10, 5), ["a"])],
      lastEvents: [event("l1", at(2024, 10, 6), ["a"])],
      people: new Map([["a", person("a", { "2026": leader(UNSW), "2025": leader(UNSW) })]]),
      now: NOW,
      rules: RULES,
    });
    const blocks = buildTwigBlocks({ result, people, missesForFollowUp: 2 });
    expect(pick(blocks, "cards")[0].cards[0].info?.body).toContain("Compared with staff year 2025.");
    expect(pick(blocks, "cards")[0].cards[0].hint).toBe("vs 1");
    expect(pick(blocks, "followUpGroups")).toEqual([]);
  });
});

describe("PPN", () => {
  test("first-timers across years, the same month last year, and campus totals", () => {
    const result = computePpn({
      year: 2027,
      events: [event("p1", at(2026, 10, 20), ["a", "n"]), event("p2", at(2026, 11, 17), ["a", "b"]), event("p0", at(2026, 12, 1), [])],
      lastEvents: [event("l1", at(2025, 11, 17), ["a"])],
      earlier: [event("l1", at(2025, 11, 17), ["a"])],
      people,
      now: NOW,
    });
    expect(result.rows.map((r) => [r.event.id, r.total, r.firstTimers, r.last?.total ?? null])).toEqual([
      ["p2", 2, 1, 1],
      ["p1", 2, 1, null],
    ]);
    expect(result.lastAverage).toBe(1);
    expect(result.totals).toEqual({
      signIns: 4,
      people: 3,
      firstTimers: 2,
      byRole: { leader: 3, staff: 0, none: 1 },
      byCampus: [
        { campus: UNSW, value: 2 },
        { campus: USYD, value: 1 },
        { campus: null, value: 1 },
      ],
    });
  });

  test("compares the average with last staff year's PPNs up to the same date, each counted once", () => {
    const signIns = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}`);
    const result = computePpn({
      year: 2027,
      events: [event("n1", at(2026, 11, 2), signIns(4, "x")), event("n2", at(2026, 11, 16), signIns(6, "y"))],
      lastEvents: [
        event("l1", at(2025, 11, 3), signIns(2, "x")),
        event("l2", at(2025, 11, 17), signIns(8, "y")),
        event("l3", at(2025, 12, 8), signIns(30, "z")),
      ],
      earlier: [],
      people,
      now: NOW,
    });
    expect(result.lastAverage).toBe(5);
    expect(pick(buildPpnBlocks({ result }), "cards")[0].cards[0]).toMatchObject({
      label: "Average per PPN",
      value: "5",
      delta: { direction: "flat" },
      hint: "vs 5",
    });
    const pastYear = computePpn({ ...{ year: 2026, events: [], earlier: [], people, now: NOW }, lastEvents: [event("o", at(2025, 9, 1), ["a"])] });
    expect(pastYear.lastAverage).toBe(1);
  });

  test("the view is cards and charts, oldest PPN first", () => {
    const result = computePpn({
      year: 2027,
      events: [event("p1", at(2026, 10, 20), ["a", "n"]), event("p2", at(2026, 11, 17), ["a", "b"]), event("p0", at(2026, 12, 1), [])],
      lastEvents: [event("l1", at(2025, 11, 17), ["a"])],
      earlier: [event("l1", at(2025, 11, 17), ["a"])],
      people,
      now: NOW,
    });
    const blocks = buildPpnBlocks({ result });
    expect(blocks.map((b) => b.type)).toEqual([
      "caption", "heading", "cards", "multiBars", "heading", "cards", "multiBars", "stacked", "breakdown", "eventList",
    ]);
    expect(pick(blocks, "caption")[0].text).toBe("Staff year 2027: 2 PPNs.");
    const [turnout, whoCame] = pick(blocks, "cards");
    expect(turnout.cards.map((c) => [c.label, c.value, c.delta?.text ?? null, c.hint ?? null])).toEqual([
      ["Average per PPN", "2", "+100%", "vs 1"],
      ["People", "3", null, null],
    ]);
    expect(whoCame.cards.map((c) => [c.label, c.value, c.hint ?? null])).toEqual([
      ["Campus leaders", "75%", "3 of 4 sign-ins"],
      ["First-timers", "2", null],
    ]);
    const [byPpn, who] = pick(blocks, "multiBars");
    expect(byPpn.subtitle).toBe("Everyone at each PPN, against the same month in 2026");
    expect(byPpn.points.map((p) => [p.label, p.segments.map((x) => x.value)])).toEqual([
      ["20 Oct", [2, 0]],
      ["17 Nov", [2, 1]],
    ]);
    expect(who.legend.map((l) => l.key)).toEqual(["leader", "none"]);
    expect(who.points.map((p) => p.segments.map((x) => x.value))).toEqual([
      [1, 1],
      [2, 0],
    ]);
    expect(pick(blocks, "stacked")[0].points.map((p) => [p.fresh, p.returning])).toEqual([
      [1, 1],
      [1, 1],
    ]);
    expect(pick(blocks, "breakdown")[0].rows).toEqual([
      { label: "UNSW", value: 2, colour: expect.any(String) },
      { label: "USYD", value: 1, colour: expect.any(String) },
      { label: "No campus", value: 1, colour: undefined },
    ]);
  });

  test("a year with nothing to compare has no last-year bars; SOW gets no campus colour; no PPN yet is an empty state", () => {
    const only = buildPpnBlocks({
      result: computePpn({ year: 2027, events: [event("p1", at(2026, 10, 20), ["a", "s"])], lastEvents: [], earlier: [], people, now: NOW }),
    });
    const [byPpn, who] = pick(only, "multiBars");
    expect(byPpn.subtitle).toBe("Everyone at each PPN");
    expect(byPpn.legend.map((l) => l.key)).toEqual(["now"]);
    expect(who.legend.map((l) => l.label)).toEqual(["Campus leaders", "Other staff"]);
    expect(pick(only, "cards")[0].cards[0]).toMatchObject({ value: "2", delta: undefined, hint: undefined });
    expect(pick(only, "breakdown")[0].rows).toEqual([
      { label: "SOW", value: 1, colour: undefined },
      { label: "UNSW", value: 1, colour: expect.any(String) },
    ]);
    const none = buildPpnBlocks({
      result: computePpn({ year: 2027, events: [event("p0", at(2026, 10, 20), [])], lastEvents: [], earlier: [], people, now: NOW }),
    });
    expect(none.map((b) => b.type)).toEqual(["empty", "eventList"]);
    const nothing = buildPpnBlocks({ result: computePpn({ year: 2027, events: [], lastEvents: [], earlier: [], people, now: NOW }) });
    expect(nothing.map((b) => b.type)).toEqual(["empty"]);
  });
});
