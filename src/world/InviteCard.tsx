import { fonts } from "@/theme";
import { tagName, type Look } from "@shared/world";
import { useEffect, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Bust } from "./Overlays";
import { hud } from "./palette";

const NATIVE = Platform.OS !== "web";

export const InviteCard = ({ name, look, onGo, onLater }: { name: string; look: Look; onGo: () => void; onLater: () => void }) => {
  const [pop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const run = Animated.spring(pop, { toValue: 1, friction: 6, tension: 120, useNativeDriver: NATIVE });
    run.start();
    return () => run.stop();
  }, [pop]);
  return (
    <Animated.View
      style={[styles.card, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}
      testID="world-invite"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.top}>
        <Bust look={look} size={40} />
        <Text style={styles.house}>🏠</Text>
        <Text style={styles.text} numberOfLines={2}>
          {`${tagName(name)} invited you home`}
        </Text>
      </View>
      <View style={styles.row}>
        <Pressable onPress={onGo} accessibilityRole="button" accessibilityLabel={`Go to ${name}'s home`} testID="world-invite-go" style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
          <Text style={styles.goText}>Go</Text>
        </Pressable>
        <Pressable onPress={onLater} accessibilityRole="button" accessibilityLabel="Not now" testID="world-invite-later" style={({ pressed }) => [styles.later, pressed && styles.pressed]}>
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
