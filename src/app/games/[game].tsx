import { GAME_SCREENS } from "@/components/games/gameScreens";
import { backOr } from "@/lib/goBack";
import { isGameId } from "@shared/games";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

export default function GameScreen() {
  const router = useRouter();
  const { game } = useLocalSearchParams<{ game: string }>();
  if (!isGameId(game)) return <Redirect href="/games" />;
  const Game = GAME_SCREENS[game];
  return (
    <Game
      onExit={() => backOr(router, "/games")}
      onLeaderboard={() => router.push({ pathname: "/games/leaderboard", params: { game } })}
    />
  );
}
