import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SharpScrollView } from "@/components/ui/SharpScrollView";
import { ordinal, PLACE_COINS } from "@shared/coins";
import { FARMER, NPC } from "@shared/world";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { GoldCoin } from "@/components/games/GoldCoin";
import { Bust } from "./Overlays";
import { GoodThumb } from "./Animals";
import { CropThumb } from "./Farm";
import { gold, hud } from "./palette";
import { popShadow } from "./popShadow";
import { useBatterySaver } from "./settings";

const NATIVE = Platform.OS !== "web";
const JOSH = FARMER.name.split(" ")[0];

export const useCoins = () => useQuery(api.coins.mine, {});

const CLOSE_MS = 200;
const SPIN_MS = 1400;
const SPARKS = [
  { x: -46, y: -18, size: 14, delay: 0 },
  { x: 44, y: -26, size: 11, delay: 0.3 },
  { x: 50, y: 18, size: 13, delay: 0.55 },
  { x: -40, y: 24, size: 10, delay: 0.8 },
];

export const CoinsPanel = ({
  open,
  top,
  balance,
  onClose,
}: {
  open: boolean;
  top: number;
  balance: number | undefined;
  onClose: () => void;
}) => {
  const reduce = useBatterySaver();
  const { width, height } = useWindowDimensions();
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
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "box-none" : "none"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close coins" testID="world-coins-scrim">
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: shown.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }) }]} />
      </Pressable>
      <Animated.View
        style={[styles.card, { top, width: Math.min(340, width - 32), maxHeight: Math.max(320, height - top - 24), opacity: shown.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }), transform: [{ scale }] }]}
        testID="world-coins-panel"
        accessibilityViewIsModal
      >
        <SharpScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
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
        <Text style={styles.lead}>Make the top 3 of an arcade game&apos;s leaderboard:</Text>
        {PLACE_COINS.map((coins, i) => (
          <View key={coins} style={styles.row} testID={`world-coins-place-${i + 1}`}>
            <Text style={styles.game}>{ordinal(i + 1)} place</Text>
            <Text style={styles.tiers}>{coins} coins</Text>
          </View>
        ))}
        <Text style={styles.note}>
          Each place pays once per game. Climb higher and you get the difference.
        </Text>
        <Text style={[styles.lead, styles.farmLead]}>Farm in your backyard:</Text>
        <View accessible accessibilityLabel={`Grow crops in your backyard and sell them to ${JOSH}`} testID="world-coins-crops" style={[styles.row, styles.farmRow]}>
          <View style={styles.goods}>
            <CropThumb crop="tomato" size={30} />
          </View>
          <Text style={styles.farmText}>Grow crops · sell to {JOSH}</Text>
        </View>
        <View accessible accessibilityLabel={`Keep hens and cows and sell their eggs and milk to ${JOSH}`} testID="world-coins-animals" style={[styles.row, styles.farmRow]}>
          <View style={styles.goods}>
            <GoodThumb good="egg" size={30} />
            <View style={styles.second}>
              <GoodThumb good="milk" size={30} />
            </View>
          </View>
          <Text style={styles.farmText}>Hens and cows · sell eggs and milk</Text>
        </View>
        <View style={styles.shop}>
          <Bust look={NPC.look} size={36} />
          <Text style={styles.shopText}>{NPC.name.split(" ")[0]} in the Café sells furniture for your home.</Text>
        </View>
        </SharpScrollView>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" testID="world-coins-close" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Ionicons name="close" size={18} color={hud.forest} />
        </Pressable>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  scrim: { backgroundColor: hud.scrim },
  scroll: { alignSelf: "stretch", flexGrow: 0 },
  scrollBody: { alignItems: "center" },
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
    ...popShadow(5),
  },
  close: { position: "absolute", top: 10, right: 10, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: hud.primarySoft },
  pressed: { opacity: 0.7 },
  hero: { width: 120, height: 76, alignItems: "center", justifyContent: "center" },
  spark: { position: "absolute", color: gold.text },
  balance: { fontFamily: fonts.display, fontSize: 30, color: hud.forest, marginTop: 2 },
  unit: { fontSize: 13, fontWeight: "700", color: gold.text, marginBottom: 12 },
  heading: { alignSelf: "stretch", fontFamily: fonts.display, fontSize: 16, color: hud.forest, marginBottom: 6 },
  lead: { alignSelf: "stretch", fontSize: 13, lineHeight: 18, color: hud.primary, marginBottom: 6 },
  row: { alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 6, borderRadius: 14, backgroundColor: hud.primarySoft },
  game: { fontWeight: "800", fontSize: 14, color: hud.forest },
  tiers: { fontWeight: "700", fontSize: 13, color: gold.text },
  note: { alignSelf: "stretch", fontSize: 13, lineHeight: 18, color: hud.primary, marginTop: 4 },
  farmLead: { marginTop: 10 },
  farmRow: { justifyContent: "flex-start", paddingVertical: 5 },
  farmText: { flex: 1, fontWeight: "800", fontSize: 13.5, color: hud.forest },
  goods: { flexDirection: "row", width: 30 },
  second: { marginLeft: -16 },
  shop: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, padding: 8, borderRadius: 16, backgroundColor: hud.accentSoft },
  shopText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600", color: hud.forest },
});
