import Ionicons from "@expo/vector-icons/Ionicons";
import * as Updates from "expo-updates";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, spacing, typography, useAppTheme } from "@/theme";

export function OtaUpdateBanner() {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const { isUpdatePending } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  if (Platform.OS === "web" || !Updates.isEnabled || !isUpdatePending || dismissed) return null;
  const restart = () => {
    setRestarting(true);
    void Updates.reloadAsync().catch(() => setRestarting(false));
  };
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + spacing.lg }]}
    >
      <View style={[styles.banner, t.shadowFloat, { backgroundColor: t.primary }]}>
        <Ionicons name="sparkles-outline" size={18} color={t.onPrimary} />
        <Text style={[typography.caption, styles.text, { color: t.onPrimary }]}>
          An update is ready. Restart to get it.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restart The SHED"
          onPress={restart}
          disabled={restarting}
          style={({ pressed }) => [
            styles.restart,
            { backgroundColor: t.onPrimary },
            (pressed || restarting) && { opacity: 0.7 },
          ]}
        >
          <Text style={[typography.label, { color: t.primary }]}>
            {restarting ? "Restarting" : "Restart"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not now"
          hitSlop={8}
          onPress={() => setDismissed(true)}
        >
          <Ionicons name="close" size={18} color={t.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    maxWidth: 520,
  },
  text: { flexShrink: 1, fontWeight: "600" },
  restart: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
});
