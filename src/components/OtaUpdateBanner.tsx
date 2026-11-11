import Ionicons from "@expo/vector-icons/Ionicons";
import { requireOptionalNativeModule } from "expo";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useAnyModalOpen } from "@/components/ui/modalPresence";
import { FastModal } from "@/components/ui/primitives";
import { radius, spacing, typography, useAppTheme } from "@/theme";

type UpdatesModule = typeof import("expo-updates");

const loadUpdates = (): UpdatesModule | null => {
  if (Platform.OS === "web" || !requireOptionalNativeModule("ExpoUpdates")) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-updates") as UpdatesModule;
};

const updatesModule = loadUpdates();

// iOS can't present a popup while a sheet is closing, and closing a sheet takes
// down a popup shown over it, so wait until no sheet is open and the last has gone.
const SHEET_CLOSE_MS = 400;

const useNoSheetOpen = () => {
  const sheetOpen = useAnyModalOpen();
  const [settled, setSettled] = useState(true);
  useEffect(() => {
    if (sheetOpen) return () => setSettled(false);
    const timer = setTimeout(() => setSettled(true), SHEET_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [sheetOpen]);
  return !sheetOpen && settled;
};

export function OtaUpdateBanner() {
  return updatesModule?.isEnabled ? <PendingUpdatePopup updates={updatesModule} /> : null;
}

function PendingUpdatePopup({
  updates,
}: {
  updates: Pick<UpdatesModule, "useUpdates" | "reloadAsync">;
}) {
  const t = useAppTheme();
  const { isUpdatePending } = updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const noSheetOpen = useNoSheetOpen();
  const restart = () => {
    setRestarting(true);
    void updates.reloadAsync().catch(() => setRestarting(false));
  };
  const dismiss = () => setDismissed(true);
  return (
    <FastModal visible={isUpdatePending && !dismissed && noSheetOpen} onRequestClose={dismiss}>
      <View
        style={[styles.backdrop, { backgroundColor: t.dark ? "rgba(0, 0, 0, 0.6)" : "rgba(15, 37, 35, 0.45)" }]}
      >
        <View
          accessibilityViewIsModal
          style={[styles.card, t.shadowFloat, { backgroundColor: t.card }]}
        >
          <View style={[styles.badge, { backgroundColor: t.primarySoft }]}>
            <Ionicons name="sparkles" size={30} color={t.primary} />
          </View>
          <Text style={[typography.title, styles.center, { color: t.text }]}>An update is ready</Text>
          <Text style={[typography.body, styles.center, { color: t.muted }]}>
            Restart The SHED to get the latest version.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restart The SHED"
            accessibilityState={{ busy: restarting, disabled: restarting }}
            onPress={restart}
            disabled={restarting}
            style={({ pressed }) => [
              styles.restart,
              { backgroundColor: t.primary },
              (pressed || restarting) && { opacity: 0.75 },
            ]}
          >
            <Ionicons name="refresh" size={22} color={t.onPrimary} />
            <Text style={[styles.restartText, { color: t.onPrimary }]}>
              {restarting ? "Restarting" : "Restart"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Not now"
            hitSlop={8}
            onPress={dismiss}
            style={({ pressed }) => [styles.later, pressed && { opacity: 0.6 }]}
          >
            <Text style={[typography.label, { color: t.muted }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </FastModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { textAlign: "center" },
  restart: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 58,
    marginTop: spacing.sm,
    borderRadius: radius.md,
  },
  restartText: { fontSize: 18, fontWeight: "800", letterSpacing: -0.2 },
  later: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
});
