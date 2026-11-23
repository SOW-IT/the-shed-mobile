import { GAME_SCREENS } from "@/components/games/gameScreens";
import { backOr } from "@/lib/goBack";
import { E2E_BUILD } from "@/env";
import { isPatternKind } from "@/lib/games/runner";
import { isGameId } from "@shared/games";
import { Redirect, useFocusEffect, useLocalSearchParams, useNavigation, useRouter, usePreventRemove } from "expo-router";
import { useCallback, useRef, useState } from "react";

export default function GameScreen() {
  const router = useRouter();
  const { game, preview } = useLocalSearchParams<{ game: string; preview?: string }>();
  // Test builds can open Mystic Man on a still board of chosen obstacles
  // (?preview=double,hang) for screenshots. Never in a store build.
  const previewKinds = __DEV__ || E2E_BUILD ? (preview ?? "").split(",").filter(isPatternKind) : [];
  // The leaderboard opens on top of the game; the game waits behind it.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  // There's no swipe back from a game (see the root layout). During a run,
  // the browser's back is held until the player confirms in the game's own
  // dialog, the same as the back button.
  const navigation = useNavigation();
  const [playing, setPlaying] = useState(false);
  const [leaveAsks, setLeaveAsks] = useState(0);
  const blocked = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const disablePrevention = usePreventRemove(playing, ({ data }) => {
    blocked.current = data.action;
    setLeaveAsks((n) => n + 1);
  });
  const exit = () => {
    const action = blocked.current;
    blocked.current = null;
    disablePrevention();
    if (action) navigation.dispatch(action);
    else backOr(router, "/games");
  };
  const onStay = useCallback(() => {
    blocked.current = null;
  }, []);
  if (!isGameId(game)) return <Redirect href="/games" />;
  const Game = GAME_SCREENS[game];
  return (
    <Game
      active={focused}
      preview={previewKinds.length ? previewKinds : undefined}
      guard={{ onPlayingChange: setPlaying, leaveAsks, onStay }}
      onExit={exit}
      onLeaderboard={() => router.push({ pathname: "/games/leaderboard", params: { game } })}
    />
  );
}
