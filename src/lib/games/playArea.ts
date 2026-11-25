import type { GameId } from "../../../shared/games";
import type { Size } from "./fit";

export const GAME_VIEWS: Record<GameId, Size> = {
  flappy: { width: 390, height: 700 },
  shooter: { width: 390, height: 700 },
  runner: { width: 760, height: 340 },
  glider: { width: 760, height: 334 },
};

type PlayArea = { scale: number; width: number; height: number; left: number; top: number };

export const fitPlayArea = (room: Size, view: Size, chrome: number): PlayArea => {
  const scale = Math.max(0, Math.min(room.width / view.width, (room.height - chrome) / view.height));
  const width = view.width * scale;
  const height = view.height * scale + chrome;
  return { scale, width, height, left: (room.width - width) / 2, top: (room.height - height) / 2 };
};
