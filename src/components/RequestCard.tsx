import { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
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
import { useAppTheme } from "../theme";
import { Card, Chip, Muted, Row, Txt } from "./ui";

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
};

const styles = StyleSheet.create({
  amount: { fontSize: 22, fontWeight: "800", flexGrow: 1 },
  steps: { fontSize: 12 },
});
