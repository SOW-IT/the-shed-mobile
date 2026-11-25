import { DevotionalsScreen } from "@/components/devotionals/DevotionalsScreen";
import { backOr } from "@/lib/goBack";
import { useRouter } from "expo-router";

export default function WorldDevotionalsScreen() {
  const router = useRouter();
  return <DevotionalsScreen onBack={() => backOr(router, "/world")} />;
}
