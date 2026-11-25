import { ErrorBanner, Muted, Sheet, Txt, errorMessage } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  DEVOTIONAL_SHARING_LEVELS,
  SHARING_LEVEL_DESCRIPTIONS,
  SHARING_LEVEL_LABELS,
  type DevotionalSharingLevel,
} from "@shared/devotionalGroups";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";

export const SharingSettingsSheet = ({
  visible,
  personalLevel,
  onClose,
}: {
  visible: boolean;
  personalLevel: DevotionalSharingLevel | null;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  const profile = useQuery(api.profile.get, visible ? {} : "skip");
  const setPersonalSharing = useMutation(api.devotionalGroups.setPersonalSharingLevel);
  const setDevotionalReminders = useMutation(api.profile.setDevotionalReminders);
  const [error, setError] = useState<string | null>(null);

  const pickLevel = (level: DevotionalSharingLevel) => {
    setError(null);
    void setPersonalSharing({ level }).catch((e: unknown) => setError(errorMessage(e)));
  };

  return (
    <Sheet visible={visible} title="Group settings" onClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.section}>
          <Text style={[typography.label, { color: t.muted }]}>What you share</Text>
          <Muted>
            {personalLevel
              ? "Applies across all your groups. Others see the lower of this and the group's level."
              : "Following each group's level. Pick a level below to set your own limit across all groups."}
          </Muted>
          <View style={styles.list}>
            {DEVOTIONAL_SHARING_LEVELS.map((level) => {
              const selected = personalLevel === level;
              return (
                <Pressable
                  key={level}
                  onPress={() => pickLevel(level)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  testID={`personal-sharing-${level}`}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: selected ? t.primarySoft : t.inputBackground,
                      borderColor: selected ? t.primary : t.border,
                    },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <View style={styles.rowText}>
                    <Text
                      style={[
                        typography.body,
                        { color: t.text, fontWeight: selected ? "700" : "600" },
                      ]}
                    >
                      {SHARING_LEVEL_LABELS[level]}
                    </Text>
                    <Text style={[typography.caption, { color: t.muted }]}>
                      {SHARING_LEVEL_DESCRIPTIONS[level]}
                    </Text>
                  </View>
                  <Ionicons
                    name={selected ? "checkmark-circle" : "ellipse-outline"}
                    size={20}
                    color={selected ? t.primary : t.faint}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>

        {profile?.isMe && profile.devotionalReminders !== null ? (
          <View style={[styles.reminderRow, { borderTopColor: t.separator }]}>
            <View style={styles.rowText}>
              <Txt style={{ fontWeight: "600" }}>Devotional reminders</Txt>
              <Muted>8 pm reminder if you haven&apos;t done today&apos;s devotional.</Muted>
            </View>
            <Switch
              accessibilityLabel="Devotional reminders"
              value={profile.devotionalReminders}
              onValueChange={(enabled) => {
                setError(null);
                void setDevotionalReminders({ enabled }).catch((e: unknown) =>
                  setError(errorMessage(e))
                );
              }}
              trackColor={{ false: t.ghost, true: t.primarySoft }}
              thumbColor={profile.devotionalReminders ? t.primary : t.faint}
            />
          </View>
        ) : null}

        <ErrorBanner message={error} />
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  section: { gap: spacing.xs },
  list: { gap: spacing.xs, marginTop: spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  rowText: { flex: 1, gap: 2 },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
