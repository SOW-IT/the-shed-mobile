import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import {
  Btn,
  Card,
  ConfirmDialog,
  ErrorBanner,
  IconButton,
  LoadingState,
  Muted,
  OptionRow,
  OptionSheet,
  runBusy,
  SearchField,
  SectionTitle,
  Segmented,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

const MAX_MATCHES = 40;

type Person = { email: string; name: string };

const normalEmail = (email: string) => email.trim().toLowerCase();

const matches = (person: Person, search: string) => {
  const needle = search.trim().toLowerCase();
  return !needle || person.name.toLowerCase().includes(needle) || person.email.includes(needle);
};

const PraiseManagersCard = ({
  year,
  emails,
  staff,
  editable,
}: {
  year: number;
  emails: string[];
  staff: Person[];
  editable: boolean;
}) => {
  const t = useAppTheme();
  const add = useMutation(api.admin.addPraiseManager);
  const remove = useMutation(api.admin.removePraiseManager);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const staffByEmail = new Map(staff.map((person) => [normalEmail(person.email), person]));
  const chosen = emails.map((email) => ({
    email,
    name: staffByEmail.get(normalEmail(email))?.name ?? email,
    onStaff: staffByEmail.has(normalEmail(email)),
  }));
  const chosenEmails = new Set(emails.map(normalEmail));
  const shown = staff
    .filter((person) => !chosenEmails.has(normalEmail(person.email)) && matches(person, search))
    .slice(0, MAX_MATCHES);
  const closePicker = () => {
    setPicking(false);
    setSearch("");
  };
  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle>Praise Managers · {year}</SectionTitle>
      <Card>
        <Muted>
          Praise Managers approve, decline, edit and delete Praise List songs, and their own songs go
          straight onto the list. Each staff year has its own, carried over on 1 October.
        </Muted>
        {chosen.length === 0 ? <Muted>Nobody yet.</Muted> : null}
        {chosen.map((person) => (
          <View key={person.email} style={styles.row}>
            <View style={styles.name}>
              <Text style={[typography.body, { color: t.text }]}>{person.name}</Text>
              {person.onStaff ? null : (
                <Text style={[typography.caption, { color: t.warning }]}>
                  No role in {year}, so not a Praise Manager
                </Text>
              )}
            </View>
            {editable ? (
              <IconButton
                name="close"
                accessibilityLabel={`Remove ${person.name} as a Praise Manager`}
                disabled={busy}
                onPress={() => setRemoving(person)}
              />
            ) : null}
          </View>
        ))}
        <ErrorBanner message={error} />
        {editable ? (
          <Btn
            title="Add a Praise Manager"
            icon="person-add-outline"
            variant="tonal"
            loading={busy}
            onPress={() => setPicking(true)}
          />
        ) : null}
      </Card>
      <OptionSheet visible={picking} title="Add a Praise Manager" onClose={closePicker}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search staff by name or email" />
        {shown.map((person) => (
          <OptionRow
            key={person.email}
            label={person.name === person.email ? person.email : `${person.name} · ${person.email}`}
            selected={false}
            onPress={() => {
              closePicker();
              void runBusy(busy, setBusy, setError, () => add({ year, email: person.email }));
            }}
          />
        ))}
        {shown.length === 0 ? <Muted>No one on staff in {year} matches.</Muted> : null}
      </OptionSheet>
      <ConfirmDialog
        visible={removing !== null}
        title={`Remove ${removing?.name ?? ""} as a Praise Manager?`}
        message="They'll stop reviewing songs straight away."
        confirmLabel="Remove"
        onConfirm={() => {
          const person = removing;
          if (person) {
            void runBusy(busy, setBusy, setError, () => remove({ year, email: person.email }));
          }
        }}
        onClose={() => setRemoving(null)}
      />
    </View>
  );
};

export const PraiseManagersTab = ({ currentYear }: { currentYear: number }) => {
  const [year, setYear] = useState(currentYear);
  const structure = useQuery(api.directory.yearStructure, { year });
  const profiles = useQuery(api.admin.listStaffProfiles, { year });
  return (
    <View style={{ gap: spacing.md }}>
      <Segmented
        segments={[currentYear, currentYear + 1].map((option) => ({
          key: String(option),
          label: option === currentYear ? `This year (${option})` : `Next year (${option})`,
        }))}
        active={String(year)}
        onChange={(key) => setYear(Number(key))}
      />
      {structure === undefined || profiles === undefined ? (
        <LoadingState />
      ) : (
        <PraiseManagersCard
          key={year}
          year={year}
          emails={structure?.praiseManagerEmails ?? []}
          staff={(profiles ?? []).map((profile) => ({
            email: profile.email,
            name: profile.name ?? profile.email,
          }))}
          editable
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 40 },
  name: { flex: 1 },
});
