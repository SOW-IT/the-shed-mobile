import { Leaderboard } from "@/components/games/Leaderboard";
import { backOr } from "@/lib/goBack";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function LeaderboardScreen() {
  const router = useRouter();
  const { game } = useLocalSearchParams<{ game?: string }>();
  return (
    <Leaderboard
      initialGame={game}
      onBack={() => backOr(router, "/games")}
      onPlay={(next) => router.push(`/games/${next}`)}
    />
  );
}
