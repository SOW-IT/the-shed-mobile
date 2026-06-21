import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
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
  ConfirmDialog,
  currencyText,
  digitsOnly,
  EmptyState,
  ErrorBanner,
  errorMessage,
  FadeInView,
  Field,
  IconButton,
  LoadingState,
  maskAccount,
  MAX_UPLOAD_BYTES,
  Muted,
  Row,
  Select,
  Sheet,
  stagger,
  Txt,
} from "@/components/ui";

export type RequestPrefill = {
  description: string;
  amount: string;
  department: string;
};

/** Walkthrough steps; the Director cutoff is the year's configured threshold. */
const buildGuideSteps = (directorThreshold: number) => [
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
    title: `Director approval (≥ $${directorThreshold.toLocaleString()})`,
    detail: `Requests at or above $${directorThreshold.toLocaleString()} also need Director sign-off.`,
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

export const GuideSheet = ({
  visible,
  onClose,
  directorThreshold = DIRECTOR_APPROVAL_THRESHOLD,
}: {
  visible: boolean;
  onClose: () => void;
  /** The live year's Director-approval cutoff; defaults to the standard $5,000. */
  directorThreshold?: number;
}) => {
  const t = useAppTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="How to submit a request">
      {buildGuideSteps(directorThreshold).map((step, i) => (
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
  directorThreshold,
}: {
  visible: boolean;
  onClose: () => void;
  departments: string[];
  defaultDepartment: string;
  /** Set when resubmitting a declined request — pre-fills the form. */
  prefill: RequestPrefill | null;
  /** The year's Director-approval cutoff, for the inline hint. */
  directorThreshold: number;
}) => {
  const submit = useMutation(api.requests.submit);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [department, setDepartment] = useState(defaultDepartment);
  const [error, setError] = useState<string | null>(null);

  // Re-initialise the form each time it opens (blank, or from the prefill).
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form on open
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
    <Sheet visible={visible} onClose={onClose} title="New Request">
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
        {Number(amount) >= directorThreshold ? (
          <Muted>{`Requests of $${directorThreshold.toLocaleString()} or more also require Director approval.`}</Muted>
        ) : null}
        <ErrorBanner message={error} />
        <Btn title="Submit Request" onPress={handleSubmit} />
        <Btn title="Cancel" variant="ghost" onPress={onClose} />
      </Sheet>
  );
};

type DraftFile = { storageId: Id<"_storage">; name: string };
type DraftRecipient = {
  accountName: string;
  bsb: string;
  accountNumber: string;
  amount: string;
  files: DraftFile[];
  saveAccount: boolean;
};
const emptyRecipient = (): DraftRecipient => ({
  accountName: "",
  bsb: "",
  accountNumber: "",
  amount: "",
  files: [],
  saveAccount: true,
});

type SavedAccount = {
  id: Id<"savedBankAccounts">;
  accountName: string;
  bsb: string;
  accountNumber: string;
  preferred: boolean;
};

/**
 * Tappable chips of the caller's previously-used bank accounts. Tapping one
 * fills the recipient's account fields; the × forgets it.
 */
const SavedAccountPicker = ({
  accounts,
  onPick,
  onForget,
}: {
  accounts: SavedAccount[];
  onPick: (account: SavedAccount) => void;
  onForget: (id: Id<"savedBankAccounts">) => void;
}) => {
  const t = useAppTheme();
  if (accounts.length === 0) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.label, { color: t.muted }]}>Saved accounts</Text>
      <View style={styles.savedRow}>
        {accounts.map((account) => (
          <View
            key={account.id}
            style={[styles.savedChip, { backgroundColor: t.ghost, borderColor: t.border }]}
          >
            <Pressable
              style={({ pressed }) => [styles.savedChipMain, pressed && { opacity: 0.6 }]}
              onPress={() => onPick(account)}
            >
              <Ionicons name="card-outline" size={14} color={t.primary} />
              <Text style={[typography.caption, { color: t.text, fontWeight: "600" }]}>
                {account.accountName}
              </Text>
              <Text style={[typography.caption, { color: t.faint }]}>
                {maskAccount(account.accountNumber)}
              </Text>
            </Pressable>
            <Pressable
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Forget saved account ${account.accountName}`}
              accessibilityHint="Removes this saved account"
              style={({ pressed }) => [styles.savedChipForget, pressed && { opacity: 0.6 }]}
              onPress={() => onForget(account.id)}
            >
              <Ionicons name="close" size={13} color={t.faint} />
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
};

/** Shows a "Save for future use" toggle only when the account isn't already saved. */
const SaveAccountToggle = ({
  recipient,
  savedAccounts,
  onToggle,
}: {
  recipient: DraftRecipient;
  savedAccounts: SavedAccount[];
  onToggle: (save: boolean) => void;
}) => {
  const t = useAppTheme();
  // Don't show if bsb+accountNumber is already in saved list.
  const alreadySaved =
    recipient.bsb &&
    recipient.accountNumber &&
    savedAccounts.some(
      (a) => a.bsb === recipient.bsb && a.accountNumber === recipient.accountNumber
    );
  if (alreadySaved) return null;
  if (!recipient.bsb && !recipient.accountNumber) return null;
  return (
    <View style={styles.saveToggleRow}>
      <Text style={[{ color: t.text, fontSize: 14, flex: 1 }]}>
        Save account details for future use
      </Text>
      <Switch
        value={recipient.saveAccount}
        onValueChange={onToggle}
        trackColor={{ false: t.ghost, true: t.primarySoft }}
        thumbColor={recipient.saveAccount ? t.primary : t.faint}
      />
    </View>
  );
};

const ReceiptSheet = ({
  request,
  onClose,
}: {
  request: Doc<"requests"> | null;
  onClose: () => void;
}) => {
  const submitReceipt = useMutation(api.requests.submitReceipt);
  const generateUploadUrl = useMutation(api.requests.generateReceiptUploadUrl);
  const savedAccounts = useQuery(api.bankAccounts.listMine, {});
  const forgetAccount = useMutation(api.bankAccounts.remove);
  const [recipients, setRecipients] = useState<DraftRecipient[]>([emptyRecipient()]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the receipt total exceeds the request and we need a confirmation.
  const [confirmExceeds, setConfirmExceeds] = useState<{ total: number } | null>(
    null
  );

  // Auto-fill first recipient from preferred account when the sheet opens or
  // when savedAccounts finish loading for the first time while the sheet is open.
  useEffect(() => {
    if (!request || !savedAccounts || savedAccounts.length === 0) return;
    // Only auto-fill if the recipient form is still in default empty state.
    const [first] = recipients;
    const isDefault =
      recipients.length === 1 &&
      first.accountName === "" &&
      first.bsb === "" &&
      first.accountNumber === "";
    if (!isDefault) return;
    const preferred = savedAccounts.find((a) => a.preferred) ?? savedAccounts[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-fill on open/load
    setRecipients([{
      accountName: preferred.accountName,
      bsb: preferred.bsb,
      accountNumber: preferred.accountNumber,
      amount: "",
      files: [],
      saveAccount: false, // already saved
    }]);
  // recipients intentionally excluded — only need to check on sheet open and accounts load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?._id, savedAccounts]);

  // Clear the draft once the sheet closes, so reopening it for a DIFFERENT
  // request never shows the previous request's recipients, amounts or attached
  // files (which would otherwise be submitted against the new request). Mirrors
  // PaySheet/DeclineSheet in ReviewList. Reset on close — not open — so the
  // auto-fill effect above can still prefill from the saved account next time.
  useEffect(() => {
    if (request !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset draft on close
    setRecipients([emptyRecipient()]);
    setError(null);
  }, [request]);

  const updateRecipient = (index: number, patch: Partial<DraftRecipient>) =>
    setRecipients((previous) =>
      previous.map((recipient, i) => {
        if (i !== index) return recipient;
        const next = { ...recipient, ...patch };
        const touchedBankFields =
          patch.accountName !== undefined ||
          patch.bsb !== undefined ||
          patch.accountNumber !== undefined;
        const matchesSaved =
          next.bsb !== "" &&
          next.accountNumber !== "" &&
          (savedAccounts ?? []).some(
            (a) => a.bsb === next.bsb && a.accountNumber === next.accountNumber
          );
        if (touchedBankFields && patch.saveAccount === undefined && !matchesSaved) {
          next.saveAccount = true;
        }
        return next;
      })
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
        if (blob.size > MAX_UPLOAD_BYTES) {
          const maxMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
          throw new Error(
            `${asset.name ?? "File"} is too large. Each receipt must be ${maxMb}MB or less.`
          );
        }
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
          saveAccount: recipient.saveAccount,
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
      setConfirmExceeds({ total });
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
          <SavedAccountPicker
            accounts={savedAccounts ?? []}
            onPick={(account) =>
              updateRecipient(index, {
                accountName: account.accountName,
                bsb: account.bsb,
                accountNumber: account.accountNumber,
              })
            }
            onForget={(id) =>
              void forgetAccount({ id }).catch((e) => setError(errorMessage(e)))
            }
          />
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
          <SaveAccountToggle
            recipient={recipient}
            savedAccounts={savedAccounts ?? []}
            onToggle={(saveAccount) => updateRecipient(index, { saveAccount })}
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
      <ConfirmDialog
        visible={confirmExceeds !== null}
        title="Receipt exceeds request"
        message={
          confirmExceeds && request
            ? `Your receipt total of $${confirmExceeds.total} is more than the requested $${request.amount}. You may only be paid up to the requested amount. Submit anyway?`
            : undefined
        }
        confirmLabel="Submit Anyway"
        destructive={false}
        onConfirm={() => void send()}
        onClose={() => setConfirmExceeds(null)}
      />
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
  year,
  readOnly = false,
  directorThreshold = DIRECTOR_APPROVAL_THRESHOLD,
}: {
  departments: string[];
  defaultDepartment: string;
  newOpen: boolean;
  prefill: RequestPrefill | null;
  onResubmit: (prefill: RequestPrefill) => void;
  onNewClose: () => void;
  // A past staff year to browse (read-only). Omit/undefined for the live year.
  year?: number;
  readOnly?: boolean;
  /** The year's Director-approval cutoff; defaults to the standard $5,000. */
  directorThreshold?: number;
}) => {
  const t = useAppTheme();
  const requests = useQuery(
    api.requests.myRequests,
    year !== undefined ? { year } : {}
  );
  const cancel = useMutation(api.requests.cancel);
  const deleteDeclined = useMutation(api.requests.deleteDeclined);
  const [receiptFor, setReceiptFor] = useState<Doc<"requests"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Drives the in-app confirmation for cancelling or deleting a request.
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

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

  const handleDeleteDeclined = async (requestId: Id<"requests">) => {
    setError(null);
    try {
      await deleteDeclined({ requestId });
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
          title={readOnly ? `No requests in ${year}` : "No requests yet"}
          message={
            readOnly
              ? "You didn't submit any requests this staff year."
              : "Tap “Make Request” below to submit your first one."
          }
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
            const needsReceipt =
              !readOnly && requestFullyApproved(request) && !request.receipt;
            return (
              <FadeInView key={request._id} delay={stagger(index)}>
                <RequestCard
                  request={request}
                  actionRequired={needsReceipt}
                  collapsible={requestCompleted(request)}
                  onCancel={
                    readOnly
                      ? undefined
                      : requestDeclined(request)
                      ? () =>
                          setConfirm({
                            title: "Delete request",
                            message: `Delete this declined $${request.amount} request ("${request.description}")? This can't be undone.`,
                            confirmLabel: "Delete",
                            onConfirm: () => void handleDeleteDeclined(request._id),
                          })
                      : !requestCompleted(request)
                      ? () =>
                          setConfirm({
                            title: "Cancel request",
                            message: `Cancel your $${request.amount} request ("${request.description}")? It will be deleted along with its approvals — this can't be undone.`,
                            confirmLabel: "Cancel Request",
                            onConfirm: () => void handleCancel(request._id),
                          })
                      : undefined
                  }
                >
                  {needsReceipt && (
                    <IconButton
                      name="cloud-upload-outline"
                      bg={t.successSoft}
                      color={t.success}
                      accessibilityLabel="Submit receipt"
                      onPress={() => setReceiptFor(request)}
                    />
                  )}
                  {!readOnly && requestDeclined(request) && (
                    <IconButton
                      name="refresh"
                      bg={t.primarySoft}
                      color={t.primary}
                      accessibilityLabel="Resubmit request"
                      onPress={() => resubmit(request)}
                    />
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
        directorThreshold={directorThreshold}
      />
      <ReceiptSheet request={receiptFor} onClose={() => setReceiptFor(null)} />
      <ConfirmDialog
        visible={confirm !== null}
        title={confirm?.title ?? ""}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={() => confirm?.onConfirm()}
        onClose={() => setConfirm(null)}
      />
    </>
  );
};

const styles = StyleSheet.create({
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
  savedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  savedChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: 5,
    gap: 4,
  },
  savedChipMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  savedChipForget: {
    paddingLeft: 2,
  },
  saveToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
