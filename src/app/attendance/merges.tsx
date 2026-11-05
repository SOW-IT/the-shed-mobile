import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { api } from "@convex/_generated/api";
import { MergesTab } from "@/components/attendance/MergesTab";
import { LoadingState, Muted, Screen } from "@/components/ui";

export default function MergesScreen() {
  const router = useRouter();
  const me = useQuery(api.directory.me);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/attendance"));
  return (
    <Screen title="Possible duplicates" onBack={goBack}>
      {me === undefined ? (
        <LoadingState />
      ) : me?.profile ? (
        <MergesTab staffYear={me.year} />
      ) : (
        <Muted>Only staff and campus leaders can merge members.</Muted>
      )}
    </Screen>
  );
}
