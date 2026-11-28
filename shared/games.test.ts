import { describe, expect, test } from "vitest";
import {
  bestsFromRuns,
  bestsToSync,
  BOARD_VERSIONS,
  CLOCK_SKEW_MS,
  CURRENT_GAME_VERSION,
  enqueueScore,
  isGameId,
  MAX_RUN_MS,
  MAX_SCORE_AGE_MS,
  NO_BESTS,
  parseBestRuns,
  parseBests,
  parseQueue,
  removeSettled,
  runsOf,
  SCORE_LIMITS,
  SCORES_RESET_AT,
  scoreProblem,
  shownBests,
  versionLabel,
  versionOf,
  stringifyBests,
  submittableFor,
  withBest,
  withBestRun,
  type QueuedScore,
  playingLabel,
  playingLine,
} from "./games";

const NOW = 1_800_000_000_000;
const entry = (overrides: Partial<QueuedScore> = {}): QueuedScore => ({
  runId: "run-abcdefgh",
  game: "runner",
  version: 2,
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
    ["an unknown version", { version: 3 as QueuedScore["version"] }, /isn't a version/],
    ["a zero score", { score: 0 }, /whole number/],
    ["a fractional score", { score: 1.5 }, /whole number/],
    ["a zero-length run", { durationMs: 0 }, /length/],
    ["an endless run", { durationMs: MAX_RUN_MS + 1 }, /length/],
    ["a NaN length", { durationMs: Number.NaN }, /length/],
    ["a score over the cap", { score: SCORE_LIMITS[2].runner.max + 1, durationMs: MAX_RUN_MS }, /over the game's limit/],
    ["too many points for the time", { score: 50_000, durationMs: 10_000 }, /too high/],
    ["a Swoop score over its cap", { game: "glider", score: SCORE_LIMITS[2].glider.max + 1, durationMs: MAX_RUN_MS }, /over the game's limit/],
    ["a Swoop score too fast for its run", { game: "glider", score: 25_000, durationMs: 10_000 }, /too high/],
    ["a run in the future", { playedAt: NOW + CLOCK_SKEW_MS + 1 }, /future/],
    ["a NaN end time", { playedAt: Number.NaN }, /future/],
    ["a stale run", { playedAt: NOW - MAX_SCORE_AGE_MS - 1 }, /too old/],
    ["a run from before its game was reset", { playedAt: SCORES_RESET_AT.runner! - 1 }, /reset/],
  ])("turns away %s", (_label, overrides, problem) => {
    expect(scoreProblem(entry(overrides), NOW)).toMatch(problem);
  });
});

describe("versions", () => {
  test("a run with no version was played on version 1, and is still taken on v1's limits", () => {
    expect([versionOf(undefined), versionOf(1), versionOf(2)]).toEqual([1, 1, 2]);
    expect(scoreProblem(entry({ version: undefined }), NOW)).toBeNull();
    expect(scoreProblem(entry({ version: 1 }), NOW)).toBeNull();
    const overV1 = { game: "glider" as const, score: SCORE_LIMITS[1].glider.max + 1, durationMs: MAX_RUN_MS };
    expect(scoreProblem(entry({ ...overV1, version: undefined }), NOW)).toMatch(/over the game's limit/);
    expect(scoreProblem(entry({ ...overV1, version: 2 }), NOW)).toBeNull();
  });

  test("v2 checks runs against its own limits", () => {
    expect(scoreProblem(entry({ game: "glider", score: SCORE_LIMITS[1].glider.max + 1, durationMs: MAX_RUN_MS }), NOW)).toBeNull();
    expect(scoreProblem(entry({ score: 241 * 60, durationMs: 60_000 }), NOW)).toBeNull();
    expect(SCORE_LIMITS[2].runner.perSecond).toBeGreaterThan(SCORE_LIMITS[1].runner.perSecond);
  });

  test("Swoop uses v3 and v2 (legacy), while the other games stay on v2 and v1 (legacy)", () => {
    expect(CURRENT_GAME_VERSION).toEqual({ shooter: 2, runner: 2, flappy: 2, glider: 3 });
    expect(BOARD_VERSIONS.glider).toEqual([3, 2]);
    expect(BOARD_VERSIONS.runner).toEqual([2, 1]);
    expect(BOARD_VERSIONS.glider.map((v) => versionLabel("glider", v))).toEqual(["v3", "v2 (legacy)"]);
    expect(BOARD_VERSIONS.runner.map((v) => versionLabel("runner", v))).toEqual(["v2", "v1 (legacy)"]);
    expect(scoreProblem(entry({ game: "glider", version: 3 }), NOW)).toBeNull();
    expect(scoreProblem(entry({ game: "runner", version: 3 }), NOW)).toMatch(/isn't a version/);
  });

  test("a saved queue keeps a run's version and drops one with a version that isn't", () => {
    const v2 = entry({ runId: "run-v2-run1" });
    const old = { ...entry({ runId: "run-old-run1" }), version: undefined };
    expect(parseQueue(JSON.stringify([v2, old, { ...v2, runId: "run-v9-run1", version: 9 }]))).toEqual([v2, JSON.parse(JSON.stringify(old))]);
  });

  test("the queue keeps the best run of each game on each version", () => {
    const old = { ...entry({ runId: "run-old-run1", score: 900 }), version: undefined };
    const fresh = entry({ runId: "run-new-run1", score: 100 });
    const better = entry({ runId: "run-new-run2", score: 200 });
    expect(enqueueScore(enqueueScore([old], fresh, NOW), better, NOW)).toEqual([old, better]);
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
  test("parse what was saved, with zero for anything unusable or from an older game version", () => {
    expect(
      parseBests(JSON.stringify({ shooter: 12.7, runner: "9", flappy: -3, glider: 4321, versions: CURRENT_GAME_VERSION }))
    ).toEqual({
      shooter: 12,
      runner: 0,
      flappy: 0,
      glider: 4321,
    });
    // A saved v2 record without per-game versions keeps v2 games and clears Swoop for v3.
    expect(parseBests(JSON.stringify({ shooter: 12, flappy: 7, glider: 4321 }))).toEqual({
      shooter: 12,
      runner: 0,
      flappy: 7,
      glider: 0,
    });
    expect(parseBests("null")).toEqual(NO_BESTS);
    expect(parseBests("{")).toEqual(NO_BESTS);
  });

  test("a best saved before its game was reset no longer counts; others carry over", () => {
    const old = JSON.stringify({ shooter: 50, runner: 900, flappy: 30 });
    expect(parseBests(old)).toEqual({ shooter: 50, runner: 0, flappy: 30, glider: 0 });
    const saved = { shooter: 50, runner: 40, flappy: 30, glider: 20 };
    expect(parseBests(stringifyBests(saved))).toEqual(saved);
    const beforeLastReset = JSON.stringify({ ...saved, resets: { runner: SCORES_RESET_AT.runner! - 1 }, versions: CURRENT_GAME_VERSION });
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

describe("bests across devices", () => {
  const local = { ...NO_BESTS, flappy: 40, runner: 900 };

  test("the server's best wins over a lower one on this device, and a higher local one is kept", () => {
    expect(shownBests(local, [{ game: "flappy", score: 75 }, { game: "runner", score: 300 }, { game: "old", score: 9 }])).toEqual({ ...local, flappy: 75 });
    expect(shownBests(local, [])).toEqual(local);
  });

  test("signed out or offline, the device's bests show as they are", () => {
    expect(shownBests(local, null)).toBe(local);
    expect(shownBests(local, undefined)).toBe(local);
  });

  const ANNA = "anna@sow.org.au";
  const BEN = "ben@sow.org.au";

  test("a higher local best of yours, still in range, is sent once through the usual queue", () => {
    const best = entry({ runId: "run-best-1", score: 900 });
    const accounts = withBestRun(withBestRun({}, ANNA, entry({ runId: "run-low-1", score: 100 }), NOW), ANNA, best, NOW);
    expect(accounts).toEqual({ [ANNA]: { runner: best } });
    expect(withBestRun(accounts, ANNA, entry({ runId: "run-lower", score: 800 }), NOW)).toBe(accounts);
    const runs = runsOf(accounts, ANNA);
    expect(bestsToSync(runs, [{ game: "runner", score: 300 }], [], NOW)).toEqual([best]);
    expect(bestsToSync(runs, [], [], NOW)).toEqual([best]);
    expect(bestsToSync(runs, [{ game: "runner", score: 900 }], [], NOW)).toEqual([]);
    expect(bestsToSync(runs, [], [best], NOW)).toEqual([]);
    expect(bestsToSync(runs, [], [], NOW, new Set(["run-best-1"]))).toEqual([]);
    expect(bestsToSync(runs, [], [{ ...best, runId: "run-old-1", version: undefined, score: 950 }], NOW)).toEqual([best]);
    expect(shownBests(bestsFromRuns(runs), [{ game: "runner", score: 300 }])).toEqual({ ...NO_BESTS, runner: 900 });
  });

  test("on a shared phone, someone else's best is never shown or sent as yours", () => {
    const annas = entry({ runId: "run-anna-1", score: 900 });
    const signedOut = entry({ runId: "run-nobody-1", score: 950 });
    const accounts = withBestRun(withBestRun({}, ANNA, annas, NOW), null, signedOut, NOW);
    expect(runsOf(accounts, BEN)).toEqual({});
    expect(runsOf(accounts, null)).toEqual({});
    expect(bestsToSync(runsOf(accounts, BEN), [], [], NOW)).toEqual([]);
    expect(shownBests(bestsFromRuns(runsOf(accounts, BEN)), [{ game: "runner", score: 40 }])).toEqual({ ...NO_BESTS, runner: 40 });
    const bens = entry({ runId: "run-ben-1", score: 100 });
    expect(runsOf(withBestRun(accounts, BEN, bens, NOW), BEN)).toEqual({ runner: bens });
  });

  test("a local best the server would turn away isn't kept or sent", () => {
    const tooFast = entry({ runId: "run-fast-1", score: 900_000, durationMs: 1000 });
    expect(bestsToSync({ runner: tooFast }, [], [], NOW)).toEqual([]);
    expect(withBestRun({}, ANNA, tooFast, NOW)).toEqual({});
    const stale = entry({ runId: "run-old-1", playedAt: NOW - MAX_SCORE_AGE_MS - 1 });
    expect(bestsToSync({ runner: stale }, [], [], NOW)).toEqual([]);
  });

  test("a best from before its game's reset, or too old to publish, gives way to a lower newer one", () => {
    const beforeReset = entry({ runId: "run-reset-1", score: 5000, playedAt: SCORES_RESET_AT.runner! - 1 });
    const aged = entry({ runId: "run-aged-1", score: 5000, game: "flappy", durationMs: 600_000, playedAt: NOW - MAX_SCORE_AGE_MS - 1 });
    const held = { [ANNA]: { runner: beforeReset, flappy: aged } };
    const newer = entry({ runId: "run-new-1", score: 120 });
    expect(runsOf(withBestRun(held, ANNA, newer, NOW), ANNA).runner).toEqual(newer);
    const newerFlap = entry({ runId: "run-new-2", game: "flappy", score: 30 });
    expect(runsOf(withBestRun(held, ANNA, newerFlap, NOW), ANNA).flappy).toEqual(newerFlap);
    expect(parseBestRuns(JSON.stringify(held), NOW)).toEqual({});
  });

  test("saved best runs read back per account, dropping anything unusable", () => {
    const best = entry({ runId: "run-best-1", score: 900 });
    expect(parseBestRuns(JSON.stringify({ [ANNA]: { runner: best, flappy: best, shooter: { score: 3 } }, [BEN]: "x" }), NOW)).toEqual({ [ANNA]: { runner: best } });
    expect(parseBestRuns("null", NOW)).toEqual({});
    expect(parseBestRuns("{", NOW)).toEqual({});
  });
});

describe("queued runs on a shared phone", () => {
  const ANNA = "anna@sow.org.au";
  const BEN = "ben@sow.org.au";

  test("each account keeps its own queued best, and only its own runs and signed-out runs are sent for it", () => {
    const annas = entry({ runId: "run-anna-1", score: 500, account: ANNA });
    const bens = entry({ runId: "run-ben-1", score: 100, account: BEN });
    const nobodys = entry({ runId: "run-nobody-1", score: 50, game: "flappy" });
    const queue = [annas, bens, nobodys].reduce<QueuedScore[]>((q, run) => enqueueScore(q, run, NOW), []);
    expect(queue).toEqual([annas, bens, nobodys]);
    const { account: _anna, ...annaSent } = annas;
    const { account: _ben, ...benSent } = bens;
    expect(submittableFor(queue, ANNA)).toEqual([annaSent, nobodys]);
    expect(submittableFor(queue, BEN)).toEqual([benSent, nobodys]);
    expect(submittableFor(queue, "cara@sow.org.au")).toEqual([nobodys]);
    expect(submittableFor(queue, ANNA).every((run) => !("account" in run))).toBe(true);
  });

  test("a saved queue keeps who each run belongs to", () => {
    const annas = entry({ runId: "run-anna-1", account: ANNA });
    expect(parseQueue(JSON.stringify([annas, { ...annas, runId: "run-bad-1", account: 7 }]))).toEqual([annas]);
  });
});
