import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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

  // Apply a resubmit prefill when one arrives (its identity changes). The plain
  // "Make Request" path passes prefill=null and deliberately leaves any
  // in-progress draft untouched — so cancelling the sheet and reopening it keeps
  // whatever was typed (description / amount / department) exactly as it was
  // left. The draft is only cleared after a successful submit.
  useEffect(() => {
    if (!prefill) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load resubmit prefill
    setDescription(prefill.description);
    setAmount(prefill.amount);
    setDepartment(prefill.department);
  }, [prefill]);

  // Adopt the default department once it resolves, without clobbering a value the
  // user (or a prefill) already chose.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- late default adoption
    if (department === "" && defaultDepartment !== "") setDepartment(defaultDepartment);
  }, [defaultDepartment, department]);

  const handleSubmit = async () => {
    setError(null);
    // Validate client-side first (mirroring convex/requests.ts:submit) so an
    // empty/zero field shows its message inline without a server round-trip —
    // which would throw a ConvexError and surface a red dev-overlay on every
    // invalid attempt. Report in on-screen field order (Description, Amount,
    // Department) so a blank form flags the first field the user sees rather
    // than masking the description error behind the default-zero amount error.
    if (description.trim() === "") {
      setError("Please describe what the request is for.");
      return;
    }
    if (!(Number(amount) > 0)) {
      setError("Amount must be a positive number.");
      return;
    }
    if (department.trim() === "") {
      setError("Pick a department for this request.");
      return;
    }
    try {
      await submit({ description, amount: Number(amount), department });
      setDescription("");
      setAmount("");
      setDepartment(defaultDepartment);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Sheet
      visible={visible}
      // Cancelling (footer Cancel, header X, backdrop, swipe) just closes — the
      // draft is kept in state for next time, no discard confirmation.
      onClose={onClose}
      title="New Request"
      footer={
        <Row spread>
          <Btn title="Cancel" variant="ghost" onPress={onClose} />
          <Btn title="Submit Request" onPress={handleSubmit} />
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
      </Sheet>
  );
};

type DraftFile = { storageId: Id<"_storage">; name: string };
type DraftRecipient = {
  /** Stable per-session id used as the list key, so a recipient's inputs stay
   *  put when rows are added or removed. */
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
      id: newRecipientId(),
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
    <Sheet
      visible={request !== null}
      onClose={onClose}
      title="Submit Receipt"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Btn title="Submit Receipt" onPress={handleSubmit} disabled={uploading} />
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
      <ConfirmDialog
        visible={confirmExceeds !== null}
        title="Receipt exceeds request"
        message={
          confirmExceeds && request
            ? `Your $${confirmExceeds.total} receipt exceeds the requested $${request.amount}. You'll be paid up to the requested amount.`
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

/**
 * Finger-tap nudge button for a single request. Owns its own `canNudge` query
 * so hook rules are satisfied inside a list render.
 */
type NudgeStatus = { onCooldown: boolean; remainingMs: number };

const NudgeButton = ({
  request,
  onNudge,
}: {
  request: Doc<"requests">;
  onNudge: (request: Doc<"requests">, status: NudgeStatus | null) => void;
}) => {
  const t = useAppTheme();
  // `canNudge` returns null when the caller is never eligible, else a
  // server-derived { onCooldown, remainingMs }. The icon stays enabled whenever
  // eligible — the cooldown is shown (and the action blocked) in the
  // confirmation modal instead.
  const status = useQuery(api.requests.canNudge, { requestId: request._id });
  const eligible = status != null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Nudge approver"
      disabled={!eligible}
      onPress={() => onNudge(request, status ?? null)}
      style={({ pressed }) => [
        nudgeButtonStyle,
        eligible ? { backgroundColor: t.primarySoft } : undefined,
        pressed && eligible ? { opacity: 0.7 } : undefined,
      ]}
    >
      <MaterialCommunityIcons
        name="hand-pointing-up"
        size={22}
        color={eligible ? t.primary : t.faint}
      />
    </Pressable>
  );
};

/** "5h 23m" / "12m" / "under a minute" for a remaining cooldown in ms. */
const formatCooldown = (ms: number): string => {
  const mins = Math.ceil(ms / 60000);
  if (mins < 1) return "under a minute";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
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
  focusId,
  focusThread = false,
  focusReopenKey,
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
  /** Notification deep-link: id of the request to focus (expand / open thread). */
  focusId?: string;
  focusThread?: boolean;
  focusReopenKey?: string;
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
  const sendNudge = useMutation(api.requests.nudge);
  const [receiptFor, setReceiptFor] = useState<Doc<"requests"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Drives the in-app confirmation for cancelling, deleting, or nudging a request.
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    destructive?: boolean;
    confirmDisabled?: boolean;
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

  const handleNudge = async (requestId: Id<"requests">) => {
    setError(null);
    try {
      await sendNudge({ requestId });
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
            // Nudge is available when the request is in-flight (waiting on
            // an approver or on payment) and the requester can't act right now.
            const canNudgeRequest =
              !readOnly &&
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
                  onCancel={
                    readOnly
                      ? undefined
                      : requestDeclined(request)
                      ? () =>
                          setConfirm({
                            title: "Delete request?",
                            message: `Your declined $${request.amount} request ("${request.description}") will be permanently deleted.`,
                            confirmLabel: "Delete",
                            onConfirm: () => void handleDeleteDeclined(request._id),
                          })
                      : !requestCompleted(request)
                      ? () =>
                          setConfirm({
                            title: "Cancel request?",
                            message: `Your $${request.amount} request ("${request.description}") and its approvals will be permanently deleted.`,
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
                  {canNudgeRequest && (
                    <NudgeButton
                      request={request}
                      onNudge={(r, status) => {
                        const onCooldown = status?.onCooldown ?? false;
                        setConfirm({
                          title: "Send a nudge?",
                          message: onCooldown
                            ? `You can nudge again in ${formatCooldown(status?.remainingMs ?? 0)}.`
                            : `Reminds whoever needs to action your $${r.amount} request ("${r.description}"). Once per day.`,
                          confirmLabel: "Send Nudge",
                          destructive: false,
                          confirmDisabled: onCooldown,
                          onConfirm: () => void handleNudge(r._id),
                        });
                      }}
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
        destructive={confirm?.destructive ?? true}
        confirmDisabled={confirm?.confirmDisabled ?? false}
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
