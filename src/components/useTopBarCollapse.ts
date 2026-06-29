import { useCallback, useRef, useState } from "react";
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ViewStyle,
} from "react-native";

const TOP_BAR_HEIGHT = 56;
const HIDE_DELTA = 10;
const SHOW_DELTA = 6;
const SHOW_AT_TOP_OFFSET = 16;
const ANIMATION_MS = 160;

export type TopBarScrollProps = {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
};

export const useTopBarCollapse = () => {
  const [progress] = useState(() => new Animated.Value(1));
  const visible = useRef(true);
  const lastY = useRef(0);

  const setVisible = useCallback(
    (next: boolean) => {
      if (visible.current === next) return;
      visible.current = next;
      Animated.timing(progress, {
        toValue: next ? 1 : 0,
        duration: ANIMATION_MS,
        useNativeDriver: false,
      }).start();
    },
    [progress]
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = Math.max(0, event.nativeEvent.contentOffset.y);
      const delta = y - lastY.current;
      if (y <= SHOW_AT_TOP_OFFSET) {
        setVisible(true);
      } else if (delta > HIDE_DELTA) {
        setVisible(false);
      } else if (delta < -SHOW_DELTA) {
        setVisible(true);
      }
      lastY.current = y;
    },
    [setVisible]
  );

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
          outputRange: [-12, 0],
        }),
      },
    ],
  };

  const showTopBar = useCallback(() => setVisible(true), [setVisible]);

  return {
    topBarStyle,
    scrollProps: { onScroll, scrollEventThrottle: 16 },
    showTopBar,
  };
};
