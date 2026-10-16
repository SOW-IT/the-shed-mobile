import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { appLinkForScheme } from "../../shared/appLinks";
import { Btn } from "@/components/ui";
import { appVersion } from "@/hooks/useReportAppVersion";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const nativePlatform = (): "ios" | "android" | null =>
  Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : null;

const DISMISSED_KEY = "updatePromptDismissedFor";

const appScheme = (): string | undefined => {
  const scheme = Constants.expoConfig?.scheme;
  return Array.isArray(scheme) ? scheme[0] : scheme;
};

let dismissedFor: string | null | undefined;
let loadingDismissed = false;
const dismissListeners = new Set<() => void>();

const setDismissedFor = (value: string | null) => {
  dismissedFor = value;
  dismissListeners.forEach((listener) => listener());
};

const subscribeDismissed = (listener: () => void) => {
  dismissListeners.add(listener);
  if (dismissedFor === undefined && !loadingDismissed && nativePlatform()) {
    loadingDismissed = true;
    SecureStore.getItemAsync(DISMISSED_KEY).then(
      (value) => setDismissedFor(value),
      () => setDismissedFor(null)
    );
  }
  return () => {
    dismissListeners.delete(listener);
  };
};

const getDismissed = () => dismissedFor;

const useUpdateCheck = () => {
  const platform = nativePlatform();
  const version = appVersion();
  const link = appLinkForScheme(appScheme());
  const storeUrl = platform === "ios" ? link.iosStore : platform === "android" ? link.androidStore : null;
  const check = useQuery(
    api.appInstalls.updateStatus,
    platform && version && storeUrl ? { platform, version } : "skip"
  );
  const dismissed = useSyncExternalStore(subscribeDismissed, getDismissed, getDismissed);
  const openStore = () => {
    if (storeUrl) void Linking.openURL(storeUrl).catch(() => {});
  };
  return { check: storeUrl ? check : undefined, version, dismissed, openStore };
};

export function AppUpdatePrompt() {
  const t = useAppTheme();
  const { check, version, openStore } = useUpdateCheck();
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
      <Btn title="Update" icon="arrow-down-circle-outline" onPress={openStore} />
    </View>
  );
}

export function UpdatePill() {
  const t = useAppTheme();
  const { check, dismissed, openStore } = useUpdateCheck();
  if (check?.status !== "recommended") return null;
  const recommended = check.latest ?? "";
  if (dismissed === undefined || dismissed === recommended) return null;
  const dismiss = () => {
    setDismissedFor(recommended);
    void SecureStore.setItemAsync(DISMISSED_KEY, recommended).catch(() => {});
  };
  return (
    <View style={[styles.pill, { backgroundColor: t.primary }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={check.message ?? `Update The SHED to ${recommended}`}
        onPress={openStore}
        style={({ pressed }) => [styles.pillMain, pressed && { opacity: 0.75 }]}
      >
        <Ionicons name="arrow-down-circle" size={16} color={t.onPrimary} />
        <Text style={[typography.caption, { color: t.onPrimary, fontWeight: "800" }]}>
          {recommended ? `Update ${recommended}` : "Update"}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Not now" hitSlop={10} onPress={dismiss}>
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
