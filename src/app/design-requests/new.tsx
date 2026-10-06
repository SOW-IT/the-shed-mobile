import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  designAnswersProblem,
  designRequestName,
  normalizeDesignAnswers,
  sydneyToday,
} from "@shared/designRequests";
import {
  answersFromDraft,
  DesignRequestForm,
  draftFromAnswers,
  emptyDraft,
  type DesignRequestDraft,
} from "@/components/design/DesignRequestForm";
import {
  EmptyState,
  errorMessage,
  FooterAction,
  LoadingState,
  ReadableColumn,
  Screen,
} from "@/components/ui";

/** New design request, or with `?edit=<id>`, the requester editing theirs. */
export default function DesignRequestFormScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editId = typeof edit === "string" && edit ? edit : null;
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

  // An edit keeps whatever due date it already had, even one now in the past.
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
    const problem = designAnswersProblem(fields, answers, today, existing?.request.answers);
    if (problem) {
      setError(problem);
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
          // A form of text fields: the button stays put under the keyboard so
          // it never covers the field being typed in.
          avoidKeyboard={false}
        />
      }
    >
      <ReadableColumn>
        <DesignRequestForm
          fields={fields}
          draft={draft}
          onChange={(next) => {
            setDraft(next);
            if (error) setError(null);
          }}
          departments={departments}
          minDate={minDate}
        />
      </ReadableColumn>
    </Screen>
  );
}
