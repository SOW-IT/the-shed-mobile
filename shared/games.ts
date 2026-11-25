// The offline mini-games' ids, score limits and the queue of scores waiting
// to go on the leaderboard. The app and the backend both read these, so a
// score the app saves is one the server accepts.
export const GAME_IDS = ["shooter", "runner", "flappy", "glider"] as const;
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
    blurb: "Tap to hop, swipe up for a big jump, swipe down to duck. It gets faster. Best sideways.",
  },
  flappy: {
    title: "Flap",
    blurb: "Tap to flap through the gaps.",
  },
  glider: {
    title: "Swoop",
    blurb: "Hold to dive into the valleys, let go to fly off the hills. Finish each world before dark. Best sideways.",
  },
};

export const GAME_VERSIONS = [1, 2] as const;
export type GameVersion = (typeof GAME_VERSIONS)[number];
export const GAME_VERSION: GameVersion = 2;

export const isGameVersion = (value: unknown): value is GameVersion =>
  (GAME_VERSIONS as readonly unknown[]).includes(value);

export const versionOf = (version: GameVersion | undefined): GameVersion => version ?? 1;

/**
 * The most points a run can earn per second it lasted, with room to spare,
 * and the most a run can score at all. The server turns away a score above
 * either, so a typo'd or tampered score can't top the leaderboard.
 */
export const SCORE_LIMITS: Record<GameVersion, Record<GameId, { perSecond: number; max: number }>> = {
  1: {
    shooter: { perSecond: 1000, max: 5_000_000 },
    runner: { perSecond: 200, max: 2_000_000 },
    flappy: { perSecond: 60, max: 1_000_000 },
    // Swoop's own rules cap these: a run can't fly faster than the bird's top
    // speed, or past the world where even that can't beat the sunset
    // (src/lib/games/glider.ts, maxGliderScore, checked by its tests).
    glider: { perSecond: 1000, max: 500_000 },
  },
  2: {
    shooter: { perSecond: 1000, max: 5_000_000 },
    runner: { perSecond: 250, max: 2_000_000 },
    flappy: { perSecond: 60, max: 1_000_000 },
    glider: { perSecond: 1000, max: 2_000_000 },
  },
};

/**
 * When a game's leaderboard was last wiped. A run played before it can't be
 * published, and a best a phone saved before it no longer counts, so old
 * scores don't come back from phones that were offline at the time.
 */
export const SCORES_RESET_AT: Partial<Record<GameId, number>> = {
  // 2.12.17: Mystic Man got faster, so the old scores were cleared.
  runner: 1_795_429_500_000,
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
  version?: GameVersion;
  score: number;
  durationMs: number;
  playedAt: number;
};

/** Why a score can't go on the leaderboard, or null when it can. */
export const scoreProblem = (entry: QueuedScore, now: number): string | null => {
  if (!RUN_ID_PATTERN.test(entry.runId)) return "That run has no usable id.";
  if (!isGameId(entry.game)) return "That isn't one of the games.";
  if (entry.version !== undefined && !isGameVersion(entry.version)) return "That isn't a version of the game.";
  if (!Number.isInteger(entry.score) || entry.score < 1) return "A score is a whole number above zero.";
  if (!Number.isFinite(entry.durationMs) || entry.durationMs <= 0 || entry.durationMs > MAX_RUN_MS) {
    return "That run's length isn't believable.";
  }
  const limit = SCORE_LIMITS[versionOf(entry.version)][entry.game];
  if (entry.score > limit.max) return "That score is over the game's limit.";
  if (entry.score > SCORE_SLACK + (limit.perSecond * entry.durationMs) / 1000) {
    return "That score is too high for how long the run lasted.";
  }
  if (!Number.isFinite(entry.playedAt) || entry.playedAt > now + CLOCK_SKEW_MS) {
    return "That run ends in the future.";
  }
  if (entry.playedAt < now - MAX_SCORE_AGE_MS) return "That run is too old to publish.";
  if (entry.playedAt < (SCORES_RESET_AT[entry.game] ?? 0)) {
    return "That run is from before the game's scores were reset.";
  }
  return null;
};

/**
 * Adds a finished run to the queue. The leaderboard keeps each person's best,
 * and only a new best can earn coins (by reaching the top 3), so the queue
 * only needs the best unpublished run of each game: a lower one would change
 * nothing once the higher one is published.
 */
export const enqueueScore = (queue: readonly QueuedScore[], entry: QueuedScore, now: number): QueuedScore[] => {
  // A run the server would turn away is never queued, and a queued one that
  // has become unpublishable can't hold its place.
  const live = queue.filter((queued) => scoreProblem(queued, now) === null);
  if (scoreProblem(entry, now) !== null) return live;
  if (live.some((queued) => queued.game === entry.game && queued.score >= entry.score)) return live;
  return [...live.filter((queued) => queued.game !== entry.game), entry];
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

export const NO_BESTS: LocalBests = { shooter: 0, runner: 0, flappy: 0, glider: 0 };

/**
 * Saves bests with the reset each was made after, so a later reset can tell
 * which saved bests came before it.
 */
export const stringifyBests = (bests: LocalBests): string => JSON.stringify({ ...bests, resets: SCORES_RESET_AT });

/**
 * Reads saved bests, keeping zero for a game with nothing usable saved, or
 * whose best was saved before its scores were last reset.
 */
export const parseBests = (saved: string): LocalBests => {
  try {
    const parsed: unknown = JSON.parse(saved);
    const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const resets =
      typeof record.resets === "object" && record.resets !== null ? (record.resets as Record<string, unknown>) : {};
    const best = (game: GameId) => {
      const value = record[game];
      const savedAfter = resets[game] ?? 0;
      if (savedAfter !== (SCORES_RESET_AT[game] ?? 0)) return 0;
      return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    };
    return { shooter: best("shooter"), runner: best("runner"), flappy: best("flappy"), glider: best("glider") };
  } catch {
    return { ...NO_BESTS };
  }
};

export const withBest = (bests: LocalBests, game: GameId, score: number): LocalBests =>
  score > bests[game] ? { ...bests, [game]: score } : bests;

export const playingLabel = (game: string | undefined): string | null => (game !== undefined && isGameId(game) ? `Playing ${GAME_INFO[game].title}` : null);

export const playingLine = (names: readonly string[], game: GameId): string | null => {
  if (names.length === 0) return null;
  const title = GAME_INFO[game].title;
  if (names.length === 1) return `${names[0]} playing ${title}`;
  const others = names.length - 1;
  return `${names[0]} and ${others} ${others === 1 ? "other" : "others"} playing ${title}`;
};
