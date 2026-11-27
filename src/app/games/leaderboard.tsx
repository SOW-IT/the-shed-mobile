import { Leaderboard } from "@/components/games/Leaderboard";
import { routesToPlay } from "@/lib/games/gameStack";
import { backOr } from "@/lib/goBack";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { CommonActions } from "expo-router/react-navigation";

export default function LeaderboardScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { game } = useLocalSearchParams<{ game?: string }>();
  // Play swaps the game and this leaderboard for the new game, so going
  // leaderboard → game → leaderboard → game never piles up screens, and back
  // from any game is the menu.
  const play = (next: string) => {
    const state = navigation.getState();
    if (!state) return router.push(`/games/${next}`);
    const routes = routesToPlay(state.routes, next);
    navigation.dispatch(CommonActions.reset({ ...state, routes, index: routes.length - 1 }));
  };
  // A link to this screen while it's open (a "just beat you" push, or the
  // same link with another game) keeps the screen and changes only its
  // params. The tab is picked once, on mount, so a new game starts it again.
  return <Leaderboard key={game ?? ""} initialGame={game} onBack={() => backOr(router, "/games")} onPlay={play} />;
}
