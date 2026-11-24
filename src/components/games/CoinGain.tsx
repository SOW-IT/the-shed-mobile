import { usePaid } from "@/lib/games/gameStorage";
import { ordinal } from "@shared/coins";
import { GAME_INFO, type GameId } from "@shared/games";
import { useEffect, useState } from "react";
import { Animated, Platform, StyleSheet, Text } from "react-native";
import { fixedColours, fonts } from "@/theme";
import { GoldCoin } from "./GoldCoin";

const NATIVE = Platform.OS !== "web";
const gold = fixedColours.games.coin;

/** Pops up on the game-over card when the run's place on the leaderboard paid coins, saying which place. */
export const CoinGain = ({ runId, game }: { runId: string | null; game: GameId }) => {
  const payout = usePaid(runId);
  const coins = payout?.coins ?? 0;
  const [pop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (coins <= 0) return;
    pop.setValue(0);
    const run = Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: NATIVE });
    run.start();
    return () => run.stop();
  }, [coins, pop]);
  if (coins <= 0) return null;
  const why = payout?.place === undefined ? null : `${ordinal(payout.place)} place on ${GAME_INFO[game].title}`;
  return (
    <Animated.View
      style={[
        styles.chip,
        { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }, { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
      ]}
      accessible
      accessibilityLabel={why ? `${why}: ${coins} coins` : `${coins} coins earned`}
      testID="game-coins"
    >
      <GoldCoin size={22} />
      {why ? (
        <Text style={styles.why} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {why}:
        </Text>
      ) : null}
      <Text style={styles.text}>+{coins}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", maxWidth: "100%", paddingVertical: 4, paddingLeft: 4, paddingRight: 12, borderRadius: 999, backgroundColor: gold.chip, borderWidth: 2, borderColor: gold.face },
  why: { flexShrink: 1, fontSize: 14, fontWeight: "800", color: gold.text },
  text: { fontFamily: fonts.display, fontSize: 18, color: gold.text },
});
