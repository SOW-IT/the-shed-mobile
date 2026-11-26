import { DOTS_BOXES, DOTS_LINES, dotLine, dropRow, gridOf, type CafeBoard, type CafeGameKind } from "../../../shared/cafeGames";

export const TRAY_BORDER = 2.5;

export type FourLayout = { pad: number; cell: number; disc: number; width: number; height: number };
export type TicTacToeLayout = { pad: number; gap: number; cell: number; pitch: number };
export type DotsLayout = { pad: number; step: number; span: number };
export type FiveLayout = { pad: number; cell: number; n: number; span: number; stone: number };

export const fourLayout = (size: number): FourLayout => {
  const { width, height } = gridOf("fourInARow");
  const pad = 12;
  const cell = Math.min(46, Math.floor((size - pad * 2 - 2) / width));
  return { pad, cell, disc: Math.round(cell * 0.79), width, height };
};

export const ticTacToeLayout = (size: number): TicTacToeLayout => {
  const pad = 12;
  const gap = 10;
  const cell = Math.min(84, Math.floor((size - pad * 2 - gap * 2 - 5) / 3));
  return { pad, gap, cell, pitch: cell + gap };
};

export const dotsLayout = (size: number): DotsLayout => {
  const pad = 26;
  const step = Math.min(62, Math.floor((size - pad * 2 - 2) / DOTS_BOXES));
  return { pad, step, span: step * DOTS_BOXES + pad * 2 };
};

export const fiveLayout = (size: number): FiveLayout => {
  const { width: n } = gridOf("fiveInARow");
  const pad = 14;
  const cell = Math.floor((size - pad * 2 - 2) / n);
  return { pad, cell, n, span: cell * n, stone: Math.round(cell * 0.84) };
};

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

const within = (x: number, y: number, outerWidth: number, outerHeight: number) => x >= 0 && y >= 0 && x <= outerWidth && y <= outerHeight;

const slotAt = (offset: number, pitch: number, count: number) => clamp(Math.floor(offset / pitch), 0, count - 1);

export const columnAt = (layout: FourLayout, x: number, y: number) => {
  const inner = TRAY_BORDER + layout.pad;
  const outerWidth = inner * 2 + layout.width * layout.cell;
  const outerHeight = inner * 2 + layout.height * layout.cell;
  return within(x, y, outerWidth, outerHeight) ? slotAt(x - inner, layout.cell, layout.width) : null;
};

export const ticTacToeCellAt = (layout: TicTacToeLayout, x: number, y: number) => {
  const inner = TRAY_BORDER + layout.pad;
  const outer = inner * 2 + layout.cell * 3 + layout.gap * 2;
  if (!within(x, y, outer, outer)) return null;
  const half = layout.gap / 2;
  return slotAt(y - inner + half, layout.pitch, 3) * 3 + slotAt(x - inner + half, layout.pitch, 3);
};

export const fivePointAt = (layout: FiveLayout, x: number, y: number) => {
  const inner = TRAY_BORDER + layout.pad;
  const outer = inner * 2 + layout.span;
  if (!within(x, y, outer, outer)) return null;
  return slotAt(y - inner, layout.cell, layout.n) * layout.n + slotAt(x - inner, layout.cell, layout.n);
};

export const lineEnds = (layout: DotsLayout, index: number) => {
  const { dir, row, col } = dotLine(index);
  const from = { x: layout.pad + col * layout.step, y: layout.pad + row * layout.step };
  return dir === "h" ? { from, to: { x: from.x + layout.step, y: from.y } } : { from, to: { x: from.x, y: from.y + layout.step } };
};

const distanceToLine = (layout: DotsLayout, index: number, x: number, y: number) => {
  const { from, to } = lineEnds(layout, index);
  const nearX = clamp(x, from.x, to.x);
  const nearY = clamp(y, from.y, to.y);
  return Math.hypot(x - nearX, y - nearY);
};

export const nearestLine = (layout: DotsLayout, x: number, y: number) => {
  const outer = layout.span + TRAY_BORDER * 2;
  if (!within(x, y, outer, outer)) return null;
  const localX = x - TRAY_BORDER;
  const localY = y - TRAY_BORDER;
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < DOTS_LINES; index++) {
    const distance = distanceToLine(layout, index, localX, localY);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
};

export type CafeLayout =
  | { kind: "fourInARow"; layout: FourLayout }
  | { kind: "ticTacToe"; layout: TicTacToeLayout }
  | { kind: "dotsAndBoxes"; layout: DotsLayout }
  | { kind: "fiveInARow"; layout: FiveLayout };

export const layoutFor = (kind: CafeGameKind, size: number): CafeLayout => {
  if (kind === "fourInARow") return { kind, layout: fourLayout(size) };
  if (kind === "ticTacToe") return { kind, layout: ticTacToeLayout(size) };
  if (kind === "dotsAndBoxes") return { kind, layout: dotsLayout(size) };
  return { kind, layout: fiveLayout(size) };
};

const spotAt = (shape: CafeLayout, x: number, y: number) => {
  if (shape.kind === "fourInARow") return columnAt(shape.layout, x, y);
  if (shape.kind === "ticTacToe") return ticTacToeCellAt(shape.layout, x, y);
  if (shape.kind === "dotsAndBoxes") return nearestLine(shape.layout, x, y);
  return fivePointAt(shape.layout, x, y);
};

export const moveAt = (shape: CafeLayout, board: Pick<CafeBoard, "cells">, x: number, y: number) => {
  const spot = spotAt(shape, x, y);
  if (spot === null) return null;
  if (shape.kind === "fourInARow") return dropRow(board.cells, spot) === null ? null : spot;
  return board.cells[spot] === 0 ? spot : null;
};

export const crossOf = (index: number, n: number) => ({ row: Math.floor(index / n), col: index % n });
