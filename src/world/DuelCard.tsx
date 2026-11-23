import { DUEL_PICK_ORDER, DUEL_PICKS, type DuelPick } from "@shared/world";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { announce } from "./announce";
import { choosing, type DuelView } from "./duel";
import { hud } from "./palette";

const TICK_MS = 100;

export const DuelCard = ({
  duel,
  opponentName,
  serverNow,
  onPick,
}: {
  duel: DuelView | null;
  opponentName: string;
  serverNow: () => number;
  onPick: (pick: DuelPick) => void;
}) => {
  const [now, setNow] = useState(serverNow);
  const live = choosing(duel, now);
  const endsAt = duel?.endsAt ?? 0;
  const round = duel?.round ?? 1;
  const waiting = duel !== null && !duel.done;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(serverNow()), TICK_MS);
    return () => clearInterval(id);
  }, [waiting, endsAt, serverNow]);
  useEffect(() => {
    if (live) announce(round > 1 ? "Draw. Pick again." : `Rock paper scissors with ${opponentName}. Pick one.`);
  }, [live, round, opponentName]);
  if (!duel || !live) return null;
  const left = Math.max(0, Math.ceil((duel.endsAt - now) / 1000));
  const share = Math.max(0, Math.min(1, (duel.endsAt - now) / (duel.endsAt - duel.startsAt)));
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
        <View style={[styles.left, { width: `${share * 100}%` }]} />
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
    shadowColor: hud.forest,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
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
  left: { height: 5, backgroundColor: hud.accent },
});
