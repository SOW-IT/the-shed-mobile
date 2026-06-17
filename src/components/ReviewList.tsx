import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { RequestCard } from "@/components/RequestCard";
import {
  Btn,
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

  const handleDecline = async () => {
    if (!target || submitting) return;
    setError(null);
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
    <Sheet visible={target !== null} onClose={onClose} title="Decline Request">
      <Muted>The requester will be emailed your reason.</Muted>
      <Field label="Reason (required)" value={reason} onChangeText={setReason} multiline />
      <ErrorBanner message={error} />
      <Btn title="Decline" variant="danger" loading={submitting} onPress={handleDecline} />
      <Btn title="Back" variant="ghost" onPress={onClose} />
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
  const t = useAppTheme();
  const pay = useMutation(api.requests.pay);
  const receipts = useQuery(
    api.requests.receiptAttachments,
    request ? { requestId: request._id } : "skip"
  );
  const [paidAmount, setPaidAmount] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

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
    <Sheet visible={request !== null} onClose={onClose} title="Pay Reimbursement">
      <Muted>Only pay after you have sent the money to the account.</Muted>
      {request?.receipt?.recipients.map((recipient, i) => (
        <View key={i} style={[styles.recipient, { backgroundColor: t.inputBackground }]}>
          <Text style={[typography.caption, { color: t.text, fontWeight: "600" }]}>
            {recipient.accountName} · ${recipient.amount}
          </Text>
          <Muted>
            BSB {recipient.bsb} · Acc {recipient.accountNumber}
          </Muted>
          {(receipts?.[i]?.attachments ?? []).map((attachment, j) =>
            attachment.url ? (
              <Pressable
                key={j}
                style={({ pressed }) => [styles.fileLink, pressed && { opacity: 0.6 }]}
                onPress={() => void Linking.openURL(attachment.url!)}
              >
                <Ionicons name="document-attach-outline" size={15} color={t.primary} />
                <Text
                  numberOfLines={1}
                  style={[typography.caption, { color: t.primary, fontWeight: "600", flex: 1 }]}
                >
                  {attachment.name}
                </Text>
              </Pressable>
            ) : null
          )}
        </View>
      ))}
      <Field
        label="Paid amount ($)"
        value={paidAmount}
        onChangeText={(text) => setPaidAmount(currencyText(text))}
        keyboardType="numeric"
      />
      <Field label="Comment (optional)" value={comment} onChangeText={setComment} />
      <ErrorBanner message={error} />
      <Btn title="Mark as Paid" variant="success" loading={paying} onPress={handlePay} />
      <Btn title="Back" variant="ghost" onPress={onClose} />
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
export const ReviewList = () => {
  const t = useAppTheme();
  const data = useQuery(api.requests.toReview, {});
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
  const [payTarget, setPayTarget] = useState<Doc<"requests"> | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <>
      <ErrorBanner message={error} />
      {data == null ? (
        <LoadingState />
      ) : !hasAnything ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="All caught up"
          message="Nothing is waiting on your review right now."
        />
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
                    <RequestCard request={request} showRequester actionRequired>
                      <IconButton
                        name="checkmark"
                        bg={t.successSoft}
                        color={t.success}
                        accessibilityLabel="Approve"
                        onPress={() => void handleApprove(request, key)}
                      />
                      <IconButton
                        name="close"
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
                  <RequestCard request={request} showRequester actionRequired>
                    <IconButton
                      name="cash-outline"
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
      <DeclineSheet target={declineTarget} onClose={() => setDeclineTarget(null)} />
      <PaySheet request={payTarget} onClose={() => setPayTarget(null)} />
    </>
  );
};

const styles = StyleSheet.create({
  recipient: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  fileLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
});
