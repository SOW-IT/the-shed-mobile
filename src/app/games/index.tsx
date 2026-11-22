import { GamesMenu } from "@/components/games/GamesMenu";
import { backOr } from "@/lib/goBack";
import { useRouter } from "expo-router";

export default function GamesScreen() {
  const router = useRouter();
  return (
    <GamesMenu
      onBack={() => backOr(router, "/profile")}
      onOpen={(target) => router.push(`/games/${target}`)}
    />
  );
}
