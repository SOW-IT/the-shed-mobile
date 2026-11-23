import Ionicons from "@expo/vector-icons/Ionicons";
import { useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Btn, Muted, OptionSheet, Row } from "@/components/ui";
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

const useUpdateCheck = () => {
  const update = useAppUpdate();
  const closed = useSyncExternalStore(subscribeDismissed, getDismissed, getDismissed);
  return { ...update, closed };
};

type UpdateCheck = ReturnType<typeof useUpdateCheck>;

/** The button that does the update: a restart, or the store. */
const UpdateButton = ({ check }: { check: UpdateCheck }) =>
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

const promptText = (check: UpdateCheck) => {
  if (check.failed) return "The update didn't download. Check your connection and try again.";
  const latest = check.latest ?? "the latest version";
  if (check.route === "restart") {
    return check.status === "required"
      ? `This version (${check.version}) is no longer supported. Version ${latest} is ready: restart The SHED to start using it.`
      : `Version ${latest} of The SHED is ready. Restart to start using it.`;
  }
  if (check.message) return check.message;
  return check.status === "required"
    ? `This version (${check.version}) is no longer supported. Update to ${latest} in the ${check.store} to keep using The SHED.`
    : `There's a newer version of The SHED (${latest}) in the ${check.store}. Update to get the latest.`;
};

export function AppUpdatePrompt() {
  const t = useAppTheme();
  const check = useUpdateCheck();
  if (!check.route || check.route === "wait") return null;
  if (check.status === "recommended") {
    return (
      <OptionSheet
        visible={!check.closed.popup}
        title={check.route === "restart" ? "Update ready" : "Update The SHED"}
        onClose={() => dismiss("popup")}
      >
        <Muted>{promptText(check)}</Muted>
        <Row spread>
          <Btn title="Not now" variant="ghost" onPress={() => dismiss("popup")} />
          <UpdateButton check={check} />
        </Row>
      </OptionSheet>
    );
  }
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.blocker, { backgroundColor: t.background }]}
      accessibilityViewIsModal
    >
      <Ionicons name="cloud-download-outline" size={56} color={t.primary} />
      <Text style={[typography.title, { color: t.text, textAlign: "center" }]}>Update The SHED</Text>
      <Text style={[typography.body, { color: t.muted, textAlign: "center" }]}>{promptText(check)}</Text>
      <UpdateButton check={check} />
    </View>
  );
}

export function UpdatePill() {
  const t = useAppTheme();
  const check = useUpdateCheck();
  if (check.status !== "recommended" || !check.route || check.route === "wait" || check.closed.pill) return null;
  const restart = check.route === "restart";
  const label = restart ? "Restart to update" : check.latest ? `Update ${check.latest}` : "Update";
  return (
    <View style={[styles.pill, { backgroundColor: t.primary }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={restart ? `Restart The SHED into ${check.latest ?? "the update"}` : `Update The SHED in the ${check.store}`}
        onPress={restart ? check.restart : check.openStore}
        disabled={check.restarting}
        style={({ pressed }) => [styles.pillMain, pressed && { opacity: 0.75 }]}
      >
        <Ionicons name={restart ? "refresh" : "arrow-down-circle"} size={16} color={t.onPrimary} />
        <Text style={[typography.caption, { color: t.onPrimary, fontWeight: "800" }]}>
          {check.restarting ? "Restarting…" : label}
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
