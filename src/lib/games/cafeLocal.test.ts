import { describe, expect, test } from "vitest";
import {
  cleanName,
  DEFAULT_NAMES,
  localResultWords,
  localTurnWords,
  NAME_MAX,
  playLocal,
  rematchLocal,
  restoreNames,
  startLocal,
  type LocalCafeGame,
} from "./cafeLocal";

const play = (game: LocalCafeGame, moves: number[]) => moves.reduce(playLocal, game);

const offlineSources = import.meta.glob(["./cafeLocal.ts", "../../components/games/CafeTableGames.tsx", "../../components/games/cafe/CafeParts.tsx", "../../components/games/cafe/CafeBoards.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("a pass-and-play game", () => {
  test("Player 1 starts and turns alternate", () => {
    const game = startLocal("ticTacToe");
    expect(game.board.turn).toBe("a");
    const next = playLocal(game, 4);
    expect(next.board.turn).toBe("b");
    expect(next.board.cells[4]).toBe(1);
    expect(playLocal(next, 0).board.cells[0]).toBe(2);
  });

  test("an illegal move changes nothing", () => {
    const game = playLocal(startLocal("ticTacToe"), 4);
    expect(playLocal(game, 4)).toBe(game);
    expect(playLocal(startLocal("fourInARow"), 9).board.cells.every((cell) => cell === 0)).toBe(true);
  });

  test("a line wins and the game stops taking moves", () => {
    const won = play(startLocal("fourInARow"), [0, 1, 0, 1, 0, 1, 0]);
    expect(won.winner).toBe("a");
    expect(playLocal(won, 2)).toBe(won);
    expect(play(startLocal("fiveInARow"), [0, 13, 1, 14, 2, 15, 3, 16, 4]).winner).toBe("a");
  });

  test("a full board with no line is a draw", () => {
    expect(play(startLocal("ticTacToe"), [0, 1, 2, 4, 3, 5, 7, 6, 8]).winner).toBe("draw");
  });

  test("closing a box in Dots and Boxes keeps the turn", () => {
    const game = play(startLocal("dotsAndBoxes"), [0, 4, 20]);
    expect(playLocal(game, 21).board.turn).toBe("b");
  });

  test("a rematch starts fresh with the other player first, alternating each time", () => {
    const first = play(startLocal("ticTacToe"), [0, 3, 1, 4, 2]);
    const second = rematchLocal(first);
    expect(second).toMatchObject({ starter: "b", winner: null, board: { turn: "b" } });
    expect(second.board.cells.every((cell) => cell === 0)).toBe(true);
    expect(rematchLocal(second)).toMatchObject({ starter: "a", board: { turn: "a" } });
  });

  test("there is no clock: the state holds no deadline", () => {
    const game = startLocal("fourInARow");
    expect(Object.keys(game).sort()).toEqual(["board", "kind", "starter", "winner"]);
    expect(Object.keys(game.board)).not.toContain("turnEndsAt");
    for (const source of Object.values(offlineSources)) expect(source).not.toMatch(/CAFE_TURN_MS|turnEndsAt|setInterval/);
  });

  test("offline play never touches Convex or the network", () => {
    expect(Object.keys(offlineSources)).toHaveLength(4);
    for (const source of Object.values(offlineSources)) {
      expect(source).not.toMatch(/from "convex\/|_generated\/api|useQuery|useMutation|fetch\(/);
    }
  });
});

describe("names", () => {
  test("names are trimmed, capped and fall back to the default", () => {
    expect(cleanName("  Kate   R  ", "Player 1")).toBe("Kate R");
    expect(cleanName("   ", "Player 2")).toBe("Player 2");
    expect(Array.from(cleanName("x".repeat(40), "P"))).toHaveLength(NAME_MAX);
  });

  test("saved names come back, and broken ones don't", () => {
    expect(restoreNames(JSON.stringify({ a: "Kate", b: "Sam" }))).toEqual({ a: "Kate", b: "Sam" });
    expect(restoreNames(JSON.stringify({ a: 3 }))).toEqual(DEFAULT_NAMES);
    expect(restoreNames("null")).toBeNull();
    expect(restoreNames("{")).toBeNull();
  });

  test("turn and result words use the names", () => {
    const names = { a: "Kate", b: "Sam" };
    expect(localTurnWords(startLocal("ticTacToe", "b"), names)).toBe("Sam's turn");
    expect(localResultWords("a", names)).toBe("Kate wins");
    expect(localResultWords("draw", names)).toBe("Draw");
  });
});
