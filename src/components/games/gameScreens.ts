import type { ComponentType } from "react";
import type { GameId } from "../../../shared/games";
import { FlappyGame } from "./FlappyGame";
import { RunnerGame } from "./RunnerGame";
import { ShooterGame } from "./ShooterGame";

export type GameScreenProps = { onExit: () => void; onLeaderboard?: () => void };

export const GAME_SCREENS: Record<GameId, ComponentType<GameScreenProps>> = {
  shooter: ShooterGame,
  runner: RunnerGame,
  flappy: FlappyGame,
};
