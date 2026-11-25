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
  SCORES_RESET_AT,
  scoreProblem,
  stringifyBests,
  withBest,
  type QueuedScore,
  playingLabel,
  playingLine,
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

  test("a queued run that can no longer publish gives way to any new run of its game", () => {
    const stale = entry({ runId: "run-stale-2", game: "runner", score: 13_000, durationMs: 600_000, playedAt: SCORES_RESET_AT.runner! - 1 });
    const fresh = entry({ runId: "run-fresh-2", game: "runner", score: 50 });
    expect(enqueueScore([stale], fresh, NOW)).toEqual([fresh]);
  });

  test("a bad run still clears out queued runs that can no longer publish", () => {
    const stale = entry({ runId: "run-stale-3", game: "runner", score: 13_000, durationMs: 600_000, playedAt: SCORES_RESET_AT.runner! - 1 });
    const good = entry({ runId: "run-good-02", game: "flappy", score: 20 });
    const endless = entry({ runId: "run-endless2", score: 900, durationMs: MAX_RUN_MS + 1 });
    expect(enqueueScore([stale, good], endless, NOW)).toEqual([good]);
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

describe("playingLine", () => {
  test("names one, two or three players", () => {
    expect(playingLine(["Anna B."], 1)).toBe("Anna B. is playing");
    expect(playingLine(["Anna B.", "Ben C."], 2)).toBe("Anna B. and Ben C. are playing");
    expect(playingLine(["Anna B.", "Ben C.", "Cara D."], 3)).toBe("Anna B., Ben C. and Cara D. are playing");
  });

  test("past a few, names two and counts the rest", () => {
    expect(playingLine(["Anna B.", "Ben C.", "Cara D."], 4)).toBe("Anna B., Ben C. and 2 others are playing");
    expect(playingLine(["Anna B.", "Ben C."], 3)).toBe("Anna B., Ben C. and 1 other are playing");
    expect(playingLine(["Anna B.", "Ben C.", "Cara D."], 50, true)).toBe("Anna B., Ben C. and 48+ others are playing");
  });

  test("is empty with nobody", () => {
    expect(playingLine([], 0)).toBe("");
    expect(playingLine([], 2)).toBe("");
  });
});

describe("playingLabel", () => {
  test("a game's label for the People list, or nothing for a game this app doesn't know", () => {
    expect(playingLabel("runner")).toBe("Playing Mystic Man");
    expect(playingLabel("chess")).toBeNull();
    expect(playingLabel(undefined)).toBeNull();
  });
});
