import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  designAnswersProblemAt,
  designRequestName,
  normalizeDesignAnswers,
  questionNumber,
  sydneyToday,
} from "@shared/designRequests";
import { staffOnlyMessage } from "@shared/staffOnly";
import { SignInPrompt } from "@/components/SignInPrompt";
import {
  answersFromDraft,
  DesignRequestForm,
  draftFromAnswers,
  emptyDraft,
  type DesignRequestDraft,
} from "@/components/design/DesignRequestForm";
import { Text, View } from "react-native";
import {
  Btn,
  Card,
  EmptyState,
  errorMessage,
  FooterAction,
  LoadingState,
  Muted,
  ReadableColumn,
  Row,
  Screen,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

export default function DesignRequestFormScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editId = typeof edit === "string" && edit ? edit : null;
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.directory.me);
  const structure = useQuery(
    api.directory.yearStructure,
    me?.profile ? { year: me.year } : "skip"
  );
  const existing = useQuery(api.designRequests.get, editId ? { id: editId } : "skip");
  const fields = useQuery(api.designRequestForm.fields, me?.profile ? {} : "skip");
  const submit = useMutation(api.designRequests.submit);
  const update = useMutation(api.designRequests.update);
  const [draft, setDraft] = useState<DesignRequestDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ key: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const defaultDepartment = me?.profile?.department ?? "";
  useEffect(() => {
    if (draft !== null || !fields) return;
    if (editId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the form once loaded
      if (existing) setDraft(draftFromAnswers(fields, existing.request.answers));
    } else {
      setDraft(emptyDraft(fields, defaultDepartment));
    }
  }, [draft, fields, editId, existing, defaultDepartment]);

  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace("/design-requests");
  const title = existing
    ? `Edit ${designRequestName(existing.request).replace(/^Design/, "design")}`
    : "New Design Request";

  if (!authLoading && !isAuthenticated) {
    return (
      <Screen title={title} onBack={goBack}>
        <SignInPrompt what="page" />
      </Screen>
    );
  }
  if (me && !me.profile) {
    return (
      <Screen title={title} onBack={goBack}>
        <EmptyState icon="color-palette-outline" title="For SOW staff" message={staffOnlyMessage("Design", me)} />
      </Screen>
    );
  }
  if (editId && (existing === null || (existing && !existing.can.edit))) {
    return (
      <Screen title="Design request" onBack={goBack}>
        <EmptyState
          icon="color-palette-outline"
          title="This design request can't be edited"
          message="Only the requester can edit a design request, and only until it's complete, declined or cancelled."
        />
      </Screen>
    );
  }
  if (draft === null || !fields) {
    return (
      <Screen title={title} onBack={goBack}>
        <LoadingState />
      </Screen>
    );
  }

  const today = sydneyToday();
  const existingDue = existing?.request.dueDate;
  const minDate = existingDue && existingDue < today ? existingDue : today;
  const picked = fields
    .filter((field) => field.kind === "department")
    .map((field) => draft[field.key])
    .filter((value): value is string => typeof value === "string" && value !== "");
  const departments = [
    ...new Set([...(structure?.departments ?? []).map((d) => d.name), ...picked]),
  ].sort();

  const save = async () => {
    if (saving) return;
    const answers = normalizeDesignAnswers(fields, answersFromDraft(fields, draft));
    const found = designAnswersProblemAt(fields, answers, today, existing?.request.answers);
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
        await update({ id: existing.request._id, answers });
        goBack();
      } else {
        const id: Id<"designRequests"> = await submit({ answers });
        router.replace(`/design-requests/${id}`);
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
          title={saving ? "Saving…" : existing ? "Save Changes" : "Submit Request"}
          disabled={saving}
          note={error}
          onPress={() => void save()}
          avoidKeyboard={false}
        />
      }
    >
      <ReadableColumn>
        {existing ? null : (
          <Card>
            <Text style={[typography.headline, { color: t.text }]}>Is this for an event?</Text>
            <Muted>
              Design requests aren&apos;t for events. For an event, make an Event Request instead:
              its Marketing form covers the event&apos;s design and promotion.
            </Muted>
            <Row>
              <Btn
                title="Make an Event Request"
                variant="tonal"
                icon="calendar-outline"
                onPress={() => router.replace("/event-requests/new")}
              />
            </Row>
          </Card>
        )}
        <View style={{ height: spacing.md }} />
        <DesignRequestForm
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
      </ReadableColumn>
    </Screen>
  );
}
