import type { ReactNode } from "react";
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

export const SwipePeriod = ({
  onPage,
  children,
}: {
  onPage: (by: -1 | 1) => void;
  children: ReactNode;
}) => {
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(0);
  const opacity = useSharedValue(1);
  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      if (reduceMotion) return;
      offset.value = Math.max(-MAX_FOLLOW, Math.min(MAX_FOLLOW, e.translationX * FOLLOW));
    })
    .onEnd((e, success) => {
      const by = success ? swipePage(e.translationX, e.velocityX) : 0;
      if (by === 0) {
        offset.value = withTiming(0, { duration: SETTLE_MS });
        return;
      }
      runOnJS(onPage)(by);
      offset.value = 0;
      if (reduceMotion) return;
      opacity.value = 0.4;
      opacity.value = withTiming(1, { duration: ARRIVE_MS });
    });
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: offset.value }],
  }));
  return (
    <GestureDetector gesture={pan} touchAction="pan-y">
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  );
};
