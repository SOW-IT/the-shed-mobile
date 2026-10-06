import { Ionicons } from "@expo/vector-icons";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { formatAnswer, formatDateTimeRange, isFieldShown } from "@shared/forms";
import {
  eventRequestRef,
  SUB_FORM_KINDS,
  SUB_FORM_LABELS,
  type SubFormKind,
} from "@shared/eventRequests";
import { EventStatusPill, SubFormStatusPill } from "@/components/events/EventPills";
import { downloadFile } from "@/lib/csvDownload";
import { eventHistoryLabel, subFormStatusLine } from "@/lib/eventRequestText";
import { sydneyDateTime } from "@/lib/sydneyTime";
import {
  Btn,
  Card,
  EmptyState,
  ErrorBanner,
  errorMessage,
  FadeInView,
  Field,
  LoadingState,
  Muted,
  ReadableColumn,
  Row,
  Screen,
  SectionTitle,
  Sheet,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

type EventData = NonNullable<ReturnType<typeof useEventRequest>>;
const useEventRequest = (id: string | undefined) =>
  useQuery(api.eventRequests.get, id ? { id } : "skip");

const FormCard = ({
  data,
  kind,
  unread,
  onOpen,
}: {
  data: EventData;
  kind: SubFormKind;
  unread: number;
  onOpen: () => void;
}) => {
  const t = useAppTheme();
  const form = data.forms[kind];
  const action = form.can.decide ? "Review" : form.can.fill ? "Fill In" : "View";
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${SUB_FORM_LABELS[kind]} form: ${action}`}
      style={({ pressed }) => [
        styles.formCard,
        t.shadowCard,
        { backgroundColor: t.card },
        form.can.decide && { borderColor: t.accent, borderWidth: 1.5 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.formTitle}>
          <Text style={[typography.headline, { color: t.text }]}>{SUB_FORM_LABELS[kind]}</Text>
          <SubFormStatusPill status={form.status} />
          {unread > 0 ? (
            <View style={[styles.unread, { backgroundColor: t.accentSoft }]}>
              <Ionicons name="chatbubble" size={11} color={t.accent} />
              <Text style={[typography.caption, { color: t.accent, fontWeight: "700" }]}>{unread}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[typography.caption, { color: t.muted }]}>
          {subFormStatusLine(kind, form, { imported: !!data.event.legacyKey, canFill: form.can.fill })}
        </Text>
      </View>
      <Text style={[typography.label, { color: form.can.decide || form.can.fill ? t.primary : t.faint }]}>
        {action}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={t.faint} />
    </Pressable>
  );
};

const Timeline = ({ id }: { id: Id<"eventRequests"> }) => {
  const t = useAppTheme();
  const events = useQuery(api.eventRequests.timeline, { id });
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
                {eventHistoryLabel(event.action, event.form)}
              </Text>
              <Text style={[typography.caption, { color: t.muted }]}>
                {sydneyDateTime(event.at)} · {event.actorName}
                {event.detail ? ` · ${event.detail}` : ""}
              </Text>
            </View>
          </View>
        ))}
      </Card>
    </>
  );
};

export default function EventRequestScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useEventRequest(id);
  const forms = useQuery(api.eventRequestForm.fields, {});
  const eventId = data?.event._id;
  const unread =
    useQuery(api.eventRequestComments.unreadCounts, eventId ? { ids: [eventId] } : "skip") ?? {};
  const cancel = useMutation(api.eventRequests.cancel);
  const markNotificationsRead = useMutation(api.notifications.markReadForEventRequest);
  const convex = useConvex();
  const [cancelling, setCancelling] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (eventId) void markNotificationsRead({ eventRequestId: eventId }).catch(() => {});
  }, [eventId, markNotificationsRead]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/event-requests"));

  if (data === undefined) {
    return (
      <Screen title="Event request" onBack={goBack}>
        <LoadingState />
      </Screen>
    );
  }
  if (data === null) {
    return (
      <Screen title="Event request" onBack={goBack}>
        <EmptyState
          icon="calendar-outline"
          title="Event request not found"
          message="It may have been removed, or it isn't one you can see."
        />
      </Screen>
    );
  }

  const { event, can } = data;
  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      after?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = () =>
    run(async () => {
      const [{ buildEventRequestPdf, eventRequestPdfFilename }, history] = await Promise.all([
        import("@/lib/eventRequestPdf"),
        convex.query(api.eventRequests.timeline, { id: event._id }),
      ]);
      const bytes = await buildEventRequestPdf({
        data,
        eventFields: forms?.event ?? [],
        marketingFields: forms?.marketing ?? [],
        history: (history ?? []).map((h) => ({
          at: h.at,
          label: eventHistoryLabel(h.action, h.form),
          actorName: h.actorName,
          detail: h.detail,
        })),
        generatedAt: Date.now(),
      });
      await downloadFile(eventRequestPdfFilename(event), bytes, {
        mimeType: "application/pdf",
        uti: "com.adobe.pdf",
        dialogTitle: event.name,
      });
    });

  const lines = [
    formatDateTimeRange(event.startsAt, event.endsAt),
    event.location,
    `Requested by ${data.requesterName ?? event.requesterEmail} (${event.department}) on ${sydneyDateTime(event.submittedAt)}`,
  ];
  if (event.editedAt) lines.push(`Edited ${sydneyDateTime(event.editedAt)}`);
  if (event.status === "APPROVED" && event.approvedAt) {
    lines.push(`Approved ${sydneyDateTime(event.approvedAt)}: it can go ahead.`);
  }
  if (event.status === "CANCELLED") {
    lines.push(
      [
        "Cancelled",
        event.cancelledAt ? sydneyDateTime(event.cancelledAt) : null,
        data.cancelledByName ? `by ${data.cancelledByName}` : null,
      ]
        .filter(Boolean)
        .join(" ")
    );
  }

  return (
    <>
      <Screen title={event.name} subtitle={eventRequestRef(event)} onBack={goBack}>
        <ReadableColumn>
          <View style={{ gap: spacing.md }}>
            <FadeInView>
              <Card>
                <EventStatusPill status={event.status} />
                {lines.map((line) => (
                  <Muted key={line}>{line}</Muted>
                ))}
                {event.cancelNote ? (
                  <Text selectable style={[typography.body, { color: t.text }]}>
                    Note: {event.cancelNote}
                  </Text>
                ) : null}
                <ErrorBanner message={error} />
                <Row>
                  {can.edit ? (
                    <Btn
                      title="Edit Event"
                      variant="tonal"
                      icon="create-outline"
                      onPress={() => router.push(`/event-requests/new?edit=${event._id}`)}
                    />
                  ) : null}
                  <Btn
                    title="Download PDF"
                    variant="tonal"
                    icon="download-outline"
                    disabled={busy || !forms}
                    onPress={() => void downloadPdf()}
                  />
                  {can.cancel ? (
                    <Btn
                      title="Cancel Event"
                      variant="ghost"
                      onPress={() => {
                        setNote("");
                        setCancelling(true);
                      }}
                    />
                  ) : null}
                </Row>
              </Card>
            </FadeInView>
            <SectionTitle>Forms</SectionTitle>
            <Muted>All three need to be approved (or not required) for the event to go ahead.</Muted>
            {SUB_FORM_KINDS.map((kind) => (
              <FormCard
                key={kind}
                data={data}
                kind={kind}
                unread={unread[event._id]?.[kind] ?? 0}
                onOpen={() => router.push(`/event-requests/${event._id}/${kind}`)}
              />
            ))}
            <SectionTitle>The event</SectionTitle>
            <Card>
              {(forms?.event ?? [])
                .filter((field) => isFieldShown(field, event.answers))
                .map((field) => (
                  <View key={field.key} style={{ gap: 4 }}>
                    <Text style={[typography.label, { color: t.muted }]}>{field.shortLabel}</Text>
                    <Text selectable style={[typography.body, { color: t.text }]}>
                      {formatAnswer(field, event.answers) ?? "—"}
                    </Text>
                  </View>
                ))}
            </Card>
            <Timeline id={event._id} />
          </View>
        </ReadableColumn>
      </Screen>

      <Sheet
        visible={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel This Event?"
        footer={
          <View style={{ gap: spacing.sm }}>
            <Btn
              title="Cancel Event"
              variant="danger"
              loading={busy}
              onPress={() =>
                void run(
                  () => cancel({ id: event._id, note: note.trim() || undefined }),
                  () => setCancelling(false)
                )
              }
            />
            <Btn title="Keep It" variant="ghost" onPress={() => setCancelling(false)} />
          </View>
        }
      >
        <Muted>
          The teams already looking at its forms will be told it isn&apos;t going ahead. It stays in
          your list as cancelled.
        </Muted>
        <Field label="Note (optional)" value={note} onChangeText={setNote} multiline />
        <ErrorBanner message={error} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  formCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  formTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  unread: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  event: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  eventDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
});
