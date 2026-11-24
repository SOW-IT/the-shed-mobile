import { describe, expect, test } from "vitest";
import {
  CLOCK_SKEW_MS,
  enqueueScore,
  isGameId,
  MAX_PAYING_RUNS,
  MAX_RUN_MS,
  MAX_SCORE_AGE_MS,
  NO_BESTS,
  parseBests,
  parseQueue,
  removeSettled,
  SCORE_LIMITS,
  SCORES_RESET_AT,
  scoreProblem,
  stringifyBests,
  withBest,
  type QueuedScore,
} from "./games";

const NOW = 1_800_000_000_000;
const entry = (overrides: Partial<QueuedScore> = {}): QueuedScore => ({
  runId: "run-abcdefgh",
  game: "runner",
  score: 120,
  durationMs: 30_000,
  playedAt: NOW - 1000,
  ...overrides,
});

describe("isGameId", () => {
  test("knows the four games", () => {
    expect(["shooter", "runner", "flappy", "glider", "snake"].map(isGameId)).toEqual([true, true, true, true, false]);
  });
});

describe("scoreProblem", () => {
  test("accepts a believable run", () => {
    expect(scoreProblem(entry(), NOW)).toBeNull();
    expect(scoreProblem(entry({ playedAt: NOW + CLOCK_SKEW_MS }), NOW)).toBeNull();
  });

  test.each<[string, Partial<QueuedScore>, RegExp]>([
    ["a missing run id", { runId: "x" }, /no usable id/],
    ["an unknown game", { game: "snake" as QueuedScore["game"] }, /isn't one of the games/],
    ["a zero score", { score: 0 }, /whole number/],
    ["a fractional score", { score: 1.5 }, /whole number/],
    ["a zero-length run", { durationMs: 0 }, /length/],
    ["an endless run", { durationMs: MAX_RUN_MS + 1 }, /length/],
    ["a NaN length", { durationMs: Number.NaN }, /length/],
    ["a score over the cap", { score: SCORE_LIMITS.runner.max + 1, durationMs: MAX_RUN_MS }, /over the game's limit/],
    ["too many points for the time", { score: 50_000, durationMs: 10_000 }, /too high/],
    ["a Swoop score over its cap", { game: "glider", score: SCORE_LIMITS.glider.max + 1, durationMs: MAX_RUN_MS }, /over the game's limit/],
    ["a Swoop score too fast for its run", { game: "glider", score: 20_000, durationMs: 10_000 }, /too high/],
    ["a run in the future", { playedAt: NOW + CLOCK_SKEW_MS + 1 }, /future/],
    ["a NaN end time", { playedAt: Number.NaN }, /future/],
    ["a stale run", { playedAt: NOW - MAX_SCORE_AGE_MS - 1 }, /too old/],
    ["a run from before its game was reset", { playedAt: SCORES_RESET_AT.runner! - 1 }, /reset/],
  ])("turns away %s", (_label, overrides, problem) => {
    expect(scoreProblem(entry(overrides), NOW)).toMatch(problem);
  });
});

describe("enqueueScore", () => {
  test("keeps only the best unpublished run of each game", () => {
    const first = entry({ runId: "run-first-1", score: 100 });
    const lower = entry({ runId: "run-lower-1", score: 50 });
    const higher = entry({ runId: "run-higher1", score: 300 });
    const flappy = entry({ runId: "run-flappy1", game: "flappy", score: 20 });
    let queue = enqueueScore([], first, NOW);
    queue = enqueueScore(queue, lower, NOW);
    expect(queue).toEqual([first]);
    queue = enqueueScore(queue, flappy, NOW);
    queue = enqueueScore(queue, higher, NOW);
    expect(queue).toEqual([flappy, higher]);
  });

  test("a queued run too old to publish gives way to a lower one that can be", () => {
    const stale = entry({ runId: "run-stale-1", score: 900, playedAt: NOW - MAX_SCORE_AGE_MS - 1 });
    const fresh = entry({ runId: "run-fresh-1", score: 50 });
    expect(enqueueScore([stale], fresh, NOW)).toEqual([fresh]);
  });

  test("a run the server would turn away never replaces a good one", () => {
    const good = entry({ runId: "run-good-01", score: 100 });
    const endless = entry({ runId: "run-endless", score: 900, durationMs: MAX_RUN_MS + 1 });
    expect(enqueueScore([good], endless, NOW)).toEqual([good]);
  });

  test("keeps every run that earns coins, as well as the best", () => {
    const low = entry({ runId: "run-low-1", game: "flappy", score: 100, durationMs: 600_000 });
    const pays = entry({ runId: "run-pays-1", game: "flappy", score: 600, durationMs: 600_000 });
    const paysLess = entry({ runId: "run-pays-2", game: "flappy", score: 520, durationMs: 600_000 });
    let queue = enqueueScore([], low, NOW);
    queue = enqueueScore(queue, pays, NOW);
    queue = enqueueScore(queue, paysLess, NOW);
    expect(queue).toEqual([pays, paysLess]);
  });

  test(`keeps at most ${MAX_PAYING_RUNS} paying runs`, () => {
    let queue: QueuedScore[] = [];
    for (let i = 0; i < MAX_PAYING_RUNS + 3; i++) {
      queue = enqueueScore(queue, entry({ runId: `run-many-${i}`, game: "flappy", score: 600, durationMs: 600_000 }), NOW);
    }
    expect(queue).toHaveLength(MAX_PAYING_RUNS);
  });

  test("a new best still fits when the paying runs are full, in place of the lowest", () => {
    let queue: QueuedScore[] = [];
    for (let i = 0; i < MAX_PAYING_RUNS; i++) {
      queue = enqueueScore(queue, entry({ runId: `run-full-${i}`, game: "flappy", score: 600 + (i === 3 ? -1 : 0), durationMs: 600_000 }), NOW);
    }
    for (let i = 0; i < 3; i++) {
      queue = enqueueScore(queue, entry({ runId: `run-best-${i}`, game: "flappy", score: 601 + i, durationMs: 600_000 }), NOW);
    }
    expect(queue).toHaveLength(MAX_PAYING_RUNS);
    expect(queue.map((queued) => queued.runId)).not.toContain("run-full-3");
    expect(queue.map((queued) => queued.runId)).toEqual(expect.arrayContaining(["run-best-0", "run-best-1", "run-best-2"]));
  });

  test("runs that can no longer publish don't take a paying run's place", () => {
    const stale = Array.from({ length: MAX_PAYING_RUNS }, (_, i) =>
      entry({ runId: `run-stale-${i}`, game: "runner", score: 13_000, durationMs: 600_000, playedAt: SCORES_RESET_AT.runner! - 1 })
    );
    const fresh = entry({ runId: "run-fresh-1", game: "flappy", score: 600, durationMs: 600_000 });
    expect(enqueueScore(stale, fresh, NOW)).toEqual([fresh]);
  });

  test("never queues a zero score", () => {
    expect(enqueueScore([], entry({ score: 0 }), NOW)).toEqual([]);
  });
});

describe("removeSettled", () => {
  test("takes out answered runs and keeps ones queued since", () => {
    const sent = entry({ runId: "run-sent-01" });
    const newer = entry({ runId: "run-newer-1", game: "shooter" });
    expect(removeSettled([sent, newer], ["run-sent-01"])).toEqual([newer]);
  });
});

describe("parseQueue", () => {
  test("reads a saved queue and drops junk", () => {
    const good = entry();
    expect(parseQueue(JSON.stringify([good, { runId: 1 }, null, { ...good, game: "snake" }]))).toEqual([good]);
    expect(parseQueue('{"not":"a list"}')).toEqual([]);
    expect(parseQueue("not json")).toEqual([]);
  });
});

describe("local bests", () => {
  test("parse what was saved, with zero for anything unusable", () => {
    expect(parseBests(JSON.stringify({ shooter: 12.7, runner: "9", flappy: -3, glider: 4321 }))).toEqual({
      shooter: 12,
      runner: 0,
      flappy: 0,
      glider: 4321,
    });
    expect(parseBests("null")).toEqual(NO_BESTS);
    expect(parseBests("{")).toEqual(NO_BESTS);
  });

  test("a best saved before its game was reset no longer counts; others carry over", () => {
    const old = JSON.stringify({ shooter: 50, runner: 900, flappy: 30 });
    expect(parseBests(old)).toEqual({ shooter: 50, runner: 0, flappy: 30, glider: 0 });
    const saved = { shooter: 50, runner: 40, flappy: 30, glider: 20 };
    expect(parseBests(stringifyBests(saved))).toEqual(saved);
    const beforeLastReset = JSON.stringify({ ...saved, resets: { runner: SCORES_RESET_AT.runner! - 1 } });
    expect(parseBests(beforeLastReset)).toEqual({ ...saved, runner: 0 });
  });

  test("only a higher score replaces a best", () => {
    const bests = { ...NO_BESTS, flappy: 40 };
    expect(withBest(bests, "flappy", 30)).toBe(bests);
    expect(withBest(bests, "flappy", 41)).toEqual({ ...NO_BESTS, flappy: 41 });
  });
});
