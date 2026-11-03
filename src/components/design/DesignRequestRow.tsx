import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Doc } from "../../../convex/_generated/dataModel";
import { formatDueDate } from "@shared/designRequests";
import { daysSince, timeAgo, waitingLabel } from "@shared/datetime";
import { sydneyDay } from "@/lib/sydneyTime";
import { radius, spacing, typography, useAppTheme } from "@/theme";
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
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Design request, ${items || "no items"}, ${meta}`}
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
            {request.editedAt ? (
              <Text style={[typography.caption, { color: t.faint }]}>{"  "}Edited</Text>
            ) : null}
          </Text>
          <View style={styles.topRight}>
            <UnreadBubble count={unread} />
            <DesignStatusPill status={request.status} />
          </View>
        </View>
        <Text numberOfLines={1} style={[typography.caption, { color: t.muted }]}>
          {meta}
        </Text>
        <Text numberOfLines={1} style={[typography.caption, { color: t.muted }]}>
          Submitted {sydneyDay(request.submittedAt)} · {timeAgo(request.submittedAt)}
        </Text>
        <WaitingLine since={request.waitingSince} />
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
