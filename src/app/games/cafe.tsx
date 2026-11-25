import { CafeTableGames } from "@/components/games/CafeTableGames";
import { backOr } from "@/lib/goBack";
import { useRouter } from "expo-router";

export default function CafeGamesScreen() {
  const router = useRouter();
  return <CafeTableGames onExit={() => backOr(router, "/games")} />;
}
