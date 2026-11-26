import { fonts } from "@/theme";
import { type Look } from "@shared/world";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Bust, usePresence } from "./Overlays";
import { hud } from "./palette";
import { popShadow } from "./popShadow";
import { useWorldName } from "./settings";

const HomeCard = ({
  emoji,
  text,
  look,
  yesLabel,
  yesHint,
  yesTestID,
  laterTestID,
  testID,
  onPick,
  onYes,
  onLater,
}: {
  emoji: string;
  text: string;
  look: Look;
  yesLabel: string;
  yesHint: string;
  yesTestID: string;
  laterTestID: string;
  testID: string;
  onPick?: (yes: boolean) => void;
  onYes: () => void;
  onLater: () => void;
}) => {
  const [answer, setAnswer] = useState<"yes" | "later" | null>(null);
  const { mounted, shown: pop, calm } = usePresence(answer === null);
  const picked = useRef(false);
  const fired = useRef(false);
  const choose = (next: "yes" | "later") => {
    if (picked.current) return;
    picked.current = true;
    setAnswer(next);
    onPick?.(next === "yes");
  };
  useEffect(() => {
    if (mounted || answer === null || fired.current) return;
    fired.current = true;
    if (answer === "yes") onYes();
    else onLater();
  }, [mounted, answer, onYes, onLater]);
  if (!mounted) return null;
  return (
    <Animated.View
      style={[styles.card, calm ? { opacity: pop } : { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}
      pointerEvents={answer === null ? "auto" : "none"}
      testID={testID}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.top}>
        <Bust look={look} size={40} />
        <Text style={styles.house}>{emoji}</Text>
        <Text style={styles.text} numberOfLines={2}>
          {text}
        </Text>
      </View>
      <View style={styles.row}>
        <Pressable onPress={() => choose("yes")} accessibilityRole="button" accessibilityLabel={yesHint} testID={yesTestID} style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
          <Text style={styles.goText}>{yesLabel}</Text>
        </Pressable>
        <Pressable onPress={() => choose("later")} accessibilityRole="button" accessibilityLabel="Not now" testID={laterTestID} style={({ pressed }) => [styles.later, pressed && styles.pressed]}>
          <Text style={styles.laterText}>Not now</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
};

export const InviteCard = ({ name, look, onGo, onLater }: { name: string; look: Look; onGo: () => void; onLater: () => void }) => {
  const worldName = useWorldName();
  const display = worldName(name);
  return (
    <HomeCard
      emoji="🏠"
      text={`${display} invited you home`}
      look={look}
      yesLabel="Go"
      yesHint={`Go to ${display}'s home`}
      yesTestID="world-invite-go"
      laterTestID="world-invite-later"
      testID="world-invite"
      onYes={onGo}
      onLater={onLater}
    />
  );
};

export const KnockCard = ({ name, look, onAnswer, onGone }: { name: string; look: Look; onAnswer: (allow: boolean) => void; onGone: () => void }) => {
  const worldName = useWorldName();
  const display = worldName(name);
  return (
    <HomeCard
      emoji="🚪"
      text={`${display} wants to visit your home`}
      look={look}
      yesLabel="Let in"
      yesHint={`Let ${display} into your home`}
      yesTestID="world-knock-allow"
      laterTestID="world-knock-later"
      testID="world-knock"
      onPick={onAnswer}
      onYes={onGone}
      onLater={onGone}
    />
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
    ...popShadow(),
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
