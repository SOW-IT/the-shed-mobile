import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../../../convex/_generated/api";
import {
  andList,
  grievanceProblem,
  normalizeGrievance,
  type GrievanceInput,
} from "@shared/grievances";
import {
  Btn,
  Card,
  EmptyState,
  errorMessage,
  Field,
  FooterAction,
  Muted,
  ReadableColumn,
  Screen,
  Select,
  Txt,
} from "@/components/ui";
import { spacing, typography } from "@/theme";

const EMPTY: GrievanceInput = {
  name: "",
  email: "",
  phone: "",
  campus: "",
  category: "",
  details: "",
  happenedWhen: "",
  peopleInvolved: "",
  hopedOutcome: "",
};

export default function NewGrievanceScreen() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.directory.me);
  const viewer = useQuery(api.grievances.viewer, isAuthenticated ? {} : "skip");
  const settings = useQuery(api.grievances.settings);
  const submit = useMutation(api.grievances.submit);
  const [draft, setDraft] = useState<GrievanceInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const accountEmail = viewer?.email ?? null;
  const accountName = me?.name ?? null;
  useEffect(() => {
    if (!accountEmail) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fill in who's signed in
    setDraft((d) => ({ ...d, email: accountEmail, name: d.name || (accountName ?? "") }));
  }, [accountEmail, accountName]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/grievances"));
  const set = (key: keyof GrievanceInput) => (value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (error) setError(null);
  };

  const save = async () => {
    if (saving) return;
    const input = normalizeGrievance(draft);
    const problem = grievanceProblem(input, settings?.categories ?? []);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      const id = await submit(input);
      if (isAuthenticated) router.replace(`/grievances/${id}`);
      else setSentTo(input.email);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (sentTo) {
    return (
      <Screen title="Grievance sent" onBack={goBack}>
        <ReadableColumn>
          <EmptyState
            icon="shield-checkmark-outline"
            title="Thank you. We've received it."
            message={`We've sent a copy to ${sentTo}, and we'll email you there when someone is looking after it and when it's resolved.`}
          />
          <View style={{ alignItems: "center" }}>
            <Btn title="Done" onPress={goBack} />
          </View>
        </ReadableColumn>
      </Screen>
    );
  }

  return (
    <Screen
      title="Raise a Grievance"
      onBack={goBack}
      footer={
        <FooterAction
          title={saving ? "Sending…" : "Send Grievance"}
          disabled={saving}
          note={error}
          onPress={() => void save()}
          avoidKeyboard={false}
        />
      }
    >
      <ReadableColumn>
        <View style={{ gap: spacing.md }}>
          <Card>
            <Txt style={typography.headline}>Only SOW&apos;s grievance team sees this</Txt>
            <Muted>
              {`Your grievance goes to ${andList(settings?.departments ?? [])}, and nobody else. We'll email you each time it moves along. If someone is in danger, call 000 first.`}
            </Muted>
          </Card>
          <Card>
            <Field
              label="Your name"
              value={draft.name}
              onChangeText={set("name")}
              autoCapitalize="words"
            />
            <Field
              label="Your email"
              value={draft.email}
              onChangeText={set("email")}
              placeholder="you@example.com"
              keyboardType="email-address"
              disabled={!!accountEmail}
            />
            <Field label="Phone (optional)" value={draft.phone ?? ""} onChangeText={set("phone")} />
            <Field
              label="Campus or area (optional)"
              value={draft.campus ?? ""}
              onChangeText={set("campus")}
              autoCapitalize="words"
            />
          </Card>
          <Card>
            <Select
              label="What is it about?"
              value={draft.category}
              options={(settings?.categories ?? []).map((c) => ({ value: c, label: c }))}
              onSelect={set("category")}
              placeholder="Choose one"
            />
            <Field
              label="What happened?"
              value={draft.details}
              onChangeText={set("details")}
              placeholder="Tell us in your own words."
              autoCapitalize="sentences"
              multiline
            />
            <Field
              label="When did it happen? (optional)"
              value={draft.happenedWhen ?? ""}
              onChangeText={set("happenedWhen")}
              autoCapitalize="sentences"
            />
            <Field
              label="Who was involved? (optional)"
              value={draft.peopleInvolved ?? ""}
              onChangeText={set("peopleInvolved")}
              autoCapitalize="sentences"
              multiline
            />
            <Field
              label="What would you like to happen? (optional)"
              value={draft.hopedOutcome ?? ""}
              onChangeText={set("hopedOutcome")}
              autoCapitalize="sentences"
              multiline
            />
          </Card>
        </View>
      </ReadableColumn>
    </Screen>
  );
}
