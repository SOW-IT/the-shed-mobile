import { fonts } from "@/theme";
import { type Look } from "@shared/world";
import { shortName } from "@shared/names";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Bust, usePresence } from "./Overlays";
import { hud } from "./palette";
import { useCardName } from "./settings";

export const InviteCard = ({ name, look, onGo, onLater }: { name: string; look: Look; onGo: () => void; onLater: () => void }) => {
  const [answer, setAnswer] = useState<"go" | "later" | null>(null);
  const cardName = useCardName();
  const { mounted, shown: pop, calm } = usePresence(answer === null);
  const fired = useRef(false);
  useEffect(() => {
    if (mounted || answer === null || fired.current) return;
    fired.current = true;
    if (answer === "go") onGo();
    else onLater();
  }, [mounted, answer, onGo, onLater]);
  if (!mounted) return null;
  return (
    <Animated.View
      style={[styles.card, calm ? { opacity: pop } : { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}
      pointerEvents={answer === null ? "auto" : "none"}
      testID="world-invite"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.top}>
        <Bust look={look} size={40} />
        <Text style={styles.house}>🏠</Text>
        <Text style={styles.text} numberOfLines={2}>
          {`${cardName(name)} invited you home`}
        </Text>
      </View>
      <View style={styles.row}>
        <Pressable onPress={() => setAnswer("go")} accessibilityRole="button" accessibilityLabel={`Go to ${shortName(name)}'s home`} testID="world-invite-go" style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
          <Text style={styles.goText}>Go</Text>
        </Pressable>
        <Pressable onPress={() => setAnswer("later")} accessibilityRole="button" accessibilityLabel="Not now" testID="world-invite-later" style={({ pressed }) => [styles.later, pressed && styles.pressed]}>
          <Text style={styles.laterText}>Not now</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 260,
    gap: 8,
    padding: 10,
    borderRadius: 18,
    backgroundColor: hud.card,
    borderWidth: 2.5,
    borderColor: hud.forest,
    shadowColor: hud.forest,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  house: { fontSize: 20 },
  text: { flex: 1, color: hud.forest, fontFamily: fonts.display, fontSize: 15 },
  row: { flexDirection: "row", gap: 8 },
  go: { flex: 1, backgroundColor: hud.accent, borderRadius: 999, paddingVertical: 8, alignItems: "center", borderWidth: 2, borderColor: hud.forest },
  goText: { color: hud.onAccent, fontWeight: "700", fontSize: 14 },
  later: { flex: 1, backgroundColor: hud.primarySoft, borderRadius: 999, paddingVertical: 8, alignItems: "center" },
  laterText: { color: hud.forest, fontWeight: "600", fontSize: 14 },
  pressed: { opacity: 0.75 },
});
