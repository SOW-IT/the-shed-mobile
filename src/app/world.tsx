import { SignInPrompt } from "@/components/SignInPrompt";
import { Btn, LoadingState, Muted, OptionSheet, Row, Screen } from "@/components/ui";
import { backOr } from "@/lib/goBack";
import { useConvexAuth } from "convex/react";
import { useFocusEffect, useLocalSearchParams, useNavigation, usePreventRemove, useRouter } from "expo-router";
import { lazy, Suspense, useCallback, useRef, useState } from "react";

// Loaded when someone opens the garden, not at startup. On web it's its own
// chunk; on iOS it's in the bundle but isn't run until now.
const WorldScreen = lazy(() => import("@/world/WorldScreen").then((m) => ({ default: m.WorldScreen })));

export default function World() {
  const router = useRouter();
  const navigation = useNavigation();
  // `?sheet=character` opens the character editor and `?sheet=poke` the list
  // of people to poke.
  const { sheet } = useLocalSearchParams<{ sheet?: string }>();
  const { isAuthenticated, isLoading } = useConvexAuth();
  // Leave the garden while another screen (the games) covers it; come back on return.
  const [focused, setFocused] = useState(true);
  const [atArcade, setAtArcade] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setAtArcade(false);
      return () => setFocused(false);
    }, [])
  );
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
      <Screen title="The Garden" onBack={() => backOr(router, "/games")}>
        <SignInPrompt what="garden" />
      </Screen>
    );
  }
  return (
    <Suspense fallback={<LoadingState />}>
      <WorldScreen
        active={focused || atArcade}
        away={atArcade && !focused}
        onBack={() => setAsking(true)}
        opening={sheet === "character" || sheet === "poke" ? sheet : undefined}
        onArcade={() => {
          setAtArcade(true);
          router.push("/games");
        }}
      />
      <OptionSheet
        visible={asking}
        title="Leave the garden?"
        onClose={stay}
        footer={
          <Row spread>
            <Btn title="Leave" variant="danger" onPress={leave} />
            <Btn title="Stay" onPress={stay} />
          </Row>
        }
      >
        <Muted>Everyone here will see you go. You can come back any time.</Muted>
      </OptionSheet>
    </Suspense>
  );
}
