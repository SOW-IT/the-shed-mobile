import Ionicons from "@expo/vector-icons/Ionicons";
import { useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Btn, ErrorBanner, Muted, OptionSheet, Row } from "@/components/ui";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { radius, spacing, typography, useAppTheme } from "@/theme";

/**
 * What's been closed since the app launched: the update popup and the pill
 * in the top bar. Nothing is saved, so both come back at the next launch for
 * as long as this version is behind the recommended one.
 */
type Dismissed = { popup: boolean; pill: boolean };
let dismissed: Dismissed = { popup: false, pill: false };
const dismissListeners = new Set<() => void>();

const dismiss = (which: keyof Dismissed) => {
  dismissed = { ...dismissed, [which]: true };
  dismissListeners.forEach((listener) => listener());
};

const subscribeDismissed = (listener: () => void) => {
  dismissListeners.add(listener);
  return () => {
    dismissListeners.delete(listener);
  };
};

const getDismissed = () => dismissed;

const useDismissed = () => useSyncExternalStore(subscribeDismissed, getDismissed, getDismissed);

export function AppUpdatePrompt() {
  const t = useAppTheme();
  const { check, version, busy, label, error, update } = useAppUpdate();
  const closed = useDismissed();
  if (check?.status === "recommended") {
    const recommended = check.latest ?? "the latest version";
    return (
      <OptionSheet visible={!closed.popup} title="Update The SHED" onClose={() => dismiss("popup")}>
        <Muted>{check.message ?? `There's a newer version of The SHED (${recommended}). Update to get the latest.`}</Muted>
        <ErrorBanner message={error} />
        <Row spread>
          <Btn title="Not now" variant="ghost" onPress={() => dismiss("popup")} />
          <Btn title={label ?? "Update"} icon="arrow-down-circle-outline" onPress={update} disabled={busy} />
        </Row>
      </OptionSheet>
    );
  }
  if (check?.status !== "required") return null;
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.blocker, { backgroundColor: t.background }]}
      accessibilityViewIsModal
    >
      <Ionicons name="cloud-download-outline" size={56} color={t.primary} />
      <Text style={[typography.title, { color: t.text, textAlign: "center" }]}>Update The SHED</Text>
      <Text style={[typography.body, { color: t.muted, textAlign: "center" }]}>
        {check.message ??
          `This version (${version}) is no longer supported. Update to ${check.latest ?? "the latest version"} to keep using The SHED.`}
      </Text>
      <Btn title={label ?? "Update"} icon="arrow-down-circle-outline" disabled={busy} onPress={update} />
      <ErrorBanner message={error} />
    </View>
  );
}

export function UpdatePill() {
  const t = useAppTheme();
  const { check, busy, label, error, update } = useAppUpdate();
  const closed = useDismissed();
  if (check?.status !== "recommended" || closed.pill) return null;
  const recommended = check.latest ?? "";
  return (
    <View style={[styles.pill, { backgroundColor: t.primary }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? error ?? check.message ?? `Update The SHED to ${recommended}`}
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={update}
        style={({ pressed }) => [styles.pillMain, pressed && { opacity: 0.75 }]}
      >
        <Ionicons name={error ? "refresh" : "arrow-down-circle"} size={16} color={t.onPrimary} />
        <Text style={[typography.caption, { color: t.onPrimary, fontWeight: "800" }]}>
          {label ?? (error ? "Retry update" : recommended ? `Update ${recommended}` : "Update")}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Not now" hitSlop={10} onPress={() => dismiss("pill")}>
        <Ionicons name="close" size={16} color={t.onPrimary} />
      </Pressable>
    </View>
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
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 7,
    borderRadius: radius.full,
  },
  pillMain: { flexDirection: "row", alignItems: "center", gap: 6 },
});
