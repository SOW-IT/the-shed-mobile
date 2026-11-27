import { CafeTableGames } from "@/components/games/CafeTableGames";
import { backOr } from "@/lib/goBack";
import { useNavigation, usePreventRemove, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";

export default function CafeGamesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  // The browser's back and the iOS swipe back are held, always, and asked
  // about in the screen's own dialog, the same as its back button.
  const [asks, setAsks] = useState(0);
  const held = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const letGo = usePreventRemove(true, ({ data }) => {
    held.current = data.action;
    setAsks((n) => n + 1);
  });
  const exit = () => {
    const action = held.current;
    held.current = null;
    letGo();
    if (action) navigation.dispatch(action);
    else backOr(router, "/games");
  };
  const onStay = useCallback(() => {
    held.current = null;
  }, []);
  return <CafeTableGames onExit={exit} guard={{ asks, onStay }} />;
}
