import type { ComponentType } from "react";
import type { GameId } from "../../../shared/games";
import type { LeaveGuard } from "./GameFrame";
import type { PatternKind } from "@/lib/games/runner";
import { FlappyGame } from "./FlappyGame";
import { RunnerGame } from "./RunnerGame";
import { ShooterGame } from "./ShooterGame";

type GameScreenProps = {
  onExit: () => void;
  onLeaderboard?: () => void;
  /** False while another screen is in front: the game pauses and ignores keys. */
  active?: boolean;
  /** Confirms the iOS swipe and browser back during a run, on a route. */
  guard?: LeaveGuard;
  /** Test builds only: Mystic Man's still preview of these patterns. */
  preview?: readonly PatternKind[];
};

export const GAME_SCREENS: Record<GameId, ComponentType<GameScreenProps>> = {
  shooter: ShooterGame,
  runner: RunnerGame,
  flappy: FlappyGame,
};
