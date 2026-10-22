import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  MARKED_ROLES,
  type MarkedRole,
  ROLE_SOURCE_NOTES,
  roleRules,
  type RoleSource,
  type RuleSettings,
} from "../../../shared/memberRole";
import { Segmented, Sheet, Txt } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const AUTOMATIC = "automatic";

/**
 * The edit sheet's Role: worked out, so it's shown locked with an info button
 * that explains how. Leaders can still set Visitor or Alumni by hand for a
 * plain member, the two Roles Insights can't tell.
 */
export function MemberRoleField({
  role,
  source,
  marked,
  onMark,
  ruleSettings,
}: {
  role: string;
  source: RoleSource;
  marked: MarkedRole | null;
  /** Leave out when the Role can't be set by hand (staff). */
  onMark?: (marked: MarkedRole | null) => void;
  ruleSettings?: RuleSettings;
}) {
  const t = useAppTheme();
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={[typography.label, { color: t.muted }]}>Role</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="How Role is worked out"
          hitSlop={10}
          onPress={() => setInfoOpen(true)}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Ionicons name="information-circle-outline" size={18} color={t.primary} />
        </Pressable>
      </View>
      <View
        testID="member-role"
        style={[styles.face, { backgroundColor: t.inputBackground }]}
        accessible
        accessibilityLabel={`Role: ${role}. ${ROLE_SOURCE_NOTES[source]}.`}
      >
        <Text style={[typography.body, { color: t.text, flex: 1 }]} numberOfLines={1}>
          {role}
        </Text>
        <Txt style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
          {ROLE_SOURCE_NOTES[source]}
        </Txt>
        <Ionicons name="lock-closed-outline" size={16} color={t.faint} />
      </View>
      {onMark ? (
        <Segmented
          segments={[
            { key: AUTOMATIC, label: "Automatic" },
            ...MARKED_ROLES.map((r) => ({ key: r, label: r })),
          ]}
          active={marked ?? AUTOMATIC}
          onChange={(key) =>
            onMark(key === AUTOMATIC ? null : (MARKED_ROLES.find((r) => r === key) ?? null))
          }
        />
      ) : null}
      <Sheet visible={infoOpen} onClose={() => setInfoOpen(false)} title="How Role is worked out">
        <Txt style={[typography.body, { color: t.text }]}>
          Insights works Role out each night from these rules.
        </Txt>
        <View style={styles.rules}>
          {roleRules(ruleSettings).map(({ role: name, rule }) => (
            <View key={name} style={styles.rule}>
              <Txt style={[typography.headline, { color: t.text }]}>{name}</Txt>
              <Txt style={[typography.body, { color: t.muted }]}>{rule}</Txt>
            </View>
          ))}
        </View>
        <Txt style={[typography.caption, { color: t.muted }]}>
          Only Visitor and Alumni can be set by hand.
        </Txt>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  face: {
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    opacity: 0.85,
  },
  rules: { gap: spacing.md, marginVertical: spacing.md },
  rule: { gap: 2 },
});
