import { describe, expect, test } from "vitest";
import {
  compareLikelihood,
  LIKELIHOOD,
  likelihoodInputKey,
  likelihoodScores,
  rankedLikelihood,
  type LikelihoodEvent,
  type LikelihoodHistory,
} from "./rollCallLikelihood";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 22);
const USYD = "University of Sydney";
const UNSW = "University of New South Wales";

const event = (eventId: string, daysAgo: number, extra: Partial<LikelihoodEvent> = {}): LikelihoodEvent => ({
  eventId,
  dateStart: NOW - daysAgo * DAY,
  tagIds: [],
  subgroups: [USYD],
  ...extra,
});

const history = (...rows: [LikelihoodEvent, string[]][]): LikelihoodHistory => ({
  events: rows.map(([e]) => e),
  attendees: rows.map(([, people]) => people),
});

describe("likelihoodScores", () => {
  const tonight = event("tonight", 0, { tagIds: ["bam"], weekly: true });

  test("adds a weight for each thing a past event shares with this one", () => {
    const scores = likelihoodScores(
      { ...tonight, dateStart: NOW },
      history(
        [event("other-campus", 0.0001, { subgroups: [UNSW] }), ["any"]],
        [event("same-group", 0.0001), ["group"]],
        [event("same-tag", 0.0001, { subgroups: [UNSW], tagIds: ["bam"] }), ["tag"]],
        [event("same-series", 0.0001, { weekly: true }), ["series"]]
      )
    );
    expect(scores.get("any")).toBeCloseTo(LIKELIHOOD.anyEvent, 4);
    expect(scores.get("group")).toBeCloseTo(LIKELIHOOD.anyEvent + LIKELIHOOD.sharedGroup, 4);
    expect(scores.get("tag")).toBeCloseTo(LIKELIHOOD.anyEvent + LIKELIHOOD.sharedTag, 4);
    expect(scores.get("series")).toBeCloseTo(
      LIKELIHOOD.anyEvent + LIKELIHOOD.sharedGroup + LIKELIHOOD.sameWeeklySeries,
      4
    );
  });

  test("a weekly series means the same groups, not just one in common", () => {
    const scores = likelihoodScores(
      tonight,
      history([event("joint weekly", 7, { weekly: true, subgroups: [USYD, UNSW] }), ["joint"]])
    );
    const fade = 0.5 ** (7 / LIKELIHOOD.halfLifeDays);
    expect(scores.get("joint")).toBeCloseTo((LIKELIHOOD.anyEvent + LIKELIHOOD.sharedGroup) * fade, 6);
  });

  test("halves a sign-in's weight every half-life, counted back from the event", () => {
    const scores = likelihoodScores(
      event("target", 0),
      history([event("recent", 0.0001), ["recent"]], [event("older", LIKELIHOOD.halfLifeDays), ["older"]])
    );
    expect(scores.get("older")! / scores.get("recent")!).toBeCloseTo(0.5, 3);
  });

  test("ignores the event itself, later events and anything over a year before it", () => {
    const target = event("target", 30);
    const scores = likelihoodScores(
      target,
      history(
        [target, ["self"]],
        [event("later", 10), ["later"]],
        [event("too old", 30 + LIKELIHOOD.windowDays + 1), ["old"]],
        [event("in window", 40), ["kept"]]
      )
    );
    expect([...scores.keys()]).toEqual(["kept"]);
  });

  test("adds up every event a person came to", () => {
    const scores = likelihoodScores(
      tonight,
      history([event("a", 7), ["ann", "ben"]], [event("b", 14), ["ann"]])
    );
    expect(scores.get("ann")!).toBeGreaterThan(scores.get("ben")!);
  });
});

describe("rankedLikelihood", () => {
  test("sorts by score, rounds to four places and drops zeros", () => {
    expect(
      rankedLikelihood(
        new Map([
          ["b", 1.234567],
          ["a", 1.234567],
          ["z", 0],
          ["c", 2],
        ])
      )
    ).toEqual([
      { memberId: "c", score: 2 },
      { memberId: "a", score: 1.2346 },
      { memberId: "b", score: 1.2346 },
    ]);
  });
});

describe("likelihoodInputKey", () => {
  const target = event("target", 0, { tagIds: ["bam"] });
  const base = history([event("a", 7), ["ann"]], [event("b", 14), ["ben"]]);
  const key = likelihoodInputKey(target, base);

  test("stays the same while nothing it reads changes", () => {
    expect(likelihoodInputKey({ ...target, tagIds: ["bam"] }, history([event("b", 14), ["ben"]], [event("a", 7), ["ann"]]))).toBe(key);
    expect(likelihoodInputKey(target, history(...base.events.map((e, i) => [e, base.attendees[i]] as [LikelihoodEvent, string[]]), [event("later", -1), ["x"]]))).toBe(key);
  });

  test("changes with a new event, a new sign-in or a past event's groups", () => {
    expect(likelihoodInputKey(target, history([event("a", 7), ["ann"]], [event("b", 14), ["ben"]], [event("c", 3), []]))).not.toBe(key);
    expect(likelihoodInputKey(target, history([event("a", 7), ["ann", "cat"]], [event("b", 14), ["ben"]]))).not.toBe(key);
    expect(likelihoodInputKey(target, history([event("a", 7, { subgroups: ["SOW"] }), ["ann"]], [event("b", 14), ["ben"]]))).not.toBe(key);
  });

  test("changes with the event's own date, groups, tags or weekly mark", () => {
    expect(likelihoodInputKey({ ...target, dateStart: target.dateStart + 1 }, base)).not.toBe(key);
    expect(likelihoodInputKey({ ...target, subgroups: [UNSW] }, base)).not.toBe(key);
    expect(likelihoodInputKey({ ...target, tagIds: [] }, base)).not.toBe(key);
    expect(likelihoodInputKey({ ...target, weekly: true }, base)).not.toBe(key);
  });
});

describe("compareLikelihood", () => {
  test("puts the higher score first, then sorts by name", () => {
    expect(compareLikelihood(2, 1, "Zed", "Amy")).toBeLessThan(0);
    expect(compareLikelihood(1, 1, "Amy", "Zed")).toBeLessThan(0);
    expect(compareLikelihood(0, 1, "Amy", "Zed")).toBeGreaterThan(0);
  });
});
