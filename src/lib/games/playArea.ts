import type { GameId } from "../../../shared/games";
import type { Size } from "./fit";

type ViewRule = {
  locked: "width" | "height";
  size: number;
  aspects: readonly [number, number];
  scenery?: readonly [number, number];
};

export const GAME_VIEWS: Record<GameId, ViewRule> = {
  flappy: { locked: "width", size: 390, aspects: [0.43, 0.5625] },
  shooter: { locked: "height", size: 700, aspects: [0.43, 0.6] },
  runner: { locked: "width", size: 760, aspects: [1.25, 2.35] },
  glider: { locked: "width", size: 760, aspects: [1.25, 1.95], scenery: [1.25, 2.35] },
  hop: { locked: "width", size: 390, aspects: [0.43, 0.5625] },
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

type Insets = { top: number; right: number; bottom: number; left: number };

export type Reach = { left: number; top: number; right: number; bottom: number };

export const decoration = (room: Size, insets: Insets, area: PlayArea, chrome: number, aspects: readonly [number, number]) => {
  const screenWidth = room.width + insets.left + insets.right;
  const screenHeight = room.height + insets.top + insets.bottom;
  const width = Math.min(screenWidth, screenHeight * aspects[1]);
  const height = Math.min(screenHeight, width / aspects[0]);
  const left = clamp(area.left + area.width / 2 - width / 2, -insets.left, room.width + insets.right - width);
  const top = clamp(area.top + area.height / 2 - height / 2, -insets.top, room.height + insets.bottom - height);
  const boardTop = area.top + chrome * area.scale;
  const per = area.scale > 0 ? 1 / area.scale : 0;
  const reach: Reach = {
    left: Math.max(0, (area.left - left) * per),
    top: Math.max(0, (boardTop - top) * per),
    right: Math.max(0, (left + width - area.left - area.width) * per),
    bottom: Math.max(0, (top + height - area.top - area.height) * per),
  };
  return { left, top, width, height, reach };
};
