import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "@/theme";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { RequestCard } from "@/components/RequestCard";
import {
  Btn,
  ErrorBanner,
  errorMessage,
  Field,
  Muted,
  Row,
  SectionTitle,
  Sheet,
  Txt,
} from "@/components/ui";

type Step = "hod" | "budgetManager" | "director" | "financeHead";

const DeclineSheet = ({
  target,
  onClose,
}: {
  target: { request: Doc<"requests">; step: Step } | null;
  onClose: () => void;
}) => {
  const decline = useMutation(api.requests.decline);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleDecline = async () => {
    if (!target) return;
    setError(null);
    try {
      await decline({ requestId: target.request._id, step: target.step, reason });
      setReason("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Sheet visible={target !== null} onClose={onClose}>
      <Txt style={styles.sheetTitle}>Decline Request</Txt>
      <Muted>The requester will be emailed your reason.</Muted>
      <Field label="Reason (required)" value={reason} onChangeText={setReason} multiline />
      <ErrorBanner message={error} />
      <Row>
        <Btn title="Decline" variant="danger" onPress={handleDecline} />
        <Btn title="Back" variant="ghost" onPress={onClose} />
      </Row>
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

  const handlePay = async () => {
    if (!request) return;
    setError(null);
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
    }
  };

  return (
    <Sheet visible={request !== null} onClose={onClose}>
      <Txt style={styles.sheetTitle}>Pay Reimbursement</Txt>
      <Muted>Only pay after you have sent the money to the account.</Muted>
      {request?.receipt?.recipients.map((recipient, i) => (
        <View key={i} style={{ gap: 2 }}>
          <Muted>
            {recipient.accountName} • BSB {recipient.bsb} • Acc{" "}
            {recipient.accountNumber} • ${recipient.amount}
          </Muted>
          {(receipts?.[i]?.attachments ?? []).map((attachment, j) =>
            attachment.url ? (
              <Pressable
                key={j}
                onPress={() => void Linking.openURL(attachment.url!)}
              >
                <Text style={{ color: t.primary, textDecorationLine: "underline" }}>
                  📎 {attachment.name}
                </Text>
              </Pressable>
            ) : null
          )}
        </View>
      ))}
      <Field
        label="Paid amount ($)"
        value={paidAmount}
        onChangeText={setPaidAmount}
        keyboardType="numeric"
      />
      <Field label="Comment (optional)" value={comment} onChangeText={setComment} />
      <ErrorBanner message={error} />
      <Row>
        <Btn title="PAY" variant="success" onPress={handlePay} />
        <Btn title="Back" variant="ghost" onPress={onClose} />
      </Row>
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
  const data = useQuery(api.requests.toReview, {});
  const approve = useMutation(api.requests.approve);
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
        <Muted>Loading…</Muted>
      ) : !hasAnything ? (
        <Muted>No requests to review.</Muted>
      ) : (
        <>
          {SECTIONS.map(({ key, title }) =>
            data[key].length === 0 ? null : (
              <View key={key}>
                <SectionTitle>
                  {title} ({data[key].length})
                </SectionTitle>
                {data[key].map((request) => (
                  <RequestCard key={request._id} request={request} showRequester>
                    <Btn
                      title="Approve"
                      variant="success"
                      onPress={() => void handleApprove(request, key)}
                    />
                    <Btn
                      title="Decline"
                      variant="danger"
                      onPress={() => setDeclineTarget({ request, step: key })}
                    />
                  </RequestCard>
                ))}
              </View>
            )
          )}
          {data.readyToPay.length > 0 && (
            <View>
              <SectionTitle>Ready to Pay ({data.readyToPay.length})</SectionTitle>
              {data.readyToPay.map((request) => (
                <RequestCard key={request._id} request={request} showRequester>
                  <Btn
                    title="Pay"
                    variant="success"
                    onPress={() => setPayTarget(request)}
                  />
                </RequestCard>
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
  sheetTitle: { fontSize: 18, fontWeight: "700" },
});
