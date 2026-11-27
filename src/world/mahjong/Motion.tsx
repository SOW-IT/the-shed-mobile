import { useEffect, type ReactNode } from "react";
import { type ViewStyle } from "react-native";
import Reanimated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";

/**
 * Comes into place once, when it first shows: from an offset (and a
 * size), along a slight arc, to where the layout puts it. With `calm` (the
 * World's battery saver) it's simply there.
 */
export const Arrive = ({
  children,
  from = { x: 0, y: 0 },
  scale = 1,
  delay = 0,
  duration = 280,
  arc = 0,
  calm,
  style,
}: {
  children: ReactNode;
  from?: { x: number; y: number };
  scale?: number;
  delay?: number;
  duration?: number;
  /** How far the path bows up on the way, for a tile thrown into the river. */
  arc?: number;
  calm: boolean;
  style?: ViewStyle;
}) => {
  const t = useSharedValue(calm ? 1 : 0);
  useEffect(() => {
    if (!calm) t.set(withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) })));
  }, [calm, delay, duration, t]);
  const moved = useAnimatedStyle(() => {
    const p = t.get();
    const lift = arc * 4 * p * (1 - p);
    return {
      opacity: Math.min(1, p * 2.5),
      transform: [{ translateX: from.x * (1 - p) }, { translateY: from.y * (1 - p) - lift }, { scale: scale + (1 - scale) * p }],
    };
  });
  return <Reanimated.View style={[style, moved]}>{children}</Reanimated.View>;
};

/** A shout across the table (PONG!, HU!): it punches in, holds, and fades. */
export const Punch = ({ children, calm, style }: { children: ReactNode; calm: boolean; style?: ViewStyle }) => {
  const t = useSharedValue(0);
  useEffect(() => {
    const always = ReduceMotion.Never;
    t.set(
      calm
        ? withSequence(always, withTiming(1, { duration: 1, reduceMotion: always }), withDelay(1100, withTiming(0, { duration: 1, reduceMotion: always }), always))
        : withSequence(always, withTiming(1, { duration: 180, easing: Easing.out(Easing.back(2.2)), reduceMotion: always }), withDelay(750, withTiming(0, { duration: 260, reduceMotion: always }), always))
    );
  }, [calm, t]);
  const shown = useAnimatedStyle(() => ({ opacity: Math.min(1, t.get() * 1.6), transform: [{ scale: calm ? 1 : 0.4 + 0.6 * t.get() }, { rotate: `${calm ? 0 : -6 + 6 * t.get()}deg` }] }));
  return (
    <Reanimated.View style={[style, shown]} pointerEvents="none">
      {children}
    </Reanimated.View>
  );
};
