import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { ReactNode, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  APPROVED,
  currentStep,
  DECLINED,
  requestDisplayStatus,
  STEP_LABELS,
  stepsForRequest,
  type ApprovalStatus,
  type ApprovalStep,
} from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { radius, spacing, typography, useAppTheme } from "../theme";
import { Btn, Card, Chip, Muted, Row, Txt } from "./ui";

const EVENT_LABELS: Record<string, string> = {
  submitted: "Submitted",
  "auto-approved": "Auto-approved",
  approved: "Approved",
  declined: "Declined",
  "receipt-submitted": "Receipt submitted",
  paid: "Paid",
};

/** Lazy-loaded audit trail: who actioned each step, and when. */
const History = ({ request }: { request: Doc<"requests"> }) => {
  const t = useAppTheme();
  const trail = useQuery(api.requests.auditTrail, { requestId: request._id });
  if (!trail) return <Muted>Loading history…</Muted>;
  return (
    <View style={[styles.history, { backgroundColor: t.inputBackground }]}>
      {trail.map((event, index) => (
        <View key={index} style={styles.historyRow}>
          <View style={[styles.historyDot, { backgroundColor: t.faint }]} />
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: t.text, fontWeight: "600" }]}>
              {EVENT_LABELS[event.action] ?? event.action}
              {event.step
                ? ` · ${STEP_LABELS[event.step as ApprovalStep] ?? event.step}`
                : ""}
            </Text>
            <Text style={[typography.caption, { color: t.muted }]}>
              {new Date(event.at).toLocaleString()} · {event.actor}
              {event.detail ? ` — ${event.detail}` : ""}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
};

/**
 * The submitted receipt in full: each recipient's bank details and their
 * receipt files as links (signed URLs — tap to view or download). Files
 * load lazily when the section is opened; the backend only returns them
 * to the requester and Finance (incl. the Finance Head).
 */
const ReceiptDetails = ({ request }: { request: Doc<"requests"> }) => {
  const t = useAppTheme();
  const files = useQuery(api.requests.receiptAttachments, {
    requestId: request._id,
  });
  const receipt = request.receipt;
  if (!receipt) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      {receipt.recipients.map((recipient, i) => (
        <View key={i} style={[styles.recipient, { backgroundColor: t.inputBackground }]}>
          <Row>
            <Txt style={{ fontWeight: "700", flexGrow: 1 }}>
              {recipient.accountName}
            </Txt>
            <Txt style={{ fontWeight: "700" }}>${recipient.amount}</Txt>
          </Row>
          <Muted>
            BSB {recipient.bsb} · Account {recipient.accountNumber}
          </Muted>
          {(files?.[i]?.attachments ?? []).map((file, j) =>
            file.url ? (
              <Pressable
                key={j}
                style={({ pressed }) => [styles.fileLink, pressed && { opacity: 0.6 }]}
                onPress={() => void Linking.openURL(file.url!)}
              >
                <Ionicons name="document-attach-outline" size={15} color={t.primary} />
                <Text
                  numberOfLines={1}
                  style={[typography.caption, { color: t.primary, fontWeight: "600", flex: 1 }]}
                >
                  {file.name}
                </Text>
              </Pressable>
            ) : null
          )}
        </View>
      ))}
    </View>
  );
};

const stepStatus = (
  request: Doc<"requests">,
  step: ApprovalStep
): ApprovalStatus | undefined =>
  ({
    hod: request.approvedByHOD,
    budgetManager: request.approvedByBudgetManager,
    director: request.approvedByDirector,
    financeHead: request.approvedByFinanceHead,
  })[step];

/**
 * The approval chain as a connected stepper: filled tick when approved,
 * cross when declined, a pulsing-dot style ring for the awaited step.
 */
const StepLine = ({ request }: { request: Doc<"requests"> }) => {
  const t = useAppTheme();
  const active = currentStep(request);
  const steps = stepsForRequest(request);
  return (
    <View style={styles.stepsRow}>
      {steps.map((step, index) => {
        const status = stepStatus(request, step);
        const isActive = step === active;
        const previousApproved =
          index > 0 && stepStatus(request, steps[index - 1]) === APPROVED;
        const circleStyle =
          status === APPROVED
            ? { backgroundColor: t.success }
            : status === DECLINED
              ? { backgroundColor: t.danger }
              : isActive
                ? { backgroundColor: t.card, borderWidth: 2, borderColor: t.primary }
                : { backgroundColor: t.card, borderWidth: 1.5, borderColor: t.border };
        const labelColor =
          status === APPROVED
            ? t.success
            : status === DECLINED
              ? t.danger
              : isActive
                ? t.text
                : t.faint;
        return (
          <View key={step} style={styles.stepGroup}>
            {index > 0 && (
              <View
                style={[
                  styles.stepConnector,
                  { backgroundColor: previousApproved ? t.success : t.separator },
                ]}
              />
            )}
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, circleStyle]}>
                {status === APPROVED ? (
                  <Ionicons name="checkmark" size={12} color={t.dark ? t.background : "#ffffff"} />
                ) : status === DECLINED ? (
                  <Ionicons name="close" size={12} color={t.dark ? t.background : "#ffffff"} />
                ) : isActive ? (
                  <View style={[styles.stepActiveDot, { backgroundColor: t.primary }]} />
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.stepLabel,
                  { color: labelColor },
                  isActive && { fontWeight: "700" },
                ]}
              >
                {STEP_LABELS[step]}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

export const RequestCard = ({
  request,
  showRequester,
  children,
}: {
  request: Doc<"requests">;
  showRequester?: boolean;
  children?: ReactNode;
}) => {
  const t = useAppTheme();
  const [showHistory, setShowHistory] = useState(false);
  const fileCount =
    request.receipt?.recipients.reduce(
      (count, recipient) => count + (recipient.attachments?.length ?? 0),
      0
    ) ?? 0;
  return (
    <Card>
      <View style={styles.topRow}>
        <Text style={[typography.amount, { color: t.text, flex: 1 }]}>
          ${request.amount}
        </Text>
        <Chip label={requestDisplayStatus(request)} />
      </View>
      <Text style={[typography.caption, { color: t.faint, marginTop: -6 }]}>
        {request.department}
        {showRequester ? ` · ${request.requesterEmail}` : ""} ·{" "}
        {new Date(request._creationTime).toLocaleDateString()}
      </Text>
      <Txt>{request.description}</Txt>
      <StepLine request={request} />
      {request.declineReason ? (
        <View style={[styles.declineBox, { backgroundColor: t.dangerSoft }]}>
          <Ionicons name="close-circle" size={15} color={t.danger} />
          <Text style={[typography.caption, { color: t.danger, flex: 1 }]}>
            {request.declineReason}
          </Text>
        </View>
      ) : null}
      {request.receipt ? (
        <>
          <Muted>
            Receipt submitted: ${request.receipt.totalAmount} (
            {request.receipt.recipients.length} recipient
            {request.receipt.recipients.length === 1 ? "" : "s"}, {fileCount} file
            {fileCount === 1 ? "" : "s"})
          </Muted>
          <ReceiptDetails request={request} />
        </>
      ) : null}
      {request.paid && request.paidAmount !== undefined ? (
        <View style={[styles.paidBox, { backgroundColor: t.successSoft }]}>
          <Ionicons name="checkmark-circle" size={15} color={t.success} />
          <Text style={[typography.caption, { color: t.success, flex: 1, fontWeight: "600" }]}>
            Paid ${request.paidAmount}
            {request.payComment ? ` — ${request.payComment}` : ""}
          </Text>
        </View>
      ) : null}
      {showHistory ? <History request={request} /> : null}
      <View style={[styles.actionsDivider, { backgroundColor: t.separator }]} />
      <Row>
        {children}
        <Btn
          title={showHistory ? "Hide History" : "History"}
          variant="ghost"
          onPress={() => setShowHistory((previous) => !previous)}
        />
      </Row>
    </Card>
  );
};

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: spacing.xs,
  },
  stepGroup: { flexDirection: "row", alignItems: "flex-start", flexShrink: 1 },
  stepConnector: {
    height: 2,
    borderRadius: 1,
    width: 14,
    marginTop: 10,
    marginHorizontal: 3,
  },
  stepItem: { alignItems: "center", gap: 4, flexShrink: 1 },
  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  stepActiveDot: { width: 8, height: 8, borderRadius: 4 },
  stepLabel: { fontSize: 10.5, letterSpacing: -0.1, maxWidth: 76, textAlign: "center" },
  declineBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  paidBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  history: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  historyRow: { flexDirection: "row", gap: spacing.sm },
  historyDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  recipient: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  fileLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  actionsDivider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
});
