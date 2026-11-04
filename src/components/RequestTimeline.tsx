import { useQuery } from "convex/react";
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
import { HistoryTimeline } from "./HistoryTimeline";
import { SowSpinner } from "./ui";

const LABELS: Record<string, string> = {
  submitted: "Submitted",
  "auto-approved": "Auto-approved",
  approved: "Approved",
  declined: "Declined",
  "receipt-submitted": "Receipt submitted",
  paid: "Paid",
};

export const eventLabel = (action: string): string => LABELS[action] ?? action;

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
  // Newest first.
  const trail = useQuery(api.requests.auditTrail, { requestId: request._id });
  if (!trail) {
    return (
      <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
        <SowSpinner size={28} />
      </View>
    );
  }
  const pending = waitingOn(request);
  const newest = trail[0];
  const oldest = trail[trail.length - 1];
  const reminders =
    pending && newest && request.lastReminderAt && request.lastReminderAt > newest.at
      ? request.reminderCount ?? 0
      : 0;
  const total =
    !pending && oldest && newest && newest.at > oldest.at && requestDisplayStatus(request) === "PAID"
      ? formatDuration(newest.at - oldest.at)
      : null;

  return (
    <View style={[styles.wrap, { backgroundColor: t.inputBackground }]}>
      <HistoryTimeline
        entries={trail.map((event) => ({
          at: event.at,
          action: event.action,
          label: `${eventLabel(event.action)}${event.step ? ` · ${STEP_LABELS[event.step as ApprovalStep] ?? event.step}` : ""}`,
          who: event.actorName ?? event.actor,
          detail: event.detail,
        }))}
        pending={
          pending
            ? {
                label: pending,
                note: newest
                  ? `${waitingLabel(newest.at)}${
                      reminders > 0 && request.lastReminderAt
                        ? ` · reminded ${reminders === 1 ? "once" : `${reminders} times`}, last ${sydneyDateTime(request.lastReminderAt)}`
                        : ""
                    }`
                  : undefined,
              }
            : undefined
        }
      />
      {total ? (
        <Text style={[typography.caption, styles.total, { color: t.faint }]}>
          Submitted to paid in {total}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  total: { marginTop: spacing.xs, marginLeft: 22 + spacing.sm },
});
