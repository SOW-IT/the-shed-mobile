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
  // Absolute scroll offset of the active scroller. It is driven on the native
  // (UI) thread via Animated.event(useNativeDriver) — see makeScrollHandler — so
  // the collapsing chrome tracks the finger in *exact lockstep* with the
  // OS-pinned sticky search bar just below it. Driving the collapse from JS
  // `setValue` inside an onScroll handler (the previous approach) ran on the JS
  // thread and lagged the native sticky bar on fast flings; same offset, same
  // thread now, so the bar's bottom edge and the sticky bar never drift apart.
  const [scrollY] = useState(() => new Animated.Value(0));

  // Collapse is positional: it tracks the scroll offset over the first
  // TOP_BAR_HEIGHT px (and grows back toward the top), not scroll *direction*.
  // The transform slides the chrome up by exactly the offset, so its bottom edge
  // and the sticky search bar stay flush in either direction — and because it's
  // a transform (not an animated `height`), it is native-driver compatible.
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

  // Fade the top-bar content out as the chrome slides up under the clip, so it
  // doesn't read as a hard cut at the clip edge.
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

  // Build an onScroll handler that feeds `scrollY` on the native thread. The
  // optional JS `listener` still runs (on the JS thread) for side effects that
  // can't live natively — e.g. recording a page's offset or firing pagination.
  // The receiving component MUST be an Animated.ScrollView for the native driver
  // to attach.
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

  // Stable handler for simple single-scroller screens (ChromeScreen).
  const scrollProps = useMemo(() => makeScrollHandler(), [makeScrollHandler]);

  // Snap the collapse to a specific offset (e.g. the active page's on tab
  // change), so the chrome reflects what the new page actually shows.
  const syncToScrollY = useCallback(
    (y: number) => {
      scrollY.setValue(Math.max(0, y));
    },
    [scrollY]
  );

  return {
    /** Transform that slides the collapsing chrome up by the scroll offset. */
    collapseStyle,
    /** Opacity that fades the top-bar content as it slides out. */
    barOpacityStyle,
    /** Native-driven scroll handler for a single scroller. */
    scrollProps,
    /** Build a native-driven scroll handler with extra JS-side side effects. */
    makeScrollHandler,
    /** Snap the collapse to a specific scroll offset. */
    syncToScrollY,
  };
};
