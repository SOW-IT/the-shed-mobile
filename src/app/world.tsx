import { SignInPrompt } from "@/components/SignInPrompt";
import { LoadingState, Screen } from "@/components/ui";
import { useRestartHold } from "@/hooks/useRestartHold";
import { backOr } from "@/lib/goBack";
import type { GameId } from "@shared/games";
import { useConvexAuth } from "convex/react";
import { type Href, useFocusEffect, useLocalSearchParams, useNavigation, usePreventRemove, useRouter } from "expo-router";
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
  const [awayGame, setAwayGame] = useState<GameId | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setAwayKind(null);
      setAwayGame(undefined);
      return () => setFocused(false);
    }, [])
  );
  useRestartHold(isAuthenticated && (focused || awayKind !== null));
  const [asking, setAsking] = useState(false);
  const held = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  // There's no swipe back out of the World (see the root layout): you leave
  // from its menu. Android's back and the browser's back ask first.
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
        awayGame={awayGame}
        onGame={(target) => {
          setAwayKind("arcade");
          setAwayGame(target === "leaderboard" ? undefined : target);
          if (target === "leaderboard") router.push("/games/leaderboard");
          else router.push({ pathname: "/games/[game]", params: { game: target } });
        }}
        onCalendar={() => {
          setAwayKind("browse");
          router.push("/world-calendar");
        }}
        onPraise={() => {
          setAwayKind("browse");
          router.push("/world-praise");
        }}
        onOpenLink={(url) => {
          setAwayKind("browse");
          // A notification's stored link; typed routes can't check it here.
          router.push(url as Href);
        }}
        onDevotional={() => {
          setAwayKind("devotional");
          router.push("/world-devotionals");
        }}
      />
    </Suspense>
  );
}
