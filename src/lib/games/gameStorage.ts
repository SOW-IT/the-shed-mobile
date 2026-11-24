// What the games keep on the phone: the best score of each game, and the
// runs waiting to go on the leaderboard. Both work signed out and offline;
// GameScoreSync publishes the queue once the phone is online and signed in.
import * as Crypto from "expo-crypto";
import { useSyncExternalStore } from "react";
import {
  enqueueScore,
  NO_BESTS,
  parseBests,
  parseQueue,
  removeSettled,
  stringifyBests,
  withBest,
  type GameId,
  type LocalBests,
  type QueuedScore,
} from "../../../shared/games";
import { readStored, tryWriteStored } from "../deviceStorage";

/**
 * A saved value that loads before any change is made to it, so a run
 * finished while the phone is still reading the saved best can't overwrite
 * it.
 */
const persisted = <T>(
  key: string,
  parse: (saved: string) => T,
  initial: T,
  stringify: (value: T) => string = JSON.stringify
) => {
  let value = initial;
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const load = () =>
    (loading ??= readStored(key).then((saved) => {
      if (saved === null) return;
      value = parse(saved);
      notify();
    }));
  // A write that failed stays owed, so the next change saves it even when
  // that change leaves the value as it was.
  let unsaved = false;
  const update = async (change: (current: T) => T) => {
    await load();
    const next = change(value);
    if (next === value && !unsaved) return;
    if (next !== value) {
      value = next;
      notify();
    }
    unsaved = !(await tryWriteStored(key, stringify(value)));
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    void load();
    return () => {
      listeners.delete(listener);
    };
  };
  return { get: () => value, update, subscribe };
};

const bests = persisted<LocalBests>("games.bests", parseBests, NO_BESTS, stringifyBests);
const queue = persisted<QueuedScore[]>("games.scoreQueue", parseQueue, []);

export const useLocalBests = () => useSyncExternalStore(bests.subscribe, bests.get, bests.get);
export const useScoreQueue = () => useSyncExternalStore(queue.subscribe, queue.get, queue.get);

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
    queue.update((current) => enqueueScore(current, entry, entry.playedAt)),
  ]).then(() => entry.runId);
};

const paid = new Map<string, number>();
const paidListeners = new Set<() => void>();
let paidVersion = 0;

export const notePaid = (coins: readonly { runId: string; coins: number }[]) => {
  if (coins.length === 0) return;
  for (const { runId, coins: amount } of coins) paid.set(runId, amount);
  paidVersion++;
  paidListeners.forEach((listener) => listener());
};

const subscribePaid = (listener: () => void) => {
  paidListeners.add(listener);
  return () => {
    paidListeners.delete(listener);
  };
};

export const usePaid = (runId: string | null): number | undefined => {
  useSyncExternalStore(subscribePaid, () => paidVersion, () => paidVersion);
  return runId === null ? undefined : paid.get(runId);
};

/** Drops runs the server has answered for, accepted or not. */
export const settleRuns = (runIds: readonly string[]): Promise<void> =>
  queue.update((current) => {
    const next = removeSettled(current, runIds);
    return next.length === current.length ? current : next;
  });
