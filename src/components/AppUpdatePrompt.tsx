import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { appLinkForScheme } from "../../shared/appLinks";
import { Btn } from "@/components/ui";
import { TOP_BAR_HEIGHT } from "@/components/useTopBarCollapse";
import { appVersion } from "@/hooks/useReportAppVersion";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const nativePlatform = (): "ios" | "android" | null =>
  Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : null;

const DISMISSED_KEY = "updatePromptDismissedFor";

const appScheme = (): string | undefined => {
  const scheme = Constants.expoConfig?.scheme;
  return Array.isArray(scheme) ? scheme[0] : scheme;
};

export function AppUpdatePrompt() {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const [dismissedFor, setDismissedFor] = useState<string | null | undefined>(undefined);
  const platform = nativePlatform();
  const version = appVersion();
  const link = appLinkForScheme(appScheme());
  const storeUrl = platform === "ios" ? link.iosStore : platform === "android" ? link.androidStore : null;
  const check = useQuery(
    api.appInstalls.updateStatus,
    platform && version && storeUrl ? { platform, version } : "skip"
  );
  useEffect(() => {
    if (!platform) return;
    SecureStore.getItemAsync(DISMISSED_KEY).then(
      (value) => setDismissedFor(value),
      () => setDismissedFor(null)
    );
  }, [platform]);
  if (!check || !storeUrl || check.status === "ok") return null;
  const openStore = () => void Linking.openURL(storeUrl).catch(() => {});

  if (check.status === "required") {
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

  const recommended = check.latest ?? "";
  if (dismissedFor === undefined || dismissedFor === recommended) return null;
  const dismiss = () => {
    setDismissedFor(recommended);
    void SecureStore.setItemAsync(DISMISSED_KEY, recommended).catch(() => {});
  };
  return (
    <View
      style={[
        styles.banner,
        { top: insets.top + TOP_BAR_HEIGHT + spacing.xs, backgroundColor: t.card },
        t.shadowFloat,
      ]}
      accessibilityRole="alert"
    >
      <Ionicons name="sparkles-outline" size={20} color={t.primary} />
      <Text style={[typography.caption, { color: t.text, flex: 1 }]}>
        {check.message ?? `A new version of The SHED${check.latest ? ` (${check.latest})` : ""} is out.`}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Update The SHED"
        onPress={openStore}
        style={({ pressed }) => [styles.update, { backgroundColor: t.primary }, pressed && { opacity: 0.7 }]}
      >
        <Text style={[typography.caption, { color: t.onPrimary, fontWeight: "800" }]}>Update</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Not now"
        hitSlop={10}
        onPress={dismiss}
      >
        <Ionicons name="close" size={20} color={t.muted} />
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
  banner: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    zIndex: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    paddingLeft: spacing.md,
    borderRadius: radius.md,
  },
  update: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full },
});
