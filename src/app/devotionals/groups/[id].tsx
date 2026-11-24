import { DevotionalGroupScreen } from "@/components/devotionals/DevotionalGroupScreen";
import { backOr } from "@/lib/goBack";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Id } from "../../../../convex/_generated/dataModel";

export default function DevotionalGroupPage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <DevotionalGroupScreen
      groupId={(id ?? "") as Id<"devotionalGroups">}
      onBack={() => backOr(router, "/devotionals")}
    />
  );
}
