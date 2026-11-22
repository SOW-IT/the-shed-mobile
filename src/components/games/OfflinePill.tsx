import { useOffline } from "@/hooks/useOffline";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePathname } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * A small note at the top of the screen while the connection is down, with
 * a way into the games. Nothing shows while online.
 */
export const OfflinePill = ({ onPlay }: { onPlay: () => void }) => {
  const t = useAppTheme();
  const offline = useOffline();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (!offline || pathname.startsWith("/games")) return null;
  return (
    <View style={[styles.wrap, { top: insets.top + spacing.xs }]} pointerEvents="box-none">
      <Pressable
        onPress={onPlay}
        accessibilityRole="button"
        accessibilityLabel="You're offline. Play a game"
        testID="offline-pill"
        style={({ pressed }) => [
          styles.pill,
          t.shadowFloat,
          { backgroundColor: t.card, borderColor: t.border },
          pressed && { opacity: 0.8 },
        ]}
      >
        <Ionicons name="cloud-offline-outline" size={15} color={t.muted} />
        <Text style={[typography.caption, { color: t.muted }]}>Offline</Text>
        <Text style={[typography.label, { color: t.text }]}>Play a game</Text>
        <Ionicons name="game-controller-outline" size={15} color={t.text} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
});
