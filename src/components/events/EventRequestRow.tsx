import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Doc } from "../../../convex/_generated/dataModel";
import { formatDateTimeRange } from "@shared/forms";
import {
  eventRequestRef,
  SUB_FORM_KINDS,
  SUB_FORM_LABELS,
  SUB_FORM_STATUS_LABELS,
  type FinanceStep,
  type SubFormKind,
  type SubFormStatus,
} from "@shared/eventRequests";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { EventStatusPill, SUB_FORM_TONES, toneColour } from "./EventPills";

export type EventRequestListRow = Doc<"eventRequests"> & {
  requesterName: string | null;
  forms: Record<SubFormKind, { status: SubFormStatus; step?: FinanceStep }>;
  waitingOnMe?: SubFormKind[];
};

/** Where each of the three forms is up to, as three small labelled dots. */
export const FormSteps = ({ forms }: { forms: EventRequestListRow["forms"] }) => {
  const t = useAppTheme();
  return (
    <View style={styles.steps}>
      {SUB_FORM_KINDS.map((kind) => (
        <View
          key={kind}
          style={styles.step}
          accessible
          accessibilityLabel={`${SUB_FORM_LABELS[kind]}: ${SUB_FORM_STATUS_LABELS[forms[kind].status]}`}
        >
          <View
            style={[styles.stepDot, { backgroundColor: toneColour(t, SUB_FORM_TONES[forms[kind].status]) }]}
          />
          <Text style={[typography.caption, { color: t.muted }]}>{SUB_FORM_LABELS[kind]}</Text>
        </View>
      ))}
    </View>
  );
};

/** One event request in a list: what, when, where, whose, and where its forms are up to. */
export const EventRequestRow = ({
  event,
  unread,
  onPress,
}: {
  event: EventRequestListRow;
  unread: number;
  onPress: () => void;
}) => {
  const t = useAppTheme();
  const who = event.requesterName ?? event.requesterEmail;
  const waiting = event.waitingOnMe ?? [];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.name}, ${formatDateTimeRange(event.startsAt, event.endsAt)}`}
      style={({ pressed }) => [
        styles.row,
        t.shadowCard,
        { backgroundColor: t.card },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[typography.caption, { color: t.faint, fontWeight: "700" }]}>
          {eventRequestRef(event)}
          {event.editedAt ? "  ·  Edited" : ""}
        </Text>
        <Text numberOfLines={2} style={[typography.headline, { color: t.text }]}>
          {event.name}
        </Text>
        <Text numberOfLines={1} style={[typography.caption, { color: t.muted }]}>
          {formatDateTimeRange(event.startsAt, event.endsAt)}
        </Text>
        <Text numberOfLines={1} style={[typography.caption, { color: t.muted }]}>
          {event.location} · {who} ({event.department})
        </Text>
        <View style={styles.footer}>
          <EventStatusPill status={event.status} />
          {unread > 0 ? (
            <View style={[styles.unread, { backgroundColor: t.accentSoft }]}>
              <Ionicons name="chatbubble" size={11} color={t.accent} />
              <Text style={[typography.caption, { color: t.accent, fontWeight: "700" }]}>
                {unread}
              </Text>
            </View>
          ) : null}
        </View>
        <FormSteps forms={event.forms} />
        {waiting.length > 0 ? (
          <Text style={[typography.caption, { color: t.accent, fontWeight: "700" }]}>
            Waiting on you: {waiting.map((k) => SUB_FORM_LABELS[k]).join(", ")}
          </Text>
        ) : null}
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
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  steps: { flexDirection: "row", gap: spacing.md, marginTop: 4, flexWrap: "wrap" },
  step: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  unread: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
