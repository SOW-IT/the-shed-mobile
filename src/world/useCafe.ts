import { applyMove, CAFE_PLACE, isCafeGameKind } from "@shared/cafeGames";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Reply = { ok: true } | { ok: false; reason: string } | { ok: false; retryInMs: number };

const wordsFor = (reply: Reply) =>
  reply.ok ? null : "retryInMs" in reply ? `Slow down a little. Try again in ${Math.ceil(reply.retryInMs / 1000)}s.` : reply.reason;

const attempt = async (send: () => Promise<Reply>) => {
  try {
    return wordsFor(await send());
  } catch (e) {
    return e instanceof ConvexError ? String(e.data) : "That didn't send.";
  }
};

export const useCafe = ({ status, place, roomId }: { status: string; place: string; roomId: Id<"worldRooms"> | null }) => {
  const inWorld = status === "in";
  const inCafe = inWorld && place === CAFE_PLACE && roomId !== null;
  const mine = useQuery(api.cafeGames.mine, inWorld ? {} : "skip");
  const playing = useQuery(api.cafeGames.playing, inCafe && roomId ? { roomId } : "skip");
  const challengeM = useMutation(api.cafeGames.challenge);
  const pickM = useMutation(api.cafeGames.pick);
  const respondM = useMutation(api.cafeGames.respond);
  const giveUpM = useMutation(api.cafeGames.giveUp);
  const rematchM = useMutation(api.cafeGames.rematch);
  const closeM = useMutation(api.cafeGames.close).withOptimisticUpdate((store, { gameId }) => {
    const current = store.getQuery(api.cafeGames.mine, {});
    if (current?.game?.id === gameId && current.game.result) store.setQuery(api.cafeGames.mine, {}, { ...current, game: null });
  });
  const moveM = useMutation(api.cafeGames.move).withOptimisticUpdate((store, { gameId, move }) => {
    const current = store.getQuery(api.cafeGames.mine, {});
    const game = current?.game;
    if (!current || !game || game.id !== gameId || game.result || !isCafeGameKind(game.kind)) return;
    const result = applyMove(game.kind, game.board, game.side, move);
    if (result.ok) store.setQuery(api.cafeGames.mine, {}, { ...current, game: { ...game, board: result.board } });
  });
  return {
    inCafe,
    challenges: mine?.challenges ?? [],
    game: mine?.game ?? null,
    playing: playing ?? [],
    challenge: useCallback((to: Id<"worldMembers">, kind: string) => attempt(() => challengeM({ to, kind })), [challengeM]),
    pick: useCallback((challengeId: Id<"cafeChallenges">, kind: string) => attempt(() => pickM({ challengeId, kind })), [pickM]),
    respond: useCallback((challengeId: Id<"cafeChallenges">, accept: boolean) => attempt(() => respondM({ challengeId, accept })), [respondM]),
    move: useCallback((gameId: Id<"cafeGames">, move: number) => attempt(() => moveM({ gameId, move })), [moveM]),
    giveUp: useCallback((gameId: Id<"cafeGames">) => attempt(() => giveUpM({ gameId })), [giveUpM]),
    rematch: useCallback((gameId: Id<"cafeGames">) => attempt(() => rematchM({ gameId })), [rematchM]),
    close: useCallback((gameId: Id<"cafeGames">) => attempt(() => closeM({ gameId })), [closeM]),
  };
};

export type Cafe = ReturnType<typeof useCafe>;
