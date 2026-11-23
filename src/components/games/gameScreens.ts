import type { ComponentType } from "react";
import type { GameId } from "../../../shared/games";
import type { LeaveGuard } from "./GameFrame";
import { FlappyGame } from "./FlappyGame";
import { RunnerGame } from "./RunnerGame";
import { ShooterGame } from "./ShooterGame";

type GameScreenProps = {
  onExit: () => void;
  onLeaderboard?: () => void;
  /** False while another screen is in front: the game pauses and ignores keys. */
  active?: boolean;
  /** Confirms the browser's back during a run, on a route. */
  guard?: LeaveGuard;
};

export const GAME_SCREENS: Record<GameId, ComponentType<GameScreenProps>> = {
  shooter: ShooterGame,
  runner: RunnerGame,
  flappy: FlappyGame,
};
