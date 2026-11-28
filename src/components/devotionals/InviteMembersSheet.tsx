import {
  Avatar,
  Btn,
  EmptyState,
  ErrorBanner,
  Muted,
  SearchField,
  Sheet,
  errorMessage,
} from "@/components/ui";
import { StatusPill } from "@/components/ui/StatusPill";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { spacing, typography, useAppTheme } from "@/theme";
import { useMutation, useQuery } from "convex/react";
import { ReactNode, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

type Person = { email: string; name: string; photo: string | null };

/** One person: avatar, name and email, with the action or status on the right. */
const PersonRow = ({ person, children }: { person: Person; children: ReactNode }) => {
  const t = useAppTheme();
  return (
    <View style={[styles.personRow, { borderBottomColor: t.separator }]}>
      <Avatar photo={person.photo} name={person.name} size={36} />
      <View style={styles.personInfo}>
        <Text style={[typography.body, { color: t.text, fontWeight: "600" }]} numberOfLines={1}>
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

const InviteMembersBody = ({
  groupId,
  groupName,
}: {
  groupId: Id<"devotionalGroups">;
  groupName: string;
}) => {
  const t = useAppTheme();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 180);
  const [inviting, setInviting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const people = useQuery(api.devotionalGroups.searchInvitableUsers, {
    groupId,
    search: debounced,
  });
  const sendInvite = useMutation(api.devotionalGroups.invite);
  const invitable = (people ?? []).filter((person) => person.status === "none");
  const already = (people ?? []).filter((person) => person.status !== "none");

  const handleInvite = async (email: string) => {
    setError(null);
    setInviting(email);
    try {
      await sendInvite({ groupId, email });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setInviting(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <Muted>
        Invite people to {groupName}. They get a notification and join once they accept.
      </Muted>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search people"
        loading={people === undefined}
      />
      <ErrorBanner message={error} />
      {people && people.length === 0 ? (
        debounced.trim() ? (
          <EmptyState
            icon="search-outline"
            title="No people found"
            message={`Nobody matches "${debounced.trim()}". Try a first name, surname or email.`}
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
            <PersonRow key={person.email} person={person}>
              <Btn
                title="Invite"
                variant="tonal"
                loading={inviting === person.email}
                disabled={inviting !== null}
                onPress={() => void handleInvite(person.email)}
              />
            </PersonRow>
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
}) => (
  <Sheet visible={visible} title="Invite Members" onClose={onClose}>
    {visible ? <InviteMembersBody groupId={groupId} groupName={groupName} /> : null}
  </Sheet>
);

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  section: { gap: spacing.xs },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  personInfo: { flex: 1, minWidth: 0, gap: 1 },
});
