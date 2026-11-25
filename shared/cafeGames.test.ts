import { describe, expect, test } from "vitest";
import {
  applyMove,
  boxEdges,
  boxesWon,
  CAFE_GAME_ORDER,
  CAFE_GAMES,
  CAFE_TABLES,
  cafeTableOf,
  dotLine,
  DOTS_LINES,
  dropRow,
  gridOf,
  isCafeGameKind,
  lineThrough,
  missTurn,
  newBoard,
  otherSide,
  pairKey,
  playingLine,
  playingTag,
  recordScore,
  type CafeBoard,
  type CafeGameKind,
  type MoveResult,
  type Side,
} from "./cafeGames";

const ok = (result: MoveResult) => {
  if (!result.ok) throw new Error(result.reason);
  return result;
};

const play = (kind: CafeGameKind, moves: number[], board: CafeBoard = newBoard(kind)) => {
  let current = board;
  let last: MoveResult | null = null;
  for (const move of moves) {
    last = ok(applyMove(kind, current, current.turn, move));
    current = last.board;
  }
  return { board: current, winner: last && last.ok ? last.winner : undefined };
};

const withCells = (kind: CafeGameKind, marks: Record<number, number>, turn: Side = "a"): CafeBoard => {
  const board = { ...newBoard(kind), turn };
  const cells = [...board.cells];
  for (const [index, mark] of Object.entries(marks)) cells[Number(index)] = mark;
  return { ...board, cells };
};

describe("the games", () => {
  test("four games with plain names, in picker order", () => {
    expect(CAFE_GAME_ORDER.map((kind) => CAFE_GAMES[kind].label)).toEqual(["Four in a Row", "Tic-tac-toe", "Dots and Boxes", "Five in a Row"]);
    expect(isCafeGameKind("fourInARow")).toBe(true);
    expect(isCafeGameKind("chess")).toBe(false);
    expect(isCafeGameKind(3)).toBe(false);
  });

  test("boards start empty with the starter's turn", () => {
    expect(newBoard("fourInARow").cells).toHaveLength(42);
    expect(newBoard("ticTacToe")).toMatchObject({ turn: "a", missed: { a: 0, b: 0 } });
    expect(newBoard("dotsAndBoxes")).toMatchObject({ cells: Array(DOTS_LINES).fill(0), boxes: Array(16).fill(0) });
    expect(newBoard("fiveInARow").cells).toHaveLength(169);
    expect(gridOf("fiveInARow")).toEqual({ width: 13, height: 13, need: 5 });
    expect(otherSide("a")).toBe("b");
  });

  test("a move out of turn, off the board or on a taken spot is refused", () => {
    const board = newBoard("ticTacToe");
    expect(applyMove("ticTacToe", board, "b", 0)).toEqual({ ok: false, reason: "It's not your turn." });
    expect(applyMove("ticTacToe", board, "a", 9)).toMatchObject({ ok: false });
    expect(applyMove("ticTacToe", board, "a", -1)).toMatchObject({ ok: false });
    expect(applyMove("ticTacToe", board, "a", 1.5)).toMatchObject({ ok: false });
    const taken = ok(applyMove("ticTacToe", board, "a", 4)).board;
    expect(applyMove("ticTacToe", taken, "b", 4)).toEqual({ ok: false, reason: "You can't go there." });
  });
});

describe("lines", () => {
  test("finds a run through a cell in every direction, or none", () => {
    const across = withCells("fiveInARow", { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 });
    expect(lineThrough(across.cells, 13, 13, 2, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(lineThrough(across.cells, 13, 13, 2, 6)).toBeNull();
    expect(lineThrough(across.cells, 13, 13, 20, 5)).toBeNull();
  });
});

describe("Four in a Row", () => {
  test("a counter drops to the lowest free row", () => {
    const { board } = play("fourInARow", [3, 3]);
    expect(board.cells[5 * 7 + 3]).toBe(1);
    expect(board.cells[4 * 7 + 3]).toBe(2);
    expect(board.last).toBe(4 * 7 + 3);
    expect(dropRow(board.cells, 3)).toBe(3);
  });

  test("wins across, down and both diagonals", () => {
    expect(play("fourInARow", [0, 0, 1, 1, 2, 2, 3])).toMatchObject({ winner: "a", board: { line: [35, 36, 37, 38] } });
    expect(play("fourInARow", [0, 1, 0, 1, 0, 1, 0]).winner).toBe("a");
    expect(play("fourInARow", [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]).winner).toBe("a");
    expect(play("fourInARow", [6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3]).winner).toBe("a");
  });

  test("a full column and a bad column are refused", () => {
    const { board } = play("fourInARow", [0, 0, 0, 0, 0, 0]);
    expect(applyMove("fourInARow", board, board.turn, 0)).toEqual({ ok: false, reason: "That column is full." });
    expect(applyMove("fourInARow", board, board.turn, 7)).toMatchObject({ ok: false });
  });

  test("a full board with no line is a draw", () => {
    const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
    const { board, winner } = play("fourInARow", order);
    expect(board.cells.every((cell) => cell !== 0)).toBe(true);
    expect(winner).toBe("draw");
  });
});

describe("Tic-tac-toe", () => {
  test("three in a row across, down or diagonally wins the game", () => {
    expect(play("ticTacToe", [0, 3, 1, 4, 2])).toMatchObject({ winner: "a", board: { line: [0, 1, 2] } });
    expect(play("ticTacToe", [0, 1, 3, 2, 6])).toMatchObject({ winner: "a", board: { line: [0, 3, 6] } });
    expect(play("ticTacToe", [0, 1, 4, 2, 8])).toMatchObject({ winner: "a", board: { line: [0, 4, 8] } });
    expect(play("ticTacToe", [0, 2, 1, 4, 8, 6])).toMatchObject({ winner: "b", board: { line: [2, 4, 6] } });
  });

  test("a full board with no line is a draw, and the game ends there", () => {
    const { board, winner } = play("ticTacToe", [0, 1, 2, 4, 3, 5, 7, 6, 8]);
    expect(winner).toBe("draw");
    expect(board.cells.every((cell) => cell !== 0)).toBe(true);
  });
});

describe("Dots and Boxes", () => {
  test("lines and boxes line up", () => {
    expect(dotLine(0)).toEqual({ dir: "h", row: 0, col: 0 });
    expect(dotLine(19)).toEqual({ dir: "h", row: 4, col: 3 });
    expect(dotLine(20)).toEqual({ dir: "v", row: 0, col: 0 });
    expect(dotLine(39)).toEqual({ dir: "v", row: 3, col: 4 });
    expect(boxEdges(0)).toEqual([0, 4, 20, 21]);
    expect(boxEdges(15)).toEqual([15, 19, 38, 39]);
  });

  test("a line that closes no box passes the turn", () => {
    const { board } = play("dotsAndBoxes", [0]);
    expect(board).toMatchObject({ turn: "b", last: 0 });
    expect(board.cells[0]).toBe(1);
  });

  test("closing a box claims it and gives another turn", () => {
    const { board } = play("dotsAndBoxes", [0, 4, 20]);
    expect(board.turn).toBe("b");
    const closed = ok(applyMove("dotsAndBoxes", board, "b", 21)).board;
    expect(closed.boxes[0]).toBe(2);
    expect(closed.turn).toBe("b");
    expect(boxesWon(closed.boxes, "b")).toBe(1);
  });

  test("one line can close two boxes at once", () => {
    const marks = Object.fromEntries([0, 4, 20, 1, 5, 22].map((i) => [i, 1]));
    const board = withCells("dotsAndBoxes", marks, "a");
    const result = ok(applyMove("dotsAndBoxes", board, "a", 21)).board;
    expect(result.boxes.slice(0, 2)).toEqual([1, 1]);
    expect(result.turn).toBe("a");
  });

  test("the last line ends it: most boxes wins, an even split draws", () => {
    const allBut = (last: number, boxes: number[]) => ({
      ...withCells("dotsAndBoxes", Object.fromEntries(Array.from({ length: DOTS_LINES }, (_, i) => [i, i === last ? 0 : 1])), "a"),
      boxes,
    });
    const aAhead = allBut(39, [...Array(9).fill(1), ...Array(6).fill(2), 0]);
    expect(ok(applyMove("dotsAndBoxes", aAhead, "a", 39)).winner).toBe("a");
    const bAhead = allBut(39, [...Array(5).fill(1), ...Array(10).fill(2), 0]);
    expect(ok(applyMove("dotsAndBoxes", bAhead, "a", 39)).winner).toBe("b");
    const even = allBut(39, [...Array(7).fill(1), ...Array(8).fill(2), 0]);
    expect(ok(applyMove("dotsAndBoxes", even, "a", 39)).winner).toBe("draw");
  });
});

describe("Five in a Row", () => {
  test("five across, down or diagonally wins; four doesn't", () => {
    expect(play("fiveInARow", [0, 13, 1, 14, 2, 15, 3, 16]).winner).toBeUndefined();
    expect(play("fiveInARow", [0, 13, 1, 14, 2, 15, 3, 16, 4]).winner).toBe("a");
    expect(play("fiveInARow", [0, 1, 13, 2, 26, 3, 39, 4, 52]).winner).toBe("a");
    expect(play("fiveInARow", [0, 1, 14, 2, 28, 3, 42, 5, 56]).winner).toBe("a");
    expect(play("fiveInARow", [4, 0, 16, 1, 28, 2, 40, 3, 52]).winner).toBe("a");
  });

  test("a stone can go anywhere free, and a full board is a draw", () => {
    expect(applyMove("fiveInARow", newBoard("fiveInARow"), "a", 168)).toMatchObject({ ok: true });
    expect(applyMove("fiveInARow", newBoard("fiveInARow"), "a", 169)).toMatchObject({ ok: false });
    const almost = withCells("fiveInARow", Object.fromEntries(Array.from({ length: 168 }, (_, i) => [i, ((i % 13) + 2 * Math.floor(i / 13)) % 4 < 2 ? 1 : 2])));
    expect(ok(applyMove("fiveInARow", almost, "a", 168)).winner).toBe("draw");
  });
});

describe("missed turns", () => {
  test("one miss passes the turn; a second in a row loses; a move clears the count", () => {
    const first = missTurn(newBoard("fourInARow"));
    expect(first).toMatchObject({ lost: false, board: { turn: "b", missed: { a: 1, b: 0 } } });
    const moved = ok(applyMove("fourInARow", first.board, "b", 0)).board;
    const again = missTurn(moved);
    expect(again.lost).toBe(true);
    const cleared = ok(applyMove("fourInARow", again.board, "b", 1)).board;
    expect(cleared.missed.b).toBe(0);
  });
});

describe("tables and records", () => {
  test("the Café's stools group into tables; the couch isn't one", () => {
    expect(CAFE_TABLES).toEqual({
      "table-a": ["table-a-left", "table-a-right"],
      "table-b": ["table-b-left", "table-b-right"],
      "table-c": ["table-c-left", "table-c-right"],
    });
    expect(cafeTableOf("table-b-right")).toBe("table-b");
    expect(cafeTableOf("couch-0")).toBeNull();
    expect(cafeTableOf(undefined)).toBeNull();
  });

  test("a pair is the same either way round", () => {
    expect(pairKey("b@x", "a@x")).toBe(pairKey("a@x", "b@x"));
  });

  test("scores, tags and lines", () => {
    expect(recordScore({ wins: 5, losses: 2, draws: 0 })).toBe("5–2");
    expect(recordScore({ wins: 5, losses: 2, draws: 1 })).toBe("5–2–1");
    expect(playingTag("fourInARow", "Kate R.")).toBe("🔴 Four in a Row vs Kate R.");
    expect(playingTag("old", "Kate R.")).toBe("vs Kate R.");
    expect(playingLine("dotsAndBoxes")).toBe("Playing Dots and Boxes");
    expect(playingLine("old")).toBe("Playing a game");
  });
});
