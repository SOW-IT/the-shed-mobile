import { type ReactNode, type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Platform, type StyleProp, StyleSheet, View, type ViewInstance, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { heightBetween, swipePage } from "@/lib/swipePage";

const PAGE_MS = 260;
const MIN_MS = 120;
const SETTLE_MS = 160;
const EASE = Easing.out(Easing.cubic);
const SIDES = [-1, 0, 1] as const;

export type SwipePeriodHandle = {
  // Slides to the next (1) or previous (-1) period; false if it's already moving.
  slide: (by: -1 | 1) => boolean;
};

type Props = {
  // Which period is showing, counted so the next one is index + 1.
  index: number;
  // A slide has finished: make index + by the one showing.
  onPage: (by: -1 | 1) => void;
  // The period `by` away from the one showing.
  renderPage: (by: -1 | 0 | 1) => ReactNode;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<SwipePeriodHandle>;
};

// Like the tabs: the month or week either side waits just off the edge and
// follows the finger in. An index that changes without a slide (Today, a
// link, midnight) starts afresh there.
export const SwipePeriod = ({ onPage, ...props }: Props) => {
  const [shown, setShown] = useState({ index: props.index, generation: 0 });
  if (shown.index !== props.index) setShown({ index: props.index, generation: shown.generation + 1 });
  return (
    <Pager
      key={shown.generation}
      {...props}
      onPage={(by) => {
        setShown((s) => ({ ...s, index: props.index + by }));
        onPage(by);
      }}
    />
  );
};

const Pager = ({ index, onPage, renderPage, style, ref }: Props) => {
  const reduceMotion = useReducedMotion();
  // Each page sits `index - origin` widths along the strip, so the strip is
  // already in place when a slide finishes and the pages move round it.
  const [origin] = useState(index);
  const at = index - origin;
  const [width, setWidth] = useState(0);
  const pos = useSharedValue(at);
  const moving = useSharedValue(false);
  const heights = useSharedValue<Record<number, number>>({});
  useEffect(() => {
    moving.set(false);
  }, [at, moving]);
  // A slide still going when a jump replaces this pager mustn't page the new one.
  const live = useSharedValue(true);
  useEffect(
    () => () => {
      live.set(false);
    },
    [live]
  );
  const finish = (by: -1 | 1) => {
    if (live.get()) onPage(by);
  };
  // On web a mouse drag still ends in a click, which would pick (and scroll to)
  // the day under the pointer; swallow the click that follows a drag.
  const dragged = useSharedValue(false);
  const frameRef = useRef<ViewInstance>(null);
  useEffect(() => {
    const node = frameRef.current as unknown as HTMLElement | null;
    if (Platform.OS !== "web" || !node) return;
    const reset = () => dragged.set(false);
    const swallow = (e: Event) => {
      if (!dragged.get()) return;
      dragged.set(false);
      e.stopPropagation();
      e.preventDefault();
    };
    node.addEventListener("pointerdown", reset, true);
    node.addEventListener("click", swallow, true);
    return () => {
      node.removeEventListener("pointerdown", reset, true);
      node.removeEventListener("click", swallow, true);
    };
  }, [dragged]);

  useImperativeHandle(ref, () => ({
    slide: (by) => {
      if (moving.get()) return false;
      moving.set(true);
      if (reduceMotion || width === 0) {
        pos.set(at + by);
        onPage(by);
        return true;
      }
      pos.set(
        withTiming(at + by, { duration: PAGE_MS, easing: EASE }, (done) => {
          "worklet";
          if (done) runOnJS(finish)(by);
        })
      );
      return true;
    },
  }));

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-12, 12])
    .onStart(() => {
      dragged.set(true);
    })
    .onUpdate((e) => {
      if (reduceMotion || moving.get() || width === 0) return;
      pos.set(Math.max(at - 1, Math.min(at + 1, at - e.translationX / width)));
    })
    .onEnd((e, success) => {
      if (moving.get()) return;
      const by = success ? swipePage(e.translationX, e.velocityX) : 0;
      if (by === 0) {
        pos.set(withTiming(at, { duration: SETTLE_MS, easing: EASE }));
        return;
      }
      moving.set(true);
      if (reduceMotion) {
        pos.set(at + by);
        runOnJS(finish)(by);
        return;
      }
      const left = Math.abs(at + by - pos.get());
      pos.set(
        withTiming(at + by, { duration: Math.max(MIN_MS, PAGE_MS * left), easing: EASE }, (done) => {
          if (done) runOnJS(finish)(by);
        })
      );
    });

  // The height follows too, so a six-week month grows in as it arrives.
  const frame = useAnimatedStyle(() => {
    const height = heightBetween(heights.get(), pos.get());
    return height === undefined ? {} : { height };
  });
  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: -pos.get() * width }] }));

  return (
    <GestureDetector gesture={pan} touchAction="pan-y">
      <Animated.View
        style={[styles.frame, style, frame]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <View ref={frameRef}>
          <Animated.View style={strip}>
            {(width > 0 ? SIDES : ([0] as const)).map((by) => {
              const page = at + by;
              return (
                <View
                  key={index + by}
                  aria-hidden={by !== 0}
                  style={[by !== 0 && styles.aside, width > 0 && { width, left: page * width }]}
                  onLayout={(e) => {
                    const height = e.nativeEvent.layout.height;
                    if (heights.get()[page] !== height) heights.set({ ...heights.get(), [page]: height });
                  }}
                >
                  {renderPage(by)}
                </View>
              );
            })}
          </Animated.View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  frame: { overflow: "hidden" },
  aside: { position: "absolute", top: 0 },
});
