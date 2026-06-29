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
  const lastY = useRef(0);
  const rebaselineOnNextScroll = useRef(false);

  const setCollapsedY = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(TOP_BAR_HEIGHT, next));
      if (clamped === collapsedY.current) return;
      collapsedY.current = clamped;
      progress.setValue(1 - clamped / TOP_BAR_HEIGHT);
    },
    [progress]
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = Math.max(0, event.nativeEvent.contentOffset.y);
      if (rebaselineOnNextScroll.current) {
        rebaselineOnNextScroll.current = false;
        lastY.current = y;
        return;
      }

      const delta = y - lastY.current;
      if (y < TOP_BAR_HEIGHT) {
        // Within one bar-height of the top: drive collapsedY purely from scroll
        // position, mirroring how the sticky search bar tracks the page top.
        setCollapsedY(y);
      } else if (delta > 0) {
        // Only collapse on scroll-down; mid-page scroll-up does not re-expand
        // the bar — it would slide over any sticky header already pinned below
        // the tab bar. The bar re-appears only when the user returns to the top.
        setCollapsedY(collapsedY.current + delta);
      }
      lastY.current = y;
    },
    [setCollapsedY]
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

  const showTopBar = useCallback(() => {
    rebaselineOnNextScroll.current = true;
    setCollapsedY(0);
  }, [setCollapsedY]);

  return {
    topBarStyle,
    scrollProps: { onScroll, scrollEventThrottle: 16 },
    showTopBar,
  };
};
