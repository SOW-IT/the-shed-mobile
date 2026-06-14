import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  APPROVED,
  currentStep,
  DECLINED,
  requestDisplayStatus,
  STEP_LABELS,
  stepsForRequest,
  type ApprovalStatus,
  type ApprovalStep,
  type RequestDisplayStatus,
} from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { radius, spacing, typography, useAppTheme } from "../theme";
import { Card, IconButton, Muted, Row, Sheet, Txt } from "./ui";
import { CommentsSheet } from "./CommentsSheet";

/** Re-renders the caller once a minute so "… ago" labels stay current. */
const useMinuteTick = () => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
};

const timeAgo = (ms: number): string => {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

const EVENT_LABELS: Record<string, string> = {
  submitted: "Submitted",
  "auto-approved": "Auto-approved",
  approved: "Approved",
  declined: "Declined",
  "receipt-submitted": "Receipt submitted",
  paid: "Paid",
};

/** Lazy-loaded audit trail: who actioned each step, and when. */
const History = ({ request }: { request: Doc<"requests"> }) => {
  const t = useAppTheme();
  const trail = useQuery(api.requests.auditTrail, { requestId: request._id });
  if (!trail) return <Muted>Loading history…</Muted>;
  return (
    <View style={[styles.history, { backgroundColor: t.inputBackground }]}>
      {trail.map((event, index) => (
        <View key={index} style={styles.historyRow}>
          <View style={[styles.historyDot, { backgroundColor: t.faint }]} />
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: t.text, fontWeight: "600" }]}>
              {EVENT_LABELS[event.action] ?? event.action}
              {event.step
                ? ` · ${STEP_LABELS[event.step as ApprovalStep] ?? event.step}`
                : ""}
            </Text>
            <Text style={[typography.caption, { color: t.muted }]}>
              {new Date(event.at).toLocaleString()} · {event.actor}
              {event.detail ? ` — ${event.detail}` : ""}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
};

/**
 * The submitted receipt in full: each recipient's bank details and their
 * receipt files as links (signed URLs — tap to view or download).
 */
const ReceiptDetails = ({ request }: { request: Doc<"requests"> }) => {
  const t = useAppTheme();
  const files = useQuery(api.requests.receiptAttachments, {
    requestId: request._id,
  });
  const receipt = request.receipt;
  if (!receipt) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      {receipt.recipients.map((recipient, i) => (
        <View key={i} style={[styles.recipient, { backgroundColor: t.inputBackground }]}>
          <Row>
            <Txt style={{ fontWeight: "700", flexGrow: 1 }}>
              {recipient.accountName}
            </Txt>
            <Txt style={{ fontWeight: "700" }}>${recipient.amount}</Txt>
          </Row>
          <Muted>
            BSB {recipient.bsb} · Account {recipient.accountNumber}
          </Muted>
          {(files?.[i]?.attachments ?? []).map((file, j) =>
            file.url ? (
              <Pressable
                key={j}
                style={({ pressed }) => [styles.fileLink, pressed && { opacity: 0.6 }]}
                onPress={() => void Linking.openURL(file.url!)}
              >
                <Ionicons name="document-attach-outline" size={15} color={t.primary} />
                <Text
                  numberOfLines={1}
                  style={[typography.caption, { color: t.primary, fontWeight: "600", flex: 1 }]}
                >
                  {file.name}
                </Text>
              </Pressable>
            ) : null
          )}
        </View>
      ))}
    </View>
  );
};

const stepStatus = (
  request: Doc<"requests">,
  step: ApprovalStep
): ApprovalStatus | undefined =>
  ({
    hod: request.approvedByHOD,
    budgetManager: request.approvedByBudgetManager,
    director: request.approvedByDirector,
    financeHead: request.approvedByFinanceHead,
  })[step];

/** Modal shown when a step circle is tapped: approver info + audit events. */
const StepInfoModal = ({
  requestId,
  step,
  onClose,
}: {
  requestId: Id<"requests">;
  step: ApprovalStep | null;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  const info = useQuery(
    api.requests.stepInfo,
    step ? { requestId, step } : "skip"
  );
  return (
    <Sheet
      visible={step !== null}
      onClose={onClose}
      scrollable={false}
      title={step ? STEP_LABELS[step] : ""}
    >
      {!info ? (
        <Muted>Loading…</Muted>
      ) : (
        <>
          <View style={{ gap: 2 }}>
            {info.name ? (
              <Txt style={{ fontWeight: "700" }}>{info.name}</Txt>
            ) : null}
            {info.email ? (
              <Muted>{info.email}</Muted>
            ) : (
              <Muted>No one assigned to this step yet.</Muted>
            )}
          </View>
          {info.events.length === 0 ? (
            <Muted>Awaiting action</Muted>
          ) : (
            info.events.map((event, i) => (
              <View key={i} style={{ gap: 2 }}>
                <Text style={[typography.caption, { color: t.text, fontWeight: "600" }]}>
                  {EVENT_LABELS[event.action] ?? event.action}
                </Text>
                <Muted>
                  {new Date(event.at).toLocaleString()}
                  {event.detail ? ` — ${event.detail}` : ""}
                </Muted>
              </View>
            ))
          )}
        </>
      )}
    </Sheet>
  );
};

/**
 * The approval chain as a connected stepper. Tap any circle to see who owns
 * that step and what they've done. Shows the approver's name and when they
 * acted inline under each step.
 */
const StepLine = ({ request }: { request: Doc<"requests"> }) => {
  const t = useAppTheme();
  useMinuteTick();
  const [selectedStep, setSelectedStep] = useState<ApprovalStep | null>(null);
  const active = currentStep(request);
  const steps = stepsForRequest(request);
  const actors = useQuery(api.requests.stepActors, { requestId: request._id });

  // One looping pulse drives the active step's circle and its incoming line.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const native = Platform.OS !== "web";
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: native }),
        Animated.timing(pulse, { toValue: 0, duration: 750, useNativeDriver: native }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const dotColor = t.dark ? t.background : "#ffffff";

  return (
    <>
      <View style={styles.stepsRow}>
        {steps.map((step, index) => {
          const status = stepStatus(request, step);
          const isActive = step === active;
          const isApproved = status === APPROVED;
          const isDeclined = status === DECLINED;
          const isPending = !isApproved && !isDeclined;

          // Colour the connector by the step it leads INTO: green into an
          // approved step, amber into a pending one (animated when active).
          const connectorColor = isApproved
            ? t.success
            : isDeclined
              ? t.separator
              : t.warning;
          const circleStyle = isApproved
            ? { backgroundColor: t.success }
            : isDeclined
              ? { backgroundColor: t.danger }
              : isActive
                ? { backgroundColor: t.warning }
                : { backgroundColor: t.card, borderWidth: 1.5, borderColor: t.warning };
          const labelColor = isApproved ? t.success : isDeclined ? t.danger : t.warning;

          const actor = actors?.[step];
          const displayName = actor?.name ?? (actor?.email ? actor.email : null);

          return (
            <React.Fragment key={step}>
              {index > 0 && (
                <Animated.View
                  style={[
                    styles.stepConnector,
                    { backgroundColor: connectorColor },
                    isActive && { opacity: pulseOpacity },
                  ]}
                />
              )}
              <Pressable
                onPress={() => setSelectedStep(step)}
                hitSlop={8}
                style={styles.stepItem}
              >
                <Animated.View
                  style={[
                    styles.stepCircle,
                    circleStyle,
                    isActive && { transform: [{ scale: pulseScale }] },
                  ]}
                >
                  {isApproved ? (
                    <Ionicons name="checkmark" size={12} color={dotColor} />
                  ) : isDeclined ? (
                    <Ionicons name="close" size={12} color={dotColor} />
                  ) : isActive ? (
                    <View style={[styles.stepActiveDot, { backgroundColor: dotColor }]} />
                  ) : null}
                </Animated.View>
                <Text
                  style={[
                    styles.stepLabel,
                    { color: labelColor },
                    isActive && { fontWeight: "700" },
                  ]}
                >
                  {STEP_LABELS[step]}
                </Text>
                {displayName ? (
                  <Text numberOfLines={1} style={[styles.stepName, { color: t.muted }]}>
                    {displayName}
                  </Text>
                ) : null}
                {actor?.actedAt ? (
                  <Text style={[styles.stepTime, { color: t.faint }]}>
                    {timeAgo(actor.actedAt)}
                  </Text>
                ) : null}
              </Pressable>
            </React.Fragment>
          );
        })}
      </View>
      <StepInfoModal
        requestId={request._id}
        step={selectedStep}
        onClose={() => setSelectedStep(null)}
      />
    </>
  );
};

const statusChip = (
  status: RequestDisplayStatus,
  t: ReturnType<typeof useAppTheme>
): { bg: string; fg: string } => {
  if (status === "PAID") return t.chip.PAID;
  if (status === "DECLINED") return t.chip.DECLINED;
  return t.chip.default; // AWAITING …
};

const cardBorderStyle = (
  status: RequestDisplayStatus,
  actionRequired: boolean | undefined,
  t: ReturnType<typeof useAppTheme>
): { borderWidth?: number; borderColor?: string } => {
  if (status === "PAID") return { borderWidth: 1.5, borderColor: t.success };
  if (status === "DECLINED") return { borderWidth: 1.5, borderColor: t.danger };
  if (actionRequired) return { borderWidth: 1.5, borderColor: t.chip.default.fg };
  return {};
};

export const RequestCard = ({
  request,
  showRequester,
  onCancel,
  actionRequired,
  children,
}: {
  request: Doc<"requests">;
  showRequester?: boolean;
  onCancel?: () => void;
  /** When true, draws an amber border to signal the current user needs to act. */
  actionRequired?: boolean;
  children?: ReactNode;
}) => {
  const t = useAppTheme();
  useMinuteTick();
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const requesterName = useQuery(
    api.directory.nameForEmail,
    showRequester ? { email: request.requesterEmail } : "skip"
  );
  const unreadComments = useQuery(api.comments.unreadCount, {
    requestId: request._id,
  });
  const status = requestDisplayStatus(request);
  const chip = statusChip(status, t);

  return (
    <Card style={cardBorderStyle(status, actionRequired, t)}>
      <View style={styles.topRow}>
        <Text style={[typography.amount, { color: t.text }]}>${request.amount}</Text>
        <View style={styles.statusWrap}>
          <View style={[styles.statusPill, { backgroundColor: chip.bg }]}>
            <Text numberOfLines={1} style={[styles.statusPillText, { color: chip.fg }]}>
              {status}
            </Text>
          </View>
        </View>
        {onCancel && (
          <Pressable onPress={onCancel} hitSlop={10} style={styles.cancelIcon}>
            <Ionicons name="trash-outline" size={17} color={t.danger} />
          </Pressable>
        )}
      </View>
      <Text style={[typography.caption, { color: t.faint, marginTop: -6 }]}>
        {request.department}
        {showRequester ? ` · ${requesterName ?? request.requesterEmail}` : ""}{" · "}
        {new Date(request._creationTime).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        })}{" · "}
        {timeAgo(request._creationTime)}
      </Text>
      <Txt>{request.description}</Txt>
      <StepLine request={request} />
      {request.declineReason ? (
        <View style={[styles.declineBox, { backgroundColor: t.dangerSoft }]}>
          <Ionicons name="close-circle" size={15} color={t.danger} />
          <Text style={[typography.caption, { color: t.danger, flex: 1 }]}>
            {request.declineReason}
          </Text>
        </View>
      ) : null}
      {request.receipt ? <ReceiptDetails request={request} /> : null}
      {request.paid && request.paidAmount !== undefined ? (
        <View style={[styles.paidBox, { backgroundColor: t.successSoft }]}>
          <Ionicons name="checkmark-circle" size={15} color={t.success} />
          <Text style={[typography.caption, { color: t.success, flex: 1, fontWeight: "600" }]}>
            Paid ${request.paidAmount}
            {request.payComment ? ` — ${request.payComment}` : ""}
          </Text>
        </View>
      ) : null}
      {showHistory ? <History request={request} /> : null}
      <View style={[styles.actionsDivider, { backgroundColor: t.separator }]} />
      <View style={styles.actionsRow}>
        <View style={styles.actionsLeft}>{children}</View>
        <View style={styles.actionsRight}>
          <IconButton
            name="receipt-outline"
            accessibilityLabel={showHistory ? "Hide audit trail" : "Show audit trail"}
            color={showHistory ? t.primary : t.ghostText}
            bg={showHistory ? t.primarySoft : undefined}
            onPress={() => setShowHistory((previous) => !previous)}
          />
          <IconButton
            name="chatbubble-ellipses-outline"
            accessibilityLabel="Comments"
            badge={unreadComments ?? 0}
            onPress={() => setShowComments(true)}
          />
        </View>
      </View>
      <CommentsSheet
        request={request}
        visible={showComments}
        onClose={() => setShowComments(false)}
      />
    </Card>
  );
};

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusWrap: { flex: 1, alignItems: "center" },
  statusPill: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: "100%",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  cancelIcon: { padding: 2 },
  stepsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: spacing.xs,
  },
  stepConnector: {
    width: 10,
    height: 2,
    borderRadius: 1,
    marginTop: 10,
    flexShrink: 0,
  },
  stepItem: { flex: 1, alignItems: "center", gap: 3 },
  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  stepActiveDot: { width: 8, height: 8, borderRadius: 4 },
  stepLabel: { fontSize: 10.5, letterSpacing: -0.1, textAlign: "center" },
  stepName: { fontSize: 10.5, letterSpacing: -0.05, textAlign: "center" },
  stepTime: { fontSize: 10, textAlign: "center" },
  declineBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  paidBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  history: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  historyRow: { flexDirection: "row", gap: spacing.sm },
  historyDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  recipient: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  fileLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  actionsDivider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  actionsLeft: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    alignItems: "center",
  },
  actionsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
