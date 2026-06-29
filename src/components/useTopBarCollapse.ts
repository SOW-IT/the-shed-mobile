import { useCallback, useRef, useState } from "react";
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ViewStyle,
} from "react-native";

export const TOP_BAR_HEIGHT = 56;

export type TopBarScrollProps = {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
};

export const useTopBarCollapse = () => {
  const [progress] = useState(() => new Animated.Value(1));
  const collapsedY = useRef(0);

  // The bar is pinned to the top of the content: its collapse tracks the
  // absolute scroll offset (shrinking over the first TOP_BAR_HEIGHT px and
  // growing back as the content scrolls toward the top), rather than scroll
  // *direction*. Tying it to the offset keeps the bar's bottom edge exactly
  // flush with the sticky search bar pinned just below it — so a mid-list
  // scroll-up no longer reveals the bar on top of that search bar. Callers with
  // several independently-scrolled pages (PagerScreen) re-sync this to the
  // active page's offset on tab change so the bar always matches what's shown.
  const syncToScrollY = useCallback(
    (y: number) => {
      const clamped = Math.max(0, Math.min(TOP_BAR_HEIGHT, y));
      if (clamped === collapsedY.current) return;
      collapsedY.current = clamped;
      progress.setValue(1 - clamped / TOP_BAR_HEIGHT);
    },
    [progress]
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncToScrollY(Math.max(0, event.nativeEvent.contentOffset.y));
    },
    [syncToScrollY]
  );

  // The bar floats over a fixed, full-height body (see ChromeScreen/PagerScreen),
  // so collapsing must shrink the bar's own height to 0 — that lets anything
  // stacked below it in the chrome (the tab bar) rise into the freed space while
  // the body underneath never moves. translateY + opacity slide and fade the bar
  // content out as the box closes.
  const topBarStyle: Animated.WithAnimatedObject<ViewStyle> = {
    height: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, TOP_BAR_HEIGHT],
    }),
    opacity: progress,
    overflow: "hidden",
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-TOP_BAR_HEIGHT, 0],
        }),
      },
    ],
  };

  return {
    topBarStyle,
    scrollProps: { onScroll, scrollEventThrottle: 16 },
    /** Snap the bar to a specific scroll offset (e.g. the active page's on tab change). */
    syncToScrollY,
  };
};
