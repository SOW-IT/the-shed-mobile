import { ReactNode } from "react";
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
import { Doc } from "../../convex/_generated/dataModel";
import { Card, Chip, Muted, Row } from "./ui";

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
  const active = currentStep(request);
  return (
    <Text style={styles.steps}>
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
}) => (
  <Card>
    <Row>
      <Text style={styles.amount}>${request.amount}</Text>
      <Chip label={requestDisplayStatus(request)} />
    </Row>
    <Muted>
      {request.department}
      {showRequester ? ` • ${request.requesterEmail}` : ""} •{" "}
      {new Date(request._creationTime).toLocaleDateString()}
    </Muted>
    <Text>{request.description}</Text>
    <StepLine request={request} />
    {request.declineReason ? (
      <Text style={styles.decline}>Declined: {request.declineReason}</Text>
    ) : null}
    {request.receipt ? (
      <Muted>
        Receipt submitted: ${request.receipt.totalAmount} (
        {request.receipt.recipients.length} recipient
        {request.receipt.recipients.length === 1 ? "" : "s"})
      </Muted>
    ) : null}
    {request.paid && request.paidAmount !== undefined ? (
      <Muted>
        Paid ${request.paidAmount}
        {request.payComment ? ` — ${request.payComment}` : ""}
      </Muted>
    ) : null}
    {children ? <Row>{children}</Row> : null}
  </Card>
);

const styles = StyleSheet.create({
  amount: { fontSize: 22, fontWeight: "800", flexGrow: 1 },
  steps: { fontSize: 12, color: "#4b5563" },
  decline: { color: "#991b1b" },
});
