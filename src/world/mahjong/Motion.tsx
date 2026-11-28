import { useEffect, type ReactNode } from "react";
import { type ViewStyle } from "react-native";
import Reanimated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from "react-native-reanimated";

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

/**
 * A beat that flashes from dim to full and back while `on` (your turn), for
 * a glow to follow (see Glow). With `calm` (the World's battery saver, or
 * the system's reduce-motion) it holds at full, so the glow is still there,
 * just steady.
 */
export const useBeat = (on: boolean, calm: boolean) => {
  const t = useSharedValue(1);
  useEffect(() => {
    if (!on || calm) {
      t.set(1);
      return;
    }
    t.set(0);
    t.set(withRepeat(withTiming(1, { duration: 520, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(t);
  }, [on, calm, t]);
  return t;
};

/** A glow that follows a beat (useBeat). Never takes a touch. */
export const Glow = ({ beat, style, testID }: { beat: SharedValue<number>; style?: ViewStyle; testID?: string }) => {
  const flashing = useAnimatedStyle(() => ({ opacity: 0.3 + 0.7 * beat.get() }));
  return <Reanimated.View style={[style, flashing]} pointerEvents="none" testID={testID} />;
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
