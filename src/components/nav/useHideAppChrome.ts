import { NavigationContext } from "expo-router/react-navigation";
import { useContext, useEffect, useState } from "react";
import { holdAppChrome } from "./appChrome";

/**
 * Hides the app's chrome while `on`, this is mounted, and its screen is in
 * front: a route pushed over it (a link from chat, say) gets its sidebar
 * and drawer back while it covers the screen. Outside a navigator it
 * always counts.
 */
export const useHideAppChrome = (on: boolean) => {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    const offFocus = navigation.addListener("focus", () => setFocused(true));
    const offBlur = navigation.addListener("blur", () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  const hold = on && focused;
  useEffect(() => (hold ? holdAppChrome() : undefined), [hold]);
};
