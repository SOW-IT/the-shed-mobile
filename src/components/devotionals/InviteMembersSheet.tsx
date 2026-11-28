import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Avatar,
  Btn,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Muted,
  SearchField,
  Sheet,
  errorMessage,
} from "@/components/ui";
import { StatusPill } from "@/components/ui/StatusPill";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { useMutation, useQuery } from "convex/react";
import { ReactNode, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { inviteeList } from "./inviteeList";

type Person = { email: string; name: string; photo: string | null };

/** One person: avatar, name and email, with the action or status on the right. */
const PersonRow = ({ person, children }: { person: Person; children: ReactNode }) => {
  const t = useAppTheme();
  return (
    <View style={[styles.personRow, { borderBottomColor: t.separator }]}>
      <Avatar photo={person.photo} name={person.name} size={36} />
      <View style={styles.personInfo}>
        <Text style={[typography.body, { color: t.text, fontWeight: "600" }]} numberOfLines={2}>
          {person.name}
        </Text>
        <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
          {person.email}
        </Text>
      </View>
      {children}
    </View>
  );
};

/** A person who can be invited: the whole row toggles them in or out of the selection. */
const SelectableRow = ({
  person,
  selected,
  disabled,
  onToggle,
}: {
  person: Person;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) => {
  const t = useAppTheme();
  // react-native-web presses on Space only for buttons, so a checkbox row
  // needs its own: one toggle, and no page scroll.
  const spaceToggles =
    Platform.OS === "web"
      ? ({
          onKeyDown: (e: { key: string; repeat?: boolean; preventDefault: () => void }) => {
            if (e.key !== " " && e.key !== "Spacebar") return;
            e.preventDefault();
            if (!disabled && !e.repeat) onToggle();
          },
        } as object)
      : {};
  return (
    <Pressable
      {...spaceToggles}
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      aria-checked={selected}
      aria-disabled={disabled}
      accessibilityLabel={`Invite ${person.name}`}
      testID={`invite-person-${person.email}`}
      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
    >
      <PersonRow person={person}>
        <Ionicons
          name={selected ? "checkmark-circle" : "ellipse-outline"}
          size={28}
          color={selected ? t.primary : t.faint}
        />
      </PersonRow>
    </Pressable>
  );
};

/** The people picked so far, whatever the search shows; tapping one takes them out. */
const SelectedTray = ({
  people,
  disabled,
  onRemove,
}: {
  people: Person[];
  disabled: boolean;
  onRemove: (person: Person) => void;
}) => {
  const t = useAppTheme();
  return (
    <View style={styles.tray} testID="invite-selected">
      {people.map((person) => (
        <Pressable
          key={person.email}
          onPress={() => onRemove(person)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          accessibilityLabel={`Remove ${person.name}`}
          hitSlop={4}
          style={({ pressed }) => [
            styles.trayChip,
            { backgroundColor: t.primarySoft },
            (pressed || disabled) && { opacity: 0.6 },
          ]}
        >
          <Avatar photo={person.photo} name={person.name} size={24} />
          <Text
            style={[typography.caption, styles.trayName, { color: t.dark ? t.text : t.primary }]}
            numberOfLines={1}
          >
            {person.name.split(" ")[0]}
          </Text>
          <Ionicons name="close" size={16} color={t.dark ? t.text : t.primary} />
        </Pressable>
      ))}
    </View>
  );
};

export const InviteMembersSheet = ({
  visible,
  groupId,
  groupName,
  onClose,
}: {
  visible: boolean;
  groupId: Id<"devotionalGroups">;
  groupName: string;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 180);
  const [selected, setSelected] = useState<Person[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const people = useQuery(
    api.devotionalGroups.searchInvitableUsers,
    visible ? { groupId, search: debounced } : "skip"
  );
  // Keep the last results on screen while the next search loads, so the list
  // doesn't empty and the sheet doesn't change height on every keystroke.
  // The search those results answer goes with them, so the empty state names
  // the search it's about and doesn't vanish while the next one loads.
  const [shown, setShown] = useState<{ people: typeof people; search: string } | undefined>(undefined);
  if (people !== undefined && people !== shown?.people) setShown({ people, search: debounced });
  const sendInvite = useMutation(api.devotionalGroups.invite);
  const invitable = (shown?.people ?? []).filter((person) => person.status === "none");
  const already = (shown?.people ?? []).filter((person) => person.status !== "none");
  const isSelected = (email: string) => selected.some((person) => person.email === email);

  const toggle = (person: Person) => {
    setSent([]);
    setSelected((current) =>
      current.some((p) => p.email === person.email)
        ? current.filter((p) => p.email !== person.email)
        : [...current, person]
    );
  };

  const handleSend = async () => {
    setError(null);
    setSending(true);
    const invited: string[] = [];
    const failed: Person[] = [];
    let firstError: string | null = null;
    for (const person of selected) {
      try {
        await sendInvite({ groupId, email: person.email });
        invited.push(person.name);
      } catch (e) {
        failed.push(person);
        firstError ??= errorMessage(e);
      }
    }
    setSending(false);
    setSelected(failed);
    setSent(invited);
    if (firstError) setError(firstError);
  };

  const handleClose = () => {
    // Invites already on their way would otherwise land in the next opening's
    // state; the sheet stays open until they're done (a few seconds at most).
    if (sending) return;
    setSearch("");
    setSelected([]);
    setSent([]);
    setError(null);
    setShown(undefined);
    onClose();
  };

  const count = selected.length;
  const footer = (
    <Btn
      title={count === 0 ? "Select people to invite" : `Invite ${count} ${count === 1 ? "person" : "people"}`}
      icon="paper-plane-outline"
      disabled={count === 0 || sending}
      loading={sending}
      onPress={() => void handleSend()}
    />
  );

  return (
    <Sheet visible={visible} title="Invite Members" onClose={handleClose} footer={footer}>
      <View style={styles.wrap}>
        <Muted>
          Invite people to {groupName}. They get a notification and join once they accept.
        </Muted>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search people"
          loading={visible && people === undefined}
        />
        {selected.length > 0 ? <SelectedTray people={selected} disabled={sending} onRemove={toggle} /> : null}
        {sent.length > 0 ? (
          <View
            style={[styles.sent, { backgroundColor: t.successSoft }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            testID="invite-sent"
          >
            <Ionicons name="checkmark-circle" size={18} color={t.success} />
            <Text style={[typography.caption, { color: t.success, flex: 1, fontWeight: "600" }]}>
              Invited {inviteeList(sent)}
            </Text>
          </View>
        ) : null}
        <ErrorBanner message={error} />
        {visible && shown === undefined ? <LoadingState /> : null}
        {shown && shown.people?.length === 0 ? (
          shown.search.trim() ? (
            <EmptyState
              icon="search-outline"
              title="No people found"
              message={`Nobody matches "${shown.search.trim()}". Try a first name, surname or email.`}
            />
          ) : (
            <EmptyState
              icon="people-outline"
              title="No one to invite yet"
              message="People show up here once they've signed in to The Shed."
            />
          )
        ) : null}
        {invitable.length > 0 ? (
          <View style={styles.section}>
            <Text style={[typography.label, { color: t.muted }]}>
              Add to the group ({invitable.length})
            </Text>
            {invitable.map((person) => (
              <SelectableRow
                key={person.email}
                person={person}
                selected={isSelected(person.email)}
                disabled={sending}
                onToggle={() => toggle(person)}
              />
            ))}
          </View>
        ) : null}
        {already.length > 0 ? (
          <View style={styles.section}>
            <Text style={[typography.label, { color: t.muted }]}>
              Already in the group ({already.length})
            </Text>
            {already.map((person) => (
              <PersonRow key={person.email} person={person}>
                {person.status === "member" ? (
                  <StatusPill label="Member" tone="done" />
                ) : (
                  <StatusPill label="Invited" tone="waiting" />
                )}
              </PersonRow>
            ))}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  section: { gap: spacing.xs },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 56,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  personInfo: { flex: 1, minWidth: 0, gap: 1 },
  tray: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  trayChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingLeft: 6,
    paddingRight: 10,
    borderRadius: radius.full,
    maxWidth: "100%",
  },
  trayName: { fontWeight: "700", flexShrink: 1 },
  sent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
});
