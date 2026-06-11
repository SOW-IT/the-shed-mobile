import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { requestCompleted, requestFullyApproved } from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { RequestCard } from "@/components/RequestCard";
import {
  Avatar,
  Btn,
  Card,
  ErrorBanner,
  errorMessage,
  Field,
  Muted,
  Row,
  Screen,
  Txt,
} from "@/components/ui";

const NewRequestModal = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const submit = useMutation(api.requests.submit);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    try {
      await submit({ description, amount: Number(amount) });
      setDescription("");
      setAmount("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <Card>
          <Txt style={styles.modalTitle}>New Request</Txt>
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="What is this for?"
            multiline
          />
          <Field
            label="Amount ($)"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="numeric"
          />
          <Muted>Requests of $5,000 or more also require Director approval.</Muted>
          <ErrorBanner message={error} />
          <Row>
            <Btn title="Submit" onPress={handleSubmit} />
            <Btn title="Cancel" variant="ghost" onPress={onClose} />
          </Row>
        </Card>
      </View>
    </Modal>
  );
};

const ReceiptModal = ({
  request,
  onClose,
}: {
  request: Doc<"requests"> | null;
  onClose: () => void;
}) => {
  const submitReceipt = useMutation(api.requests.submitReceipt);
  const [accountName, setAccountName] = useState("");
  const [bsb, setBsb] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!request) return;
    setError(null);
    try {
      await submitReceipt({
        requestId: request._id,
        recipients: [
          { accountName, bsb, accountNumber, amount: Number(amount) },
        ],
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal visible={request !== null} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <Card>
          <Txt style={styles.modalTitle}>Submit Receipt</Txt>
          <Field label="Account name" value={accountName} onChangeText={setAccountName} />
          <Field label="BSB" value={bsb} onChangeText={setBsb} keyboardType="numeric" />
          <Field
            label="Account number"
            value={accountNumber}
            onChangeText={setAccountNumber}
            keyboardType="numeric"
          />
          <Field
            label="Receipt amount ($)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />
          <ErrorBanner message={error} />
          <Row>
            <Btn title="Submit Receipt" onPress={handleSubmit} />
            <Btn title="Cancel" variant="ghost" onPress={onClose} />
          </Row>
        </Card>
      </View>
    </Modal>
  );
};

export default function MyRequestsScreen() {
  const { signOut } = useAuthActions();
  const me = useQuery(api.directory.me);
  const requests = useQuery(
    api.requests.myRequests,
    me?.profile ? {} : "skip"
  );
  const cancel = useMutation(api.requests.cancel);
  const [newOpen, setNewOpen] = useState(false);
  const [receiptFor, setReceiptFor] = useState<Doc<"requests"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async (requestId: Id<"requests">) => {
    setError(null);
    try {
      await cancel({ requestId });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (me === undefined) return <Screen />;

  return (
    <Screen>
      {me === null || me.profile === null ? (
        <Card>
          <Txt style={styles.modalTitle}>Welcome{me?.name ? `, ${me.name}` : ""}</Txt>
          <Muted>
            No role or department is assigned to {me?.email} for {me?.year} yet.
            Ask an admin (Data and IT or Human Resources) to set you up.
          </Muted>
          <Row>
            <Btn title="Sign out" variant="ghost" onPress={() => void signOut()} />
          </Row>
        </Card>
      ) : (
        <>
          <Card>
            <Row>
              <Avatar photo={me.photo} name={me.name} size={44} />
              <View style={{ flexGrow: 1 }}>
                <Txt style={{ fontWeight: "700" }}>{me.name ?? me.email}</Txt>
                <Muted>
                  {me.profile.role} • {me.profile.department} • {me.year}
                </Muted>
              </View>
              <Btn title="Sign out" variant="ghost" onPress={() => void signOut()} />
            </Row>
          </Card>
          <Row>
            <Btn title="+ Make Request" onPress={() => setNewOpen(true)} />
          </Row>
          <ErrorBanner message={error} />
          {requests === undefined ? (
            <Muted>Loading…</Muted>
          ) : requests.length === 0 ? (
            <Muted>No requests yet. Make your first one!</Muted>
          ) : (
            requests.map((request) => (
              <RequestCard key={request._id} request={request}>
                {!requestCompleted(request) && (
                  <Btn
                    title="Cancel Request"
                    variant="danger"
                    onPress={() => void handleCancel(request._id)}
                  />
                )}
                {requestFullyApproved(request) && !request.receipt && (
                  <Btn
                    title="Submit Receipt"
                    variant="success"
                    onPress={() => setReceiptFor(request)}
                  />
                )}
              </RequestCard>
            ))
          )}
          <NewRequestModal visible={newOpen} onClose={() => setNewOpen(false)} />
          <ReceiptModal request={receiptFor} onClose={() => setReceiptFor(null)} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
});
