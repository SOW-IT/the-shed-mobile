import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Doc } from "../../../convex/_generated/dataModel";
import { formatDateTimeRange } from "@shared/forms";
import {
  SUB_FORM_KINDS,
  SUB_FORM_LABELS,
  SUB_FORM_STATUS_LABELS,
  type FinanceStep,
  type SubFormKind,
  type SubFormStatus,
} from "@shared/eventRequests";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { UnreadBubble, WaitingLine } from "@/components/design/DesignRequestRow";
import { EventStatusPill, eventStatusColour, SUB_FORM_TONES, toneColour } from "./EventPills";

export type EventRequestListRow = Doc<"eventRequests"> & {
  requesterName: string | null;
  forms: Record<SubFormKind, { status: SubFormStatus; step?: FinanceStep }>;
  waitingOnMe?: SubFormKind[];
  waitingSince?: number;
};

const STEP_ICONS: Record<SubFormStatus, keyof typeof Ionicons.glyphMap> = {
  DRAFT: "ellipse-outline",
  PENDING: "time",
  CHANGES_REQUESTED: "alert-circle",
  APPROVED: "checkmark-circle",
  NOT_REQUIRED: "remove-circle-outline",
};

// Marketing on the left, Risk in the middle and Finance on the right.
const FormSteps = ({ forms }: { forms: EventRequestListRow["forms"] }) => {
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
          <Ionicons
            name={STEP_ICONS[forms[kind].status]}
            size={18}
            color={toneColour(t, SUB_FORM_TONES[forms[kind].status])}
          />
          <Text style={[styles.stepLabel, { color: t.muted }]}>{SUB_FORM_LABELS[kind]}</Text>
        </View>
      ))}
    </View>
  );
};

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
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.name}, ${formatDateTimeRange(event.startsAt, event.endsAt)}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: t.card, borderColor: eventStatusColour(t, event.status) },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.top}>
          <Text numberOfLines={3} style={[typography.headline, styles.name, { color: t.text }]}>
            {event.name}
            {event.editedAt ? (
              <Text style={[typography.caption, { color: t.faint }]}>{"  "}Edited</Text>
            ) : null}
          </Text>
          <View style={styles.topRight}>
            <UnreadBubble count={unread} />
            <EventStatusPill status={event.status} />
          </View>
        </View>
        <Text numberOfLines={1} style={[typography.caption, { color: t.muted }]}>
          {formatDateTimeRange(event.startsAt, event.endsAt)}
        </Text>
        <Text numberOfLines={1} style={[typography.caption, { color: t.muted }]}>
          {event.location} · {who} ({event.department})
        </Text>
        <FormSteps forms={event.forms} />
        <WaitingLine since={event.waitingSince} />
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
  steps: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  step: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepLabel: { fontSize: 14.5, fontWeight: "600" },
});
