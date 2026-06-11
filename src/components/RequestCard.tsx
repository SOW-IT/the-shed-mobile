import { useQuery } from "convex/react";
import { ReactNode, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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
  if (trail === undefined) return <Muted>Loading history…</Muted>;
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

/** A compact "HOD ✓ → Budget Manager ● → Finance Head ○" progress line. */
const StepLine = ({ request }: { request: Doc<"requests"> }) => {
  const t = useAppTheme();
  const active = currentStep(request);
  return (
    <Text style={[styles.steps, { color: t.muted }]}>
      {stepsForRequest(request)
        .map((step) => {
          const status = stepStatus(request, step);
          const mark =
            status === APPROVED
              ? "✓"
              : status === DECLINED
                ? "✕"
                : step === active
                  ? "●"
                  : "○";
          return `${STEP_LABELS[step]} ${mark}`;
        })
        .join("  →  ")}
    </Text>
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
        <Muted>
          Receipt submitted: ${request.receipt.totalAmount} (
          {request.receipt.recipients.length} recipient
          {request.receipt.recipients.length === 1 ? "" : "s"},{" "}
          {request.receipt.recipients.reduce(
            (count, recipient) => count + (recipient.attachments?.length ?? 0),
            0
          )}{" "}
          file{request.receipt.recipients.reduce((c, r) => c + (r.attachments?.length ?? 0), 0) === 1 ? "" : "s"}
          )
        </Muted>
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
          title={showHistory ? "Hide History" : "History"}
          variant="ghost"
          onPress={() => setShowHistory((previous) => !previous)}
        />
      </Row>
    </Card>
  );
};

const styles = StyleSheet.create({
  amount: { fontSize: 22, fontWeight: "800", flexGrow: 1 },
  steps: { fontSize: 12 },
});
