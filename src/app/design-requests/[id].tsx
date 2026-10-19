import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ReactNode, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  designRequestName,
  designStepTrack,
  formatDesignAnswer,
  isFieldShown,
  type DesignField,
} from "@shared/designRequests";
import { CommentsButton } from "@/components/CommentThreadSheet";
import { DesignCommentsSheet } from "@/components/design/DesignCommentsSheet";
import { LabelledField } from "@/components/events/LabelledField";
import { SignInPrompt } from "@/components/SignInPrompt";
import { downloadFile } from "@/lib/csvDownload";
import { sydneyDateTime, sydneyDay } from "@/lib/sydneyTime";
import { DesignStatusPill } from "@/components/design/DesignStatusPill";
import {
  Btn,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  FadeInView,
  Field,
  LoadingState,
  Muted,
  ReadableColumn,
  Row,
  runBusy,
  Screen,
  SectionTitle,
  Sheet,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

/** Sydney time, so the page and its PDF read the same wherever you are. */
const when = sydneyDateTime;

const EVENT_LABELS: Record<string, string> = {
  submitted: "Submitted",
  "auto-approved": "Approved automatically (Marketing Head's own request)",
  approved: "Approved",
  declined: "Declined",
  edited: "Edited",
  completed: "Marked complete",
  cancelled: "Cancelled",
  imported: "Imported from the old SHED",
};

const Answer = ({ label, children }: { label: string; children: ReactNode }) => {
  const t = useAppTheme();
  return (
    <View style={styles.answer}>
      <Text style={[typography.label, { color: t.muted }]}>{label}</Text>
      <Text selectable style={[typography.body, { color: t.text }]}>
        {children}
      </Text>
    </View>
  );
};

/** Each question the form asks, with this request's answer ("—" if none). */
const Answers = ({
  request,
  fields,
}: {
  request: Doc<"designRequests">;
  fields: readonly DesignField[] | null | undefined;
}) => {
  if (!fields) return <LoadingState />;
  return (
    <Card>
      {fields
        .filter((field) => isFieldShown(field, request.answers))
        .map((field) => (
          <Answer key={field.key} label={field.shortLabel}>
            {formatDesignAnswer(field, request.answers) ?? "—"}
          </Answer>
        ))}
    </Card>
  );
};

const Timeline = ({ id }: { id: Id<"designRequests"> }) => {
  const t = useAppTheme();
  const events = useQuery(api.designRequests.timeline, { id });
  if (!events || events.length === 0) return null;
  return (
    <>
      <SectionTitle>History</SectionTitle>
      <Card>
        {events.map((event, index) => (
          <View key={index} style={styles.event}>
            <View style={[styles.eventDot, { backgroundColor: t.faint }]} />
            <View style={{ flex: 1 }}>
              <Text style={[typography.caption, { color: t.text, fontWeight: "700" }]}>
                {EVENT_LABELS[event.action] ?? event.action}
              </Text>
              <Text style={[typography.caption, { color: t.muted }]}>
                {when(event.at)} · {event.actorName}
                {event.detail ? ` · ${event.detail}` : ""}
              </Text>
            </View>
          </View>
        ))}
      </Card>
    </>
  );
};

/** What happened to the request, in a sentence or two under its status. */
const STEP_ICON = { done: "checkmark", declined: "close", current: null, todo: null } as const;

const StatusTrack = ({
  request,
  requesterName,
  decidedByName,
  completedByName,
}: {
  request: Doc<"designRequests">;
  requesterName: string;
  decidedByName: string | null;
  completedByName: string | null;
}) => {
  const t = useAppTheme();
  const steps = designStepTrack(request, {
    requester: requesterName,
    decidedBy: decidedByName,
    completedBy: completedByName,
  });
  const fill = { done: t.success, declined: t.danger, current: t.warningSoft, todo: t.ghost };
  return (
    <View style={{ gap: spacing.xs }}>
      <View
        style={styles.track}
        accessible
        accessibilityLabel={steps
          .map((step) => `${step.label}: ${step.state === "done" || step.state === "declined" ? `${step.name ?? ""} ${step.at ? sydneyDay(step.at) : ""}` : step.state === "current" ? "next" : "not yet"}`)
          .join(", ")}
      >
        {steps.map((step, i) => {
          const icon = STEP_ICON[step.state];
          return (
            <View key={step.key} style={styles.trackStep}>
              <View style={styles.trackDotRow}>
                <View style={[styles.trackLine, { backgroundColor: i === 0 ? "transparent" : fill[step.state === "current" ? "todo" : step.state] }]} />
                <View
                  style={[
                    styles.trackDot,
                    { backgroundColor: fill[step.state] },
                    step.state === "current" && { borderWidth: 2, borderColor: t.warning },
                  ]}
                >
                  {icon ? <Ionicons name={icon} size={12} color={t.background} /> : null}
                </View>
                <View
                  style={[
                    styles.trackLine,
                    {
                      backgroundColor:
                        i === steps.length - 1
                          ? "transparent"
                          : fill[steps[i + 1].state === "done" ? "done" : "todo"],
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  typography.caption,
                  { color: step.state === "todo" ? t.faint : t.text, fontWeight: "700", textAlign: "center" },
                ]}
              >
                {step.label}
              </Text>
              {step.name ? (
                <Text numberOfLines={2} style={[typography.caption, { color: t.muted, textAlign: "center" }]}>
                  {step.name}
                </Text>
              ) : null}
              {step.at ? (
                <Text style={[typography.caption, { color: t.faint, textAlign: "center" }]}>
                  {sydneyDay(step.at)}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      {request.editedAt ? <Muted>{`Edited ${when(request.editedAt)}`}</Muted> : null}
      {request.status === "CANCELLED" && request.cancelledAt ? (
        <Muted>{`Cancelled ${when(request.cancelledAt)}`}</Muted>
      ) : null}
    </View>
  );
};

export default function DesignRequestScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { id, thread, reopen } = useLocalSearchParams<{
    id: string;
    thread?: string;
    reopen?: string;
  }>();
  const data = useQuery(api.designRequests.get, id ? { id } : "skip");
  const fields = useQuery(api.designRequestForm.fields, {});
  const requestId = data?.request._id;
  const unread =
    useQuery(
      api.designRequestComments.unreadCounts,
      requestId ? { ids: [requestId] } : "skip"
    ) ?? {};
  const approve = useMutation(api.designRequests.approve);
  const decline = useMutation(api.designRequests.decline);
  const complete = useMutation(api.designRequests.complete);
  const cancel = useMutation(api.designRequests.cancel);
  const markNotificationsRead = useMutation(api.notifications.markReadForDesignRequest);
  const convex = useConvex();

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [openedThreadLink, setOpenedThreadLink] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (requestId) {
      void markNotificationsRead({ designRequestId: requestId }).catch(() => {});
    }
  }, [requestId, markNotificationsRead]);

  // A thread link (a comment notification) opens the comments once.
  const threadLink = thread === "1" && requestId ? `${requestId}|${reopen ?? ""}` : null;
  useEffect(() => {
    if (threadLink && threadLink !== openedThreadLink) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open from a deep link
      setCommentsOpen(true);
      setOpenedThreadLink(threadLink);
    }
  }, [threadLink, openedThreadLink]);

  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace("/design-requests");

  if (!authLoading && !isAuthenticated) {
    return (
      <Screen title="Design request" onBack={goBack}>
        <SignInPrompt what="design request" />
      </Screen>
    );
  }
  if (data === undefined) {
    return (
      <Screen title="Design request" onBack={goBack}>
        <LoadingState />
      </Screen>
    );
  }
  if (data === null) {
    return (
      <Screen title="Design request" onBack={goBack}>
        <EmptyState
          icon="color-palette-outline"
          title="Design request not found"
          message="It may have been removed, or it isn't one you can see."
        />
      </Screen>
    );
  }

  const { request, can } = data;
  const run = (action: () => Promise<unknown>, after?: () => void) =>
    runBusy(busy, setBusy, setError, action, after);
  const unreadCount = unread[request._id] ?? 0;

  // Built on the device from what this page shows, plus its history and comments.
  const downloadPdf = () =>
    run(async () => {
      const [{ buildDesignRequestPdf, designRequestPdfFilename }, history, comments] =
        await Promise.all([
          import("@/lib/designRequestPdf"),
          convex.query(api.designRequests.timeline, { id: request._id }),
          convex.query(api.designRequestComments.list, { id: request._id }),
        ]);
      const bytes = await buildDesignRequestPdf({
        request,
        requesterName: data.requesterName,
        decidedByName: data.decidedByName,
        completedByName: data.completedByName,
        fields: fields ?? [],
        history: (history ?? []).map((event) => ({
          at: event.at,
          label: EVENT_LABELS[event.action] ?? event.action,
          actorName: event.actorName,
          detail: event.detail,
        })),
        comments: (comments ?? []).map((comment) => ({
          at: comment.at,
          authorName: comment.authorName,
          body: comment.body,
        })),
        generatedAt: Date.now(),
      });
      await downloadFile(designRequestPdfFilename(request), bytes, {
        mimeType: "application/pdf",
        uti: "com.adobe.pdf",
        dialogTitle: designRequestName(request),
      });
    });

  return (
    <>
      <Screen
        title={designRequestName(request)}
        subtitle={request.title || undefined}
        onBack={goBack}
      >
        <ReadableColumn>
          <View style={{ gap: spacing.md }}>
            <FadeInView>
              <Card>
                <DesignStatusPill status={request.status} />
                <StatusTrack
                  request={request}
                  requesterName={data.requesterName ?? request.requesterEmail}
                  decidedByName={data.decidedByName}
                  completedByName={data.completedByName}
                />
                {request.status === "DECLINED" && request.declineReason ? (
                  <Text selectable style={[typography.body, { color: t.danger }]}>
                    Reason: {request.declineReason}
                  </Text>
                ) : null}
                {request.completionNote ? (
                  <Text selectable style={[typography.body, { color: t.text }]}>
                    Note: {request.completionNote}
                  </Text>
                ) : null}
                <ErrorBanner message={error} />
                <Row>
                  {can.approve ? (
                    <>
                      <Btn
                        title="Approve"
                        variant="success"
                        icon="checkmark"
                        loading={busy}
                        onPress={() => void run(() => approve({ id: request._id }))}
                      />
                      <Btn
                        title="Decline"
                        variant="danger"
                        onPress={() => {
                          setReason("");
                          setDeclining(true);
                        }}
                      />
                    </>
                  ) : null}
                  {can.complete ? (
                    <Btn
                      title="Mark Complete"
                      icon="checkmark-done"
                      onPress={() => {
                        setNote("");
                        setCompleting(true);
                      }}
                    />
                  ) : null}
                  {can.edit ? (
                    <Btn
                      title="Edit"
                      variant="tonal"
                      icon="create-outline"
                      onPress={() => router.push(`/design-requests/new?edit=${request._id}`)}
                    />
                  ) : null}
                  {can.comment ? (
                    <CommentsButton unread={unreadCount} onPress={() => setCommentsOpen(true)} />
                  ) : null}
                  <Btn
                    title="Download PDF"
                    variant="tonal"
                    icon="download-outline"
                    disabled={busy || !fields}
                    onPress={() => void downloadPdf()}
                  />
                  {can.cancel ? (
                    <Btn
                      title="Cancel Request"
                      variant="ghost"
                      onPress={() => setConfirmCancel(true)}
                    />
                  ) : null}
                </Row>
              </Card>
            </FadeInView>
            <SectionTitle>Answers</SectionTitle>
            <Answers request={request} fields={fields} />
            <Timeline id={request._id} />
          </View>
        </ReadableColumn>
      </Screen>

      {can.comment ? (
        <DesignCommentsSheet
          id={request._id}
          visible={commentsOpen}
          onClose={() => setCommentsOpen(false)}
        />
      ) : null}

      <Sheet
        visible={declining}
        onClose={() => setDeclining(false)}
        title="Decline Design Request"
        footer={
          <View style={{ gap: spacing.sm }}>
            <Btn
              title="Decline"
              variant="danger"
              loading={busy}
              disabled={reason.trim() === ""}
              onPress={() =>
                void run(
                  () => decline({ id: request._id, reason }),
                  () => setDeclining(false)
                )
              }
            />
            <Btn title="Back" variant="ghost" onPress={() => setDeclining(false)} />
          </View>
        }
      >
        <Muted>The requester and the Marketing team will be told your reason.</Muted>
        <LabelledField label="Reason" required value={reason} onChangeText={setReason} multiline />
        <ErrorBanner message={error} />
      </Sheet>

      <Sheet
        visible={completing}
        onClose={() => setCompleting(false)}
        title="Mark Complete"
        footer={
          <View style={{ gap: spacing.sm }}>
            <Btn
              title="Mark Complete"
              loading={busy}
              onPress={() =>
                void run(
                  () => complete({ id: request._id, note: note.trim() || undefined }),
                  () => setCompleting(false)
                )
              }
            />
            <Btn title="Back" variant="ghost" onPress={() => setCompleting(false)} />
          </View>
        }
      >
        <Muted>
          {"The requester will be told it's done. Add a note or a link to the final files if you like."}
        </Muted>
        <Field label="Note (optional)" value={note} onChangeText={setNote} multiline />
        <ErrorBanner message={error} />
      </Sheet>

      <ConfirmDialog
        visible={confirmCancel}
        title="Cancel this design request?"
        message="The Marketing team will be told it's no longer needed. It stays in your list as cancelled."
        confirmLabel="Cancel Request"
        cancelLabel="Keep It"
        onConfirm={() => void run(() => cancel({ id: request._id }))}
        onClose={() => setConfirmCancel(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", alignItems: "flex-start", marginTop: spacing.xs },
  trackStep: { flex: 1, alignItems: "center", gap: 2 },
  trackDotRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", marginBottom: 4 },
  trackLine: { flex: 1, height: 2 },
  trackDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  answer: { gap: 4 },
  event: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  eventDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
});
