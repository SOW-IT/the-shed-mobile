import { fonts } from "@/theme";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { GoldCoin } from "@/components/games/GoldCoin";
import { gold, hud } from "./palette";

const NATIVE = Platform.OS !== "web";

export const useCoins = () => useQuery(api.coins.mine, {});

export const CoinCounter = ({ balance }: { balance: number | undefined }) => {
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
    <View style={styles.wrap} accessible accessibilityLabel={balance === undefined ? "Coins loading" : `${balance} coins`} testID="world-coins">
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
    </View>
  );
};

const styles = StyleSheet.create({
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
