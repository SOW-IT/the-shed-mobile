import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  DIRECTOR_APPROVAL_THRESHOLD,
  requestCompleted,
  requestDeclined,
  requestFullyApproved,
} from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { RequestCard } from "@/components/RequestCard";
import {
  Btn,
  currencyText,
  digitsOnly,
  EmptyState,
  ErrorBanner,
  errorMessage,
  FadeInView,
  Field,
  LoadingState,
  Muted,
  Row,
  Select,
  Sheet,
  stagger,
  Txt,
} from "@/components/ui";

// Alert.alert buttons are a no-op on react-native-web, so the web build
// falls back to window.confirm.
const confirmAction = (
  title: string,
  message: string,
  confirmText: string,
  onConfirm: () => void,
  destructive?: boolean
) => {
  if (Platform.OS === "web") {
    if (window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Back", style: "cancel" },
    {
      text: confirmText,
      style: destructive ? "destructive" : "default",
      onPress: onConfirm,
    },
  ]);
};

export type RequestPrefill = {
  description: string;
  amount: string;
  department: string;
};

const GUIDE_STEPS = [
  {
    icon: "create-outline" as const,
    title: "Submit your request",
    detail: "Enter what you need reimbursed, the amount, and the department to charge.",
  },
  {
    icon: "person-outline" as const,
    title: "HOD approval",
    detail: "Your Head of Department reviews and approves the request.",
  },
  {
    icon: "wallet-outline" as const,
    title: "Budget Manager approval",
    detail: "The Budget Manager checks available funds and signs off.",
  },
  {
    icon: "shield-checkmark-outline" as const,
    title: `Director approval (≥ $${DIRECTOR_APPROVAL_THRESHOLD.toLocaleString()})`,
    detail: `Requests at or above $${DIRECTOR_APPROVAL_THRESHOLD.toLocaleString()} also need Director sign-off.`,
  },
  {
    icon: "checkmark-circle-outline" as const,
    title: "Finance Head approval",
    detail: "The Finance Head gives final approval.",
  },
  {
    icon: "receipt-outline" as const,
    title: "Submit your receipt",
    detail: "Once fully approved, upload your receipt and provide bank account details.",
  },
  {
    icon: "cash-outline" as const,
    title: "Payment",
    detail: "Finance transfers the amount to your account and marks the request as Paid.",
  },
];

const GuideSheet = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="How to submit a request">
      {GUIDE_STEPS.map((step, i) => (
        <View key={i} style={styles.guideStep}>
          <View style={[styles.guideIconWrap, { backgroundColor: t.primarySoft }]}>
            <Ionicons name={step.icon} size={18} color={t.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.caption, { color: t.text, fontWeight: "700" }]}>
              {step.title}
            </Text>
            <Text style={[typography.caption, { color: t.muted }]}>{step.detail}</Text>
          </View>
        </View>
      ))}
    </Sheet>
  );
};

const NewRequestSheet = ({
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
  const t = useAppTheme();
  const submit = useMutation(api.requests.submit);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [department, setDepartment] = useState(defaultDepartment);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

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
    <>
      <Sheet visible={visible} onClose={onClose} title="New Request">
        <Pressable
          style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.6 }]}
          onPress={() => setShowGuide(true)}
        >
          <Ionicons name="information-circle-outline" size={17} color={t.primary} />
          <Text style={[typography.caption, { color: t.primary, fontWeight: "600" }]}>
            How does this work?
          </Text>
        </Pressable>
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
          onChangeText={(text) => setAmount(currencyText(text))}
          placeholder="0.00"
          keyboardType="numeric"
        />
        <Select
          label="Department"
          value={department}
          options={departments}
          onSelect={setDepartment}
        />
        <Muted>{`Requests of $${DIRECTOR_APPROVAL_THRESHOLD.toLocaleString()} or more also require Director approval.`}</Muted>
        <ErrorBanner message={error} />
        <Btn title="Submit Request" onPress={handleSubmit} />
        <Btn title="Cancel" variant="ghost" onPress={onClose} />
      </Sheet>
      <GuideSheet visible={showGuide} onClose={() => setShowGuide(false)} />
    </>
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

const ReceiptSheet = ({
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

  const send = async () => {
    if (!request) return;
    try {
      await submitReceipt({
        requestId: request._id,
        recipients: recipients.map((recipient) => ({
          accountName: recipient.accountName.trim(),
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

  const handleSubmit = () => {
    if (!request) return;
    setError(null);
    for (const [index, recipient] of recipients.entries()) {
      const which = recipients.length === 1 ? "" : ` for recipient ${index + 1}`;
      if (
        !recipient.accountName.trim() ||
        !recipient.bsb ||
        !recipient.accountNumber ||
        !recipient.amount
      ) {
        setError(`Fill in every field${which}.`);
        return;
      }
      if (!(Number(recipient.amount) > 0)) {
        setError(`The amount${which} must be a positive number.`);
        return;
      }
    }
    if (!recipients.some((recipient) => recipient.files.length > 0)) {
      setError("Attach at least one receipt file.");
      return;
    }
    const total = recipients.reduce((sum, r) => sum + Number(r.amount), 0);
    if (total > request.amount) {
      confirmAction(
        "Receipt exceeds request",
        `Your receipt total of $${total} is more than the requested $${request.amount}. You may only be paid up to the requested amount. Submit anyway?`,
        "Submit Anyway",
        () => void send()
      );
      return;
    }
    void send();
  };

  return (
    <Sheet visible={request !== null} onClose={onClose} title="Submit Receipt">
      {recipients.map((recipient, index) => (
        <View key={index} style={{ gap: 10 }}>
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
            onChangeText={(bsb) => updateRecipient(index, { bsb: digitsOnly(bsb) })}
            keyboardType="numeric"
          />
          <Field
            label="Account number"
            value={recipient.accountNumber}
            onChangeText={(accountNumber) =>
              updateRecipient(index, { accountNumber: digitsOnly(accountNumber) })
            }
            keyboardType="numeric"
          />
          <Field
            label="Receipt amount ($)"
            value={recipient.amount}
            onChangeText={(amount) =>
              updateRecipient(index, { amount: currencyText(amount) })
            }
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
            variant="tonal"
            onPress={() => void attachFiles(index)}
            disabled={uploading}
          />
        </View>
      ))}
      <Btn
        title="+ Add another recipient"
        variant="ghost"
        onPress={() => setRecipients((previous) => [...previous, emptyRecipient()])}
      />
      <ErrorBanner message={error} />
      <Btn title="Submit Receipt" onPress={handleSubmit} disabled={uploading} />
      <Btn title="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
};

/** The signed-in user's own requests: list, new-request and receipt forms. */
export const MyRequests = ({
  departments,
  defaultDepartment,
  newOpen,
  prefill,
  onResubmit,
  onNewClose,
}: {
  departments: string[];
  defaultDepartment: string;
  newOpen: boolean;
  prefill: RequestPrefill | null;
  onResubmit: (prefill: RequestPrefill) => void;
  onNewClose: () => void;
}) => {
  const requests = useQuery(api.requests.myRequests, {});
  const cancel = useMutation(api.requests.cancel);
  const [receiptFor, setReceiptFor] = useState<Doc<"requests"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resubmit = (request: Doc<"requests">) => {
    onResubmit({
      description: request.description,
      amount: String(request.amount),
      department: request.department,
    });
  };

  const handleCancel = async (requestId: Id<"requests">) => {
    setError(null);
    try {
      await cancel({ requestId });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <ErrorBanner message={error} />
      {requests == null ? (
        <LoadingState />
      ) : requests.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="No requests yet"
          message="Tap “Make Request” below to submit your first one."
        />
      ) : (
        [...requests]
          .sort((a, b) => {
            // Requests needing action (submit receipt or resubmit after decline) float up
            const needsAction = (r: typeof a) =>
              (requestFullyApproved(r) && !r.receipt) || requestDeclined(r) ? 0 : 1;
            const diff = needsAction(a) - needsAction(b);
            if (diff !== 0) return diff;
            return b._creationTime - a._creationTime;
          })
          .map((request, index) => {
            const needsReceipt = requestFullyApproved(request) && !request.receipt;
            return (
              <FadeInView key={request._id} delay={stagger(index)}>
                <RequestCard
                  request={request}
                  actionRequired={needsReceipt}
                  onCancel={
                    !requestCompleted(request)
                      ? () =>
                          confirmAction(
                            "Cancel request",
                            `Cancel your $${request.amount} request ("${request.description}")? It will be deleted along with its approvals — this can't be undone.`,
                            "Cancel Request",
                            () => void handleCancel(request._id),
                            true
                          )
                      : undefined
                  }
                >
                  {needsReceipt && (
                    <Btn
                      title="Submit Receipt"
                      variant="success"
                      onPress={() => setReceiptFor(request)}
                    />
                  )}
                  {requestDeclined(request) && (
                    <Btn title="Resubmit" onPress={() => resubmit(request)} />
                  )}
                </RequestCard>
              </FadeInView>
            );
          })
      )}
      <NewRequestSheet
        visible={newOpen}
        onClose={onNewClose}
        departments={departments}
        defaultDepartment={defaultDepartment}
        prefill={prefill}
      />
      <ReceiptSheet request={receiptFor} onClose={() => setReceiptFor(null)} />
    </>
  );
};

const styles = StyleSheet.create({
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
  },
  guideStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  guideIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
