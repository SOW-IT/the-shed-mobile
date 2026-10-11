import { describe, expect, test } from "vitest";
import {
  computeTerm,
  computeYear,
  dayLabel,
  DEFAULT_WEEKLY_SETTINGS,
  deriveTerms,
  followUps,
  type HeldWeekly,
  sameTermLastYear,
  type TermFacts,
  termKey,
  termLabel,
  termRows,
  termSystemFor,
  truncateTerm,
  type WeeklyPerson,
  type WeeklySettings,
} from "./weeklyInsights";

const UNSW = "University of New South Wales";
const USYD = "University of Sydney";

// 5pm on a Wednesday in Sydney is 7am UTC (6am in daylight time, same day).
const wed = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 7);

let n = 0;
/** Terms from [date, people] pairs. */
function build(entries: [number, string[]][], system: "terms" | "semesters" = "terms"): TermFacts[] {
  const held: (HeldWeekly & { keys: string[] })[] = entries.map(([at, keys]) => ({
    eventId: `e${n++}`,
    at,
    count: keys.length,
    keys,
  }));
  return deriveTerms(held, system, DEFAULT_WEEKLY_SETTINGS.termGapDays).map((t) => {
    const attendance: Record<string, number[]> = {};
    t.weeklies.forEach((w, i) => {
      for (const key of held.find((h) => h.eventId === w.eventId)!.keys) (attendance[key] ??= []).push(i);
    });
    return { ...t, attendance };
  });
}

const person = (
  key: string,
  info: { campus?: string | null; roles?: string[] } = {},
  infoByYear: WeeklyPerson["infoByYear"] = {}
): WeeklyPerson => ({
  key,
  name: key.toUpperCase(),
  photo: null,
  memberId: null,
  infoByYear,
  info: { campus: info.campus === undefined ? UNSW : info.campus, roles: info.roles ?? [] },
});

const classify = (people: WeeklyPerson[], settings: Partial<WeeklySettings> = {}, subgroup = UNSW) => ({
  subgroup,
  settings: { ...DEFAULT_WEEKLY_SETTINGS, ...settings },
  persons: new Map(people.map((p) => [p.key, p])),
});

const T1_2026 = [wed(2026, 2, 18), wed(2026, 2, 25), wed(2026, 3, 4), wed(2026, 3, 11), wed(2026, 3, 18), wed(2026, 4, 8), wed(2026, 4, 15), wed(2026, 4, 22)];
const T2_2026 = [wed(2026, 6, 3), wed(2026, 6, 10), wed(2026, 6, 17), wed(2026, 6, 24), wed(2026, 7, 1), wed(2026, 7, 22), wed(2026, 7, 29), wed(2026, 8, 5)];

describe("terms", () => {
  test("names terms by when they start and numbers weeks from the first weekly", () => {
    const terms = build([...T1_2026, ...T2_2026].map((at) => [at, ["a"]]));
    expect(terms.map((t) => t.label)).toEqual(["T1 2026", "T2 2026"]);
    expect(terms.map((t) => t.key)).toEqual(["2026-T1", "2026-T2"]);
    // A 3-week gap (no W6/W7) stays inside T1; flexi week shows as a missing W6.
    expect(terms[0].weeklies.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 8, 9, 10]);
    expect(terms[1].weeklies.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 8, 9, 10]);
  });

  test("T3 starts in September; semesters split at July", () => {
    const t = build([[wed(2025, 9, 17), ["a"]], [wed(2025, 11, 19), ["a"]], [wed(2026, 2, 18), ["a"]]]);
    expect(t.map((x) => x.label)).toEqual(["T3 2025", "T1 2026"]);
    const sem = build(
      [[wed(2026, 2, 25), ["a"]], [wed(2026, 5, 27), ["a"]], [wed(2026, 7, 29), ["a"]]],
      "semesters"
    );
    expect(sem.map((x) => x.label)).toEqual(["Sem 1 2026", "Sem 2 2026"]);
    expect(sem.map((x) => x.key)).toEqual(["2026-S1", "2026-S2"]);
  });

  test("helpers", () => {
    expect(termSystemFor(UNSW, DEFAULT_WEEKLY_SETTINGS)).toBe("terms");
    expect(termSystemFor(USYD, DEFAULT_WEEKLY_SETTINGS)).toBe("semesters");
    expect(termLabel("semesters", 2, 2026)).toBe("Sem 2 2026");
    expect(termKey("terms", 3, 2025)).toBe("2025-T3");
    expect(dayLabel(wed(2026, 3, 4))).toBe("4 Mar");
  });
});

describe("categories", () => {
  test("staff, leaders, visitors, newcomers, regulars and irregulars", () => {
    const prev = T1_2026.map((at, i) => [at, ["reg", "irr", ...(i < 2 ? ["was"] : [])]] as [number, string[]]);
    const now = T2_2026.slice(0, 6).map((at, i) => [
      at,
      [
        "staff",
        "lead",
        "reg",
        ...(i === 0 ? ["irr", "vis", "otherLead"] : []),
        ...(i >= 3 ? ["new"] : []),
        ...(i < 4 ? ["away"] : []),
        "noCampus",
      ],
    ]) as [number, string[]][];
    const terms = build([...prev, ...now]);
    const people = [
      person("staff", { roles: ["Alumni"] }),
      person("lead", { roles: ["Student Leader"] }),
      person("otherLead", { campus: USYD, roles: ["Student Leader"] }),
      person("reg"),
      person("irr"),
      person("was"),
      person("vis", { campus: USYD }),
      person("away", { campus: USYD }),
      person("new"),
      person("noCampus", { campus: null }),
    ];
    const rows = termRows(terms, 1, classify(people));
    const cat = Object.fromEntries(rows.map((r) => [r.key, r.category]));
    expect(cat).toEqual({
      staff: "staff",
      lead: "leader",
      otherLead: "visitor",
      reg: "regular",
      irr: "irregular",
      was: "irregular",
      vis: "visitor",
      away: "regular",
      new: "newcomer",
      noCampus: "regular",
    });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.away.section).toBe("other");
    expect(byKey.noCampus).toMatchObject({ section: "campus", noCampus: true });
    expect(byKey.was).toMatchObject({ attended: 0, held: 6, pct: 0, weeks: [] });
    expect(byKey.reg).toMatchObject({ attended: 6, pct: 1, weeks: [1, 2, 3, 4, 5, 8] });
    // Irregulars and newcomers first; leaders and staff last.
    expect(rows.map((r) => r.category)).toEqual([
      "irregular", "irregular", "newcomer", "regular", "regular",
      "regular", "visitor", "visitor", "leader", "staff",
    ]);
  });

  test("a newcomer who keeps coming becomes Regular after 4 weeklies", () => {
    const terms = build(T1_2026.map((at, i) => [at, i < 5 ? ["n"] : []]).filter(([, k]) => (k as string[]).length) as [number, string[]][]);
    const c = classify([person("n")]);
    // 5 of 5 held weeklies, but held only counts weeklies someone came to.
    expect(termRows(terms, 0, c)[0].category).toBe("regular");
    expect(termRows(terms, 0, classify([person("n")], { newcomerPromoteWeeklies: 6 }))[0].category).toBe("newcomer");
  });

  test("until 4 weeklies are held, last term counts too", () => {
    const prev = T1_2026.map((at) => [at, ["loyal", "x"]] as [number, string[]]);
    const now = T2_2026.slice(0, 2).map((at) => [at, ["x"]] as [number, string[]]);
    const terms = build([...prev, ...now]);
    const rows = termRows(terms, 1, classify([person("loyal"), person("x")]));
    // loyal came to 8 of the last 10 (none this term) → still Regular.
    expect(rows.find((r) => r.key === "loyal")!.category).toBe("regular");
    const later = build([...prev, ...T2_2026.slice(0, 4).map((at) => [at, ["x"]] as [number, string[]])]);
    expect(termRows(later, 1, classify([person("loyal"), person("x")])).find((r) => r.key === "loyal")!.category).toBe("irregular");
  });

  test("roles and campus come from the staff year of the term's last weekly", () => {
    const terms = build(T2_2026.map((at) => [at, ["p"]]));
    const p = person("p", {}, { "2026": { campus: UNSW, roles: ["President"] } });
    expect(termRows(terms, 0, classify([p]))[0].category).toBe("leader");
    const unknown = termRows(terms, 0, classify([]))[0];
    expect(unknown).toMatchObject({ name: "Unknown", noCampus: true });
  });
});

describe("follow-ups", () => {
  const setup = () => {
    const prev = T1_2026.map((at) => [at, ["was", "lead", "staff", "steady"]] as [number, string[]]);
    const now: [number, string[]][] = T2_2026.slice(0, 7).map((at, i) => [
      at,
      [
        "steady",
        ...(i < 5 ? ["was", "lead", "staff"] : []),
        ...(i === 5 ? ["new"] : []),
        ...(i === 4 ? ["vis"] : []),
        ...(i === 1 ? ["oldNew", "oldVis"] : []),
        ...(i === 6 ? ["freshVis"] : []),
      ],
    ]);
    const terms = build([...prev, ...now]);
    const people = [
      person("was"),
      person("lead", { roles: ["Executive"] }),
      person("staff", { roles: ["Staff"] }),
      person("steady"),
      person("new"),
      person("oldNew"),
      person("vis", { campus: USYD }),
      person("oldVis", { campus: USYD }),
      person("freshVis", { campus: USYD }),
    ];
    const c = classify(people);
    return { terms, c, rows: termRows(terms, terms.length - 1, c) };
  };

  test("was coming, new and not back, and visitors (not back first)", () => {
    const { terms, c, rows } = setup();
    const fu = followUps(terms, rows, c);
    expect(fu.map((f) => [f.key, f.group, f.needsFollowUp])).toEqual([
      ["was", "was_coming", true],
      ["lead", "was_coming", true],
      ["new", "newcomer", true],
      ["vis", "visitor", true],
      ["freshVis", "visitor", false],
    ]);
    expect(fu[0].reason).toBe("Came to 5 of 5, then missed the last 2");
    expect(fu[2].reason).toBe("New on 22 Jul · came 1 time, missed the last weekly");
    expect(fu[3].reason).toBe("Visited 1 Jul, not back since");
    expect(fu[4].reason).toBe("Visited 29 Jul");
  });

  test("newcomers and visitors drop off once their visit is no longer recent", () => {
    const { terms, c, rows } = setup();
    const keys = followUps(terms, rows, c).map((f) => f.key);
    expect(keys).not.toContain("oldNew");
    expect(keys).not.toContain("oldVis");
    expect(followUps(terms, rows, { ...c, settings: { ...c.settings, freshWeeklies: 10 } }).map((f) => f.key)).toContain("oldNew");
  });

  test("missing one weekly when the setting is one reads naturally; too little history gives nobody", () => {
    const { terms, c, rows } = setup();
    const one = followUps(terms, rows, { ...c, settings: { ...c.settings, followUpMisses: 1 } });
    expect(one.find((f) => f.key === "was")!.reason).toMatch(/then missed the last weekly$/);
    const short = build([[T2_2026[0], ["a"]]]);
    expect(followUps(short, termRows(short, 0, c), c)).toEqual([]);
  });
});

describe("summaries and comparisons", () => {
  const terms2025 = [wed(2025, 2, 19), wed(2025, 2, 26), wed(2025, 3, 5), wed(2025, 3, 12)];
  const all = () =>
    build([
      ...terms2025.map((at, i) => [at, ["a", "b", ...(i === 0 ? ["c"] : [])]] as [number, string[]]),
      ...T1_2026.slice(0, 3).map((at, i) => [at, ["a", ...(i === 0 ? ["d", "e"] : []), ...(i === 1 ? ["d", "vis"] : [])]] as [number, string[]]),
    ]);
  const people = [person("a"), person("b"), person("c"), person("d"), person("e"), person("vis", { campus: USYD })];

  test("a term's summary and who came each week", () => {
    const terms = all();
    const r = computeTerm(terms, 1, classify(people));
    expect(r.summary).toEqual({
      weeklies: 3,
      weeklyAvg: 2.3,
      people: 4,
      regulars: 1,
      newcomers: 2,
      newcomersStayed: 1,
      campusShare: 0.857,
    });
    expect(r.byCategory[0].counts).toEqual({ newcomer: 2, regular: 1 });
  });

  test("last year's same term, cut to the same week while this one runs", () => {
    const terms = all();
    const c = classify(people);
    expect(sameTermLastYear(terms, 1, true, c)!.term.weeklies).toHaveLength(3);
    expect(sameTermLastYear(terms, 1, false, c)!.term.weeklies).toHaveLength(4);
    expect(sameTermLastYear(terms, 0, false, c)).toBeNull();
    expect(truncateTerm(terms[0], 0)).toBeNull();
    const late = build([[wed(2025, 3, 12), ["a"]], [wed(2026, 2, 18), ["a"]]]);
    // Last year's T1 started in its week 1 on 12 Mar; nothing to cut to.
    expect(sameTermLastYear(late, 1, true, c)).not.toBeNull();
  });

  test("a year: everyone's share of its weeklies, latest category, and to-date cuts", () => {
    const terms = all();
    const c = classify(people);
    const y = computeYear(terms, 2026, c)!;
    expect(y.rows.find((r) => r.key === "a")).toMatchObject({ attended: 3, held: 3, termKey: "2026-T1" });
    expect(y.summary.newcomers).toBe(2);
    expect(computeYear(terms, 2024, c)).toBeNull();
    const cut = computeYear(terms, 2025, c, wed(2025, 2, 27))!;
    expect(cut.summary.weeklies).toBe(2);
    expect(computeYear(terms, 2025, c, wed(2025, 1, 1))).toBeNull();
  });
});
