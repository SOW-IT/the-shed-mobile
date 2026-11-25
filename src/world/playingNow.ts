import { isGameId, type GameId } from "../../shared/games";

type Player = { isMe: boolean; name: string; away?: "arcade"; playing?: string };

export const playingNow = (people: readonly Player[], nameOf: (name: string) => string): Partial<Record<GameId, string[]>> => {
  const byGame: Partial<Record<GameId, string[]>> = {};
  for (const p of people) {
    if (p.isMe || p.away !== "arcade" || p.playing === undefined || !isGameId(p.playing)) continue;
    (byGame[p.playing] ??= []).push(nameOf(p.name));
  }
  return byGame;
};
