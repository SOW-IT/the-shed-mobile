import { describe, expect, test } from "vitest";
import { DOTS_BOXES, dropRow, newBoard } from "../../../shared/cafeGames";
import { columnAt, crossOf, dotsLayout, fiveLayout, fivePointAt, fourLayout, layoutFor, lineEnds, moveAt, nearestLine, ticTacToeCellAt, ticTacToeLayout, TRAY_BORDER } from "./cafePick";

const SIZE = 360;
const H_LINES = (DOTS_BOXES + 1) * DOTS_BOXES;

describe("four in a row", () => {
  const layout = fourLayout(SIZE);
  const inner = TRAY_BORDER + layout.pad;
  const xOf = (col: number) => inner + col * layout.cell + layout.cell / 2;

  test("the column under the finger, wherever it is up or down the board", () => {
    expect(layout).toMatchObject({ cell: 46, width: 7, height: 6 });
    expect(columnAt(layout, xOf(3), 20)).toBe(3);
    expect(columnAt(layout, xOf(3), inner + 5 * layout.cell)).toBe(3);
    expect(columnAt(layout, xOf(6), 40)).toBe(6);
  });

  test("the rim's padding counts as the nearest column, past the tray counts as off the board", () => {
    expect(columnAt(layout, 2, 40)).toBe(0);
    expect(columnAt(layout, inner * 2 + 7 * layout.cell - 1, 40)).toBe(6);
    expect(columnAt(layout, -1, 40)).toBeNull();
    expect(columnAt(layout, xOf(2), inner * 2 + 6 * layout.cell + 1)).toBeNull();
    expect(columnAt(layout, xOf(2), -3)).toBeNull();
  });

  test("the piece lands on the lowest empty row, and a full column takes nothing", () => {
    const board = newBoard("fourInARow");
    const shape = layoutFor("fourInARow", SIZE);
    expect(moveAt(shape, board, xOf(4), 30)).toBe(4);
    expect(dropRow(board.cells, 4)).toBe(5);
    const cells = [...board.cells];
    for (let row = 0; row < 6; row++) cells[row * 7 + 4] = row % 2 ? 1 : 2;
    cells[5 * 7 + 2] = 1;
    expect(dropRow(cells, 2)).toBe(4);
    expect(moveAt(shape, { cells }, xOf(4), 30)).toBeNull();
    expect(moveAt(shape, { cells }, xOf(2), 30)).toBe(2);
  });
});

describe("tic-tac-toe", () => {
  const layout = ticTacToeLayout(SIZE);
  const inner = TRAY_BORDER + layout.pad;
  const at = (slot: number) => inner + slot * layout.pitch + layout.cell / 2;

  test("the square under the finger, with each gap split between its neighbours", () => {
    expect(ticTacToeCellAt(layout, at(1), at(1))).toBe(4);
    expect(ticTacToeCellAt(layout, at(2), at(0))).toBe(2);
    expect(ticTacToeCellAt(layout, inner + layout.cell + layout.gap / 2 - 1, at(0))).toBe(0);
    expect(ticTacToeCellAt(layout, inner + layout.cell + layout.gap / 2 + 1, at(0))).toBe(1);
    expect(ticTacToeCellAt(layout, at(0), -1)).toBeNull();
  });

  test("a taken square takes nothing", () => {
    const shape = layoutFor("ticTacToe", SIZE);
    const cells = newBoard("ticTacToe").cells.map((_, i) => (i === 4 ? 1 : 0));
    expect(moveAt(shape, { cells }, at(1), at(1))).toBeNull();
    expect(moveAt(shape, { cells }, at(0), at(1))).toBe(3);
  });
});

describe("five in a row", () => {
  const layout = fiveLayout(SIZE);
  const inner = TRAY_BORDER + layout.pad;
  const at = (slot: number) => inner + slot * layout.cell + layout.cell / 2;

  test("the point under the finger, and the row and column through it", () => {
    expect(layout).toMatchObject({ n: 13, cell: 25, span: 325 });
    const index = fivePointAt(layout, at(9), at(6));
    expect(index).toBe(6 * 13 + 9);
    expect(crossOf(index!, 13)).toEqual({ row: 6, col: 9 });
    expect(crossOf(0, 13)).toEqual({ row: 0, col: 0 });
    expect(crossOf(168, 13)).toEqual({ row: 12, col: 12 });
  });

  test("the rim snaps to the edge points; past the tray, or on a stone, takes nothing", () => {
    expect(fivePointAt(layout, 1, 1)).toBe(0);
    expect(fivePointAt(layout, inner * 2 + layout.span, inner * 2 + layout.span)).toBe(168);
    expect(fivePointAt(layout, inner * 2 + layout.span + 1, at(3))).toBeNull();
    const shape = layoutFor("fiveInARow", SIZE);
    const cells = newBoard("fiveInARow").cells.map((_, i) => (i === 84 ? 2 : 0));
    expect(moveAt(shape, { cells }, at(6), at(6))).toBeNull();
    expect(moveAt(shape, { cells }, at(7), at(6))).toBe(85);
  });
});

describe("dots and boxes", () => {
  const layout = dotsLayout(SIZE);
  const local = (x: number, y: number) => [x + TRAY_BORDER, y + TRAY_BORDER] as const;
  const dot = (n: number) => layout.pad + n * layout.step;

  test("the stick nearest the finger, across or down", () => {
    expect(layout).toMatchObject({ step: 62, span: 300 });
    expect(nearestLine(layout, ...local(dot(0) + 30, dot(0) + 4))).toBe(0);
    expect(nearestLine(layout, ...local(dot(0) + 4, dot(0) + 30))).toBe(H_LINES);
    expect(nearestLine(layout, ...local(dot(2) + 31, dot(3) - 6))).toBe(3 * DOTS_BOXES + 2);
    expect(nearestLine(layout, ...local(dot(4) + 3, dot(1) + 20))).toBe(H_LINES + 1 * (DOTS_BOXES + 1) + 4);
  });

  test("near a corner peg, the stick it's closest along wins", () => {
    expect(nearestLine(layout, ...local(dot(1) + 12, dot(1) + 2))).toBe(1 * DOTS_BOXES + 1);
    expect(nearestLine(layout, ...local(dot(1) + 2, dot(1) + 12))).toBe(H_LINES + 1 * (DOTS_BOXES + 1) + 1);
  });

  test("stick ends run peg to peg", () => {
    expect(lineEnds(layout, 0)).toEqual({ from: { x: dot(0), y: dot(0) }, to: { x: dot(1), y: dot(0) } });
    expect(lineEnds(layout, H_LINES)).toEqual({ from: { x: dot(0), y: dot(0) }, to: { x: dot(0), y: dot(1) } });
  });

  test("a drawn stick or a point past the tray takes nothing", () => {
    const shape = layoutFor("dotsAndBoxes", SIZE);
    const cells = newBoard("dotsAndBoxes").cells.map((_, i) => (i === 0 ? 1 : 0));
    expect(moveAt(shape, { cells }, ...local(dot(0) + 30, dot(0) + 2))).toBeNull();
    expect(moveAt(shape, { cells }, ...local(dot(0) + 30, dot(1) - 2))).toBe(DOTS_BOXES);
    expect(nearestLine(layout, -1, 40)).toBeNull();
    expect(nearestLine(layout, 40, layout.span + TRAY_BORDER * 2 + 1)).toBeNull();
  });
});

describe("letting go", () => {
  test("letting go off the board places nothing, in every game", () => {
    for (const kind of ["fourInARow", "ticTacToe", "dotsAndBoxes", "fiveInARow"] as const) {
      const shape = layoutFor(kind, SIZE);
      const board = newBoard(kind);
      expect(moveAt(shape, board, -4, 60)).toBeNull();
      expect(moveAt(shape, board, 60, -4)).toBeNull();
      expect(moveAt(shape, board, SIZE + 40, 60)).toBeNull();
      expect(moveAt(shape, board, 60, SIZE + 40)).toBeNull();
      expect(moveAt(shape, board, 60, 60)).not.toBeNull();
    }
  });
});
