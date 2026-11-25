// What the games keep on the phone: the best score of each game, and the
// runs waiting to go on the leaderboard. Both work signed out and offline;
// GameScoreSync publishes the queue once the phone is online and signed in.
import * as Crypto from "expo-crypto";
import { useConvexAuth, useQuery } from "convex/react";
import { useMemo, useSyncExternalStore } from "react";
import { useOffline } from "@/hooks/useOffline";
import { api } from "../../../convex/_generated/api";
import {
  enqueueScore,
  NO_BESTS,
  parseBestRuns,
  parseBests,
  parseQueue,
  removeSettled,
  shownBests,
  stringifyBests,
  withBest,
  withBestRun,
  type BestRuns,
  type GameId,
  type LocalBests,
  type QueuedScore,
} from "../../../shared/games";
import {
  DEFAULT_CHARACTERS,
  parseCharacters,
  withCharacter,
  type Character,
  type CharacterChoices,
  type CharacterGame,
} from "../../../shared/gameCharacters";
import { persisted } from "./persisted";

const bests = persisted<LocalBests>("games.bests", parseBests, NO_BESTS, stringifyBests);
const queue = persisted<QueuedScore[]>("games.scoreQueue", parseQueue, []);
const bestRuns = persisted<BestRuns>("games.bestRuns", parseBestRuns, {});

const characters = persisted<CharacterChoices>("games.characters", parseCharacters, DEFAULT_CHARACTERS);

export const useCharacterChoice = (game: CharacterGame): Character =>
  useSyncExternalStore(characters.subscribe, characters.get, characters.get)[game];

export const chooseCharacter = (game: CharacterGame, character: Character): Promise<void> =>
  characters.update((current) => withCharacter(current, game, character));

export const useLocalBests = () => useSyncExternalStore(bests.subscribe, bests.get, bests.get);
export const useScoreQueue = () => useSyncExternalStore(queue.subscribe, queue.get, queue.get);
export const useBestRuns = () => useSyncExternalStore(bestRuns.subscribe, bestRuns.get, bestRuns.get);

export const useServerBests = () => {
  const { isAuthenticated } = useConvexAuth();
  const offline = useOffline();
  const server = useQuery(api.gameScores.myBests, isAuthenticated && !offline ? {} : "skip");
  return isAuthenticated && !offline ? server : undefined;
};

export const useBests = (): LocalBests => {
  const local = useLocalBests();
  const server = useServerBests();
  return useMemo(() => shownBests(local, server), [local, server]);
};

export const queueRuns = (runs: readonly QueuedScore[]): Promise<void> =>
  queue.update((current) => runs.reduce((next, run) => enqueueScore(next, run, Date.now()), current));

const runId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Crypto.randomUUID();

/** Saves a finished run: a new best if it is one, and a place in the queue. */
export const recordRun = (game: GameId, score: number, durationMs: number): Promise<string | null> => {
  if (score < 1) return Promise.resolve(null);
  const entry: QueuedScore = {
    runId: runId(),
    game,
    score,
    durationMs: Math.max(1, Math.round(durationMs)),
    playedAt: Date.now(),
  };
  return Promise.all([
    bests.update((current) => withBest(current, game, score)),
    bestRuns.update((current) => withBestRun(current, entry)),
    queue.update((current) => enqueueScore(current, entry, entry.playedAt)),
  ]).then(() => entry.runId);
};

/** What a run earned, and the leaderboard place it earned it for. */
type Payout = { coins: number; place?: number };

const paid = new Map<string, Payout>();
const paidListeners = new Set<() => void>();

export const notePaid = (coins: readonly ({ runId: string } & Payout)[]) => {
  if (coins.length === 0) return;
  for (const { runId, coins: amount, place } of coins) paid.set(runId, { coins: amount, place });
  paidListeners.forEach((listener) => listener());
};

const subscribePaid = (listener: () => void) => {
  paidListeners.add(listener);
  return () => {
    paidListeners.delete(listener);
  };
};

const NOT_PAID = () => undefined;

/**
 * What a run has been paid, once the server says. The payout is the store's
 * snapshot itself: read beside a version number instead, React Compiler kept
 * the first read for a run (nothing yet) and the chip never showed.
 */
export const usePaid = (runId: string | null): Payout | undefined => {
  const read = runId === null ? NOT_PAID : () => paid.get(runId);
  return useSyncExternalStore(subscribePaid, read, read);
};

/** Drops runs the server has answered for, accepted or not. */
export const settleRuns = (runIds: readonly string[]): Promise<void> =>
  queue.update((current) => {
    const next = removeSettled(current, runIds);
    return next.length === current.length ? current : next;
  });
