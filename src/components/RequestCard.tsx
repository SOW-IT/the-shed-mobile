import React from "react";
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
import { Doc, Id } from "../../convex/_generated/dataModel";
import { radius, spacing, typography, useAppTheme } from "../theme";
import { Btn, Card, Chip, Muted, Row, Sheet, Txt } from "./ui";

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
 * receipt files as links (signed URLs — tap to view or download).
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

/** Modal shown when a step circle is tapped: approver info + audit events. */
const StepInfoModal = ({
  requestId,
  step,
  onClose,
}: {
  requestId: Id<"requests">;
  step: ApprovalStep | null;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  const info = useQuery(
    api.requests.stepInfo,
    step ? { requestId, step } : "skip"
  );
  return (
    <Sheet
      visible={step !== null}
      onClose={onClose}
      scrollable={false}
      title={step ? STEP_LABELS[step] : ""}
    >
      {!info ? (
        <Muted>Loading…</Muted>
      ) : (
        <>
          <View style={{ gap: 2 }}>
            {info.name ? (
              <Txt style={{ fontWeight: "700" }}>{info.name}</Txt>
            ) : null}
            {info.email ? (
              <Muted>{info.email}</Muted>
            ) : (
              <Muted>No one assigned to this step yet.</Muted>
            )}
          </View>
          {info.events.length === 0 ? (
            <Muted>Awaiting action</Muted>
          ) : (
            info.events.map((event, i) => (
              <View key={i} style={{ gap: 2 }}>
                <Text style={[typography.caption, { color: t.text, fontWeight: "600" }]}>
                  {EVENT_LABELS[event.action] ?? event.action}
                </Text>
                <Muted>
                  {new Date(event.at).toLocaleString()}
                  {event.detail ? ` — ${event.detail}` : ""}
                </Muted>
              </View>
            ))
          )}
        </>
      )}
    </Sheet>
  );
};

/**
 * The approval chain as a connected stepper. Tap any circle to see who owns
 * that step and what they've done.
 */
const StepLine = ({ request }: { request: Doc<"requests"> }) => {
  const t = useAppTheme();
  const [selectedStep, setSelectedStep] = useState<ApprovalStep | null>(null);
  const active = currentStep(request);
  const steps = stepsForRequest(request);
  return (
    <>
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
            <React.Fragment key={step}>
              {index > 0 && (
                <View
                  style={[
                    styles.stepConnector,
                    { backgroundColor: previousApproved ? t.success : t.separator },
                  ]}
                />
              )}
              <Pressable
                onPress={() => setSelectedStep(step)}
                hitSlop={8}
                style={styles.stepItem}
              >
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
              </Pressable>
            </React.Fragment>
          );
        })}
      </View>
      <StepInfoModal
        requestId={request._id}
        step={selectedStep}
        onClose={() => setSelectedStep(null)}
      />
    </>
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
  const requesterName = useQuery(
    api.directory.nameForEmail,
    showRequester ? { email: request.requesterEmail } : "skip"
  );
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
        {showRequester ? ` · ${requesterName ?? request.requesterEmail}` : ""} ·{" "}
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
      {request.receipt ? <ReceiptDetails request={request} /> : null}
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
      <View style={styles.actionsRow}>
        <View style={styles.actionsLeft}>{children}</View>
        <Btn
          title={showHistory ? "Hide Audit Trail" : "Audit Trail"}
          variant="ghost"
          onPress={() => setShowHistory((previous) => !previous)}
        />
      </View>
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
  stepConnector: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    marginTop: 10,
    marginHorizontal: 3,
  },
  stepItem: { alignItems: "center", gap: 4, width: 72 },
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
  actionsRow: { flexDirection: "row", alignItems: "center" },
  actionsLeft: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    alignItems: "center",
  },
});
