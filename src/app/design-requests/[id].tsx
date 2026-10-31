import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
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
import { sydneyDateTime } from "@/lib/sydneyTime";
import { StepTrack } from "@/components/StepTrack";
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
  const steps = designStepTrack(request, {
    requester: requesterName,
    decidedBy: decidedByName,
    completedBy: completedByName,
  });
  return (
    <View style={{ gap: spacing.xs }}>
      <StepTrack steps={steps} />
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
  answer: { gap: 4 },
  event: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  eventDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
});
