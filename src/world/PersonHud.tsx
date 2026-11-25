import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { hud } from "./palette";
import { popShadow } from "./popShadow";
import { useBatterySaver } from "./settings";

export type HudAction = {
  id: string;
  label: string;
  hint: string;
  emoji?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

const ITEM = 58;
const GAP = 6;
const PAD = 7;
const INK = 2.5;
const TAIL = 9;
const EDGE = 6;
export const HUD_HEIGHT = ITEM + PAD * 2 + INK * 2 + TAIL;

const hudWidth = (count: number) => count * ITEM + (count - 1) * GAP + PAD * 2 + INK * 2;
const nativeDriver = Platform.OS !== "web";

export const PersonHud = ({
  x,
  y,
  stageWidth,
  visible,
  actions,
  onHidden,
}: {
  x: number;
  y: number;
  stageWidth: number;
  visible: boolean;
  actions: HudAction[];
  onHidden: () => void;
}) => {
  const [shown] = useState(() => new Animated.Value(0));
  const calm = useBatterySaver();
  const hidden = useRef(onHidden);
  useEffect(() => {
    hidden.current = onHidden;
  });
  useEffect(() => {
    if (visible) {
      const pop = calm
        ? Animated.timing(shown, { toValue: 1, duration: 140, useNativeDriver: nativeDriver })
        : Animated.spring(shown, { toValue: 1, friction: 6, tension: 140, useNativeDriver: nativeDriver });
      pop.start();
      return () => pop.stop();
    }
    const leave = Animated.timing(shown, { toValue: 0, duration: 130, easing: Easing.in(Easing.quad), useNativeDriver: nativeDriver });
    leave.start(({ finished }) => finished && hidden.current());
    return () => leave.stop();
  }, [visible, shown, calm]);

  const width = hudWidth(actions.length);
  const left = Math.min(Math.max(EDGE, x - width / 2), Math.max(EDGE, stageWidth - width - EDGE));
  const top = Math.max(EDGE, y - HUD_HEIGHT);
  const tailLeft = Math.min(Math.max(16, x - left), width - 16) - TAIL;
  return (
    <Animated.View
      pointerEvents={visible ? "box-none" : "none"}
      style={[
        styles.wrap,
        {
          left,
          top,
          width,
          opacity: shown.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
          transform: calm
            ? []
            : [
                { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
                { scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
              ],
        },
      ]}
      testID="world-person-hud"
    >
      <View style={styles.card}>
        {actions.map((action) => (
          <Pressable
            key={action.id}
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.hint}
            testID={`world-hud-${action.id}`}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            {action.emoji ? (
              <Text style={styles.emoji}>{action.emoji}</Text>
            ) : (
              <Ionicons name={action.icon ?? "ellipsis-horizontal"} size={22} color={hud.forest} />
            )}
            <Text style={styles.label} numberOfLines={1}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.tailInk, { left: tailLeft }]} />
      <View style={[styles.tail, { left: tailLeft + 3 }]} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: "absolute", height: HUD_HEIGHT },
  card: {
    flexDirection: "row",
    gap: GAP,
    padding: PAD,
    borderRadius: 22,
    backgroundColor: hud.card,
    borderWidth: INK,
    borderColor: hud.forest,
    ...popShadow(),
  },
  item: {
    width: ITEM,
    height: ITEM,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: hud.accentSoft,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  emoji: { fontSize: 22 },
  label: { fontSize: 10.5, fontWeight: "700", color: hud.forest, marginTop: 2 },
  tailInk: {
    position: "absolute",
    top: HUD_HEIGHT - TAIL - INK,
    borderLeftWidth: TAIL,
    borderRightWidth: TAIL,
    borderTopWidth: TAIL + 2,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: hud.forest,
  },
  tail: {
    position: "absolute",
    top: HUD_HEIGHT - TAIL - INK - 1,
    borderLeftWidth: TAIL - 3,
    borderRightWidth: TAIL - 3,
    borderTopWidth: TAIL - 2,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: hud.card,
  },
});
