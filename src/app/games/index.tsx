import { GamesMenu } from "@/components/games/GamesMenu";
import { backOr } from "@/lib/goBack";
import { useNavigation, useRouter } from "expo-router";

export default function GamesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const openGarden = () => {
    const routes = navigation.getState()?.routes ?? [];
    if (routes[routes.length - 2]?.name === "world") router.back();
    else router.push("/world");
  };
  return (
    <GamesMenu
      onBack={() => backOr(router, "/profile")}
      onOpen={(target) => router.push(`/games/${target}`)}
      onGarden={openGarden}
    />
  );
}
