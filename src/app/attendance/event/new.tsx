import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { api } from "@convex/_generated/api";
import { defaultEventWindow, subgroupLabel } from "@shared/rollcall";
import {
  Btn,
  Chip,
  errorMessage,
  Field,
  LoadingState,
  Muted,
  MultiSelect,
  Screen,
} from "@/components/ui";
import { typography, useAppTheme } from "@/theme";

/** Create an event and tag it with one or more sub-groups (collaborative). */
export default function NewEventScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const { subgroup } = useLocalSearchParams<{ subgroup?: string }>();
  const subgroups = useQuery(api.events.subgroups);
  const createEvent = useMutation(api.events.create);

  const [name, setName] = useState("");
  // Preselect the sub-group we came from, if any.
  const [selected, setSelected] = useState<string[]>(subgroup ? [subgroup] : []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (subgroups === undefined) return <LoadingState />;

  const options = subgroups.map((s) => ({ label: subgroupLabel(s), value: s }));
  const collaborative = selected.length > 1;

  const submit = async () => {
    // Guard against rapid double-taps creating duplicate events before the
    // screen navigates away.
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const { dateStart, dateEnd } = defaultEventWindow();
    try {
      const eventId = await createEvent({
        name,
        dateStart,
        dateEnd,
        subgroups: selected,
      });
      router.replace({
        pathname: "/attendance/event/[eventId]",
        params: { eventId },
      });
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  };

  return (
    <Screen title="New event" onBack={() => router.back()}>
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Wednesday Outreach"
      />
      <MultiSelect
        label="Sub-groups"
        values={selected}
        options={options}
        onSelect={setSelected}
        placeholder="Pick one or more"
      />
      <Muted>
        Pick two or more sub-groups to make this a collaborative event — it
        appears in each sub-group&apos;s list and shares one attendance list drawn
        from SOW&apos;s staff for the year.
      </Muted>
      {collaborative ? <Chip label="Collaborative event" /> : null}
      {error ? (
        <Text style={[typography.caption, { color: t.danger }]}>{error}</Text>
      ) : null}
      <Btn
        title="Create event"
        onPress={() => void submit()}
        loading={submitting}
        disabled={submitting || selected.length === 0 || !name.trim()}
      />
    </Screen>
  );
}
