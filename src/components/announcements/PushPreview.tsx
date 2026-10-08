import { Image, StyleSheet, Text, View } from "react-native";
import { spacing, useAppTheme } from "@/theme";

/**
 * Roughly how the announcement lands on a phone's lock screen: the app's icon
 * and name, the title in bold and the first few lines of the message.
 */
export const PushPreview = ({ title, message }: { title: string; message: string }) => {
  const t = useAppTheme();
  const banner = t.dark ? "rgba(58, 58, 60, 0.92)" : "rgba(255, 255, 255, 0.92)";
  const text = t.dark ? "#FFFFFF" : "#000000";
  const secondary = t.dark ? "rgba(235, 235, 245, 0.6)" : "rgba(60, 60, 67, 0.6)";
  return (
    <View
      style={[styles.wallpaper, { backgroundColor: t.dark ? "#1B3431" : "#C9DAD7" }]}
      accessibilityLabel={`Notification preview: ${title || "no title"}. ${message}`}
    >
      <View style={[styles.banner, t.shadowCard, { backgroundColor: banner }]}>
        <Image
          source={require("../../../assets/images/icon.png")}
          style={styles.icon}
          accessibilityIgnoresInvertColors
        />
        <View style={styles.content}>
          <View style={styles.topLine}>
            <Text numberOfLines={1} style={[styles.title, { color: text }]}>
              {title.trim() || "Your title"}
            </Text>
            <Text style={[styles.time, { color: secondary }]}>now</Text>
          </View>
          <Text numberOfLines={4} style={[styles.body, { color: text }]}>
            {message.trim() || "Your message shows here."}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wallpaper: {
    borderRadius: 22,
    padding: spacing.md,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  icon: { width: 38, height: 38, borderRadius: 9 },
  content: { flex: 1, minWidth: 0, gap: 1 },
  topLine: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  title: { flex: 1, fontSize: 15, fontWeight: "600", letterSpacing: -0.2 },
  time: { fontSize: 13 },
  body: { fontSize: 15, lineHeight: 20, letterSpacing: -0.2 },
});
