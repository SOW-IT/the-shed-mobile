import { GAME_SCREENS } from "@/components/games/gameScreens";
import { backOr } from "@/lib/goBack";
import { isGameId } from "@shared/games";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";

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
  if (!isGameId(game)) return <Redirect href="/games" />;
  const Game = GAME_SCREENS[game];
  return (
    <Game
      active={focused}
      onExit={() => backOr(router, "/games")}
      onLeaderboard={() => router.push({ pathname: "/games/leaderboard", params: { game } })}
    />
  );
}
