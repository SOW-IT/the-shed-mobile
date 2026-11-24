import { memo, useEffect, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { garden } from "./palette";
import { Ellipse } from "./Shapes";

const NATIVE = Platform.OS !== "web";
const RING_MS = 1111;
const PETAL_MS = 1309;
const PIN_MS = 1571;
const PETALS = [0, 1, 2, 3, 4, 5];
const SQUASH = 0.6;
const SINE = Array.from({ length: 9 }, (_, i) => i / 8);

const useLoop = (ms: number, still: boolean, rest: number) => {
  const [value] = useState(() => new Animated.Value(rest));
  useEffect(() => {
    value.setValue(still ? rest : 0);
    if (still) return;
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: NATIVE }));
    loop.start();
    return () => loop.stop();
  }, [value, ms, still, rest]);
  return value;
};

const MarkerView = ({ x, y, scale, pinY, pinBob, calm }: { x: number; y: number; scale: number; pinY: number; pinBob: number; calm: boolean }) => {
  const ring = useLoop(RING_MS, calm, 0.35);
  const petals = useLoop(PETAL_MS, calm, 0);
  const pin = useLoop(PIN_MS, calm, 0);
  const rx = 1.5 * 0.6 * scale;
  const ry = 1.5 * 0.36 * scale;
  const orbit = 0.24 * scale;
  const reach = orbit + 0.15 * scale;
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          {
            left: x - rx,
            top: y - ry,
            width: rx * 2,
            height: ry * 2,
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          },
        ]}
      >
        <Ellipse cx={rx} cy={ry} rx={rx} ry={ry} fill="transparent" ink={2} inkColour={garden.ring} dashed={false} />
      </Animated.View>
      <View pointerEvents="none" style={[styles.abs, { left: x - reach, top: y - 0.06 * scale - reach, width: reach * 2, height: reach * 2, transform: [{ scaleY: SQUASH }] }]}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ rotate: petals.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "60deg"] }) }] },
          ]}
        >
          {PETALS.map((n) => {
            const a = (n / 6) * Math.PI * 2;
            return (
              <Ellipse
                key={n}
                cx={reach + Math.cos(a) * orbit}
                cy={reach + Math.sin(a) * orbit}
                rx={0.14 * scale}
                ry={(0.08 / SQUASH) * scale}
                fill={garden.markerPetal}
                ink={1.2}
                inkColour={garden.ink}
              />
            );
          })}
        </Animated.View>
      </View>
      <Ellipse cx={x} cy={y - 0.06 * scale} rx={0.12 * scale} ry={0.08 * scale} fill={garden.markerMiddle} ink={1.2} inkColour={garden.ink} />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pin,
          {
            left: x - 0.17 * scale,
            top: pinY - 0.1 * scale,
            borderLeftWidth: 0.17 * scale,
            borderRightWidth: 0.17 * scale,
            borderTopWidth: 0.36 * scale,
            transform: [{ translateY: pin.interpolate({ inputRange: SINE, outputRange: SINE.map((k) => -Math.sin(k * Math.PI * 2) * pinBob) }) }],
          },
        ]}
      />
    </>
  );
};

export const Marker = memo(MarkerView);

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  pin: {
    position: "absolute",
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: garden.markerPin,
  },
});
