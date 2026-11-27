import { StatusBar, type StatusBarProps } from "expo-status-bar";
import { NavigationContext } from "expo-router/react-navigation";
import { useContext, useEffect, useState } from "react";

/**
 * A status bar that only counts while its screen is in front. Status bars
 * stack: the last one mounted wins until it unmounts. A game stays mounted
 * under the Leaderboard it opens, or under any screen a link opens on top,
 * so its light bar (a dark sky, or the game-over scrim) stayed on the
 * cream screen in front. Outside a navigator (the offline games' modal)
 * it always counts.
 */
export const FocusedStatusBar = (props: StatusBarProps) => {
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
  return focused ? <StatusBar {...props} /> : null;
};
