import { SEATS } from "./world";

export const CAFE_GAMES = {
  fourInARow: { label: "Four in a Row", icon: "🔴" },
  ticTacToe: { label: "Tic-tac-toe", icon: "⭕" },
  dotsAndBoxes: { label: "Dots and Boxes", icon: "🔲" },
  fiveInARow: { label: "Five in a Row", icon: "⚫" },
} as const;
export type CafeGameKind = keyof typeof CAFE_GAMES;
export const CAFE_GAME_ORDER: readonly CafeGameKind[] = ["fourInARow", "ticTacToe", "dotsAndBoxes", "fiveInARow"];
export const isCafeGameKind = (value: unknown): value is CafeGameKind => typeof value === "string" && Object.hasOwn(CAFE_GAMES, value);
export const CAFE_PLACE = "cafe";

export const CAFE_TURN_MS = 60_000;
export const CAFE_CHALLENGE_MS = 30_000;
export const CAFE_AWAY_GRACE_MS = 20_000;
export const CAFE_QUIET_MS = 5 * 60_000;
export const CAFE_KEEP_MS = 2 * 60_000;
export const CAFE_WATCH_TOUCH_MS = 20_000;
export const CAFE_WATCH_WRITE_MS = CAFE_WATCH_TOUCH_MS / 2;
export const CAFE_WATCH_TTL_MS = 60_000;
const CAFE_MISSES_TO_LOSE = 2;

export type Side = "a" | "b";
export type Winner = Side | "draw";
export const otherSide = (side: Side): Side => (side === "a" ? "b" : "a");
const markOf = (side: Side) => (side === "a" ? 1 : 2);

export type CafeBoard = {
  cells: number[];
  boxes: number[];
  turn: Side;
  missed: { a: number; b: number };
  last?: number;
  line?: number[];
};

const GRIDS = {
  fourInARow: { width: 7, height: 6, need: 4 },
  ticTacToe: { width: 3, height: 3, need: 3 },
  fiveInARow: { width: 13, height: 13, need: 5 },
} as const;
export const gridOf = (kind: Exclude<CafeGameKind, "dotsAndBoxes">) => GRIDS[kind];

export const DOTS_BOXES = 4;
const H_LINES = (DOTS_BOXES + 1) * DOTS_BOXES;
export const DOTS_LINES = H_LINES * 2;

export const dotLine = (index: number) =>
  index < H_LINES
    ? { dir: "h" as const, row: Math.floor(index / DOTS_BOXES), col: index % DOTS_BOXES }
    : { dir: "v" as const, row: Math.floor((index - H_LINES) / (DOTS_BOXES + 1)), col: (index - H_LINES) % (DOTS_BOXES + 1) };

export const boxEdges = (box: number) => {
  const row = Math.floor(box / DOTS_BOXES);
  const col = box % DOTS_BOXES;
  return [row * DOTS_BOXES + col, (row + 1) * DOTS_BOXES + col, H_LINES + row * (DOTS_BOXES + 1) + col, H_LINES + row * (DOTS_BOXES + 1) + col + 1];
};

const boxesBeside = (line: number) => {
  const { dir, row, col } = dotLine(line);
  const near: number[] = [];
  if (dir === "h") {
    if (row > 0) near.push((row - 1) * DOTS_BOXES + col);
    if (row < DOTS_BOXES) near.push(row * DOTS_BOXES + col);
  } else {
    if (col > 0) near.push(row * DOTS_BOXES + col - 1);
    if (col < DOTS_BOXES) near.push(row * DOTS_BOXES + col);
  }
  return near;
};

const cellCount = (kind: CafeGameKind) => (kind === "dotsAndBoxes" ? DOTS_LINES : GRIDS[kind].width * GRIDS[kind].height);

export const newBoard = (kind: CafeGameKind): CafeBoard => ({
  cells: Array.from({ length: cellCount(kind) }, () => 0),
  boxes: kind === "dotsAndBoxes" ? Array.from({ length: DOTS_BOXES * DOTS_BOXES }, () => 0) : [],
  turn: "a",
  missed: { a: 0, b: 0 },
});

const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

export const lineThrough = (cells: readonly number[], width: number, height: number, index: number, need: number): number[] | null => {
  const mark = cells[index];
  if (!mark) return null;
  const x0 = index % width;
  const y0 = Math.floor(index / width);
  for (const [dx, dy] of DIRECTIONS) {
    const run = [index];
    for (const sign of [1, -1]) {
      let x = x0 + dx * sign;
      let y = y0 + dy * sign;
      while (x >= 0 && x < width && y >= 0 && y < height && cells[y * width + x] === mark) {
        run.push(y * width + x);
        x += dx * sign;
        y += dy * sign;
      }
    }
    if (run.length >= need) return run.sort((p, q) => p - q);
  }
  return null;
};

export const dropRow = (cells: readonly number[], column: number) => {
  const { width, height } = GRIDS.fourInARow;
  for (let row = height - 1; row >= 0; row--) if (cells[row * width + column] === 0) return row;
  return null;
};

type Refused = { ok: false; reason: string };
type Moved = { ok: true; board: CafeBoard; winner?: Winner };
export type MoveResult = Refused | Moved;

const refuse = (reason: string): Refused => ({ ok: false, reason });
const full = (cells: readonly number[]) => cells.every((cell) => cell !== 0);
const fresh = (board: CafeBoard, side: Side) => ({ ...board, missed: { ...board.missed, [side]: 0 } });

const placeOnGrid = (kind: Exclude<CafeGameKind, "dotsAndBoxes">, board: CafeBoard, side: Side, index: number): Moved => {
  const { width, height, need } = GRIDS[kind];
  const cells = [...board.cells];
  cells[index] = markOf(side);
  const line = lineThrough(cells, width, height, index, need);
  const next = { ...fresh(board, side), cells, last: index, turn: otherSide(side) };
  if (line) return { ok: true, board: { ...next, line }, winner: side };
  if (full(cells)) return { ok: true, board: next, winner: "draw" };
  return { ok: true, board: next };
};

export const boxesWon = (boxes: readonly number[], side: Side) => boxes.filter((box) => box === markOf(side)).length;

const drawLine = (board: CafeBoard, side: Side, index: number): Moved => {
  const cells = [...board.cells];
  cells[index] = markOf(side);
  const boxes = [...board.boxes];
  let claimed = 0;
  for (const box of boxesBeside(index)) {
    if (boxes[box] === 0 && boxEdges(box).every((edge) => cells[edge] !== 0)) {
      boxes[box] = markOf(side);
      claimed++;
    }
  }
  const next = { ...fresh(board, side), cells, boxes, last: index, turn: claimed > 0 ? side : otherSide(side) };
  if (!full(cells)) return { ok: true, board: next };
  const a = boxesWon(boxes, "a");
  const b = boxesWon(boxes, "b");
  return { ok: true, board: next, winner: a > b ? "a" : b > a ? "b" : "draw" };
};

export const applyMove = (kind: CafeGameKind, board: CafeBoard, side: Side, move: number): MoveResult => {
  if (board.turn !== side) return refuse("It's not your turn.");
  if (!Number.isInteger(move) || move < 0) return refuse("You can't go there.");
  if (kind === "fourInARow") {
    if (move >= GRIDS.fourInARow.width) return refuse("You can't go there.");
    const row = dropRow(board.cells, move);
    if (row === null) return refuse("That column is full.");
    return placeOnGrid(kind, board, side, row * GRIDS.fourInARow.width + move);
  }
  if (move >= board.cells.length || board.cells[move] !== 0) return refuse("You can't go there.");
  if (kind === "dotsAndBoxes") return drawLine(board, side, move);
  return placeOnGrid(kind, board, side, move);
};

export const missTurn = (board: CafeBoard): { board: CafeBoard; lost: boolean } => {
  const side = board.turn;
  const missed = { ...board.missed, [side]: board.missed[side] + 1 };
  return { board: { ...board, missed, turn: otherSide(side) }, lost: missed[side] >= CAFE_MISSES_TO_LOSE };
};

export const CAFE_TABLES: Readonly<Record<string, readonly string[]>> = SEATS.cafe.reduce<Record<string, string[]>>((tables, seat) => {
  const table = /^(table-[a-z]+)-/.exec(seat.id)?.[1];
  if (table) (tables[table] ??= []).push(seat.id);
  return tables;
}, {});

export const cafeTableOf = (seat: string | undefined) => {
  if (seat === undefined) return null;
  for (const [table, seats] of Object.entries(CAFE_TABLES)) if (seats.includes(seat)) return table;
  return null;
};

export const pairKey = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`);

type CafeRecord = { kind: string; wins: number; losses: number; draws: number };

export const recordScore = ({ wins, losses, draws }: Pick<CafeRecord, "wins" | "losses" | "draws">) =>
  draws > 0 ? `${wins}–${losses}–${draws}` : `${wins}–${losses}`;

export const playingTag = (kind: string, opponent: string) =>
  isCafeGameKind(kind) ? `${CAFE_GAMES[kind].icon} ${CAFE_GAMES[kind].label} vs ${opponent}` : `vs ${opponent}`;

export const playingLine = (kind: string) => (isCafeGameKind(kind) ? `Playing ${CAFE_GAMES[kind].label}` : "Playing a game");
