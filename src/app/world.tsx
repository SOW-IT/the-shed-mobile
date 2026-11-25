import { SignInPrompt } from "@/components/SignInPrompt";
import { LoadingState, Screen } from "@/components/ui";
import { useRestartHold } from "@/hooks/useRestartHold";
import { backOr } from "@/lib/goBack";
import { useConvexAuth } from "convex/react";
import { useFocusEffect, useLocalSearchParams, useNavigation, usePreventRemove, useRouter } from "expo-router";
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";

// Loaded when someone opens the garden, not at startup. On web it's its own
// chunk; on iOS it's in the bundle but isn't run until now.
const WorldScreen = lazy(() => import("@/world/WorldScreen").then((m) => ({ default: m.WorldScreen })));

type AwayKind = "arcade" | "devotional" | "browse";

export default function World() {
  const router = useRouter();
  const navigation = useNavigation();
  // `?sheet=character` opens the character editor and `?sheet=poke` the list
  // of people to poke.
  const { sheet, poke, invite } = useLocalSearchParams<{ sheet?: string; poke?: string; invite?: string }>();
  const arrival = useMemo(() => (poke || invite ? { poke: poke || undefined, invite: invite || undefined } : undefined), [poke, invite]);
  const { isAuthenticated, isLoading } = useConvexAuth();
  // Leave the garden while another screen (the games) covers it; come back on return.
  const [focused, setFocused] = useState(true);
  const [awayKind, setAwayKind] = useState<AwayKind | null>(null);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setAwayKind(null);
      return () => setFocused(false);
    }, [])
  );
  useRestartHold(isAuthenticated && (focused || awayKind !== null));
  const [asking, setAsking] = useState(false);
  const held = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const letGo = usePreventRemove(isAuthenticated, ({ data }) => {
    held.current = data.action;
    setAsking(true);
  });
  const leave = () => {
    const action = held.current;
    held.current = null;
    setAsking(false);
    letGo();
    if (action) navigation.dispatch(action);
    else backOr(router, "/games");
  };
  const stay = () => {
    held.current = null;
    setAsking(false);
  };
  if (isLoading) return <LoadingState />;
  if (!isAuthenticated) {
    return (
      <Screen title="World" onBack={() => backOr(router, "/games")}>
        <SignInPrompt what="world" />
      </Screen>
    );
  }
  return (
    <Suspense fallback={<LoadingState />}>
      <WorldScreen
        active={focused || awayKind !== null}
        awayKind={awayKind && !focused ? awayKind : null}
        onBack={() => setAsking(true)}
        leaveAsked={asking}
        onStay={stay}
        onLeave={leave}
        arrival={arrival}
        opening={sheet === "character" || sheet === "poke" ? sheet : undefined}
        onArcade={() => {
          setAwayKind("arcade");
          router.push("/games");
        }}
        onCalendar={() => {
          setAwayKind("browse");
          router.push("/world-calendar");
        }}
        onPraise={() => {
          setAwayKind("browse");
          router.push("/world-praise");
        }}
        onDevotional={() => {
          setAwayKind("devotional");
          router.push("/world-devotionals");
        }}
      />
    </Suspense>
  );
}
