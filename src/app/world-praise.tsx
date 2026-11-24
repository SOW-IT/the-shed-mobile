import MusicScreen from "@/components/music/MusicScreen";
import { backOr } from "@/lib/goBack";
import { useRouter } from "expo-router";

export default function WorldPraiseScreen() {
  const router = useRouter();
  return <MusicScreen onBack={() => backOr(router, "/world")} />;
}
