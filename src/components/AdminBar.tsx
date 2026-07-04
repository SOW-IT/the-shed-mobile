import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { radius, spacing, useAppTheme } from "@/theme";
import { FadeInView, Txt } from "@/components/ui";

/**
 * The "Admin" entry bar shown at the top of the Org chart and the Requests "All"
 * tab for admins / the Finance Head — a card that opens the Admin screen. Pass a
 * `tab` to deep-link straight to one of the Admin top-bar segments (e.g. "other"
 * for the finance settings: Budget Manager, Director threshold, delegation).
 */
export const AdminBar = ({
  tab,
  label = "Admin",
  delay = 20,
}: {
  tab?: "users" | "structure" | "other";
  label?: string;
  delay?: number;
}) => {
  const t = useAppTheme();
  const router = useRouter();
  return (
    <FadeInView delay={delay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open admin tools"
        onPress={() =>
          router.push(
            tab ? { pathname: "/admin", params: { tab } } : "/admin"
          )
        }
        style={({ pressed }) => [
          styles.adminButton,
          t.shadowCard,
          { backgroundColor: t.card },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Ionicons name="settings-outline" size={20} color={t.primary} />
        <Txt style={styles.adminLabel}>{label}</Txt>
        <Ionicons name="chevron-forward" size={18} color={t.faint} />
      </Pressable>
    </FadeInView>
  );
};

const styles = StyleSheet.create({
  adminButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md - 2,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  adminLabel: {
    flexGrow: 1,
    fontSize: 15,
    fontWeight: "700",
  },
});
