import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import {
  requestCompleted,
  requestDeclined,
  requestFullyApproved,
} from "../../shared/flow";
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
  Select,
  Txt,
} from "@/components/ui";

export type RequestPrefill = {
  description: string;
  amount: string;
  department: string;
};

const NewRequestModal = ({
  visible,
  onClose,
  departments,
  defaultDepartment,
  prefill,
}: {
  visible: boolean;
  onClose: () => void;
  departments: string[];
  defaultDepartment: string;
  /** Set when resubmitting a declined request — pre-fills the form. */
  prefill: RequestPrefill | null;
}) => {
  const submit = useMutation(api.requests.submit);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [department, setDepartment] = useState(defaultDepartment);
  const [error, setError] = useState<string | null>(null);

  // Re-initialise the form each time it opens (blank, or from the prefill).
  useEffect(() => {
    if (!visible) return;
    setDescription(prefill?.description ?? "");
    setAmount(prefill?.amount ?? "");
    setDepartment(prefill?.department ?? defaultDepartment);
  }, [visible, prefill, defaultDepartment]);

  const handleSubmit = async () => {
    setError(null);
    try {
      await submit({ description, amount: Number(amount), department });
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
          <Select
            label="Department (you can submit on behalf of another department)"
            value={department}
            options={departments}
            onSelect={setDepartment}
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

type DraftFile = { storageId: Id<"_storage">; name: string };
type DraftRecipient = {
  accountName: string;
  bsb: string;
  accountNumber: string;
  amount: string;
  files: DraftFile[];
};
const emptyRecipient = (): DraftRecipient => ({
  accountName: "",
  bsb: "",
  accountNumber: "",
  amount: "",
  files: [],
});

const ReceiptModal = ({
  request,
  onClose,
}: {
  request: Doc<"requests"> | null;
  onClose: () => void;
}) => {
  const submitReceipt = useMutation(api.requests.submitReceipt);
  const generateUploadUrl = useMutation(api.requests.generateReceiptUploadUrl);
  const [recipients, setRecipients] = useState<DraftRecipient[]>([emptyRecipient()]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRecipient = (index: number, patch: Partial<DraftRecipient>) =>
    setRecipients((previous) =>
      previous.map((recipient, i) =>
        i === index ? { ...recipient, ...patch } : recipient
      )
    );

  const attachFiles = async (index: number) => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      setUploading(true);
      const uploaded: DraftFile[] = [];
      for (const asset of result.assets) {
        const blob = await (await fetch(asset.uri)).blob();
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": asset.mimeType ?? blob.type ?? "application/octet-stream",
          },
          body: blob,
        });
        if (!response.ok) throw new Error(`Upload of ${asset.name} failed`);
        const { storageId } = await response.json();
        uploaded.push({ storageId, name: asset.name ?? "receipt" });
      }
      setRecipients((previous) =>
        previous.map((recipient, i) =>
          i === index
            ? { ...recipient, files: [...recipient.files, ...uploaded] }
            : recipient
        )
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!request) return;
    setError(null);
    try {
      await submitReceipt({
        requestId: request._id,
        recipients: recipients.map((recipient) => ({
          accountName: recipient.accountName,
          bsb: recipient.bsb,
          accountNumber: recipient.accountNumber,
          amount: Number(recipient.amount),
          attachments: recipient.files,
        })),
      });
      setRecipients([emptyRecipient()]);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal visible={request !== null} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <Card>
          <ScrollView style={{ maxHeight: 560 }}>
            <View style={{ gap: 8 }}>
              <Txt style={styles.modalTitle}>Submit Receipt</Txt>
              {recipients.map((recipient, index) => (
                <View key={index} style={{ gap: 8 }}>
                  <Row>
                    <Txt style={{ fontWeight: "700", flexGrow: 1 }}>
                      Recipient {index + 1}
                    </Txt>
                    {recipients.length > 1 && (
                      <Btn
                        title="Remove"
                        variant="ghost"
                        onPress={() =>
                          setRecipients((previous) =>
                            previous.filter((_, i) => i !== index)
                          )
                        }
                      />
                    )}
                  </Row>
                  <Field
                    label="Account name"
                    value={recipient.accountName}
                    onChangeText={(accountName) => updateRecipient(index, { accountName })}
                  />
                  <Field
                    label="BSB"
                    value={recipient.bsb}
                    onChangeText={(bsb) => updateRecipient(index, { bsb })}
                    keyboardType="numeric"
                  />
                  <Field
                    label="Account number"
                    value={recipient.accountNumber}
                    onChangeText={(accountNumber) => updateRecipient(index, { accountNumber })}
                    keyboardType="numeric"
                  />
                  <Field
                    label="Receipt amount ($)"
                    value={recipient.amount}
                    onChangeText={(amount) => updateRecipient(index, { amount })}
                    keyboardType="numeric"
                  />
                  {recipient.files.map((file, fileIndex) => (
                    <Row key={`${file.storageId}-${fileIndex}`}>
                      <Muted>📎 {file.name}</Muted>
                      <Btn
                        title="✕"
                        variant="ghost"
                        onPress={() =>
                          updateRecipient(index, {
                            files: recipient.files.filter((_, i) => i !== fileIndex),
                          })
                        }
                      />
                    </Row>
                  ))}
                  <Btn
                    title={uploading ? "Uploading…" : "Attach receipt files"}
                    variant="ghost"
                    onPress={() => void attachFiles(index)}
                    disabled={uploading}
                  />
                </View>
              ))}
              <Btn
                title="+ Add another recipient"
                variant="ghost"
                onPress={() =>
                  setRecipients((previous) => [...previous, emptyRecipient()])
                }
              />
              <ErrorBanner message={error} />
              <Row>
                <Btn title="Submit Receipt" onPress={handleSubmit} disabled={uploading} />
                <Btn title="Cancel" variant="ghost" onPress={onClose} />
              </Row>
            </View>
          </ScrollView>
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
  const structure = useQuery(
    api.directory.yearStructure,
    me?.profile ? { year: me.year } : "skip"
  );
  const departmentNames = (structure?.departments ?? []).map((d) => d.name);
  // Own department, or (for Heads of Division) one under their division.
  const defaultDepartment =
    me?.profile?.department ??
    (structure?.departments ?? []).find(
      (d) => d.division === me?.profile?.division
    )?.name ??
    "";
  const cancel = useMutation(api.requests.cancel);
  const [newOpen, setNewOpen] = useState(false);
  const [prefill, setPrefill] = useState<RequestPrefill | null>(null);
  const [receiptFor, setReceiptFor] = useState<Doc<"requests"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resubmit = (request: Doc<"requests">) => {
    setPrefill({
      description: request.description,
      amount: String(request.amount),
      department: request.department,
    });
    setNewOpen(true);
  };

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
                  {me.profile.roles.join(", ")} •{" "}
                  {[me.profile.department, me.profile.division]
                    .filter(Boolean)
                    .join(" / ") || "—"}{" "}
                  • {me.year}
                </Muted>
              </View>
              <Btn title="Sign out" variant="ghost" onPress={() => void signOut()} />
            </Row>
          </Card>
          <Row>
            <Btn
              title="+ Make Request"
              onPress={() => {
                setPrefill(null);
                setNewOpen(true);
              }}
            />
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
                {requestDeclined(request) && (
                  <Btn
                    title="Resubmit"
                    onPress={() => resubmit(request)}
                  />
                )}
              </RequestCard>
            ))
          )}
          <NewRequestModal
            visible={newOpen}
            onClose={() => setNewOpen(false)}
            departments={departmentNames}
            defaultDepartment={defaultDepartment}
            prefill={prefill}
          />
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
