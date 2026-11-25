import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, type SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { FIRE_LOOP_MS, FLAMES, flameAt, PUFFS, puffAt, STILL_PHASE } from "./fireMotion";
import { garden, places } from "./palette";

const campfire = places.campfire;

type Shape = { key: string; i: number; dx: number; dy: number; w: number; h: number; colour: string; ink: boolean };

const TONGUES: readonly Shape[] = [
  { key: "flame", i: 0, dx: 0, dy: 0.75, w: 0.8, h: 1.15, colour: campfire.flame, ink: true },
  { key: "tip", i: 1, dx: 0.14, dy: 1.02, w: 0.32, h: 0.55, colour: campfire.flame, ink: true },
  { key: "core", i: 2, dx: -0.05, dy: 0.68, w: 0.5, h: 0.72, colour: campfire.flameHot, ink: false },
];

const PUFF_IDS = Array.from({ length: PUFFS }, (_, i) => i);

const PUFF_SIZE = 0.42;
const SMOKE_FROM = 1.35;
const SMOKE_RISE = 1.9;

const Tongue = ({ clock, i, shape, scale }: { clock: SharedValue<number>; i: number; shape: Shape; scale: number }) => {
  const style = useAnimatedStyle(() => {
    const f = flameAt(clock.value, i % FLAMES);
    return { transform: [{ translateX: f.dx * scale }, { scaleX: f.scaleX }, { scaleY: f.scaleY }] };
  });
  const w = shape.w * scale;
  const h = shape.h * scale;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.abs,
        {
          left: shape.dx * scale - w / 2,
          top: -shape.dy * scale - h / 2,
          width: w,
          height: h,
          borderRadius: w / 2,
          borderTopLeftRadius: w * 0.42,
          borderTopRightRadius: w * 0.42,
          backgroundColor: shape.colour,
          borderWidth: shape.ink ? Math.max(1, 0.02 * scale) : 0,
          borderColor: garden.ink,
          transformOrigin: "bottom",
        },
        style,
      ]}
    />
  );
};

const Puff = ({ clock, i, scale }: { clock: SharedValue<number>; i: number; scale: number }) => {
  const style = useAnimatedStyle(() => {
    const p = puffAt(clock.value, i);
    return {
      opacity: p.opacity,
      transform: [{ translateX: p.dx * scale }, { translateY: -p.rise * SMOKE_RISE * scale }, { scale: p.scale }],
    };
  });
  const size = PUFF_SIZE * scale;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.abs, { left: -size / 2, top: -SMOKE_FROM * scale - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: campfire.smoke }, style]}
    />
  );
};

export const CampfireFlames = ({ x, y, scale, live }: { x: number; y: number; scale: number; live: boolean }) => {
  const clock = useSharedValue(STILL_PHASE);
  useEffect(() => {
    if (!live) {
      cancelAnimation(clock);
      clock.value = STILL_PHASE;
      return;
    }
    clock.value = 0;
    clock.value = withRepeat(withTiming(1, { duration: FIRE_LOOP_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(clock);
  }, [live, clock]);
  return (
    <View pointerEvents="none" style={[styles.abs, { left: x, top: y }]} testID={live ? "world-campfire-live" : "world-campfire-still"}>
      {PUFF_IDS.map((i) => (
        <Puff key={`puff${i}`} clock={clock} i={i} scale={scale} />
      ))}
      {TONGUES.map((shape) => (
        <Tongue key={shape.key} clock={clock} i={shape.i} shape={shape} scale={scale} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  abs: { position: "absolute" },
});
