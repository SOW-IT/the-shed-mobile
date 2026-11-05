import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Btn, Card, ErrorBanner, Muted, MultiSelect, runBusy, SectionTitle } from "@/components/ui";
import { spacing } from "@/theme";

// Which departments handle grievances: their members see every grievance and act on it.
export const GrievanceTeamCard = ({ year }: { year: number }) => {
  const settings = useQuery(api.grievances.settings);
  const structure = useQuery(api.directory.yearStructure, { year });
  const save = useMutation(api.grievances.setDepartments);
  // What the list was when editing began, so a save can't undo someone else's change.
  const [draft, setDraft] = useState<{ base: string[]; picked: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!settings) return null;
  const saved = settings.departments;
  const value = draft?.picked ?? saved;
  const names = [...new Set([...(structure?.departments ?? []).map((d) => d.name), ...saved])].sort();
  const unchanged = value.length === saved.length && value.every((d) => saved.includes(d));
  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle>Grievance team</SectionTitle>
      <Card>
        <Muted>
          Everyone in these departments sees and handles every grievance. Nobody else can, admins
          included. Taking your own department off removes your access.
        </Muted>
        <MultiSelect
          label="Departments"
          values={value}
          options={names.map((name) => ({ label: name, value: name }))}
          onSelect={(picked) => setDraft({ base: draft?.base ?? saved, picked })}
          placeholder="Choose departments…"
        />
        <ErrorBanner message={error} />
        <Btn
          title="Save Grievance Team"
          loading={busy}
          disabled={unchanged || value.length === 0}
          onPress={() =>
            void runBusy(
              busy,
              setBusy,
              setError,
              () => save({ departments: value, expected: draft?.base ?? saved }),
              () => setDraft(null)
            )
          }
        />
      </Card>
    </View>
  );
};
