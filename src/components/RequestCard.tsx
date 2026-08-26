import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import React, { ReactNode, useEffect, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  APPROVED,
  currentStep,
  DECLINED,
  eventStaffYear,
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
import {
  Card,
  formatAmount,
  IconButton,
  LoadingBar,
  LoadingState,
  Muted,
  Sheet,
  SowSpinner,
  Txt,
} from "./ui";
import { CommentsSheet } from "./CommentsSheet";
import { ReceiptRecipientList } from "./ReceiptRecipientList";

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

const History = ({ request }: { request: Doc<"requests"> }) => {
  const t = useAppTheme();
  const trail = useQuery(api.requests.auditTrail, { requestId: request._id });
  if (!trail) {
    return (
      <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
        <SowSpinner size={28} />
      </View>
    );
  }
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
              {event.detail ? ` · ${event.detail}` : ""}
            </Text>
          </View>
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

const StepInfoModal = ({
  requestId,
  step,
  isActiveStep,
  onClose,
}: {
  requestId: Id<"requests">;
  step: ApprovalStep | null;
  isActiveStep: boolean;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  const info = useQuery(
    api.requests.stepInfo,
    step ? { requestId, step } : "skip"
  );
  const title = step
    ? `${STEP_LABELS[step]}${info?.isDelegated ? "*" : ""}`
    : "";
  const officeholderLabel =
    info?.officeholderName ?? info?.officeholderEmail ?? "the usual approver";
  return (
    <Sheet
      visible={step !== null}
      onClose={onClose}
      scrollable={false}
      title={title}
    >
      {!info ? (
        <LoadingState />
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
          {info.isDelegated ? (
            <Muted>
              {info.name ?? "This person"} is covering for {officeholderLabel}
              {isActiveStep
                ? " and can approve in their place."
                : " and approved (or declined) in their place."}
              {info.otherDelegateNames.length > 0
                ? ` Also covering: ${info.otherDelegateNames.join(", ")}.`
                : ""}
            </Muted>
          ) : null}
          {info.events.length === 0 ? (
            isActiveStep ? <Muted>Awaiting action</Muted> : null
          ) : (
            info.events.map((event, i) => (
              <View key={i} style={{ gap: 2 }}>
                <Text style={[typography.caption, { color: t.text, fontWeight: "600" }]}>
                  {EVENT_LABELS[event.action] ?? event.action}
                </Text>
                <Muted>
                  {new Date(event.at).toLocaleString()}
                  {event.detail ? ` · ${event.detail}` : ""}
                </Muted>
              </View>
            ))
          )}
        </>
      )}
    </Sheet>
  );
};

const StepLine = ({ request }: { request: Doc<"requests"> }) => {
  const t = useAppTheme();
  const [selectedStep, setSelectedStep] = useState<ApprovalStep | null>(null);
  const active = currentStep(request);
  const steps = stepsForRequest(request);
  const actors = useQuery(api.requests.stepActors, { requestId: request._id });

  const [fill] = useState(() => new Animated.Value(0));
  const needsAnimation = active !== null;
  useEffect(() => {
    if (!needsAnimation) return;
    const native = Platform.OS !== "web";
    const loop = Animated.loop(
      Animated.timing(fill, { toValue: 1, duration: 3000, useNativeDriver: native, easing: Easing.linear })
    );
    loop.start();
    return () => loop.stop();
  }, [fill, needsAnimation]);
  const connectorFillX = fill.interpolate({ inputRange: [0, 2 / 3, 1], outputRange: [-10, 10, 10] });
  const circleFillX = fill.interpolate({ inputRange: [0, 1 / 3, 1], outputRange: [-22, -22, 22] });
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

          const connectorColor = isApproved
            ? t.success
            : isDeclined
              ? t.separator
              : isActive
                ? t.warning
                : t.separator;
          const circleStyle = isApproved
            ? { backgroundColor: t.success }
            : isDeclined
              ? { backgroundColor: t.danger }
              : isActive
                ? { backgroundColor: t.warning }
                : { backgroundColor: t.card, borderWidth: 1.5, borderColor: t.separator };
          const labelColor = isApproved ? t.success : isDeclined ? t.danger : isActive ? t.warning : t.faint;

          const actor = actors?.[step];
          const displayName = actor?.name ?? (actor?.email ? actor.email : null);

          return (
            <React.Fragment key={step}>
              {index > 0 && (
                isActive && isPending ? (
                  <View style={[styles.stepConnector, { backgroundColor: t.warningSoft, overflow: "hidden" }]}>
                    <Animated.View
                      style={{
                        position: "absolute",
                        width: 10,
                        height: 2,
                        backgroundColor: t.warning,
                        transform: [{ translateX: connectorFillX }],
                      }}
                    />
                  </View>
                ) : (
                  <View style={[styles.stepConnector, { backgroundColor: connectorColor }]} />
                )
              )}
              <Pressable
                onPress={() => setSelectedStep(step)}
                hitSlop={8}
                style={styles.stepItem}
              >
                {isActive && isPending ? (
                  <View style={[styles.stepCircle, { backgroundColor: t.warningSoft, overflow: "hidden" }]}>
                    <Animated.View
                      style={{
                        position: "absolute",
                        width: 22,
                        height: 22,
                        backgroundColor: t.warning,
                        transform: [{ translateX: circleFillX }],
                      }}
                    />
                    <View style={[styles.stepActiveDot, { backgroundColor: dotColor }]} />
                  </View>
                ) : (
                  <View style={[styles.stepCircle, circleStyle]}>
                    {isApproved ? (
                      <Ionicons name="checkmark" size={12} color={dotColor} />
                    ) : isDeclined ? (
                      <Ionicons name="close" size={12} color={dotColor} />
                    ) : null}
                  </View>
                )}
                <Text
                  style={[
                    styles.stepLabel,
                    { color: labelColor },
                    isActive && { fontWeight: "700" },
                  ]}
                >
                  {STEP_LABELS[step]}
                  {actor?.isDelegated ? "*" : ""}
                </Text>
                {actors === undefined ? (
                  isApproved || isDeclined ? (
                    <>
                      <LoadingBar width={40} height={14} />
                      <LoadingBar width={26} height={13} />
                    </>
                  ) : null
                ) : (
                  <>
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
                  </>
                )}
              </Pressable>
            </React.Fragment>
          );
        })}
      </View>
      <StepInfoModal
        requestId={request._id}
        step={selectedStep}
        isActiveStep={selectedStep === active}
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
  return t.chip.default;
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
  collapsible = false,
  autoExpand = false,
  autoOpenThread = false,
  deepLinkOpenKey,
  children,
}: {
  request: Doc<"requests">;
  showRequester?: boolean;
  onCancel?: () => void;
  actionRequired?: boolean;
  autoExpand?: boolean;
  autoOpenThread?: boolean;
  deepLinkOpenKey?: string;
  collapsible?: boolean;
  children?: ReactNode;
}) => {
  const t = useAppTheme();
  useMinuteTick();
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(autoOpenThread);
  const [expanded, setExpanded] = useState(autoExpand && collapsible);
  const requesterName = useQuery(
    api.directory.nameForEmail,
    showRequester
      ? { email: request.requesterEmail, year: eventStaffYear(request._creationTime) }
      : "skip"
  );
  const unreadComments = useQuery(api.comments.unreadCount, {
    requestId: request._id,
  });
  const status = requestDisplayStatus(request);
  const chip = statusChip(status, t);

  const [bodyMounted, setBodyMounted] = useState(autoExpand && collapsible);
  const [bodyHeight, setBodyHeight] = useState(0);
  const [heightAnim] = useState(() => new Animated.Value(0));
  const expand = () => {
    setBodyMounted(true);
    setExpanded(true);
  };

  useEffect(() => {
    if (autoExpand && collapsible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external deep-link focus sync
      setBodyMounted(true);
      setExpanded(true);
    }
    if (autoOpenThread) setShowComments(true);
  }, [autoExpand, autoOpenThread, collapsible, deepLinkOpenKey]);

  const collapse = () => {
    setExpanded(false);
    Animated.timing(heightAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setBodyMounted(false);
    });
  };
  const toggleExpanded = () => (expanded ? collapse() : expand());
  useEffect(() => {
    if (expanded && bodyHeight > 0) {
      Animated.timing(heightAnim, {
        toValue: bodyHeight,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [expanded, bodyHeight, heightAnim]);

  const header = (
    <>
      <View style={styles.topRow}>
        <View style={styles.topSide}>
          <Text style={[typography.amount, { color: t.text }]}>${formatAmount(request.amount)}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: chip.bg }]}>
          <Text numberOfLines={1} style={[styles.statusPillText, { color: chip.fg }]}>
            {status}
          </Text>
        </View>
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
    </>
  );

  const body = (
    <>
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
      {request.receipt ? <ReceiptRecipientList request={request} /> : null}
      {request.paid && request.paidAmount !== undefined ? (
        <View style={[styles.paidBox, { backgroundColor: t.successSoft }]}>
          <Ionicons name="checkmark-circle" size={15} color={t.success} />
          <Text style={[typography.caption, { color: t.success, flex: 1, fontWeight: "600" }]}>
            Paid ${formatAmount(request.paidAmount)}
            {request.payComment ? ` · ${request.payComment}` : ""}
          </Text>
        </View>
      ) : null}
      {showHistory ? <History request={request} /> : null}
      <View style={[styles.actionsDivider, { backgroundColor: t.separator }]} />
      <View style={styles.actionsRow}>
        <View style={styles.actionsLeft}>
          {children}
          {collapsible && (
            <IconButton
              name="chevron-up"
              size={40}
              accessibilityLabel="Show less"
              onPress={collapse}
            />
          )}
        </View>
        <View style={styles.actionsRight}>
          <IconButton
            name="receipt-outline"
            size={40}
            accessibilityLabel={showHistory ? "Hide audit trail" : "Show audit trail"}
            color={showHistory ? t.primary : t.ghostText}
            bg={showHistory ? t.primarySoft : undefined}
            onPress={() => setShowHistory((previous) => !previous)}
          />
          <IconButton
            name="chatbubble-ellipses-outline"
            size={40}
            accessibilityLabel="Comments"
            badge={unreadComments ?? 0}
            badgeColor="#ffffff"
            badgeTextColor="#333333"
            onPress={() => setShowComments(true)}
          />
          {onCancel ? (
            <IconButton
              name="trash-outline"
              size={40}
              color={t.danger}
              accessibilityLabel="Delete or cancel request"
              onPress={onCancel}
            />
          ) : null}
        </View>
      </View>
      <CommentsSheet
        request={request}
        visible={showComments}
        onClose={() => setShowComments(false)}
      />
    </>
  );

  return (
    <Card style={cardBorderStyle(status, actionRequired, t)}>
      {collapsible ? (
        <Pressable
          onPress={toggleExpanded}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Show less" : "View more details"}
          style={({ pressed }) => [styles.headerWrap, pressed && { opacity: 0.6 }]}
        >
          {header}
        </Pressable>
      ) : (
        header
      )}
      {collapsible ? (
        bodyMounted ? (
          <Animated.View
            style={{
              height: heightAnim,
              overflow: "hidden",
              marginTop: -(spacing.sm + 2),
            }}
          >
            <View
              style={styles.bodyMeasure}
              onLayout={(e) => setBodyHeight(e.nativeEvent.layout.height)}
            >
              {body}
            </View>
          </Animated.View>
        ) : null
      ) : (
        body
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  headerWrap: { gap: spacing.sm + 2 },
  bodyMeasure: { gap: spacing.sm + 2, paddingTop: spacing.sm + 2 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topSide: { flex: 1 },
  statusPill: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: "60%",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
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
  stepName: { fontSize: 10.5, lineHeight: 14, letterSpacing: -0.05, textAlign: "center" },
  stepTime: { fontSize: 10, lineHeight: 13, textAlign: "center" },
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
