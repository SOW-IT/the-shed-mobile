import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Fragment, type MutableRefObject, useEffect, useRef, useState } from "react";
import { Alert, Image, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
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
import { EarlierYears, useEarlierYears } from "@/components/EarlierYears";
import { createdAtOf, ReceiptFilesNote, requestStaffYear } from "@/components/ReceiptFilesNote";
import { useMinuteTick } from "@/hooks/useMinuteTick";
import {
  getLocalFileSizeBytes,
  uploadLocalFileToUrl,
} from "@/lib/uploadLocalFile";
import {
  Btn,
  ConfirmDialog,
  currencyText,
  ACCOUNT_NUMBER_MAX_LENGTH,
  BSB_LENGTH,
  digitsOnly,
  sumAmounts,
  toCents,
  EmptyState,
  ErrorBanner,
  errorMessage,
  FadeInView,
  Grid,
  Field,
  formatAmount,
  IconButton,
  LoadingState,
  maskAccount,
  MAX_RECEIPT_UPLOAD_BYTES,
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
    title: `Director approval (≥ $${formatAmount(directorThreshold)})`,
    detail: `Requests at or above $${formatAmount(directorThreshold)} also need Director sign-off.`,
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
  prefill: RequestPrefill | null;
  directorThreshold: number;
}) => {
  const submit = useMutation(api.requests.submit);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [department, setDepartment] = useState(defaultDepartment);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!prefill) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load resubmit prefill
    setDescription(prefill.description);
    setAmount(prefill.amount);
    setDepartment(prefill.department);
  }, [prefill]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- late default adoption
    if (department === "" && defaultDepartment !== "") setDepartment(defaultDepartment);
  }, [defaultDepartment, department]);

  const complete = description.trim() !== "" && Number(amount) > 0 && department.trim() !== "";

  const handleSubmit = async () => {
    if (submittingRef.current || !complete) return;
    setError(null);
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await submit({ description, amount: Number(amount), department });
      setDescription("");
      setAmount("");
      setDepartment(defaultDepartment);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="New Request"
      footer={
        <Row spread>
          <Btn title="Cancel" variant="ghost" onPress={onClose} />
          <Btn title="Submit Request" onPress={handleSubmit} loading={submitting} disabled={!complete} />
        </Row>
      }
    >
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
          keyboardType="decimal-pad"
        />
        <Select
          label="Department"
          value={department}
          options={departments}
          onSelect={setDepartment}
        />
        <ApprovalPreview
          department={department}
          crossesDirectorThreshold={Number(amount) >= directorThreshold}
          directorThreshold={directorThreshold}
        />
        <ErrorBanner message={error} />
      </Sheet>
  );
};

const ApprovalPreview = ({
  department,
  crossesDirectorThreshold,
  directorThreshold,
}: {
  department: string;
  crossesDirectorThreshold: boolean;
  directorThreshold: number;
}) => {
  const t = useAppTheme();
  const steps = useQuery(
    api.requests.approvalPreview,
    department.trim() ? { department, amount: crossesDirectorThreshold ? directorThreshold : 0 } : "skip"
  );
  if (!steps || steps.length === 0) return null;
  const heading = steps.every((step) => step.skipped) ? "Approved straight away" : "Goes to";
  return (
    <View
      accessible
      accessibilityLabel={`${heading}: ${steps.map((s) => (s.skipped ? `${s.label}, skipped` : s.label)).join(", then ")}`}
      style={{ gap: spacing.xs }}
    >
      <Text style={[typography.label, { color: t.muted }]}>{heading}</Text>
      <View style={styles.previewRow}>
        {steps.map((step, i) => (
          <Fragment key={step.step}>
            {i > 0 ? <Ionicons name="chevron-forward" size={12} color={t.faint} /> : null}
            <View
              style={[
                styles.previewStep,
                { backgroundColor: step.skipped ? t.successSoft : t.ghost },
                step.step === "director" && { borderWidth: 1, borderColor: t.warning },
              ]}
            >
              <Text style={[typography.caption, { color: t.text, fontWeight: "700" }]}>
                {step.label}
              </Text>
              <Text numberOfLines={1} style={[typography.caption, { color: t.muted }]}>
                {step.skipped ? "Skipped" : (step.name ?? "Not set")}
              </Text>
            </View>
          </Fragment>
        ))}
      </View>
    </View>
  );
};

type DraftFile = { storageId: Id<"_storage">; name: string; previewUri?: string };
type DraftRecipient = {
  id: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
  amount: string;
  files: DraftFile[];
  saveAccount: boolean;
};
let recipientIdCounter = 0;
const newRecipientId = () => `r${++recipientIdCounter}`;
const emptyRecipient = (): DraftRecipient => ({
  id: newRecipientId(),
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
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmExceeds, setConfirmExceeds] = useState<{ total: number } | null>(
    null
  );

  useEffect(() => {
    if (!request || !savedAccounts || savedAccounts.length === 0) return;
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
      id: newRecipientId(),
      accountName: preferred.accountName,
      bsb: preferred.bsb,
      accountNumber: preferred.accountNumber,
      amount: "",
      files: [],
      saveAccount: false,
    }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?._id, savedAccounts]);

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

  type PickedReceipt = { uri: string; name: string; mimeType?: string | null };

  const uploadPickedReceipts = async (index: number, assets: PickedReceipt[]) => {
    if (assets.length === 0) return;
    setUploading(true);
    try {
      for (const asset of assets) {
        const size = await getLocalFileSizeBytes(asset.uri);
        if (size > MAX_RECEIPT_UPLOAD_BYTES) {
          const maxMb = Math.round(MAX_RECEIPT_UPLOAD_BYTES / (1024 * 1024));
          throw new Error(
            `${asset.name} is too large. Each receipt must be ${maxMb}MB or less.`
          );
        }
      }
      for (const asset of assets) {
        const uploadUrl = await generateUploadUrl();
        let storageId: Id<"_storage">;
        try {
          storageId = await uploadLocalFileToUrl(uploadUrl, asset);
        } catch (e) {
          if (e instanceof Error && e.message === "Upload failed") {
            throw new Error(`Upload of ${asset.name} failed`);
          }
          throw e;
        }
        const uploaded: DraftFile = {
          storageId,
          name: asset.name,
          previewUri: asset.mimeType?.startsWith("image/") ? asset.uri : undefined,
        };
        setRecipients((previous) =>
          previous.map((recipient, recipientIndex) =>
            recipientIndex === index
              ? { ...recipient, files: [...recipient.files, uploaded] }
              : recipient
          )
        );
      }
    } finally {
      setUploading(false);
    }
  };

  const attachFromFiles = async (index: number) => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      await uploadPickedReceipts(
        index,
        result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.name || "receipt",
          mimeType: asset.mimeType,
        }))
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const attachFromGallery = async (index: number) => {
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Photo library access is needed to attach receipt photos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.9,
      });
      if (result.canceled) return;
      await uploadPickedReceipts(
        index,
        result.assets.map((asset, assetIndex) => {
          const ext =
            asset.mimeType === "image/png"
              ? "png"
              : asset.mimeType === "image/webp"
                ? "webp"
                : "jpg";
          return {
            uri: asset.uri,
            name: asset.fileName?.trim() || `receipt-${assetIndex + 1}.${ext}`,
            mimeType: asset.mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext}`,
          };
        })
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const attachFiles = (index: number) => {
    if (Platform.OS === "web") {
      void attachFromFiles(index);
      return;
    }
    Alert.alert("Attach receipt", "Choose from your photo library or files.", [
      { text: "Photo Library", onPress: () => void attachFromGallery(index) },
      { text: "Files", onPress: () => void attachFromFiles(index) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const send = async () => {
    if (!request || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await submitReceipt({
        requestId: request._id,
        recipients: recipients.map((recipient) => ({
          accountName: recipient.accountName.trim(),
          bsb: recipient.bsb,
          accountNumber: recipient.accountNumber,
          amount: Number(recipient.amount),
          saveAccount: recipient.saveAccount,
          attachments: recipient.files.map(({ storageId, name }) => ({ storageId, name })),
        })),
      });
      setRecipients([emptyRecipient()]);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const complete =
    recipients.every(
      (recipient) =>
        recipient.accountName.trim() !== "" &&
        recipient.bsb !== "" &&
        recipient.accountNumber !== "" &&
        Number(recipient.amount) > 0
    ) && recipients.some((recipient) => recipient.files.length > 0);

  const handleSubmit = () => {
    if (!request || !complete) return;
    setError(null);
    const total = sumAmounts(recipients.map((r) => Number(r.amount)));
    if (toCents(total) > toCents(request.amount)) {
      setConfirmExceeds({ total });
      return;
    }
    void send();
  };

  const receiptTotal = recipients.reduce(
    (sum, r) => sum + (Number(r.amount) || 0),
    0
  );

  return (
    <Sheet
      visible={request !== null}
      onClose={onClose}
      title="Submit Receipt"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Btn
            title="Submit Receipt"
            onPress={handleSubmit}
            disabled={uploading || !complete}
            loading={sending}
          />
          <Btn title="Cancel" variant="ghost" onPress={onClose} />
        </View>
      }
    >
      {recipients.map((recipient, index) => (
        <View key={recipient.id} style={{ gap: 10 }}>
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
            maxLength={BSB_LENGTH}
          />
          <Field
            label="Account number"
            value={recipient.accountNumber}
            onChangeText={(accountNumber) =>
              updateRecipient(index, { accountNumber: digitsOnly(accountNumber) })
            }
            keyboardType="numeric"
            maxLength={ACCOUNT_NUMBER_MAX_LENGTH}
          />
          <Field
            label="Receipt amount ($)"
            value={recipient.amount}
            onChangeText={(amount) =>
              updateRecipient(index, { amount: currencyText(amount) })
            }
            keyboardType="decimal-pad"
          />
          {recipient.files.map((file, fileIndex) => (
            <Row key={`${file.storageId}-${fileIndex}`}>
              {file.previewUri ? (
                <Image
                  source={{ uri: file.previewUri }}
                  accessibilityLabel={`Receipt ${file.name}`}
                  style={styles.receiptThumb}
                />
              ) : null}
              <Muted>{file.previewUri ? file.name : `📎 ${file.name}`}</Muted>
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
            title={uploading ? "Uploading…" : "Attach receipts"}
            variant="tonal"
            onPress={() => attachFiles(index)}
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
      {recipients.length > 1 ? (
        <Field
          label="Total ($)"
          value={formatAmount(receiptTotal)}
          onChangeText={() => {}}
          disabled
        />
      ) : null}
      <ErrorBanner message={error} />
      <ConfirmDialog
        visible={confirmExceeds !== null}
        title="Receipt exceeds request"
        message={
          confirmExceeds && request
            ? `Your $${formatAmount(confirmExceeds.total)} receipt exceeds the requested $${formatAmount(request.amount)}. You'll be paid up to the requested amount.`
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

const formatCooldown = (ms: number): string => {
  const mins = Math.ceil(ms / 60000);
  if (mins < 1) return "under a minute";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const cooldownLeftMs = (availableAt: number): number =>
  Math.max(0, availableAt - Date.now());

const NudgeButton = ({
  request,
  onNudge,
}: {
  request: Doc<"requests">;
  onNudge: (request: Doc<"requests">) => void;
}) => {
  const t = useAppTheme();
  useMinuteTick();
  const status = useQuery(api.requests.canNudge, { requestId: request._id });
  const waitMs = status ? cooldownLeftMs(status.availableAt) : 0;
  const coolingDown = waitMs > 0;
  const enabled = status != null && !coolingDown;
  const wait = coolingDown ? formatCooldown(waitMs) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={wait ? `Nudge again in ${wait}` : "Nudge approver"}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={() => onNudge(request)}
      style={({ pressed }) => [
        nudgeButtonStyle,
        wait ? [styles.nudgeCooldown, { backgroundColor: t.ghost }] : undefined,
        enabled ? { backgroundColor: t.primarySoft } : undefined,
        pressed && enabled ? { opacity: 0.7 } : undefined,
      ]}
    >
      <MaterialCommunityIcons
        name="hand-pointing-up"
        size={22}
        color={enabled ? t.primary : t.faint}
      />
      {wait ? (
        <Text style={[typography.caption, { color: t.faint, fontWeight: "600" }]}>{wait}</Text>
      ) : null}
    </Pressable>
  );
};

export const MyRequests = ({
  departments,
  defaultDepartment,
  newOpen,
  prefill,
  onResubmit,
  onNewClose,
  onMakeRequest,
  directorThreshold = DIRECTOR_APPROVAL_THRESHOLD,
  focusId,
  focusThread = false,
  focusReopenKey,
  onFocusThreadOpened,
  loadMoreRef,
}: {
  departments: string[];
  defaultDepartment: string;
  newOpen: boolean;
  prefill: RequestPrefill | null;
  onResubmit: (prefill: RequestPrefill) => void;
  onNewClose: () => void;
  onMakeRequest?: () => void;
  focusId?: string;
  focusThread?: boolean;
  focusReopenKey?: string;
  onFocusThreadOpened?: () => void;
  directorThreshold?: number;
  loadMoreRef?: MutableRefObject<(() => void) | null>;
}) => {
  const t = useAppTheme();
  const requests = useQuery(api.requests.myRequests, {});
  const earlier = useEarlierYears(api.requests.earlierMine, {
    enabled: requests != null,
    exclude: (requests ?? []).map((r) => r._id),
    yearOf: requestStaffYear,
    newestOf: createdAtOf,
    loadMoreRef,
  });
  const cancel = useMutation(api.requests.cancel);
  const deleteDeclined = useMutation(api.requests.deleteDeclined);
  const sendNudge = useMutation(api.requests.nudge);
  const [receiptFor, setReceiptFor] = useState<Doc<"requests"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const resubmit = (request: Doc<"requests">) => {
    onResubmit({
      description: request.description,
      amount: String(request.amount),
      department: request.department,
    });
  };

  const runOn = async (
    action: (args: { requestId: Id<"requests"> }) => Promise<unknown>,
    requestId: Id<"requests">
  ) => {
    setError(null);
    try {
      await action({ requestId });
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
          action={onMakeRequest ? { label: "Make a request", onPress: onMakeRequest } : undefined}
        />
      ) : (
        <Grid minColumnWidth={380}>
          {[...requests]
          .sort((a, b) => {
            const needsAction = (r: typeof a) =>
              (requestFullyApproved(r) && !r.receipt) || requestDeclined(r) ? 0 : 1;
            const diff = needsAction(a) - needsAction(b);
            if (diff !== 0) return diff;
            return b._creationTime - a._creationTime;
          })
          .map((request, index) => {
            const needsReceipt = requestFullyApproved(request) && !request.receipt;
            const canNudgeRequest =
              !requestCompleted(request) &&
              !requestDeclined(request) &&
              !needsReceipt;
            return (
              <FadeInView key={request._id} delay={stagger(index)}>
                <RequestCard
                  request={request}
                  actionRequired={needsReceipt}
                  collapsible={requestCompleted(request)}
                  autoExpand={request._id === focusId}
                  autoOpenThread={request._id === focusId && focusThread}
                  deepLinkOpenKey={request._id === focusId ? focusReopenKey : undefined}
                  onAutoOpenThread={request._id === focusId ? onFocusThreadOpened : undefined}
                  onCancel={
                    requestDeclined(request)
                      ? () =>
                          setConfirm({
                            title: "Delete request?",
                            message: `Your declined $${formatAmount(request.amount)} request ("${request.description}") will be permanently deleted.`,
                            confirmLabel: "Delete",
                            onConfirm: () => void runOn(deleteDeclined, request._id),
                          })
                      : !requestCompleted(request)
                      ? () =>
                          setConfirm({
                            title: "Cancel request?",
                            message: `Your $${formatAmount(request.amount)} request ("${request.description}") and its approvals will be permanently deleted.`,
                            confirmLabel: "Cancel Request",
                            onConfirm: () => void runOn(cancel, request._id),
                          })
                      : undefined
                  }
                >
                  {needsReceipt && (
                    <IconButton
                      name="cloud-upload-outline"
                      size={40}
                      label="Add receipt"
                      bg={t.successSoft}
                      color={t.success}
                      accessibilityLabel="Submit receipt"
                      onPress={() => setReceiptFor(request)}
                    />
                  )}
                  {requestDeclined(request) && (
                    <IconButton
                      name="refresh"
                      bg={t.primarySoft}
                      color={t.primary}
                      accessibilityLabel="Resubmit request"
                      onPress={() => resubmit(request)}
                    />
                  )}
                  {canNudgeRequest && (
                    <NudgeButton
                      request={request}
                      onNudge={(r) =>
                        setConfirm({
                          title: "Send a nudge?",
                          message: `Reminds whoever needs to action your $${formatAmount(r.amount)} request ("${r.description}"). Once per day.`,
                          confirmLabel: "Send Nudge",
                          destructive: false,
                          onConfirm: () => void runOn(sendNudge, r._id),
                        })
                      }
                    />
                  )}
                </RequestCard>
              </FadeInView>
            );
          })}
        </Grid>
      )}
      <EarlierYears
        groups={earlier.groups}
        hasMore={earlier.hasMore}
        loadingMore={earlier.loadingMore}
        onLoadMore={earlier.loadMore}
        note={(y) => <ReceiptFilesNote year={y} />}
        renderRows={(rows) => (
          <Grid minColumnWidth={380}>
            {rows.map((request) => (
              <RequestCard key={request._id} request={request} collapsible />
            ))}
          </Grid>
        )}
      />
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
        destructive={confirm?.destructive ?? true}
        onConfirm={() => confirm?.onConfirm()}
        onClose={() => setConfirm(null)}
      />
    </>
  );
};

const nudgeButtonStyle = {
  width: 40,
  height: 40,
  borderRadius: 20,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const styles = StyleSheet.create({
  previewRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  receiptThumb: { width: 48, height: 48, borderRadius: radius.sm },
  previewStep: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.md,
    maxWidth: 150,
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
  nudgeCooldown: {
    width: "auto",
    minWidth: 40,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
  },
  saveToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
