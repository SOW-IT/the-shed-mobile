// The offline mini-games' ids, score limits and the queue of scores waiting
// to go on the leaderboard. The app and the backend both read these, so a
// score the app saves is one the server accepts.

export const GAME_IDS = ["shooter", "runner", "flappy"] as const;
export type GameId = (typeof GAME_IDS)[number];

export const isGameId = (value: string): value is GameId =>
  (GAME_IDS as readonly string[]).includes(value);

export const GAME_INFO: Record<GameId, { title: string; blurb: string }> = {
  shooter: {
    title: "Sky Shooter",
    blurb: "Drag to fly. Your plane fires on its own. Dodge everything.",
  },
  runner: {
    title: "Mystic Man",
    blurb: "Swipe up to jump, swipe down to slide. It gets faster.",
  },
  flappy: {
    title: "Flap",
    blurb: "Tap to flap through the gaps.",
  },
};

/**
 * The most points a run can earn per second it lasted, with room to spare,
 * and the most a run can score at all. The server turns away a score above
 * either, so a typo'd or tampered score can't top the leaderboard.
 */
export const SCORE_LIMITS: Record<GameId, { perSecond: number; max: number }> = {
  shooter: { perSecond: 1000, max: 5_000_000 },
  runner: { perSecond: 200, max: 2_000_000 },
  flappy: { perSecond: 60, max: 1_000_000 },
};

/** Points any run may have before its duration counts, for rounding. */
const SCORE_SLACK = 100;
export const MAX_RUN_MS = 6 * 60 * 60 * 1000;
/** How far ahead of the server's clock a phone's clock may be. */
export const CLOCK_SKEW_MS = 10 * 60 * 1000;
/** How long a score may wait on a phone to be published. */
export const MAX_SCORE_AGE_MS = 365 * 24 * 60 * 60 * 1000;
export const MAX_SCORES_PER_SUBMIT = 20;
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export type QueuedScore = {
  /** Made on the phone when the run ends; retries send the same one. */
  runId: string;
  game: GameId;
  score: number;
  durationMs: number;
  playedAt: number;
};

/** Why a score can't go on the leaderboard, or null when it can. */
export const scoreProblem = (entry: QueuedScore, now: number): string | null => {
  if (!RUN_ID_PATTERN.test(entry.runId)) return "That run has no usable id.";
  if (!isGameId(entry.game)) return "That isn't one of the games.";
  if (!Number.isInteger(entry.score) || entry.score < 1) return "A score is a whole number above zero.";
  if (!Number.isFinite(entry.durationMs) || entry.durationMs <= 0 || entry.durationMs > MAX_RUN_MS) {
    return "That run's length isn't believable.";
  }
  const limit = SCORE_LIMITS[entry.game];
  if (entry.score > limit.max) return "That score is over the game's limit.";
  if (entry.score > SCORE_SLACK + (limit.perSecond * entry.durationMs) / 1000) {
    return "That score is too high for how long the run lasted.";
  }
  if (!Number.isFinite(entry.playedAt) || entry.playedAt > now + CLOCK_SKEW_MS) {
    return "That run ends in the future.";
  }
  if (entry.playedAt < now - MAX_SCORE_AGE_MS) return "That run is too old to publish.";
  return null;
};

/**
 * Adds a finished run to the queue. The leaderboard keeps each person's best,
 * so the queue only needs the best unpublished run of each game: a lower one
 * would change nothing once the higher one is published.
 */
export const enqueueScore = (queue: readonly QueuedScore[], entry: QueuedScore, now: number): QueuedScore[] => {
  if (entry.score < 1) return [...queue];
  // A queued run the server would turn away can't hold its place.
  const current = queue.find((queued) => queued.game === entry.game && scoreProblem(queued, now) === null);
  if (current && current.score >= entry.score) return [...queue];
  return [...queue.filter((queued) => queued.game !== entry.game), entry];
};

/**
 * Takes out the runs the server has answered for. A run queued after the
 * request went out has a new id, so it stays.
 */
export const removeSettled = (queue: readonly QueuedScore[], settled: readonly string[]): QueuedScore[] =>
  queue.filter((queued) => !settled.includes(queued.runId));

const isQueuedScore = (value: unknown): value is QueuedScore => {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.runId === "string" &&
    typeof entry.game === "string" &&
    isGameId(entry.game) &&
    typeof entry.score === "number" &&
    typeof entry.durationMs === "number" &&
    typeof entry.playedAt === "number"
  );
};

/** Reads a saved queue, dropping anything that isn't a queued run. */
export const parseQueue = (saved: string): QueuedScore[] => {
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(isQueuedScore) : [];
  } catch {
    return [];
  }
};

export type LocalBests = Record<GameId, number>;

export const NO_BESTS: LocalBests = { shooter: 0, runner: 0, flappy: 0 };

/** Reads saved bests, keeping zero for a game with nothing usable saved. */
export const parseBests = (saved: string): LocalBests => {
  try {
    const parsed: unknown = JSON.parse(saved);
    const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const best = (game: GameId) => {
      const value = record[game];
      return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    };
    return { shooter: best("shooter"), runner: best("runner"), flappy: best("flappy") };
  } catch {
    return { ...NO_BESTS };
  }
};

export const withBest = (bests: LocalBests, game: GameId, score: number): LocalBests =>
  score > bests[game] ? { ...bests, [game]: score } : bests;
