import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { sydneyDateTime } from "@/lib/sydneyTime";
import { Card, IconButton, Muted, SectionTitle } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

export function AppErrorsCard() {
  const t = useAppTheme();
  const recent = useQuery(api.appErrors.recent, {});
  const dismiss = useMutation(api.appErrors.dismiss);
  const [open, setOpen] = useState<Id<"appErrors"> | null>(null);
  if (!recent) return null;
  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle>App errors · last {recent.days} days</SectionTitle>
      <Card>
        {recent.errors.length === 0 ? (
          <Muted>Nothing reported. The app sends a report when a screen crashes or a promise is left unhandled.</Muted>
        ) : (
          recent.errors.map((error) => {
            const expanded = open === error.id;
            return (
              <View key={error.id} style={[styles.row, { borderColor: t.separator }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={expanded ? "Hide details" : "Show details"}
                  onPress={() => setOpen(expanded ? null : error.id)}
                  style={{ flex: 1, gap: 2 }}
                >
                  <Text style={[typography.body, { color: t.text, fontWeight: "600" }]} numberOfLines={expanded ? undefined : 2}>
                    {error.message}
                  </Text>
                  <Text style={[typography.caption, { color: t.muted }]}>
                    {error.count === 1 ? "once" : `${error.count} times`} · {error.platform}
                    {error.version ? ` ${error.version}` : ""}
                    {error.route ? ` · ${error.route}` : ""}
                  </Text>
                  <Text style={[typography.caption, { color: t.faint }]}>
                    Last {sydneyDateTime(error.lastAt)}
                    {error.lastEmail ? ` · ${error.lastEmail}` : ""}
                  </Text>
                  {expanded && error.stack ? (
                    <Text selectable style={[styles.stack, { color: t.muted, backgroundColor: t.inputBackground }]}>
                      {error.stack}
                    </Text>
                  ) : null}
                </Pressable>
                <IconButton
                  name="checkmark-done-outline"
                  size={36}
                  accessibilityLabel="Clear this error"
                  onPress={() => void dismiss({ id: error.id }).catch(() => {})}
                />
              </View>
            );
          })
        )}
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={14} color={t.faint} />
          <Text style={[typography.caption, { color: t.faint, flex: 1 }]}>
            The same error is counted once per occurrence and kept until cleared here.
          </Text>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stack: {
    fontFamily: "Menlo",
    fontSize: 11,
    lineHeight: 15,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  note: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: spacing.xs },
});
