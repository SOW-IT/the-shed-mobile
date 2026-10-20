import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "convex/react";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  currentStep,
  requestDisplayStatus,
  STEP_LABELS,
  type ApprovalStep,
} from "../../shared/flow";
import { formatDuration, waitingLabel } from "@shared/datetime";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { sydneyDateTime } from "@/lib/sydneyTime";
import { radius, spacing, typography, useAppTheme } from "../theme";
import { SowSpinner } from "./ui";

type IconName = keyof typeof Ionicons.glyphMap;

const EVENTS: Record<string, { label: string; icon: IconName; tone: "primary" | "success" | "danger" }> = {
  submitted: { label: "Submitted", icon: "paper-plane-outline", tone: "primary" },
  "auto-approved": { label: "Auto-approved", icon: "flash-outline", tone: "success" },
  approved: { label: "Approved", icon: "checkmark", tone: "success" },
  declined: { label: "Declined", icon: "close", tone: "danger" },
  "receipt-submitted": { label: "Receipt submitted", icon: "receipt-outline", tone: "primary" },
  paid: { label: "Paid", icon: "cash-outline", tone: "success" },
};

const GAP_WORTH_SHOWING_MS = 60 * 60 * 1000;

const eventOf = (action: string) =>
  EVENTS[action] ?? { label: action, icon: "ellipse-outline" as IconName, tone: "primary" as const };

export const eventLabel = (action: string): string => eventOf(action).label;

const waitingOn = (request: Doc<"requests">): string | null => {
  const status = requestDisplayStatus(request);
  if (status === "PAID" || status === "DECLINED") return null;
  if (status === "AWAITING RECEIPT") return "Waiting on the requester's receipt";
  if (status === "AWAITING PAYMENT") return "Waiting on payment from the Finance Head";
  const step = currentStep(request);
  return step ? `Waiting on the ${STEP_LABELS[step as ApprovalStep]}` : "Waiting";
};

export const RequestTimeline = ({ request }: { request: Doc<"requests"> }) => {
  const t = useAppTheme();
  const trail = useQuery(api.requests.auditTrail, { requestId: request._id });
  if (!trail) {
    return (
      <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
        <SowSpinner size={28} />
      </View>
    );
  }
  const tones = { primary: t.primary, success: t.success, danger: t.danger };
  const pending = waitingOn(request);
  const last = trail[trail.length - 1];
  const first = trail[0];
  const reminders =
    pending && last && request.lastReminderAt && request.lastReminderAt > last.at
      ? request.reminderCount ?? 0
      : 0;
  const total =
    !pending && first && last && last.at > first.at && requestDisplayStatus(request) === "PAID"
      ? formatDuration(last.at - first.at)
      : null;

  return (
    <View style={[styles.wrap, { backgroundColor: t.inputBackground }]}>
      {trail.map((event, index) => {
        const info = eventOf(event.action);
        const colour = tones[info.tone];
        const previous = index > 0 ? trail[index - 1] : null;
        const gap = previous ? event.at - previous.at : 0;
        const isLast = index === trail.length - 1 && !pending;
        return (
          <React.Fragment key={index}>
            {gap >= GAP_WORTH_SHOWING_MS ? (
              <View style={styles.gapRow}>
                <View style={[styles.gapRail, { backgroundColor: t.separator }]} />
                <Text style={[typography.caption, { color: t.faint }]}>
                  {formatDuration(gap)} later
                </Text>
              </View>
            ) : null}
            <View style={styles.row}>
              <View style={styles.railColumn}>
                <View style={[styles.circle, { backgroundColor: colour }]}>
                  <Ionicons name={info.icon} size={12} color={t.dark ? t.background : "#ffffff"} />
                </View>
                {!isLast ? <View style={[styles.rail, { backgroundColor: t.separator }]} /> : null}
              </View>
              <View style={styles.content}>
                <Text style={[typography.caption, { color: t.text, fontWeight: "700" }]}>
                  {info.label}
                  {event.step ? ` · ${STEP_LABELS[event.step as ApprovalStep] ?? event.step}` : ""}
                </Text>
                <Text style={[typography.caption, { color: t.muted }]}>
                  {event.actorName ?? event.actor} · {sydneyDateTime(event.at)}
                </Text>
                {event.detail ? (
                  <Text
                    style={[
                      typography.caption,
                      { color: info.tone === "danger" ? t.danger : t.muted, fontStyle: "italic" },
                    ]}
                  >
                    {event.detail}
                  </Text>
                ) : null}
              </View>
            </View>
          </React.Fragment>
        );
      })}
      {pending ? (
        <View style={styles.row}>
          <View style={styles.railColumn}>
            <View style={[styles.circle, styles.pendingCircle, { borderColor: t.warning }]}>
              <View style={[styles.pendingDot, { backgroundColor: t.warning }]} />
            </View>
          </View>
          <View style={styles.content}>
            <Text style={[typography.caption, { color: t.warning, fontWeight: "700" }]}>{pending}</Text>
            {last ? (
              <Text style={[typography.caption, { color: t.muted }]}>
                {waitingLabel(last.at)}
                {reminders > 0 && request.lastReminderAt
                  ? ` · reminded ${reminders === 1 ? "once" : `${reminders} times`}, last ${sydneyDateTime(request.lastReminderAt)}`
                  : ""}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {total ? (
        <Text style={[typography.caption, styles.total, { color: t.faint }]}>
          Submitted to paid in {total}
        </Text>
      ) : null}
    </View>
  );
};

const RAIL_WIDTH = 22;

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch" },
  railColumn: { width: RAIL_WIDTH, alignItems: "center" },
  circle: {
    width: RAIL_WIDTH,
    height: RAIL_WIDTH,
    borderRadius: RAIL_WIDTH / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingCircle: { backgroundColor: "transparent", borderWidth: 1.5 },
  pendingDot: { width: 8, height: 8, borderRadius: 4 },
  rail: { flex: 1, width: 2, borderRadius: 1, marginVertical: 2, minHeight: 8 },
  content: { flex: 1, gap: 1, paddingBottom: spacing.sm },
  gapRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingBottom: spacing.sm },
  gapRail: { width: 2, marginLeft: RAIL_WIDTH / 2 - 1, marginRight: RAIL_WIDTH / 2 - 1, height: 14, borderRadius: 1 },
  total: { marginTop: spacing.xs, marginLeft: RAIL_WIDTH + spacing.sm },
});
