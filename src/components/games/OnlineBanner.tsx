import { useOffline } from "@/hooks/useOffline";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SHOW_MS = 3000;

/**
 * Whether the connection came back in the last few seconds. Only a change
 * from offline counts, so it never shows for a screen that was online all
 * along.
 */
const useBackOnline = (): boolean => {
  const offline = useOffline();
  const wasOffline = useRef(offline);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const cameBack = wasOffline.current && !offline;
    wasOffline.current = offline;
    if (!cameBack) return;
    setShown(true);
    const timer = setTimeout(() => setShown(false), SHOW_MS);
    return () => clearTimeout(timer);
  }, [offline]);
  return shown && !offline;
};

/**
 * A small "Online" note at the top when the connection comes back while the
 * games are open. It never takes a touch and never stops a game.
 */
export const OnlineBanner = () => {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  if (!useBackOnline()) return null;
  return (
    <View style={[styles.wrap, { top: insets.top + spacing.xs }]} pointerEvents="none">
      <View
        style={[styles.pill, t.shadowFloat, { backgroundColor: t.successSoft }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        testID="online-banner"
      >
        <Ionicons name="cloud-done-outline" size={15} color={t.success} />
        <Text style={[typography.label, { color: t.success }]}>Online</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 10 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
});
