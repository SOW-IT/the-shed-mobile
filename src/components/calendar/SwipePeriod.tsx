import { type ReactNode, useLayoutEffect } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { swipePage } from "@/lib/swipePage";

const FOLLOW = 0.35;
const MAX_FOLLOW = 72;
const SETTLE_MS = 160;
const ARRIVE_MS = 180;
const DIMMED = 0.4;

export const SwipePeriod = ({
  periodKey,
  onPage,
  children,
}: {
  periodKey: string;
  onPage: (by: -1 | 1) => void;
  children: ReactNode;
}) => {
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(0);
  const opacity = useSharedValue(1);
  const arriving = useSharedValue(false);
  useLayoutEffect(() => {
    if (!arriving.get()) return;
    arriving.set(false);
    opacity.set(withTiming(1, { duration: ARRIVE_MS }));
  }, [periodKey, arriving, opacity]);
  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      if (reduceMotion) return;
      offset.set(Math.max(-MAX_FOLLOW, Math.min(MAX_FOLLOW, e.translationX * FOLLOW)));
    })
    .onEnd((e, success) => {
      const by = success ? swipePage(e.translationX, e.velocityX) : 0;
      if (by === 0) {
        offset.set(withTiming(0, { duration: SETTLE_MS }));
        return;
      }
      offset.set(0);
      if (!reduceMotion) {
        opacity.set(DIMMED);
        arriving.set(true);
      }
      runOnJS(onPage)(by);
    });
  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: offset.get() }],
  }));
  return (
    <GestureDetector gesture={pan} touchAction="pan-y">
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  );
};
