import { useOffline } from "@/hooks/useOffline";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { api } from "../../../convex/_generated/api";
import { PLAYING_BEAT_MS, type GameId } from "../../../shared/games";

const useForeground = () => {
  const [active, setActive] = useState(AppState.currentState !== "background");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setActive(state !== "background"));
    return () => sub.remove();
  }, []);
  return active;
};

/**
 * Shows you on the Games list as playing `game` while you're in it: marked on
 * going in and every PLAYING_BEAT_MS after, taken off on leaving, on putting
 * the phone away and while another screen (the leaderboard) covers the game.
 * Signed out or offline it sends nothing.
 */
export const useMarkPlaying = (game: GameId | null, active: boolean) => {
  const { isAuthenticated } = useConvexAuth();
  const offline = useOffline();
  const foreground = useForeground();
  const mark = useMutation(api.gamePlayers.playing);
  const leave = useMutation(api.gamePlayers.left);
  const on = game !== null && active && isAuthenticated && !offline && foreground;
  useEffect(() => {
    if (!on || game === null) return;
    const beat = () => {
      mark({ game }).catch(() => undefined);
    };
    beat();
    const id = setInterval(beat, PLAYING_BEAT_MS);
    return () => {
      clearInterval(id);
      leave({ game }).catch(() => undefined);
    };
  }, [on, game, mark, leave]);
};

export type NowPlaying = FunctionReturnType<typeof api.gamePlayers.nowPlaying>[number];

/** Who else is in each game right now, live; empty signed out or offline. */
export const useNowPlaying = () => {
  const { isAuthenticated } = useConvexAuth();
  const offline = useOffline();
  const rows = useQuery(api.gamePlayers.nowPlaying, isAuthenticated && !offline ? {} : "skip");
  const byGame: Partial<Record<GameId, NowPlaying>> = {};
  for (const row of rows ?? []) byGame[row.game] = row;
  return byGame;
};
