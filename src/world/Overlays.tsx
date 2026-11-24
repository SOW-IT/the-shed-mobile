import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { PLACE_TITLES, type Look, type Place } from "@shared/world";
import { useEffect, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { glass, hud, signal, signalColour } from "./palette";
import { Avatar } from "./Person";
import { backdropOf, BUST_BORDER, bustFigure } from "./bust";

const NATIVE = Platform.OS !== "web";
const LEAD_MS = 40;
const ITEM_MS = 240;
const STAGGER_MS = 40;
const STAGGERED = 8;
const OUT_MS = 170;
const OPEN_MS = LEAD_MS + STAGGER_MS * STAGGERED + ITEM_MS;
const STEPS = [0, 0.25, 0.5, 0.75, 1];
const EASE_OUT = STEPS.map((k) => 1 - (1 - k) ** 3);

export const PLACE_ICONS: Record<Place, string> = {
  garden: "🌿",
  chapel: "⛪",
  campfire: "🔥",
  cafe: "☕",
  beach: "🏖️",
  home: "🏠",
};

export const placeLabel = (place: Place) => `${PLACE_ICONS[place]} ${PLACE_TITLES[place]}`;

export const useOverlayClock = (open: boolean) => {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [clock] = useState(() => new Animated.Value(open ? OPEN_MS : 0));
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (!mounted) return;
    const run = Animated.timing(clock, {
      toValue: open ? OPEN_MS : 0,
      duration: reduce ? 0 : open ? OPEN_MS : OUT_MS,
      easing: Easing.linear,
      useNativeDriver: NATIVE,
    });
    run.start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
    return () => run.stop();
  }, [open, mounted, reduce, clock]);
  return { mounted, clock };
};

type Clock = Animated.Value;

const eased = (clock: Clock, start: number, from: number, to: number) =>
  clock.interpolate({
    inputRange: STEPS.map((k) => start + k * ITEM_MS),
    outputRange: EASE_OUT.map((e) => from + (to - from) * e),
    extrapolate: "clamp",
  });

export const scrimStyle = (clock: Clock) => ({ opacity: eased(clock, 0, 0, 1) });

export const popStyle = (clock: Clock) => ({
  opacity: eased(clock, 0, 0, 1),
  transform: [{ translateY: eased(clock, 0, -12, 0) }, { scale: eased(clock, 0, 0.94, 1) }],
});

export const itemStyle = (clock: Clock, index: number) => {
  const start = LEAD_MS + Math.min(index, STAGGERED) * STAGGER_MS;
  return { opacity: eased(clock, start, 0, 1), transform: [{ translateY: eased(clock, start, -8, 0) }] };
};

export const blurBehind = (Platform.OS === "web" ? { backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" } : {}) as unknown as ViewStyle;

export const Bust = ({ look, size }: { look: Look; size: number }) => (
  <View pointerEvents="none" style={[styles.bust, { width: size, height: size, borderRadius: size / 2, backgroundColor: backdropOf(look) }]}>
    <Avatar
      figure={bustFigure(look, size)}
      pose={{ x: 0, z: 0, walking: false, arrivesAt: 0, heading: 0 }}
      look={look}
      t={0}
      seed={0}
      shadow={false}
    />
  </View>
);

const QUALITY = ["unknown", "poor", "fair", "good", "great"] as const;

export const connectionLabel = (bars: number | undefined) => `Connection ${QUALITY[bars ?? 0]}`;

export const SignalBars = ({ bars, size = 16 }: { bars?: number; size?: number }) => {
  const lit = bars ?? 0;
  const colour = lit > 0 ? signalColour(lit) : signal.offOnGlass;
  return (
    <View style={[styles.bars, { height: size, gap: size * 0.12 }]} accessible accessibilityLabel={connectionLabel(bars)}>
      {[1, 2, 3, 4].map((n) => (
        <View
          key={n}
          style={{
            width: size * 0.17,
            height: size * (0.3 + 0.233 * (n - 1)),
            borderRadius: size * 0.06,
            backgroundColor: n <= lit ? colour : signal.offOnGlass,
          }}
        />
      ))}
    </View>
  );
};

export const WifiBars = ({ bars, size = 20, off = signal.offOnCard }: { bars?: number; size?: number; off?: string }) => {
  const lit = bars ?? 0;
  const colour = lit > 0 ? signalColour(lit) : off;
  const cx = size / 2;
  const cy = size * 0.86;
  const stroke = size * 0.11;
  const dot = size * 0.09;
  return (
    <View style={{ width: size, height: size * 0.92, overflow: "hidden" }} pointerEvents="none">
      {[0.3, 0.52, 0.74].map((k, i) => {
        const radius = size * k;
        return (
          <View
            key={k}
            style={{
              position: "absolute",
              left: cx - radius,
              top: cy - radius,
              width: radius * 2,
              height: radius * 2,
              borderRadius: radius,
              borderWidth: stroke,
              borderColor: "transparent",
              borderTopColor: i + 2 <= lit ? colour : off,
            }}
          />
        );
      })}
      <View style={{ position: "absolute", left: cx - dot, top: cy - dot, width: dot * 2, height: dot * 2, borderRadius: dot, backgroundColor: lit > 0 ? colour : off }} />
    </View>
  );
};

export type MenuEntry = {
  id: string;
  label: string;
  emoji?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
  tone?: "leave";
  accessibilityLabel?: string;
  onPress: () => void;
};

export const WorldMenu = ({
  open,
  top,
  entries,
  onClose,
}: {
  open: boolean;
  top: number;
  entries: readonly MenuEntry[];
  onClose: () => void;
}) => {
  const { mounted, clock } = useOverlayClock(open);
  if (!mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "box-none" : "none"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" testID="world-menu-close">
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle(clock)]} />
      </Pressable>
      <Animated.View style={[styles.menu, blurBehind, { top }, popStyle(clock)]} testID="world-menu">
        {entries.map((entry, i) => (
          <Animated.View key={entry.id} style={[itemStyle(clock, i), entry.tone === "leave" && i > 0 && styles.leaveGap]}>
            <Pressable
              onPress={entry.onPress}
              accessibilityRole="button"
              accessibilityLabel={entry.accessibilityLabel ?? entry.label}
              testID={`world-menu-${entry.id}`}
              style={({ pressed }) => [styles.place, entry.tone === "leave" && styles.leave, pressed && styles.rowPressed]}
            >
              <View style={[styles.placeIcon, entry.tone === "leave" && styles.leaveIcon]}>
                {entry.emoji ? <Text style={styles.placeEmoji}>{entry.emoji}</Text> : null}
                {entry.icon ? <Ionicons name={entry.icon} size={19} color={glass.text} /> : null}
              </View>
              <Text style={styles.placeTitle} numberOfLines={1}>
                {entry.label}
              </Text>
              {entry.count !== undefined ? (
                <View style={[styles.count, entry.count === 0 && styles.countEmpty]}>
                  <Ionicons name="person" size={11} color={glass.text} />
                  <Text style={styles.countText}>{entry.count}</Text>
                </View>
              ) : null}
            </Pressable>
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
};

export const LeaveDialog = ({ open, onStay, onLeave }: { open: boolean; onStay: () => void; onLeave: () => void }) => {
  const { mounted, clock } = useOverlayClock(open);
  if (!mounted) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents={open ? "box-none" : "none"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onStay} accessibilityRole="button" accessibilityLabel="Stay" testID="world-leave-scrim">
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrimDeep, scrimStyle(clock)]} />
      </Pressable>
      <Animated.View style={[styles.dialog, blurBehind, popStyle(clock)]} testID="world-leave-dialog" accessibilityViewIsModal>
        <Animated.View style={[styles.door, itemStyle(clock, 0)]}>
          <Ionicons name="exit-outline" size={30} color={glass.text} />
        </Animated.View>
        <Animated.View style={itemStyle(clock, 1)}>
          <Text style={styles.dialogTitle} accessibilityRole="header">
            Leave the World?
          </Text>
          <Text style={styles.dialogText}>Everyone here will see you go. You can come back any time.</Text>
        </Animated.View>
        <Animated.View style={[styles.dialogButtons, itemStyle(clock, 2)]}>
          <Pressable onPress={onStay} accessibilityRole="button" testID="world-leave-stay" style={({ pressed }) => [styles.dialogButton, pressed && styles.rowPressed]}>
            <Text style={styles.dialogButtonText}>Stay</Text>
          </Pressable>
          <Pressable
            onPress={onLeave}
            accessibilityRole="button"
            testID="world-leave-confirm"
            style={({ pressed }) => [styles.dialogButton, styles.dialogLeave, pressed && styles.rowPressed]}
          >
            <Ionicons name="exit-outline" size={17} color={hud.onAccent} />
            <Text style={styles.dialogButtonText}>Leave</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
};

export const GlassPill = ({
  label,
  icon,
  onPress,
  disabled = false,
  testID,
  accessibilityLabel,
  tone = "plain",
}: {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  tone?: "plain" | "accent";
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled }}
    testID={testID}
    style={({ pressed }) => [styles.pill, tone === "accent" && styles.pillAccent, disabled && styles.pillDisabled, pressed && styles.rowPressed]}
  >
    {icon ? <Ionicons name={icon} size={14} color={glass.text} /> : null}
    {label ? <Text style={styles.pillText}>{label}</Text> : null}
  </Pressable>
);

const styles = StyleSheet.create({
  scrim: { backgroundColor: glass.scrim },
  bust: { overflow: "hidden", borderWidth: BUST_BORDER, borderColor: glass.edge },
  bars: { flexDirection: "row", alignItems: "flex-end" },
  menu: {
    position: "absolute",
    left: 14,
    width: 270,
    maxWidth: "92%",
    padding: 8,
    gap: 6,
    borderRadius: 22,
    backgroundColor: glass.panel,
    borderWidth: 1.5,
    borderColor: glass.edge,
    transformOrigin: "top left",
  },
  leaveGap: { marginTop: 6 },
  leave: { backgroundColor: "transparent", borderWidth: 1, borderColor: glass.edge },
  leaveIcon: { backgroundColor: hud.accent },
  centre: { alignItems: "center", justifyContent: "center" },
  scrimDeep: { backgroundColor: glass.scrimDeep },
  dialog: {
    width: 300,
    maxWidth: "88%",
    alignItems: "center",
    gap: 12,
    padding: 20,
    borderRadius: 26,
    backgroundColor: glass.panel,
    borderWidth: 1.5,
    borderColor: glass.edge,
  },
  door: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: hud.accent },
  dialogTitle: { fontFamily: fonts.display, fontSize: 21, color: glass.text, textAlign: "center", letterSpacing: -0.3 },
  dialogText: { color: glass.muted, fontSize: 14, lineHeight: 19, textAlign: "center", marginTop: 6 },
  dialogButtons: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 4 },
  dialogButton: { flex: 1, flexDirection: "row", gap: 6, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: glass.row, borderWidth: 1, borderColor: glass.edge },
  dialogLeave: { backgroundColor: hud.accent, borderColor: hud.accent },
  dialogButtonText: { color: glass.text, fontFamily: fonts.display, fontSize: 16 },
  place: { flexDirection: "row", alignItems: "center", gap: 10, height: 52, paddingHorizontal: 8, borderRadius: 16, backgroundColor: glass.row },
  rowPressed: { opacity: 0.7 },
  placeIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: glass.row },
  placeEmoji: { fontSize: 19 },
  placeTitle: { flex: 1, fontFamily: fonts.display, fontSize: 16, color: glass.text },
  count: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: hud.primary },
  countEmpty: { backgroundColor: glass.row },
  countText: { color: glass.text, fontSize: 12, fontWeight: "800" },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: glass.row, borderWidth: 1, borderColor: glass.edge },
  pillAccent: { backgroundColor: hud.accent, borderColor: hud.accent },
  pillDisabled: { opacity: 0.45 },
  pillText: { color: glass.text, fontSize: 13, fontWeight: "700" },
});
