import { ordinal, PLACE_COINS } from "./coins";
import { GAME_INFO, type GameId } from "./games";

const TOP_PLACES = PLACE_COINS.length;

export type Beaten = { email: string; place: number };

export const beatenInTop = (
  board: readonly { email: string; score: number }[],
  player: string,
  previous: number | null,
  score: number
): Beaten[] =>
  board.flatMap((row) => {
    if (row.email === player || row.score >= score || (previous !== null && previous > row.score)) return [];
    const place = 1 + board.filter((other) => other.score > row.score).length;
    return place <= TOP_PLACES ? [{ email: row.email, place: place + 1 }] : [];
  });

export const beatenPush = (name: string, game: GameId, place: number) => ({
  title: `${name} just beat you in ${GAME_INFO[game].title}`,
  body: place <= TOP_PLACES ? `You're now ${ordinal(place)}` : `You're out of the top ${TOP_PLACES}`,
  url: `/games/leaderboard?game=${game}`,
});
