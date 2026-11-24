import { usePaid } from "@/lib/games/gameStorage";
import { useEffect, useState } from "react";
import { Animated, Platform, StyleSheet, Text } from "react-native";
import { fixedColours, fonts } from "@/theme";
import { GoldCoin } from "./GoldCoin";

const NATIVE = Platform.OS !== "web";
const gold = fixedColours.games.coin;

export const CoinGain = ({ runId }: { runId: string | null }) => {
  const coins = usePaid(runId);
  const [pop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (coins === undefined) return;
    pop.setValue(0);
    const run = Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: NATIVE });
    run.start();
    return () => run.stop();
  }, [coins, pop]);
  if (coins === undefined) return null;
  const capped = coins === 0;
  return (
    <Animated.View
      style={[
        styles.chip,
        capped && styles.capped,
        { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }, { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
      ]}
      accessible
      accessibilityLabel={capped ? "No more coins today" : `${coins} coins earned`}
      testID="game-coins"
    >
      <GoldCoin size={22} />
      <Text style={[styles.text, capped && styles.cappedText]}>{capped ? "Max today" : `+${coins}`}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", paddingVertical: 4, paddingLeft: 4, paddingRight: 12, borderRadius: 999, backgroundColor: gold.chip, borderWidth: 2, borderColor: gold.face },
  capped: { backgroundColor: gold.capped, borderColor: gold.capped },
  text: { fontFamily: fonts.display, fontSize: 18, color: gold.text },
  cappedText: { fontSize: 14, color: gold.cappedText },
});
