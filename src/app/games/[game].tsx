import { GAME_SCREENS } from "@/components/games/gameScreens";
import { backOr } from "@/lib/goBack";
import { E2E_BUILD } from "@/env";
import { isPatternKind, practiceStart } from "@/lib/games/runner";
import { isGliderPreview } from "@/lib/games/glider";
import { isGameId } from "@shared/games";
import { Redirect, useFocusEffect, useLocalSearchParams, useNavigation, useRouter, usePreventRemove } from "expo-router";
import { useCallback, useRef, useState } from "react";

export default function GameScreen() {
  const router = useRouter();
  const { game, preview, start } = useLocalSearchParams<{ game: string; preview?: string; start?: string }>();
  // Test builds can open Mystic Man on a still board of chosen obstacles
  // (?preview=double,hang), or Swoop on a still moment of a run
  // (?preview=dive), for screenshots. Never in a store build.
  const testBuild = __DEV__ || E2E_BUILD;
  const previewKinds = testBuild ? (preview ?? "").split(",").filter(isPatternKind) : [];
  const scene = testBuild && preview && isGliderPreview(preview) ? preview : undefined;
  const startScore = testBuild ? practiceStart(start) : undefined;
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
      scene={scene}
      startScore={startScore}
      guard={{ onPlayingChange: setPlaying, leaveAsks, onStay }}
      onExit={exit}
      onLeaderboard={() => router.push({ pathname: "/games/leaderboard", params: { game } })}
    />
  );
}
