import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { spacing, useAppTheme } from "@/theme";
import { eventStaffYear } from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { RequestCard } from "@/components/RequestCard";
import { ReceiptRecipientList } from "@/components/ReceiptRecipientList";
import {
  Btn,
  ConfirmDialog,
  currencyText,
  EmptyState,
  ErrorBanner,
  errorMessage,
  FadeInView,
  Field,
  IconButton,
  LoadingState,
  Muted,
  SectionTitle,
  Sheet,
  stagger,
} from "@/components/ui";

type Step = "hod" | "budgetManager" | "director" | "financeHead";

const DeclineSheet = ({
  target,
  onClose,
}: {
  target: { request: Doc<"requests">; step: Step } | null;
  onClose: () => void;
}) => {
  // Optimistic: remove the request from the approver's review list the moment
  // they confirm, so it disappears behind the closing sheet. Reverts on error.
  const decline = useMutation(api.requests.decline).withOptimisticUpdate(
    (localStore, { requestId, step }) => {
      const data = localStore.getQuery(api.requests.toReview, {});
      if (!data) return;
      localStore.setQuery(api.requests.toReview, {}, {
        ...data,
        [step]: data[step].filter((r) => r._id !== requestId),
      });
    }
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The sheet stays mounted (hidden via `visible`), so reset the form whenever
  // it opens for a different request — otherwise a previously typed reason
  // carries over to the next request.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on target change
    setReason("");
    setError(null);
  }, [target]);

  const handleDecline = async () => {
    if (!target || submitting) return;
    setError(null);
    // Validate the required reason here so we don't fire a mutation that's
    // guaranteed to fail server-side (which would log a raw Convex error). The
    // server still enforces this as a backstop.
    if (reason.trim() === "") {
      setError(
        "Please give a reason for declining — the requester will be notified with it."
      );
      return;
    }
    setSubmitting(true);
    try {
      await decline({ requestId: target.request._id, step: target.step, reason });
      setReason("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      visible={target !== null}
      onClose={onClose}
      title="Decline Request"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Btn
            title="Decline"
            variant="danger"
            loading={submitting}
            onPress={handleDecline}
          />
          <Btn title="Back" variant="ghost" onPress={onClose} />
        </View>
      }
    >
      <Muted>The requester will be emailed your reason.</Muted>
      <Field label="Reason (required)" value={reason} onChangeText={setReason} multiline />
      <ErrorBanner message={error} />
    </Sheet>
  );
};

const PaySheet = ({
  request,
  onClose,
}: {
  request: Doc<"requests"> | null;
  onClose: () => void;
}) => {
  const pay = useMutation(api.requests.pay);
  const [paidAmount, setPaidAmount] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  // Reset when the sheet opens for a different request (it stays mounted, so
  // the amount/comment would otherwise persist from the last payment).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on request change
    setPaidAmount("");
    setComment("");
    setError(null);
  }, [request]);

  const handlePay = async () => {
    if (!request || paying) return;
    setError(null);
    setPaying(true);
    try {
      await pay({
        requestId: request._id,
        paidAmount: Number(paidAmount),
        comment: comment || undefined,
      });
      setPaidAmount("");
      setComment("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPaying(false);
    }
  };

  return (
    <Sheet
      visible={request !== null}
      onClose={onClose}
      title="Pay Reimbursement"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Btn
            title="Mark as Paid"
            variant="success"
            loading={paying}
            onPress={handlePay}
          />
          <Btn title="Back" variant="ghost" onPress={onClose} />
        </View>
      }
    >
      <Muted>Only pay after you have sent the money to the account.</Muted>
      {request ? <ReceiptRecipientList request={request} /> : null}
      <Field
        label="Paid amount ($)"
        value={paidAmount}
        onChangeText={(text) => setPaidAmount(currencyText(text))}
        keyboardType="numeric"
      />
      <Field label="Comment (optional)" value={comment} onChangeText={setComment} />
      <ErrorBanner message={error} />
    </Sheet>
  );
};

const SECTIONS: { key: Exclude<Step, never>; title: string }[] = [
  { key: "hod", title: "Awaiting Your HOD Approval" },
  { key: "budgetManager", title: "Awaiting Your Budget Approval" },
  { key: "director", title: "Awaiting Your Director Approval" },
  { key: "financeHead", title: "Awaiting Your Finance Head Approval" },
];

/** Requests waiting on the signed-in approver, grouped by step. */
export const ReviewList = ({
  focusId,
  focusThread = false,
}: {
  /** Notification deep-link: id of the request to focus (expand / open thread). */
  focusId?: string;
  focusThread?: boolean;
} = {}) => {
  const t = useAppTheme();
  const data = useQuery(api.requests.toReview, {});
  // Requests the approver has already actioned, shown in their own section
  // beneath the pending ones.
  const reviewed = useQuery(api.requests.reviewed, {});
  // Optimistic: clear the request from its review section immediately so the
  // approval feels instant; the next pending step/payer reconciles on response.
  const approve = useMutation(api.requests.approve).withOptimisticUpdate(
    (localStore, { requestId, step }) => {
      const current = localStore.getQuery(api.requests.toReview, {});
      if (!current) return;
      localStore.setQuery(api.requests.toReview, {}, {
        ...current,
        [step]: current[step].filter((r) => r._id !== requestId),
      });
    }
  );
  const [declineTarget, setDeclineTarget] = useState<{
    request: Doc<"requests">;
    step: Step;
  } | null>(null);
  // Approving asks for confirmation first (declining already prompts for a
  // reason in DeclineSheet).
  const [approveTarget, setApproveTarget] = useState<{
    request: Doc<"requests">;
    step: Step;
  } | null>(null);
  const [payTarget, setPayTarget] = useState<Doc<"requests"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve the requester's name for the approve-confirmation copy, scoped to
  // the request's staff year (same lookup the card uses); fall back to the
  // email until it loads or when the person has no profile name.
  const approveRequesterName = useQuery(
    api.directory.nameForEmail,
    approveTarget
      ? {
          email: approveTarget.request.requesterEmail,
          year: eventStaffYear(approveTarget.request._creationTime),
        }
      : "skip"
  );

  const handleApprove = async (request: Doc<"requests">, step: Step) => {
    setError(null);
    try {
      await approve({ requestId: request._id, step });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const hasAnything =
    data &&
    (data.hod.length > 0 ||
      data.budgetManager.length > 0 ||
      data.director.length > 0 ||
      data.financeHead.length > 0 ||
      data.readyToPay.length > 0);
  const hasReviewed = reviewed != null && reviewed.length > 0;

  return (
    <>
      <ErrorBanner message={error} />
      {data == null || reviewed === undefined ? (
        // Wait for BOTH the pending list and the reviewed history before
        // deciding what to show, so "All caught up" can't flash before the
        // Reviewed section resolves.
        <LoadingState />
      ) : !hasAnything && !hasReviewed ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="All caught up"
          message="Nothing is waiting on your review right now."
        />
      ) : (
        <>
          {!hasAnything ? (
            <Muted>You&rsquo;re all caught up — nothing is waiting on your review.</Muted>
          ) : (
            <>
              {SECTIONS.map(({ key, title }) =>
                data[key].length === 0 ? null : (
                  <View key={key} style={{ gap: spacing.md }}>
                    <SectionTitle>
                      {title} ({data[key].length})
                    </SectionTitle>
                    {data[key].map((request, index) => (
                      <FadeInView key={request._id} delay={stagger(index)}>
                        <RequestCard request={request} showRequester actionRequired autoExpand={request._id === focusId} autoOpenThread={request._id === focusId && focusThread}>
                          <IconButton
                            name="checkmark"
                            size={40}
                            bg={t.successSoft}
                            color={t.success}
                            accessibilityLabel="Approve"
                            onPress={() => setApproveTarget({ request, step: key })}
                          />
                          <IconButton
                            name="close"
                            size={40}
                            bg={t.dangerSoft}
                            color={t.danger}
                            accessibilityLabel="Decline"
                            onPress={() => setDeclineTarget({ request, step: key })}
                          />
                        </RequestCard>
                      </FadeInView>
                    ))}
                  </View>
                )
              )}
              {data.readyToPay.length > 0 && (
                <View style={{ gap: spacing.md }}>
                  <SectionTitle>Ready to Pay ({data.readyToPay.length})</SectionTitle>
                  {data.readyToPay.map((request, index) => (
                    <FadeInView key={request._id} delay={stagger(index)}>
                      <RequestCard request={request} showRequester actionRequired autoExpand={request._id === focusId} autoOpenThread={request._id === focusId && focusThread}>
                        <IconButton
                          name="cash-outline"
                          size={40}
                          bg={t.successSoft}
                          color={t.success}
                          accessibilityLabel="Mark as paid"
                          onPress={() => setPayTarget(request)}
                        />
                      </RequestCard>
                    </FadeInView>
                  ))}
                </View>
              )}
            </>
          )}
          {reviewed && reviewed.length > 0 ? (
            <View style={{ gap: spacing.md }}>
              <SectionTitle>Reviewed ({reviewed.length})</SectionTitle>
              {reviewed.map((request, index) => (
                <FadeInView key={request._id} delay={stagger(index)}>
                  {/* Read-only history of what this approver has actioned. */}
                  <RequestCard
                    request={request}
                    showRequester
                    collapsible
                    autoExpand={request._id === focusId}
                    autoOpenThread={request._id === focusId && focusThread}
                  />
                </FadeInView>
              ))}
            </View>
          ) : null}
        </>
      )}
      <ConfirmDialog
        visible={approveTarget !== null}
        title="Approve request?"
        message={
          approveTarget
            ? `$${approveTarget.request.amount} from ${approveRequesterName ?? approveTarget.request.requesterEmail} — moves to the next step.`
            : undefined
        }
        confirmLabel="Approve"
        destructive={false}
        onConfirm={() => {
          if (approveTarget) void handleApprove(approveTarget.request, approveTarget.step);
        }}
        onClose={() => setApproveTarget(null)}
      />
      <DeclineSheet target={declineTarget} onClose={() => setDeclineTarget(null)} />
      <PaySheet request={payTarget} onClose={() => setPayTarget(null)} />
    </>
  );
};
