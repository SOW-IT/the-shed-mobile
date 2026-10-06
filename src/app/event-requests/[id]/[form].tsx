import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ReactNode, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../../../../convex/_generated/api";
import {
  answersProblem,
  formatAnswer,
  isFieldShown,
  normalizeAnswers,
  sydneyToday,
  type FormField,
} from "@shared/forms";
import {
  eventSize,
  financeProblem,
  isSubFormKind,
  normalizeFinance,
  normalizeRisk,
  riskProblem,
  SUB_FORM_LABELS,
  SUB_FORM_TEAMS,
  type SubFormKind,
} from "@shared/eventRequests";
import {
  answersFromDraft,
  draftFromAnswers,
  FormQuestions,
  type FormDraft,
} from "@/components/forms/FormQuestions";
import { EventCommentsSheet } from "@/components/events/EventCommentsSheet";
import { SubFormStatusPill } from "@/components/events/EventPills";
import {
  financeDataFrom,
  financeDraftFrom,
  FinanceFormEditor,
  FinanceView,
  type FinanceDraft,
} from "@/components/events/FinanceForm";
import {
  riskDataFrom,
  riskDraftFrom,
  RiskFormEditor,
  RiskStandardLinks,
  RiskView,
  type RiskDraft,
} from "@/components/events/RiskForm";
import { subFormStatusLine } from "@/lib/eventRequestText";
import {
  Btn,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  errorMessage,
  FadeInView,
  Field,
  FooterAction,
  LoadingState,
  Muted,
  ReadableColumn,
  Row,
  Screen,
  Sheet,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

type Drafts = { marketing?: FormDraft; risk?: RiskDraft; finance?: FinanceDraft };

const MarketingAnswers = ({
  fields,
  answers,
}: {
  fields: readonly FormField[];
  answers: Record<string, unknown>;
}) => {
  const t = useAppTheme();
  const shown = fields.filter((f) => isFieldShown(f, answers as never));
  return (
    <Card>
      {shown.map((field) => (
        <View key={field.key} style={{ gap: 4 }}>
          <Text style={[typography.label, { color: t.muted }]}>{field.shortLabel}</Text>
          <Text selectable style={[typography.body, { color: t.text }]}>
            {formatAnswer(field, answers as never) ?? "—"}
          </Text>
        </View>
      ))}
    </Card>
  );
};

export default function EventSubFormScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const { id, form: formParam, thread, reopen: reopenToken } = useLocalSearchParams<{
    id: string;
    form: string;
    thread?: string;
    reopen?: string;
  }>();
  const kind: SubFormKind | null = formParam && isSubFormKind(formParam) ? formParam : null;
  const data = useQuery(api.eventRequests.get, id && kind ? { id } : "skip");
  const forms = useQuery(api.eventRequestForm.fields, {});
  const eventId = data?.event._id;
  const unread =
    useQuery(api.eventRequestComments.unreadCounts, eventId ? { ids: [eventId] } : "skip") ?? {};
  const saveMarketing = useMutation(api.eventSubForms.saveMarketing);
  const saveRisk = useMutation(api.eventSubForms.saveRisk);
  const saveFinance = useMutation(api.eventSubForms.saveFinance);
  const approve = useMutation(api.eventSubForms.approve);
  const requestChanges = useMutation(api.eventSubForms.requestChanges);
  const reopen = useMutation(api.eventSubForms.reopen);
  const markNotificationsRead = useMutation(api.notifications.markReadForEventRequest);

  const [drafts, setDrafts] = useState<Drafts>({});
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [openedThreadLink, setOpenedThreadLink] = useState<string | null>(null);
  const [askingChanges, setAskingChanges] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (eventId) void markNotificationsRead({ eventRequestId: eventId }).catch(() => {});
  }, [eventId, markNotificationsRead]);

  // A thread link (a comment notification) opens the comments once.
  const threadLink = thread === "1" && eventId ? `${eventId}|${reopenToken ?? ""}` : null;
  useEffect(() => {
    if (threadLink && threadLink !== openedThreadLink) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open from a deep link
      setCommentsOpen(true);
      setOpenedThreadLink(threadLink);
    }
  }, [threadLink, openedThreadLink]);

  // The editable copy starts from what's saved, once, when the form can be filled in.
  const current = kind && data ? data.forms[kind] : null;
  const canFill = !!current?.can.fill;
  useEffect(() => {
    if (!kind || !current || !canFill || drafts[kind] || !forms) return;
    const seeded: Drafts =
      kind === "marketing"
        ? { marketing: draftFromAnswers(forms.marketing, current.answers ?? {}) }
        : kind === "risk"
          ? { risk: riskDraftFrom(current.risk) }
          : { finance: financeDraftFrom(current.finance) };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the form once loaded
    setDrafts((d) => ({ ...d, ...seeded }));
  }, [kind, current, canFill, drafts, forms]);

  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace(id ? `/event-requests/${id}` : "/event-requests");

  if (!kind || data === null) {
    return (
      <Screen title="Event form" onBack={goBack}>
        <EmptyState
          icon="calendar-outline"
          title="Form not found"
          message="It may have been removed, or it isn't one you can see."
        />
      </Screen>
    );
  }
  if (data === undefined || !forms || !current) {
    return (
      <Screen title={`${SUB_FORM_LABELS[kind]} form`} onBack={goBack}>
        <LoadingState />
      </Screen>
    );
  }

  const { event } = data;
  const label = SUB_FORM_LABELS[kind];
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

  /** Saves the form; with `submit`, checks it first and sends it for approval. */
  const save = (submit: boolean) => {
    setSaved(false);
    if (kind === "marketing" && drafts.marketing) {
      const answers = normalizeAnswers(forms.marketing, answersFromDraft(forms.marketing, drafts.marketing));
      const problem = submit ? answersProblem(forms.marketing, answers, sydneyToday(), current.answers) : null;
      if (problem) return setError(problem);
      return void run(
        () => saveMarketing({ id: event._id, answers, submit }),
        submit ? goBack : () => setSaved(true)
      );
    }
    if (kind === "risk" && drafts.risk) {
      const risk = riskDataFrom(drafts.risk);
      const problem = submit ? riskProblem(normalizeRisk(risk)) : null;
      if (problem) return setError(problem);
      return void run(
        () => saveRisk({ id: event._id, risk, submit }),
        submit ? goBack : () => setSaved(true)
      );
    }
    if (kind === "finance" && drafts.finance) {
      const finance = financeDataFrom(drafts.finance);
      const problem = submit ? financeProblem(normalizeFinance(finance)) : null;
      if (problem) return setError(problem);
      return void run(
        () => saveFinance({ id: event._id, finance, submit }),
        submit ? goBack : () => setSaved(true)
      );
    }
  };

  const change = (next: Drafts) => {
    setDrafts((d) => ({ ...d, ...next }));
    setSaved(false);
    if (error) setError(null);
  };

  let body: ReactNode;
  if (canFill) {
    body =
      kind === "marketing" && drafts.marketing ? (
        <FormQuestions
          fields={forms.marketing}
          draft={drafts.marketing}
          onChange={(marketing) => change({ marketing })}
          departments={[]}
          minDate={sydneyToday()}
          size={eventSize(event.answers.registrationGoal as number | undefined)}
        />
      ) : kind === "risk" && drafts.risk ? (
        <RiskFormEditor draft={drafts.risk} onChange={(risk) => change({ risk })} />
      ) : kind === "finance" && drafts.finance ? (
        <FinanceFormEditor
          draft={drafts.finance}
          onChange={(finance) => change({ finance })}
          directorThreshold={data.directorThreshold}
        />
      ) : (
        <LoadingState />
      );
  } else {
    body =
      kind === "marketing" ? (
        <MarketingAnswers fields={forms.marketing} answers={current.answers ?? {}} />
      ) : kind === "risk" ? (
        <View style={{ gap: spacing.md }}>
          <RiskView data={current.risk ?? { noRisks: false, risks: [] }} imported={!!event.legacyKey} />
          <RiskStandardLinks />
        </View>
      ) : (
        <FinanceView data={current.finance ?? { income: [], expenses: [] }} />
      );
  }

  const unreadCount = unread[event._id]?.[kind] ?? 0;
  const statusLine = subFormStatusLine(kind, current, {
    imported: !!event.legacyKey,
    canFill,
  });

  return (
    <>
      <Screen
        title={`${label} form`}
        subtitle={event.name}
        onBack={goBack}
        footer={
          canFill ? (
            <FooterAction
              title={busy ? "Saving…" : "Submit for Approval"}
              disabled={busy}
              note={error ?? (saved ? "Draft saved." : null)}
              onPress={() => save(true)}
              cancel={{ title: "Save Draft", onPress: () => save(false), disabled: busy }}
              avoidKeyboard={false}
            />
          ) : undefined
        }
      >
        <ReadableColumn>
          <View style={{ gap: spacing.md }}>
            <FadeInView>
              <Card>
                <SubFormStatusPill status={current.status} />
                <Muted>{statusLine}</Muted>
                {current.status === "CHANGES_REQUESTED" && current.changesReason ? (
                  <Text selectable style={[typography.body, { color: t.danger }]}>
                    What to change: {current.changesReason}
                  </Text>
                ) : null}
                {canFill ? (
                  <Muted>
                    {`Fill it in, then submit it for the ${SUB_FORM_TEAMS[kind]} Head to approve. You can save a draft and come back to it.`}
                  </Muted>
                ) : null}
                {canFill ? null : <ErrorBanner message={error} />}
                <Row>
                  {current.can.decide ? (
                    <>
                      <Btn
                        title="Approve"
                        variant="success"
                        icon="checkmark"
                        loading={busy}
                        onPress={() => void run(() => approve({ id: event._id, form: kind }))}
                      />
                      <Btn
                        title="Request Changes"
                        variant="danger"
                        onPress={() => {
                          setReason("");
                          setAskingChanges(true);
                        }}
                      />
                    </>
                  ) : null}
                  <Btn
                    title={unreadCount > 0 ? `Comments (${unreadCount} new)` : "Comments"}
                    variant="tonal"
                    icon="chatbubbles-outline"
                    onPress={() => setCommentsOpen(true)}
                  />
                  {current.can.reopen ? (
                    <Btn title="Reopen to Change" variant="ghost" onPress={() => setConfirmReopen(true)} />
                  ) : null}
                </Row>
              </Card>
            </FadeInView>
            {body}
          </View>
        </ReadableColumn>
      </Screen>

      <EventCommentsSheet
        id={event._id}
        form={kind}
        canPost={current.can.comment}
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />

      <Sheet
        visible={askingChanges}
        onClose={() => setAskingChanges(false)}
        title="Request Changes"
        footer={
          <View style={{ gap: spacing.sm }}>
            <Btn
              title="Request Changes"
              variant="danger"
              loading={busy}
              disabled={reason.trim() === ""}
              onPress={() =>
                void run(
                  () => requestChanges({ id: event._id, form: kind, reason }),
                  () => setAskingChanges(false)
                )
              }
            />
            <Btn title="Back" variant="ghost" onPress={() => setAskingChanges(false)} />
          </View>
        }
      >
        <Muted>The requester will be told what to change, and can submit the form again.</Muted>
        <Field label="What needs to change? (required)" value={reason} onChangeText={setReason} multiline />
        <ErrorBanner message={error} />
      </Sheet>

      <ConfirmDialog
        visible={confirmReopen}
        title={`Reopen the ${label} form?`}
        message="It goes back to being filled in, and will need approving again. The event won't count as approved until it is."
        confirmLabel="Reopen"
        cancelLabel="Keep It"
        onConfirm={() => void run(() => reopen({ id: event._id, form: kind }))}
        onClose={() => setConfirmReopen(false)}
      />
    </>
  );
}
