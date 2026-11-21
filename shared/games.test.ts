import { describe, expect, test } from "vitest";
import {
  CLOCK_SKEW_MS,
  enqueueScore,
  isGameId,
  MAX_RUN_MS,
  MAX_SCORE_AGE_MS,
  NO_BESTS,
  parseBests,
  parseQueue,
  removeSettled,
  SCORE_LIMITS,
  scoreProblem,
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
  test("knows the three games", () => {
    expect(["shooter", "runner", "flappy", "snake"].map(isGameId)).toEqual([true, true, true, false]);
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
    ["a run in the future", { playedAt: NOW + CLOCK_SKEW_MS + 1 }, /future/],
    ["a NaN end time", { playedAt: Number.NaN }, /future/],
    ["a stale run", { playedAt: NOW - MAX_SCORE_AGE_MS - 1 }, /too old/],
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
    let queue = enqueueScore([], first);
    queue = enqueueScore(queue, lower);
    expect(queue).toEqual([first]);
    queue = enqueueScore(queue, flappy);
    queue = enqueueScore(queue, higher);
    expect(queue).toEqual([flappy, higher]);
  });

  test("never queues a zero score", () => {
    expect(enqueueScore([], entry({ score: 0 }))).toEqual([]);
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
    expect(parseBests(JSON.stringify({ shooter: 12.7, runner: "9", flappy: -3 }))).toEqual({
      shooter: 12,
      runner: 0,
      flappy: 0,
    });
    expect(parseBests("null")).toEqual(NO_BESTS);
    expect(parseBests("{")).toEqual(NO_BESTS);
  });

  test("only a higher score replaces a best", () => {
    const bests = { ...NO_BESTS, flappy: 40 };
    expect(withBest(bests, "flappy", 30)).toBe(bests);
    expect(withBest(bests, "flappy", 41)).toEqual({ ...NO_BESTS, flappy: 41 });
  });
});
