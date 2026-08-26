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
  formatAmount,
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on target change
    setReason("");
    setError(null);
  }, [target]);

  const handleDecline = async () => {
    if (!target || submitting) return;
    setError(null);
    if (reason.trim() === "") {
      setError(
        "Please give a reason for declining. The requester will be notified with it."
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
        keyboardType="decimal-pad"
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

export const ReviewList = ({
  focusId,
  focusThread = false,
  focusReopenKey,
}: {
  focusId?: string;
  focusThread?: boolean;
  focusReopenKey?: string;
} = {}) => {
  const t = useAppTheme();
  const data = useQuery(api.requests.toReview, {});
  const reviewed = useQuery(api.requests.reviewed, {});
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
  const [approveTarget, setApproveTarget] = useState<{
    request: Doc<"requests">;
    step: Step;
  } | null>(null);
  const [payTarget, setPayTarget] = useState<Doc<"requests"> | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <LoadingState />
      ) : !hasAnything && !hasReviewed ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="All caught up"
          message="Nothing is waiting on your review."
        />
      ) : (
        <>
          {!hasAnything ? (
            <Muted>You&rsquo;re all caught up.</Muted>
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
                        <RequestCard
                          request={request}
                          showRequester
                          actionRequired
                          autoExpand={request._id === focusId}
                          autoOpenThread={request._id === focusId && focusThread}
                          deepLinkOpenKey={request._id === focusId ? focusReopenKey : undefined}
                        >
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
                      <RequestCard
                        request={request}
                        showRequester
                        actionRequired
                        autoExpand={request._id === focusId}
                        autoOpenThread={request._id === focusId && focusThread}
                        deepLinkOpenKey={request._id === focusId ? focusReopenKey : undefined}
                      >
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
                  <RequestCard
                    request={request}
                    showRequester
                    collapsible
                    autoExpand={request._id === focusId}
                    autoOpenThread={request._id === focusId && focusThread}
                    deepLinkOpenKey={request._id === focusId ? focusReopenKey : undefined}
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
            ? `$${formatAmount(approveTarget.request.amount)} from ${approveRequesterName ?? approveTarget.request.requesterEmail}. Moves to the next step.`
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
