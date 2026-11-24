import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { COIN_TIERS, DAILY_COIN_CAP } from "@shared/coins";
import { GAME_IDS, GAME_INFO } from "@shared/games";
import { NPC } from "@shared/world";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { GoldCoin } from "@/components/games/GoldCoin";
import { Bust } from "./Overlays";
import { gold, hud } from "./palette";
import { useBatterySaver } from "./settings";

const NATIVE = Platform.OS !== "web";

export const useCoins = () => useQuery(api.coins.mine, {});

export const CoinCounter = ({ balance, onPress }: { balance: number | undefined; onPress?: () => void }) => {
  const [bump] = useState(() => new Animated.Value(0));
  const last = useRef(balance);
  const [gain, setGain] = useState<number | null>(null);
  useEffect(() => {
    const before = last.current;
    last.current = balance;
    if (before === undefined || balance === undefined || balance === before) return;
    setGain(balance - before);
    bump.setValue(0);
    const run = Animated.timing(bump, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE });
    run.start(({ finished }) => finished && setGain(null));
    return () => run.stop();
  }, [balance, bump]);
  const pop = bump.interpolate({ inputRange: [0, 0.2, 1], outputRange: [1, 1.18, 1] });
  return (
    <Pressable
      style={styles.wrap}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={balance === undefined ? "Coins loading" : `${balance} coins. How to get coins`}
      testID="world-coins"
    >
      <Animated.View style={[styles.pill, { transform: [{ scale: pop }] }]}>
        <GoldCoin size={24} />
        <Text style={styles.count} numberOfLines={1}>
          {balance === undefined ? "…" : balance.toLocaleString()}
        </Text>
      </Animated.View>
      {gain !== null ? (
        <Animated.Text
          style={[
            styles.gain,
            gain < 0 && styles.spent,
            { opacity: bump.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: bump.interpolate({ inputRange: [0, 1], outputRange: [4, -18] }) }] },
          ]}
        >
          {gain > 0 ? `+${gain}` : `${gain}`}
        </Animated.Text>
      ) : null}
    </Pressable>
  );
};

const CLOSE_MS = 200;
const SPIN_MS = 1400;
const SPARKS = [
  { x: -46, y: -18, size: 14, delay: 0 },
  { x: 44, y: -26, size: 11, delay: 0.3 },
  { x: 50, y: 18, size: 13, delay: 0.55 },
  { x: -40, y: 24, size: 10, delay: 0.8 },
];

const tierText = (tiers: readonly { over: number; coins: number }[]) =>
  tiers.map((tier) => `over ${tier.over.toLocaleString()} → ${tier.coins} coins`).join("  ·  ");

export const CoinsPanel = ({
  open,
  top,
  balance,
  earnedToday,
  onClose,
}: {
  open: boolean;
  top: number;
  balance: number | undefined;
  earnedToday: number | undefined;
  onClose: () => void;
}) => {
  const reduce = useBatterySaver();
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const [shown] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (!mounted) return;
    const run =
      open && !reduce
        ? Animated.spring(shown, { toValue: 1, friction: 6, tension: 120, useNativeDriver: NATIVE })
        : Animated.timing(shown, { toValue: open ? 1 : 0, duration: reduce ? 0 : CLOSE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE });
    run.start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
    return () => run.stop();
  }, [open, mounted, reduce, shown]);
  useEffect(() => {
    if (!mounted || reduce) return;
    spin.setValue(0);
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: SPIN_MS, easing: Easing.linear, useNativeDriver: NATIVE }));
    loop.start();
    return () => loop.stop();
  }, [mounted, reduce, spin]);
  if (!mounted) return null;
  const scale = shown.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const turn = spin.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 0.12, -1, 0.12, 1] });
  const coinScale = spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.06, 1] });
  const remaining = Math.max(0, DAILY_COIN_CAP - (earnedToday ?? 0));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "box-none" : "none"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close coins" testID="world-coins-scrim">
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: shown.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }) }]} />
      </Pressable>
      <Animated.View
        style={[styles.card, { top, width: Math.min(340, width - 32), opacity: shown.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }), transform: [{ scale }] }]}
        testID="world-coins-panel"
        accessibilityViewIsModal
      >
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" testID="world-coins-close" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Ionicons name="close" size={18} color={hud.forest} />
        </Pressable>
        <View style={styles.hero}>
          {SPARKS.map((spark) => (
            <Animated.Text
              key={`${spark.x},${spark.y}`}
              style={[
                styles.spark,
                {
                  fontSize: spark.size,
                  transform: [{ translateX: spark.x }, { translateY: spark.y }],
                  opacity: reduce
                    ? 0.8
                    : spin.interpolate({
                        inputRange: [0, spark.delay * 0.5 + 0.01, spark.delay * 0.5 + 0.25, spark.delay * 0.5 + 0.5, 1],
                        outputRange: [0.15, 0.15, 1, 0.15, 0.15],
                      }),
                },
              ]}
            >
              ✦
            </Animated.Text>
          ))}
          <Animated.View style={{ transform: [{ scaleX: reduce ? 1 : turn }, { scale: reduce ? 1 : coinScale }] }}>
            <GoldCoin size={64} />
          </Animated.View>
        </View>
        <Text style={styles.balance} accessibilityRole="header">
          {balance === undefined ? "…" : balance.toLocaleString()}
        </Text>
        <Text style={styles.unit}>SOW coins</Text>
        <Text style={styles.heading}>How to get coins</Text>
        {GAME_IDS.map((game) => (
          <View key={game} style={styles.row}>
            <Text style={styles.game}>{GAME_INFO[game].title}</Text>
            <Text style={styles.tiers}>{tierText(COIN_TIERS[game])}</Text>
          </View>
        ))}
        <Text style={styles.note}>
          Score past a mark in the arcade for 10 or 20 coins a run, up to {DAILY_COIN_CAP} a day ({remaining} left today).
        </Text>
        <View style={styles.shop}>
          <Bust look={NPC.look} size={36} />
          <Text style={styles.shopText}>{NPC.name.split(" ")[0]} in the Café sells furniture for your home.</Text>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  scrim: { backgroundColor: hud.scrim },
  card: {
    position: "absolute",
    alignSelf: "center",
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: hud.card,
    borderWidth: 3,
    borderColor: hud.forest,
    shadowColor: hud.forest,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  close: { position: "absolute", top: 10, right: 10, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: hud.primarySoft },
  pressed: { opacity: 0.7 },
  hero: { width: 120, height: 76, alignItems: "center", justifyContent: "center" },
  spark: { position: "absolute", color: gold.text },
  balance: { fontFamily: fonts.display, fontSize: 30, color: hud.forest, marginTop: 2 },
  unit: { fontSize: 13, fontWeight: "700", color: gold.text, marginBottom: 12 },
  heading: { alignSelf: "stretch", fontFamily: fonts.display, fontSize: 16, color: hud.forest, marginBottom: 6 },
  row: { alignSelf: "stretch", gap: 2, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 6, borderRadius: 14, backgroundColor: hud.primarySoft },
  game: { fontWeight: "800", fontSize: 14, color: hud.forest },
  tiers: { fontWeight: "700", fontSize: 13, color: gold.text },
  note: { alignSelf: "stretch", fontSize: 13, lineHeight: 18, color: hud.primary, marginTop: 4 },
  shop: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, padding: 8, borderRadius: 16, backgroundColor: hud.accentSoft },
  shopText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600", color: hud.forest },
  wrap: { alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 36,
    paddingLeft: 5,
    paddingRight: 10,
    borderRadius: 18,
    backgroundColor: hud.card,
    borderWidth: 2.5,
    borderColor: hud.forest,
    shadowColor: hud.forest,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  count: { fontFamily: fonts.display, fontSize: 15, color: hud.forest, minWidth: 18 },
  gain: { position: "absolute", top: 36, fontFamily: fonts.display, fontSize: 14, color: gold.text },
  spent: { color: hud.accent },
});
