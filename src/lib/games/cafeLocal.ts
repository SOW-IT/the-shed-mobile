import { applyMove, newBoard, otherSide, type CafeBoard, type CafeGameKind, type Side, type Winner } from "../../../shared/cafeGames";

export type LocalCafeGame = { kind: CafeGameKind; board: CafeBoard; starter: Side; winner: Winner | null };
export type LocalNames = { a: string; b: string };

export const DEFAULT_NAMES: LocalNames = { a: "Player 1", b: "Player 2" };
export const NAME_MAX = 20;

export const startLocal = (kind: CafeGameKind, starter: Side = "a"): LocalCafeGame => ({
  kind,
  board: { ...newBoard(kind), turn: starter },
  starter,
  winner: null,
});

export const playLocal = (game: LocalCafeGame, move: number): LocalCafeGame => {
  if (game.winner !== null) return game;
  const result = applyMove(game.kind, game.board, game.board.turn, move);
  if (!result.ok) return game;
  return { ...game, board: result.board, winner: result.winner ?? null };
};

export const rematchLocal = (game: LocalCafeGame): LocalCafeGame => startLocal(game.kind, otherSide(game.starter));

export const cleanName = (raw: string, fallback: string) => Array.from(raw.trim().replace(/\s+/g, " ")).slice(0, NAME_MAX).join("") || fallback;

export const restoreNames = (saved: string): LocalNames | null => {
  try {
    const parsed: unknown = JSON.parse(saved);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { a, b } = parsed as Record<string, unknown>;
    return { a: cleanName(typeof a === "string" ? a : "", DEFAULT_NAMES.a), b: cleanName(typeof b === "string" ? b : "", DEFAULT_NAMES.b) };
  } catch {
    return null;
  }
};

export const localTurnWords = (game: LocalCafeGame, names: LocalNames) => `${names[game.board.turn]}'s turn`;

export const localResultWords = (winner: Winner, names: LocalNames) => (winner === "draw" ? "Draw" : `${names[winner]} wins`);
