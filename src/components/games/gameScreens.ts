import type { ComponentType } from "react";
import type { GameId } from "../../../shared/games";
import { FlappyGame } from "./FlappyGame";
import { RunnerGame } from "./RunnerGame";
import { ShooterGame } from "./ShooterGame";

type GameScreenProps = {
  onExit: () => void;
  onLeaderboard?: () => void;
  /** False while another screen is in front: the game pauses and ignores keys. */
  active?: boolean;
};

export const GAME_SCREENS: Record<GameId, ComponentType<GameScreenProps>> = {
  shooter: ShooterGame,
  runner: RunnerGame,
  flappy: FlappyGame,
};
