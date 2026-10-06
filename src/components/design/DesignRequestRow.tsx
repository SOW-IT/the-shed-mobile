import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Doc } from "../../../convex/_generated/dataModel";
import { formatDueDate } from "@shared/designRequests";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { DesignStatusPill } from "./DesignStatusPill";

export type DesignRequestListRow = Doc<"designRequests"> & { requesterName: string | null };

/** One design request in a list: what's being designed, for when, and its status. */
export const DesignRequestRow = ({
  request,
  showRequester,
  unread,
  onPress,
}: {
  request: DesignRequestListRow;
  showRequester: boolean;
  unread: number;
  onPress: () => void;
}) => {
  const t = useAppTheme();
  const items = request.title;
  const who = request.requesterName ?? request.requesterEmail;
  const meta = [
    showRequester ? who : request.department,
    request.dueDate ? `Needed by ${formatDueDate(request.dueDate)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Design request ${request.number}, ${items || "no items"}, ${meta}`}
      style={({ pressed }) => [
        styles.row,
        t.shadowCard,
        { backgroundColor: t.card },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.titleLine}>
          <Text style={[typography.caption, { color: t.faint, fontWeight: "700" }]}>
            #{request.number} · {request.year}
          </Text>
          {request.editedAt ? (
            <Text style={[typography.caption, { color: t.faint }]}>Edited</Text>
          ) : null}
        </View>
        <Text numberOfLines={2} style={[typography.headline, { color: t.text }]}>
          {items || "Design request"}
        </Text>
        <Text numberOfLines={1} style={[typography.caption, { color: t.muted }]}>
          {meta}
        </Text>
        <View style={styles.footer}>
          <DesignStatusPill status={request.status} />
          {unread > 0 ? (
            <View style={[styles.unread, { backgroundColor: t.accentSoft }]}>
              <Ionicons name="chatbubble" size={11} color={t.accent} />
              <Text style={[typography.caption, { color: t.accent, fontWeight: "700" }]}>
                {unread}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={t.faint} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  titleLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  unread: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
