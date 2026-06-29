import { useCallback, useRef, useState } from "react";
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ViewStyle,
} from "react-native";

const TOP_BAR_HEIGHT = 56;
const SHOW_AT_TOP_OFFSET = 16;

export type TopBarScrollProps = {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
};

export const useTopBarCollapse = () => {
  const [progress] = useState(() => new Animated.Value(1));
  const collapsedY = useRef(0);
  const lastY = useRef(0);

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
      const delta = y - lastY.current;
      if (y <= SHOW_AT_TOP_OFFSET) {
        setCollapsedY(0);
      } else if (delta !== 0) {
        setCollapsedY(collapsedY.current + delta);
      }
      lastY.current = y;
    },
    [setCollapsedY]
  );

  const topBarStyle: Animated.WithAnimatedObject<ViewStyle> = {
    height: TOP_BAR_HEIGHT,
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
    lastY.current = 0;
    setCollapsedY(0);
  }, [setCollapsedY]);

  return {
    topBarStyle,
    scrollProps: { onScroll, scrollEventThrottle: 16 },
    showTopBar,
  };
};
