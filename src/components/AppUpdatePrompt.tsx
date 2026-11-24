import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Btn } from "@/components/ui";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { fixedColours, radius, spacing, typography, useAppTheme } from "@/theme";

type UpdateCheck = ReturnType<typeof useAppUpdate>;

const BlockerButton = ({ check }: { check: UpdateCheck }) =>
  check.route === "restart" ? (
    <Btn
      title={check.restarting ? "Restarting…" : "Restart to update"}
      icon="refresh"
      onPress={check.restart}
      disabled={check.restarting}
    />
  ) : (
    <Btn title={`Open the ${check.store}`} icon="arrow-down-circle-outline" onPress={check.openStore} />
  );

const blockerText = (check: UpdateCheck) => {
  if (check.failed) return "The update didn't download. Check your connection and try again.";
  const latest = check.latest ?? "the latest version";
  if (check.route === "restart") {
    return `This version (${check.version}) is no longer supported. Version ${latest} is ready: restart The SHED to start using it.`;
  }
  if (check.message) return check.message;
  return `This version (${check.version}) is no longer supported. Update to ${latest} in the ${check.store} to keep using The SHED.`;
};

export function AppUpdatePrompt() {
  const t = useAppTheme();
  const check = useAppUpdate();
  if (check.status !== "required" || !check.route || check.route === "wait") return null;
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.blocker, { backgroundColor: t.background }]}
      accessibilityViewIsModal
    >
      <Ionicons name="cloud-download-outline" size={56} color={t.primary} />
      <Text style={[typography.title, { color: t.text, textAlign: "center" }]}>Update The SHED</Text>
      <Text style={[typography.body, { color: t.muted, textAlign: "center" }]}>{blockerText(check)}</Text>
      <BlockerButton check={check} />
    </View>
  );
}

const storeIcon = (platform: UpdateCheck["platform"]) =>
  platform === "android" ? "logo-google-playstore" : "logo-apple-appstore";

const LABELS = {
  store: "Update",
  update: "Update",
  updating: "Updating…",
  ready: "Update ready",
  failed: "Retry update",
} as const;

const DESCRIPTIONS = {
  update: "Update The SHED",
  updating: "Updating The SHED",
  ready: "Update ready. Restart The SHED now",
  failed: "The update didn't download. Try again",
} as const;

export function UpdateButton() {
  const t = useAppTheme();
  const check = useAppUpdate();
  const state = check.state;
  if (!state) return null;
  const failed = state === "failed";
  const updating = state === "updating";
  const colour = failed ? fixedColours.onColour : t.onPrimary;
  const icon = state === "store" ? storeIcon(check.platform) : failed ? "alert-circle" : "refresh";
  return (
    <Pressable
      testID="top-bar-update"
      accessibilityRole="button"
      accessibilityLabel={state === "store" ? `Update The SHED in the ${check.store}` : DESCRIPTIONS[state]}
      accessibilityState={{ busy: updating, disabled: updating }}
      onPress={state === "store" ? check.openStore : check.restart}
      disabled={updating}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: failed ? t.dangerStrong : t.primary },
        pressed && { opacity: 0.8 },
      ]}
    >
      {updating ? (
        <ActivityIndicator size="small" color={colour} style={styles.spinner} />
      ) : (
        <Ionicons name={icon} size={14} color={colour} />
      )}
      <Text style={[styles.label, { color: colour }]}>{LABELS[state]}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  blocker: {
    zIndex: 1000,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  spinner: { width: 14, height: 14, transform: [{ scale: 0.7 }] },
  label: { ...typography.caption, fontWeight: "800" },
});
