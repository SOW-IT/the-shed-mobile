import { DevotionalEditor } from "@/components/devotionals/DevotionalEditor";
import { backOr } from "@/lib/goBack";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function DevotionalDayPage() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();
  return <DevotionalEditor date={date ?? ""} onBack={() => backOr(router, "/devotionals")} />;
}
