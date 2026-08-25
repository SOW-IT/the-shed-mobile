import type { ComponentProps } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ViewStyle,
} from "react-native";

export const TOP_BAR_HEIGHT = 56;

type AnimatedScrollViewProps = ComponentProps<typeof Animated.ScrollView>;

export type TopBarScrollProps = {
  onScroll: AnimatedScrollViewProps["onScroll"];
  scrollEventThrottle: number;
};

export const useTopBarCollapse = () => {
  const [scrollY] = useState(() => new Animated.Value(0));

  const collapseStyle = useMemo<Animated.WithAnimatedObject<ViewStyle>>(
    () => ({
      transform: [
        {
          translateY: scrollY.interpolate({
            inputRange: [0, TOP_BAR_HEIGHT],
            outputRange: [0, -TOP_BAR_HEIGHT],
            extrapolate: "clamp",
          }),
        },
      ],
    }),
    [scrollY]
  );

  const barOpacityStyle = useMemo<Animated.WithAnimatedObject<ViewStyle>>(
    () => ({
      opacity: scrollY.interpolate({
        inputRange: [0, TOP_BAR_HEIGHT],
        outputRange: [1, 0],
        extrapolate: "clamp",
      }),
    }),
    [scrollY]
  );

  const makeScrollHandler = useCallback(
    (
      listener?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
    ): TopBarScrollProps => ({
      scrollEventThrottle: 16,
      onScroll: Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: true, listener }
      ),
    }),
    [scrollY]
  );

  const scrollProps = useMemo(() => makeScrollHandler(), [makeScrollHandler]);

  const syncToScrollY = useCallback(
    (y: number) => {
      scrollY.setValue(Math.max(0, y));
    },
    [scrollY]
  );

  return {
    collapseStyle,
    barOpacityStyle,
    scrollProps,
    makeScrollHandler,
    syncToScrollY,
  };
};
