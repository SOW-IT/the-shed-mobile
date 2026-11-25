import type { GameId } from "../../../shared/games";
import type { Size } from "./fit";

type ViewRule = {
  locked: "width" | "height";
  size: number;
  aspects: readonly [number, number];
};

export const GAME_VIEWS: Record<GameId, ViewRule> = {
  flappy: { locked: "width", size: 390, aspects: [0.43, 0.8] },
  shooter: { locked: "height", size: 700, aspects: [0.43, 0.6] },
  runner: { locked: "width", size: 760, aspects: [1.25, 2.35] },
  glider: { locked: "width", size: 760, aspects: [1.25, 2.35] },
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export const idealBoard = (room: Size, chrome: number, rule: ViewRule): Size => {
  const [narrowest, widest] = rule.aspects;
  const aspect = room.width / Math.max(1, room.height);
  if (rule.locked === "width") {
    const shown = rule.size / clamp(aspect, narrowest, widest);
    return { width: rule.size, height: Math.max(1, shown - chrome) };
  }
  return { width: (rule.size + chrome) * clamp(aspect, narrowest, widest), height: rule.size };
};

type PlayArea = { scale: number; width: number; height: number; left: number; top: number };

export const fitPlayArea = (room: Size, board: Size, chrome: number): PlayArea => {
  const scale = Math.max(0, Math.min(room.width / board.width, room.height / (board.height + chrome)));
  const width = board.width * scale;
  const height = (board.height + chrome) * scale;
  return { scale, width, height, left: (room.width - width) / 2, top: (room.height - height) / 2 };
};
