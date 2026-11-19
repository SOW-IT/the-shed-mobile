import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Doc } from "../../../convex/_generated/dataModel";
import { formatDueDate } from "@shared/designRequests";
import { daysSince, timeAgo, waitingLabel } from "@shared/datetime";
import { sydneyDay } from "@/lib/sydneyTime";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { Facts } from "@/components/ui/primitives";
import { designStatusColour, DesignStatusPill } from "./DesignStatusPill";

export type DesignRequestListRow = Doc<"designRequests"> & {
  requesterName: string | null;
  waitingSince?: number;
};

const WAITING_LONG_DAYS = 7;

export const WaitingLine = ({ since }: { since: number | undefined }) => {
  const t = useAppTheme();
  if (since === undefined) return null;
  const long = daysSince(since) >= WAITING_LONG_DAYS;
  return (
    <Text style={[typography.caption, { color: long ? t.accent : t.muted, fontWeight: "700" }]}>
      {waitingLabel(since)}
    </Text>
  );
};

export const UnreadBubble = ({ count }: { count: number }) => {
  const t = useAppTheme();
  if (count <= 0) return null;
  return (
    <View
      accessibilityLabel={`${count} new ${count === 1 ? "comment" : "comments"}`}
      style={[styles.unread, { backgroundColor: t.accentSoft }]}
    >
      <Ionicons name="chatbubble" size={11} color={t.accent} />
      <Text style={[typography.caption, { color: t.accent, fontWeight: "700" }]}>{count}</Text>
    </View>
  );
};

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
  ];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Design request, ${items || "no items"}, ${meta.filter(Boolean).join(", ")}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: t.card, borderColor: designStatusColour(t, request.status) },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.top}>
          <Text numberOfLines={3} style={[typography.headline, styles.name, { color: t.text }]}>
            {items || "Design request"}
          </Text>
          <View style={styles.topRight}>
            {request.editedAt ? (
              <Text style={[typography.caption, { color: t.faint }]}>Edited</Text>
            ) : null}
            <UnreadBubble count={unread} />
            <DesignStatusPill status={request.status} />
          </View>
        </View>
        <Facts parts={meta} numberOfLines={1} />
        <Facts
          parts={[`Submitted ${sydneyDay(request.submittedAt)}`, timeAgo(request.submittedAt)]}
          numberOfLines={1}
        />
        <WaitingLine since={request.waitingSince} />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.lg,
  },
  top: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  name: { flex: 1 },
  topRight: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  unread: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
