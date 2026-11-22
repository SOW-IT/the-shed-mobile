import { SignInPrompt } from "@/components/SignInPrompt";
import { LoadingState, Screen } from "@/components/ui";
import { backOr } from "@/lib/goBack";
import { useConvexAuth } from "convex/react";
import { useRouter } from "expo-router";
import { lazy, Suspense } from "react";

// Loaded when someone opens the garden, not at startup. On web it's its own
// chunk; on iOS it's in the bundle but isn't run until now.
const WorldScreen = lazy(() => import("@/world/WorldScreen").then((m) => ({ default: m.WorldScreen })));

export default function World() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const back = () => backOr(router, "/games");
  if (isLoading) return <LoadingState />;
  if (!isAuthenticated) {
    return (
      <Screen title="The Garden" onBack={back}>
        <SignInPrompt what="garden" />
      </Screen>
    );
  }
  return (
    <Suspense fallback={<LoadingState />}>
      <WorldScreen onBack={back} onArcade={() => router.push("/games")} />
    </Suspense>
  );
}
