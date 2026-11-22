import { GAME_SCREENS } from "@/components/games/gameScreens";
import { backOr } from "@/lib/goBack";
import { isGameId } from "@shared/games";
import { Redirect, useFocusEffect, useLocalSearchParams, useNavigation, useRouter, usePreventRemove } from "expo-router";
import { useCallback, useRef, useState } from "react";

export default function GameScreen() {
  const router = useRouter();
  const { game } = useLocalSearchParams<{ game: string }>();
  // The leaderboard opens on top of the game; the game waits behind it.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  // During a run, the iOS swipe and the browser's back are held until the
  // player confirms in the game's own dialog.
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
      guard={{ onPlayingChange: setPlaying, leaveAsks, onStay }}
      onExit={exit}
      onLeaderboard={() => router.push({ pathname: "/games/leaderboard", params: { game } })}
    />
  );
}
