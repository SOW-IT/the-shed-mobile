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
  Muted,
  OptionRow,
  OptionSheet,
  runBusy,
  SearchField,
  SectionTitle,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

const MAX_MATCHES = 40;

type Person = { email: string; name: string };

const matches = (person: Person, search: string) => {
  const needle = search.trim().toLowerCase();
  return !needle || person.name.toLowerCase().includes(needle) || person.email.includes(needle);
};

export const AdminsCard = () => {
  const t = useAppTheme();
  const list = useQuery(api.admins.list);
  const save = useMutation(api.admins.set);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!list) return null;
  const chosenEmails = list.chosen.map((person) => person.email);
  const change = (emails: string[]) =>
    runBusy(busy, setBusy, setError, () => save({ emails, expected: chosenEmails }));
  const candidates = list.staff.filter((person) => !chosenEmails.includes(person.email));
  const shown = candidates.filter((person) => matches(person, search)).slice(0, MAX_MATCHES);
  const closePicker = () => {
    setPicking(false);
    setSearch("");
  };
  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle>Admins</SectionTitle>
      <Card>
        <Muted>Admins see every view and can change anything in Admin.</Muted>
        <Text style={[typography.label, { color: t.muted }]}>Always admins</Text>
        {list.fixed.map((person) => (
          <View key={person.email} style={styles.row}>
            <Text style={[typography.body, styles.name, { color: t.text }]}>{person.name}</Text>
            <Text style={[typography.caption, { color: t.muted }]}>{person.reason}</Text>
          </View>
        ))}
        <Text style={[typography.label, { color: t.muted, marginTop: spacing.sm }]}>Chosen by admins</Text>
        {list.chosen.length === 0 ? <Muted>Nobody yet.</Muted> : null}
        {list.chosen.map((person) => (
          <View key={person.email} style={styles.row}>
            <View style={styles.name}>
              <Text style={[typography.body, { color: t.text }]}>{person.name}</Text>
              {person.onStaff ? null : (
                <Text style={[typography.caption, { color: t.warning }]}>
                  No role this year, so not an admin right now
                </Text>
              )}
            </View>
            <IconButton
              name="close"
              accessibilityLabel={`Remove ${person.name} as an admin`}
              disabled={busy}
              onPress={() => setRemoving(person)}
            />
          </View>
        ))}
        <ErrorBanner message={error} />
        <Btn title="Add an admin" icon="person-add-outline" variant="tonal" loading={busy} onPress={() => setPicking(true)} />
      </Card>
      <OptionSheet visible={picking} title="Add an admin" onClose={closePicker}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search staff by name or email" />
        {shown.map((person) => (
          <OptionRow
            key={person.email}
            label={person.name === person.email ? person.email : `${person.name} · ${person.email}`}
            selected={false}
            onPress={() => {
              closePicker();
              void change([...chosenEmails, person.email]);
            }}
          />
        ))}
        {shown.length === 0 ? <Muted>No one on staff this year matches.</Muted> : null}
      </OptionSheet>
      <ConfirmDialog
        visible={removing !== null}
        title={`Remove ${removing?.name ?? ""} as an admin?`}
        message="They'll lose Admin and the admin views straight away."
        confirmLabel="Remove"
        onConfirm={() => {
          if (removing) void change(chosenEmails.filter((email) => email !== removing.email));
        }}
        onClose={() => setRemoving(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 40 },
  name: { flex: 1 },
});
