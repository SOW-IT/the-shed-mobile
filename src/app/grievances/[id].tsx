import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ReactNode, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  grievanceCategoryLabel,
  grievanceName,
  grievanceStepTrack,
  isOpenGrievance,
  type GrievanceOutcome,
} from "@shared/grievances";
import { LabelledField } from "@/components/events/LabelledField";
import { GrievanceStatusPill } from "@/components/grievances/GrievanceStatusPill";
import { SignInPrompt } from "@/components/SignInPrompt";
import { StepTrack } from "@/components/StepTrack";
import { sydneyDateTime } from "@/lib/sydneyTime";
import {
  Btn,
  Card,
  EmptyState,
  ErrorBanner,
  FadeInView,
  LoadingState,
  Muted,
  OptionRow,
  OptionSheet,
  ReadableColumn,
  Row,
  runBusy,
  Screen,
  SectionTitle,
  Sheet,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

const EVENT_LABELS: Record<string, string> = {
  submitted: "Raised",
  taken: "Taken on",
  assigned: "Given to someone",
  "in-progress": "Marked in progress",
  resolved: "Resolved",
  "not-proceeding": "Closed, not proceeding",
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

const Details = ({ g }: { g: Doc<"grievances"> }) => (
  <Card>
    <Answer label="Raised by">
      {[g.name, g.email, g.phone].filter(Boolean).join(" · ")}
    </Answer>
    <Answer label="About">{grievanceCategoryLabel(g.category)}</Answer>
    {g.campus ? <Answer label="Campus or area">{g.campus}</Answer> : null}
    {g.happenedWhen ? <Answer label="When">{g.happenedWhen}</Answer> : null}
    {g.peopleInvolved ? <Answer label="Who was involved">{g.peopleInvolved}</Answer> : null}
    <Answer label="What happened">{g.details}</Answer>
    {g.hopedOutcome ? <Answer label="Hoped-for outcome">{g.hopedOutcome}</Answer> : null}
  </Card>
);

const History = ({ id }: { id: Id<"grievances"> }) => {
  const t = useAppTheme();
  const events = useQuery(api.grievances.timeline, { id });
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

export default function GrievanceScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useQuery(api.grievances.get, id && isAuthenticated ? { id } : "skip");
  const viewer = useQuery(api.grievances.viewer, isAuthenticated ? {} : "skip");
  const team = useQuery(api.grievances.team, data?.isHandler ? {} : "skip");
  const assign = useMutation(api.grievances.assign);
  const start = useMutation(api.grievances.start);
  const close = useMutation(api.grievances.close);
  const markRead = useMutation(api.notifications.markReadForGrievance);

  const [picking, setPicking] = useState(false);
  const [closing, setClosing] = useState<GrievanceOutcome | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grievanceId = data?.grievance._id;
  useEffect(() => {
    if (grievanceId) void markRead({ grievanceId }).catch(() => {});
  }, [grievanceId, markRead]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/grievances"));

  if (!authLoading && !isAuthenticated) {
    return (
      <Screen title="Grievance" onBack={goBack}>
        <SignInPrompt what="grievance" />
      </Screen>
    );
  }
  if (data === undefined) {
    return (
      <Screen title="Grievance" onBack={goBack}>
        <LoadingState />
      </Screen>
    );
  }
  if (data === null) {
    return (
      <Screen title="Grievance" onBack={goBack}>
        <EmptyState
          icon="shield-checkmark-outline"
          title="Grievance not found"
          message="Only the person who raised it and the People and Culture and Compliance teams can see a grievance."
        />
      </Screen>
    );
  }

  const { grievance: g, can } = data;
  const run = (action: () => Promise<unknown>, after?: () => void) =>
    runBusy(busy, setBusy, setError, action, after);
  const steps = grievanceStepTrack(g, {
    submitter: g.name,
    assignee: data.assigneeName,
    closedBy: data.closedByName,
  });
  const resolving = closing === "RESOLVED";

  return (
    <>
      <Screen title={grievanceName(g)} subtitle={grievanceCategoryLabel(g.category)} onBack={goBack}>
        <ReadableColumn>
          <View style={{ gap: spacing.md }}>
            <FadeInView>
              <Card>
                <GrievanceStatusPill status={g.status} />
                <StepTrack steps={steps} />
                {data.assigneeName ? (
                  <Muted>{`Looked after by ${data.assigneeName}`}</Muted>
                ) : null}
                {g.closingNote ? (
                  <Text
                    selectable
                    style={[typography.body, { color: g.status === "RESOLVED" ? t.text : t.danger }]}
                  >
                    {g.status === "RESOLVED" ? "Outcome" : "Reason"}: {g.closingNote}
                  </Text>
                ) : null}
                <ErrorBanner message={error} />
                {data.isHandler ? (
                  <Row>
                    {can.take && viewer ? (
                      <Btn
                        title="Take It On"
                        icon="hand-left-outline"
                        loading={busy}
                        onPress={() =>
                          void run(() => assign({ id: g._id, assigneeEmail: viewer.email }))
                        }
                      />
                    ) : null}
                    {can.assign ? (
                      <Btn
                        title="Give To…"
                        variant="tonal"
                        icon="person-add-outline"
                        onPress={() => setPicking(true)}
                      />
                    ) : null}
                    {can.start ? (
                      <Btn
                        title="Mark In Progress"
                        variant="tonal"
                        icon="play-outline"
                        loading={busy}
                        onPress={() => void run(() => start({ id: g._id }))}
                      />
                    ) : null}
                    {can.resolve ? (
                      <Btn
                        title="Resolve"
                        variant="success"
                        icon="checkmark-done"
                        onPress={() => {
                          setNote("");
                          setClosing("RESOLVED");
                        }}
                      />
                    ) : null}
                    {can.close ? (
                      <Btn
                        title="Not Proceeding"
                        variant="ghost"
                        onPress={() => {
                          setNote("");
                          setClosing("NOT_PROCEEDING");
                        }}
                      />
                    ) : null}
                  </Row>
                ) : isOpenGrievance(g.status) ? (
                  <Muted>{`We'll email ${g.email} each time this moves along.`}</Muted>
                ) : null}
              </Card>
            </FadeInView>
            <SectionTitle>Details</SectionTitle>
            <Details g={g} />
            {data.isHandler ? <History id={g._id} /> : null}
          </View>
        </ReadableColumn>
      </Screen>

      <OptionSheet visible={picking} title="Give to" onClose={() => setPicking(false)}>
        {(team ?? []).map((person) => (
          <OptionRow
            key={person.email}
            label={person.name}
            selected={person.email === g.assigneeEmail}
            onPress={() => {
              setPicking(false);
              void run(() => assign({ id: g._id, assigneeEmail: person.email }));
            }}
          />
        ))}
      </OptionSheet>

      <Sheet
        visible={closing !== null}
        onClose={() => setClosing(null)}
        title={resolving ? "Resolve Grievance" : "Not Proceeding"}
        footer={
          <View style={{ gap: spacing.sm }}>
            <Btn
              title={resolving ? "Resolve" : "Close Grievance"}
              variant={resolving ? "success" : "danger"}
              loading={busy}
              disabled={note.trim() === ""}
              onPress={() =>
                void run(
                  () => close({ id: g._id, outcome: closing ?? "RESOLVED", note }),
                  () => setClosing(null)
                )
              }
            />
            <Btn title="Back" variant="ghost" onPress={() => setClosing(null)} />
          </View>
        }
      >
        <Muted>
          {resolving
            ? `${g.name} will be emailed this outcome.`
            : `${g.name} will be emailed that it won't be taken further, with this reason.`}
        </Muted>
        <LabelledField
          label={resolving ? "Outcome" : "Reason"}
          required
          value={note}
          onChangeText={setNote}
          multiline
        />
        <ErrorBanner message={error} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  answer: { gap: 4 },
  event: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  eventDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
});
