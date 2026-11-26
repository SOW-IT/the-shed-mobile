import { fonts } from "@/theme";
import { INTRO_MS } from "@shared/mahjong/game";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Reanimated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { mahjong as m } from "../palette";

/** When each part of the intro plays, in ms from the start of the hand. */
export const INTRO = { diceLand: 1300, wall: 1800, split: 2300, deal: 2700, dealt: 4500 } as const;

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2]],
};

const Die = ({ value, size }: { value: number; size: number }) => {
  const pip = size * 0.18;
  return (
    <View style={[styles.die, { width: size, height: size, borderRadius: size * 0.2 }]}>
      {PIPS[value].map(([r, c]) => (
        <View
          key={`${r}${c}`}
          style={[styles.pip, { width: pip, height: pip, borderRadius: pip, top: size * 0.14 + r * size * 0.27, left: size * 0.14 + c * size * 0.27, backgroundColor: value === 1 || value === 4 ? m.characters : m.honour }]}
        />
      ))}
    </View>
  );
};

/** A die that tumbles (spinning, showing other faces) until it lands on its value. */
const Tumbling = ({ value, landed, index, calm }: { value: number; landed: boolean; index: number; calm: boolean }) => {
  const spin = useSharedValue(0);
  useEffect(() => {
    if (calm || landed) {
      cancelAnimation(spin);
      spin.set(calm ? 0 : withTiming(Math.round(spin.get() / 360) * 360 + 360, { duration: 260, easing: Easing.out(Easing.back(1.6)) }));
      return;
    }
    spin.set(withRepeat(withTiming(spin.get() + 360, { duration: 380 + index * 60, easing: Easing.linear }), -1));
  }, [landed, calm, index, spin]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }, { translateY: landed || calm ? 0 : -6 * Math.abs(Math.sin((spin.get() * Math.PI) / 180)) }] }));
  return (
    <Reanimated.View style={style}>
      <Die value={value} size={26} />
    </Reanimated.View>
  );
};

const WALL_SIDES = [{ bottom: 2, left: 28 }, { right: 2, top: 28 }, { top: 2, left: 28 }, { left: 2, top: 28 }] as const;

/** The wall: four sides of stacks round the middle, broken where the dice say. */
const Wall = ({ breakAt, dealer, split }: { breakAt: number; dealer: number; split: boolean }) => {
  const STACKS = 9;
  // The break, on the dice's side counted from the dealer, so many stacks along.
  const side = (dealer + breakAt - 1) % 4;
  const at = breakAt % STACKS;
  const sides = [0, 1, 2, 3].map((s) => Array.from({ length: STACKS }, (_, i) => ({ key: `${s}-${i}`, gap: split && s === side && (i === at || i === at + 1) })));
  return (
    <View style={styles.wall} testID="mahjong-wall">
      {sides.map((stacks, s) => (
        <View key={stacks[0].key} style={[styles.wallSide, s % 2 === 1 && styles.wallSideTall, WALL_SIDES[s]]}>
          {stacks.map((stack) => (
            <View key={stack.key} style={[s % 2 === 1 ? styles.stackTall : styles.stack, stack.gap && styles.stackGone]} />
          ))}
        </View>
      ))}
    </View>
  );
};

/**
 * The start of a hand: the dice tumble and land (on the first hand they
 * pick the dealer), the wall splits where they say, and the tiles are dealt
 * (the hand fills in fours below; see `dealtCount`).
 */
export const Intro = ({ dice, breakAt, dealer, dealerName, until, now, calm }: { dice: number[]; breakAt: number; dealer: number; dealerName: string; until: number; now: number; calm: boolean }) => {
  const elapsed = INTRO_MS - Math.max(0, until - now);
  const landed = calm || elapsed >= INTRO.diceLand;
  const total = dice.reduce((a, b) => a + b, 0);
  return (
    <View style={styles.intro} testID="mahjong-intro" accessibilityLiveRegion="polite">
      {elapsed >= INTRO.wall || calm ? <Wall breakAt={breakAt} dealer={dealer} split={calm || elapsed >= INTRO.split} /> : null}
      <View style={styles.dice} testID="mahjong-dice">
        {dice.map((value, i) => (
          // The three dice never change places, so their order is their key.
          // eslint-disable-next-line react/no-array-index-key -- fixed positions, never reordered
          <Tumbling key={i} value={landed ? value : ((value + Math.floor(elapsed / 120) + i) % 6) + 1} landed={landed} index={i} calm={calm} />
        ))}
      </View>
      {landed ? (
        <Text style={styles.introText} accessibilityLabel={`The dice say ${total}. ${dealerName} ${dealerName === "You" ? "deal" : "deals"}.`}>
          {`${total} · ${dealerName} ${dealerName === "You" ? "deal" : "deals"}`}
        </Text>
      ) : null}
    </View>
  );
};

/** How many of your tiles are dealt so far: four at a time to each seat, then one more. */
export const dealtCount = (elapsed: number, total: number, calm: boolean) => {
  if (calm || elapsed >= INTRO.dealt) return total;
  if (elapsed < INTRO.deal) return 0;
  const rounds = Math.floor(((elapsed - INTRO.deal) / (INTRO.dealt - INTRO.deal)) * 4) + 1;
  return Math.min(total, rounds * 4);
};

const STACK = { w: 8, h: 5 };
const styles = StyleSheet.create({
  intro: { width: 150, height: 150, alignItems: "center", justifyContent: "center" },
  dice: { flexDirection: "row", gap: 8, zIndex: 2 },
  die: { backgroundColor: m.tile, borderWidth: 1, borderColor: m.tileEdge, borderBottomWidth: 3, borderBottomColor: m.tileSide },
  pip: { position: "absolute" },
  introText: { marginTop: 8, fontFamily: fonts.display, fontSize: 13, color: m.text, textAlign: "center", zIndex: 2 },
  wall: { position: "absolute", left: 0, top: 0, width: 150, height: 150 },
  wallSide: { position: "absolute", flexDirection: "row", gap: 2 },
  wallSideTall: { flexDirection: "column" },
  stack: { width: STACK.w, height: STACK.h * 2, borderRadius: 2, backgroundColor: m.back, borderBottomWidth: 2, borderBottomColor: m.backEdge },
  stackTall: { width: STACK.h * 2, height: STACK.w, borderRadius: 2, backgroundColor: m.back, borderRightWidth: 2, borderRightColor: m.backEdge },
  stackGone: { opacity: 0 },
});
