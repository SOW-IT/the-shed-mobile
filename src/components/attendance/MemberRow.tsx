import { Pressable, StyleSheet, Text, View } from "react-native";
import { campusPill } from "@/components/attendance/campusPill";
import { Avatar } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

/**
 * A person in the Members list, or anywhere else members are picked from, so
 * every list shows the same avatar, campus colour and pill.
 */
export function MemberRow({
  name,
  subtitle,
  photo,
  university,
  roles,
  tag,
  accessibilityLabel,
  onPress,
}: {
  name: string;
  subtitle?: string;
  photo?: string | null;
  university?: string;
  roles: readonly string[];
  /** A small label beside the name, e.g. STAFF. */
  tag?: string;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const t = useAppTheme();
  const pill = campusPill(university, roles, t);
  // Staff without a campus already say STAFF in the pill.
  const showTag = Boolean(tag) && tag !== pill.label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: t.card, borderColor: pill.colour ?? t.separator },
        pressed && { opacity: 0.66 },
      ]}
      onPress={onPress}
    >
      <Avatar photo={photo ?? null} name={name} size={38} />
      <View style={styles.text}>
        <View style={styles.nameRow}>
          <Text
            style={[typography.headline, styles.name, { color: t.text }]}
            numberOfLines={1}
          >
            {name}
          </Text>
          {showTag ? (
            <View style={[styles.tag, { backgroundColor: t.ghost }]}>
              <Text style={[styles.tagText, { color: t.ghostText }]}>{tag}</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.campusPill, { backgroundColor: pill.background }]}>
        <Text
          style={[typography.caption, styles.campusPillText, { color: pill.text }]}
          numberOfLines={1}
        >
          {pill.label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  text: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  name: { flexShrink: 1 },
  tag: { borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.2 },
  campusPill: {
    maxWidth: 92,
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  campusPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
});
