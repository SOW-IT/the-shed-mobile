import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { api } from "@convex/_generated/api";
import { FinanceSettingsPanel } from "@/components/finance/FinanceSettings";
import { LoadingState, Screen } from "@/components/ui";
import { backOr } from "@/lib/goBack";

export default function FinanceSettingsScreen() {
  const router = useRouter();
  const me = useQuery(api.directory.me);
  const goBack = () => backOr(router, "/");
  return (
    <Screen title="Finance settings" onBack={goBack}>
      {me === undefined ? <LoadingState /> : <FinanceSettingsPanel currentYear={me?.year ?? new Date().getFullYear()} />}
    </Screen>
  );
}
