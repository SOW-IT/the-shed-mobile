import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type EmailChoice, NO_PUSH_LABELS, type NoPushReason } from "@shared/announcements";
import { Checkbox, Chip } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const FIRST_FEW = 5;

export type NoPushPerson = { email: string; name: string; reason: NoPushReason };

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export const NoPushList = ({
  withoutApp,
  email,
  onEmailThem,
  onEmailEveryone,
}: {
  withoutApp: readonly NoPushPerson[];
  email: EmailChoice;
  onEmailThem: () => void;
  /** Offers emailing everyone here too, for when that choice isn't on screen. */
  onEmailEveryone?: () => void;
}) => {
  const t = useAppTheme();
  const [showAll, setShowAll] = useState(false);
  if (withoutApp.length === 0) return null;
  const shown = showAll ? withoutApp : withoutApp.slice(0, FIRST_FEW);
  const hidden = withoutApp.length - shown.length;
  const covered = email !== "none";
  return (
    <View
      style={[styles.panel, { backgroundColor: covered ? t.ghost : t.warningSoft }]}
      testID="announcement-no-push"
    >
      <View style={styles.heading}>
        <Ionicons
          name={covered ? "mail-outline" : "notifications-off-outline"}
          size={18}
          color={covered ? t.text : t.warning}
        />
        <Text style={[typography.label, { color: t.text, flex: 1 }]}>
          {withoutApp.length === 1
            ? "1 person may not get a push"
            : `${people(withoutApp.length)} may not get a push`}
        </Text>
      </View>
      {shown.map((person) => (
        <View key={person.email} style={styles.person}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text numberOfLines={1} style={[typography.body, { color: t.text }]}>
              {person.name}
            </Text>
            {person.name !== person.email ? (
              <Text numberOfLines={1} style={[typography.caption, { color: t.muted }]}>
                {person.email}
              </Text>
            ) : null}
          </View>
          <Chip>{NO_PUSH_LABELS[person.reason]}</Chip>
        </View>
      ))}
      {hidden > 0 || showAll ? (
        <Pressable
          onPress={() => setShowAll((v) => !v)}
          accessibilityRole="button"
          hitSlop={6}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Text style={[typography.label, { color: t.primary }]}>
            {showAll ? "Show fewer" : `Show all ${withoutApp.length}`}
          </Text>
        </Pressable>
      ) : null}
      <Text style={[typography.caption, { color: t.muted }]}>
        {email === "everyone"
          ? "Everyone gets an email too, so they won't miss it."
          : email === "withoutApp"
            ? "They get an email instead, so they won't miss it."
            : onEmailEveryone
              ? "They don't have the app, or have notifications off. Email them, or everyone, so they don't miss it."
              : "They don't have the app, or have notifications off. Email them so they don't miss it."}
      </Text>
      {email !== "everyone" ? (
        <Checkbox
          checked={email === "withoutApp"}
          onToggle={onEmailThem}
          label={
            withoutApp.length === 1 ? "Email this person" : `Email these ${withoutApp.length} people`
          }
        />
      ) : null}
      {onEmailEveryone ? (
        <Checkbox
          checked={email === "everyone"}
          onToggle={onEmailEveryone}
          label="Email everyone"
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
