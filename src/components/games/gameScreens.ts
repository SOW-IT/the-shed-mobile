import type { ComponentType } from "react";
import type { GameId } from "../../../shared/games";
import type { LeaveGuard } from "./GameFrame";
import type { PatternKind } from "@/lib/games/runner";
import type { GliderPreview } from "@/lib/games/glider";
import type { HopPreview } from "@/lib/games/hop";
import { FlappyGame } from "./FlappyGame";
import { GliderGame } from "./GliderGame";
import { HopGame } from "./HopGame";
import { RunnerGame } from "./RunnerGame";
import { ShooterGame } from "./ShooterGame";

type GameScreenProps = {
  onExit: () => void;
  onLeaderboard?: () => void;
  /** False while another screen is in front: the game pauses and ignores keys. */
  active?: boolean;
  /** Confirms the browser's back during a run, on a route. */
  guard?: LeaveGuard;
  /** Test builds only: Mystic Man's still preview of these patterns. */
  preview?: readonly PatternKind[];
  startScore?: number;
  /** Test builds only: a still moment of a Swoop run. */
  scene?: GliderPreview;
  /** Test builds only: a still moment of a Hop run. */
  hopScene?: HopPreview;
  /** Test builds only: a Hop practice run that plays itself to this score, then falls off. */
  autoplay?: number;
};

export const GAME_SCREENS: Record<GameId, ComponentType<GameScreenProps>> = {
  shooter: ShooterGame,
  runner: RunnerGame,
  flappy: FlappyGame,
  glider: GliderGame,
  hop: HopGame,
};
