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
import { useAppTheme } from "../theme";
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
  const trail = useQuery(api.requests.auditTrail, { requestId: request._id });
  if (!trail) return <Muted>Loading history…</Muted>;
  return (
    <View style={{ gap: 2 }}>
      {trail.map((event, index) => (
        <Muted key={index}>
          {new Date(event.at).toLocaleString()} —{" "}
          {EVENT_LABELS[event.action] ?? event.action}
          {event.step
            ? ` (${STEP_LABELS[event.step as ApprovalStep] ?? event.step})`
            : ""}{" "}
          by {event.actor}
          {event.detail ? ` — ${event.detail}` : ""}
        </Muted>
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
    <View style={{ gap: 6 }}>
      {receipt.recipients.map((recipient, i) => (
        <View key={i} style={[styles.recipient, { borderColor: t.border }]}>
          <Row>
            <Txt style={{ fontWeight: "700", flexGrow: 1 }}>
              {recipient.accountName}
            </Txt>
            <Txt style={{ fontWeight: "700" }}>${recipient.amount}</Txt>
          </Row>
          <Muted>
            BSB {recipient.bsb} • Account {recipient.accountNumber}
          </Muted>
          {(files?.[i]?.attachments ?? []).map((file, j) =>
            file.url ? (
              <Pressable key={j} onPress={() => void Linking.openURL(file.url!)}>
                <Text style={{ color: t.primary, textDecorationLine: "underline" }}>
                  📎 {file.name}
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

/** The approval chain, one icon+label per step: green tick when approved,
 *  red cross when declined, a highlighted dot for the step it waits on. */
const StepLine = ({ request }: { request: Doc<"requests"> }) => {
  const t = useAppTheme();
  const active = currentStep(request);
  const steps = stepsForRequest(request);
  return (
    <View style={styles.stepsRow}>
      {steps.map((step, index) => {
        const status = stepStatus(request, step);
        const isActive = step === active;
        const icon =
          status === APPROVED ? (
            <Ionicons name="checkmark-circle" size={18} color={t.success} />
          ) : status === DECLINED ? (
            <Ionicons name="close-circle" size={18} color={t.danger} />
          ) : (
            <Ionicons
              name={isActive ? "ellipse" : "ellipse-outline"}
              size={isActive ? 12 : 12}
              color={isActive ? t.primary : t.muted}
            />
          );
        const labelColor =
          status === APPROVED
            ? t.success
            : status === DECLINED
              ? t.danger
              : isActive
                ? t.text
                : t.muted;
        return (
          <View key={step} style={styles.stepItem}>
            {index > 0 ? (
              <Text style={[styles.stepArrow, { color: t.muted }]}>→</Text>
            ) : null}
            {icon}
            <Text
              style={[
                styles.stepLabel,
                { color: labelColor },
                isActive && { fontWeight: "700" },
              ]}
            >
              {STEP_LABELS[step]}
            </Text>
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
      <Row>
        <Txt style={styles.amount}>${request.amount}</Txt>
        <Chip label={requestDisplayStatus(request)} />
      </Row>
      <Muted>
        {request.department}
        {showRequester ? ` • ${request.requesterEmail}` : ""} •{" "}
        {new Date(request._creationTime).toLocaleDateString()}
      </Muted>
      <Txt>{request.description}</Txt>
      <StepLine request={request} />
      {request.declineReason ? (
        <Text style={{ color: t.danger }}>Declined: {request.declineReason}</Text>
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
        <Muted>
          Paid ${request.paidAmount}
          {request.payComment ? ` — ${request.payComment}` : ""}
        </Muted>
      ) : null}
      {showHistory ? <History request={request} /> : null}
      <Row>
        {children}
        <Btn
          title={showHistory ? "Hide Audit Trail" : "Audit Trail"}
          variant="ghost"
          onPress={() => setShowHistory((previous) => !previous)}
        />
      </Row>
    </Card>
  );
};

const styles = StyleSheet.create({
  amount: { fontSize: 22, fontWeight: "800", flexGrow: 1 },
  stepsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginVertical: 2,
  },
  stepItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  stepArrow: { fontSize: 12, marginRight: 4 },
  stepLabel: { fontSize: 12 },
  recipient: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 2,
  },
});
