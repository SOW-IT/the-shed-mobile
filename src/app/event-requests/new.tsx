import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Fragment, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { answersProblemAt, normalizeAnswers, questionNumber, sydneyToday } from "@shared/forms";
import { SUB_FORM_KINDS, SUB_FORM_LABELS } from "@shared/eventRequests";
import { staffOnlyMessage } from "@shared/staffOnly";
import { SignInPrompt } from "@/components/SignInPrompt";
import {
  answersFromDraft,
  draftFromAnswers,
  emptyDraft,
  FormQuestions,
  type FormDraft,
} from "@/components/forms/FormQuestions";
import {
  EmptyState,
  errorMessage,
  FooterAction,
  LoadingState,
  ReadableColumn,
  Screen,
  WarningBanner,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const REQUEST_STEPS = ["Event", ...SUB_FORM_KINDS.map((kind) => SUB_FORM_LABELS[kind])];

const RequestSteps = () => {
  const t = useAppTheme();
  return (
    <View
      style={styles.steps}
      accessible
      accessibilityLabel={`Step 1 of ${REQUEST_STEPS.length}: the event. Then ${REQUEST_STEPS.slice(1).join(", ")}.`}
    >
      {REQUEST_STEPS.map((label, i) => (
        <Fragment key={label}>
          {i > 0 ? <Ionicons name="chevron-forward" size={14} color={t.faint} /> : null}
          <View
            style={[
              styles.step,
              i === 0
                ? { backgroundColor: t.primarySoft, borderColor: t.primary }
                : { borderColor: t.border },
            ]}
          >
            <Text
              style={[
                typography.caption,
                { color: i === 0 ? (t.dark ? t.text : t.primary) : t.muted, fontWeight: i === 0 ? "700" : "500" },
              ]}
            >
              {i + 1} {label}
            </Text>
          </View>
        </Fragment>
      ))}
    </View>
  );
};

const DAY = 86_400_000;
/** Marketing needs time: events sooner than this get a gentle warning. */
const LEAD_DAYS = 28;

/** New event request, or with `?edit=<id>`, the requester's side editing it. */
export default function EventRequestFormScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editId = typeof edit === "string" && edit ? edit : null;
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.directory.me);
  const staff = !!me?.profile && !me.isCampusLeader;
  const viewer = useQuery(api.eventRequests.viewer, staff ? {} : "skip");
  const structure = useQuery(api.directory.yearStructure, me?.profile ? { year: me.year } : "skip");
  const existing = useQuery(api.eventRequests.get, editId ? { id: editId } : "skip");
  const forms = useQuery(api.eventRequestForm.fields, staff ? {} : "skip");
  const create = useMutation(api.eventRequests.create);
  const update = useMutation(api.eventRequests.update);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ key: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // Events starting before this date get a gentle "that's soon" warning.
  const [leadCutoff] = useState(() => sydneyToday(new Date(Date.now() + LEAD_DAYS * DAY)));

  const fields = forms?.event;
  const ownDepartments = viewer?.departments;
  useEffect(() => {
    if (draft !== null || !fields || ownDepartments === undefined) return;
    if (editId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the form once loaded
      if (existing) setDraft(draftFromAnswers(fields, existing.event.answers));
    } else {
      setDraft(emptyDraft(fields, ownDepartments[0] ?? ""));
    }
  }, [draft, fields, editId, existing, ownDepartments]);

  const goBack = () =>
    router.canGoBack()
      ? router.back()
      : router.replace(editId ? `/event-requests/${editId}` : "/event-requests");
  const title = existing ? `Edit ${existing.event.name}` : "New Event Request";

  if (!authLoading && !isAuthenticated) {
    return (
      <Screen title={title} onBack={goBack}>
        <SignInPrompt what="page" />
      </Screen>
    );
  }
  if (me && !staff) {
    return (
      <Screen title={title} onBack={goBack}>
        <EmptyState icon="calendar-outline" title="For SOW staff" message={staffOnlyMessage("Event", me)} />
      </Screen>
    );
  }
  if (editId && (existing === null || (existing && !existing.can.edit))) {
    return (
      <Screen title="Event request" onBack={goBack}>
        <EmptyState
          icon="calendar-outline"
          title="This event can't be edited"
          message="Only the requester's department can edit an event, and only while it's in progress."
        />
      </Screen>
    );
  }
  if (draft === null || !fields || !viewer) {
    return (
      <Screen title={title} onBack={goBack}>
        <LoadingState />
      </Screen>
    );
  }

  const today = sydneyToday();
  const existingStart = existing?.event.startsAt.slice(0, 10);
  const minDate = existingStart && existingStart < today ? existingStart : today;
  const departments =
    viewer.departments.length > 0
      ? [...new Set([...viewer.departments, ...(existing ? [existing.event.department] : [])])]
      : (structure?.departments ?? []).map((d) => d.name).sort();
  const start = typeof draft.start === "string" ? draft.start.slice(0, 10) : "";
  const soon = start.length === 10 && start >= today && start < leadCutoff;

  const save = async () => {
    if (saving) return;
    const answers = normalizeAnswers(fields, answersFromDraft(fields, draft));
    const found = answersProblemAt(fields, answers, today, existing?.event.answers);
    setProblem(found);
    if (found) {
      const number = questionNumber(fields, answers, found.key);
      setError(number === undefined ? found.message : `Question ${number}: ${found.message}`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (existing) {
        await update({ id: existing.event._id, answers });
        goBack();
      } else {
        const id: Id<"eventRequests"> = await create({ answers });
        router.replace(`/event-requests/${id}`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title={title}
      onBack={goBack}
      footer={
        <FooterAction
          title={saving ? "Saving…" : existing ? "Save Changes" : "Create Event Request"}
          disabled={saving}
          note={error}
          onPress={() => void save()}
          avoidKeyboard={false}
        />
      }
    >
      <ReadableColumn>
        <View style={{ gap: spacing.md }}>
          {existing ? null : <RequestSteps />}
          <FormQuestions
            fields={fields}
            draft={draft}
            onChange={(next) => {
              setDraft(next);
              if (error) setError(null);
              if (problem) setProblem(null);
            }}
            departments={departments}
            minDate={minDate}
            problem={problem}
          />
          <WarningBanner
            message={
              soon
                ? "This event is less than 4 weeks away. Get the forms in as soon as you can, so Marketing has time to promote it."
                : null
            }
          />
        </View>
      </ReadableColumn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.xs },
  step: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
});
