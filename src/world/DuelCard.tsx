import { DUEL_PICK_ORDER, DUEL_PICKS, isDuelPick, type DuelPick } from "@shared/world";
import { useEffect, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { announce } from "./announce";
import { choosing, type DuelView } from "./duel";
import { duelWakeDelay } from "./duelTiming";
import { hud } from "./palette";
import { popShadow } from "./popShadow";

const NATIVE = Platform.OS !== "web";
const pickName = (pick: string) => (isDuelPick(pick) ? DUEL_PICKS[pick].label.toLowerCase() : pick);
const pickIcon = (pick: string) => (isDuelPick(pick) ? DUEL_PICKS[pick].icon : "");

export const DuelCard = ({
  duel,
  side,
  opponentName,
  serverNow,
  onPick,
  showResult = false,
}: {
  duel: DuelView | null;
  side: "a" | "b";
  opponentName: string;
  serverNow: () => number;
  onPick: (pick: DuelPick) => void;
  showResult?: boolean;
}) => {
  const [now, setNow] = useState(serverNow);
  const [bar] = useState(() => new Animated.Value(1));
  const live = choosing(duel, now);
  const startsAt = duel?.startsAt ?? 0;
  const endsAt = duel?.endsAt ?? 0;
  const round = duel?.round ?? 1;
  useEffect(() => {
    const wait = duelWakeDelay(duel, now, serverNow(), showResult);
    if (wait === null) return;
    const id = setTimeout(() => setNow(serverNow()), wait);
    return () => clearTimeout(id);
  }, [duel, now, showResult, serverNow]);
  useEffect(() => {
    if (!live || endsAt <= startsAt) return;
    const current = serverNow();
    const remaining = Math.max(0, endsAt - current);
    const initial = Math.max(0, Math.min(1, remaining / (endsAt - startsAt)));
    bar.setValue(initial);
    const run = Animated.timing(bar, {
      toValue: 0,
      duration: remaining,
      easing: Easing.linear,
      useNativeDriver: NATIVE,
    });
    run.start();
    return () => run.stop();
  }, [live, startsAt, endsAt, round, bar, serverNow]);
  useEffect(() => {
    if (live) announce(round > 1 ? "Draw. Pick again." : `Scissors paper rock with ${opponentName}. Pick one.`);
  }, [live, round, opponentName]);
  const shown = duel?.shown;
  const revealed = showResult && !live && shown !== undefined && now >= shown.at;
  const mine = shown ? shown[side] : "";
  const theirs = shown ? shown[side === "a" ? "b" : "a"] : "";
  const verdict = !shown || shown.winner === "draw" ? "Draw!" : shown.winner === side ? "You win!" : `${opponentName} wins.`;
  const said = revealed ? `You picked ${pickName(mine)}, ${opponentName} picked ${pickName(theirs)}. ${verdict}` : null;
  useEffect(() => {
    if (said) announce(said);
  }, [said]);
  if (!duel) return null;
  if (!live) {
    if (said === null) return null;
    return (
      <View style={styles.card} testID="world-duel-result" accessible accessibilityLabel={said}>
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={1}>
            {verdict}
          </Text>
        </View>
        <View style={styles.row}>
          <View style={[styles.pick, shown?.winner === side && styles.picked]}>
            <Text style={styles.icon}>{pickIcon(mine)}</Text>
            <Text style={[styles.label, shown?.winner === side && styles.pickedLabel]}>You</Text>
          </View>
          <View style={[styles.pick, shown !== undefined && shown.winner !== side && shown.winner !== "draw" && styles.picked]}>
            <Text style={styles.icon}>{pickIcon(theirs)}</Text>
            <Text
              style={[styles.label, shown !== undefined && shown.winner !== side && shown.winner !== "draw" && styles.pickedLabel]}
              numberOfLines={1}
            >
              {opponentName}
            </Text>
          </View>
        </View>
      </View>
    );
  }
  const left = Math.max(0, Math.ceil((duel.endsAt - now) / 1000));
  return (
    <View style={styles.card} testID="world-duel">
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>
          {round > 1 ? "Draw! Go again" : `vs ${opponentName}`}
        </Text>
        <Text style={styles.count} accessibilityLabel={`${left} seconds left`}>
          {left}
        </Text>
      </View>
      <View style={styles.row}>
        {DUEL_PICK_ORDER.map((pick) => {
          const picked = duel.myPick === pick;
          return (
            <Pressable
              key={pick}
              onPress={() => onPick(pick)}
              accessibilityRole="button"
              accessibilityLabel={DUEL_PICKS[pick].label}
              accessibilityState={{ selected: picked }}
              testID={`world-duel-${pick}`}
              style={({ pressed }) => [styles.pick, picked && styles.picked, pressed && styles.pressed]}
            >
              <Text style={styles.icon}>{DUEL_PICKS[pick].icon}</Text>
              <Text style={[styles.label, picked && styles.pickedLabel]}>{DUEL_PICKS[pick].label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.left, { transform: [{ scaleX: bar }] }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 8,
    backgroundColor: hud.card,
    borderRadius: 22,
    padding: 10,
    borderWidth: 2.5,
    borderColor: hud.forest,
    ...popShadow(),
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  title: { flex: 1, color: hud.forest, fontSize: 15, fontWeight: "800" },
  count: { color: hud.accent, fontSize: 22, fontWeight: "900", minWidth: 24, textAlign: "right" },
  row: { flexDirection: "row", gap: 8 },
  pick: {
    flex: 1,
    height: 72,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: hud.accentSoft,
    borderWidth: 2.5,
    borderColor: "transparent",
  },
  picked: { backgroundColor: hud.accent, borderColor: hud.forest },
  pressed: { opacity: 0.75 },
  icon: { fontSize: 30 },
  label: { fontSize: 12, fontWeight: "700", color: hud.forest, marginTop: 2 },
  pickedLabel: { color: hud.onAccent },
  track: { height: 5, borderRadius: 3, backgroundColor: hud.primarySoft, overflow: "hidden" },
  left: { width: "100%", height: 5, backgroundColor: hud.accent, transformOrigin: "left" },
});
