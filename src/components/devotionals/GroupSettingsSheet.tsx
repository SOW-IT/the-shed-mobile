import {
  Avatar,
  Btn,
  Chip,
  ConfirmDialog,
  ErrorBanner,
  Muted,
  Row,
  Sheet,
  errorMessage,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";
import {
  formatGroupDateRange,
  SHARING_LEVEL_LABELS,
  type DevotionalSharingLevel,
} from "@shared/devotionalGroups";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

type MemberItem = {
  email: string;
  name: string;
  photo: string | null;
  isOwner: boolean;
  isMe: boolean;
};

type InviteItem = {
  email: string;
  name: string;
  photo: string | null;
  invitedAt: number;
};

export const GroupSettingsSheet = ({
  visible,
  group,
  onEdit,
  onInvite,
  onRemoveMember,
  onDeleteGroup,
  onLeaveGroup,
  onClose,
}: {
  visible: boolean;
  group: {
    name: string;
    startDate: string;
    endDate: string;
    sharingLevel: DevotionalSharingLevel;
    ownerName: string;
    isOwner: boolean;
    members: MemberItem[];
    pendingInvites: InviteItem[];
  };
  onEdit: () => void;
  onInvite: () => void;
  onRemoveMember: (email: string) => Promise<void>;
  onDeleteGroup: () => Promise<void>;
  onLeaveGroup: () => Promise<void>;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  const [error, setError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ email: string; name: string; pending: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const runRemove = async (email: string) => {
    setError(null);
    setBusyEmail(email);
    try {
      await onRemoveMember(email);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyEmail(null);
    }
  };

  return (
    <>
      <Sheet visible={visible} title={group.isOwner ? "Group settings" : "Group info"} onClose={onClose}>
        <View style={styles.wrap}>
          <View style={styles.summary}>
            <Text style={[typography.headline, { color: t.text }]}>{group.name}</Text>
            <Muted>
              {formatGroupDateRange(group.startDate, group.endDate)} · {SHARING_LEVEL_LABELS[group.sharingLevel]}
            </Muted>
          </View>

          {group.isOwner ? (
            <Row spread>
              <Btn
                title="Edit group"
                variant="tonal"
                icon="create-outline"
                onPress={() => {
                  onClose();
                  onEdit();
                }}
              />
              <Btn
                title="Invite Members"
                variant="primary"
                icon="person-add-outline"
                onPress={() => {
                  onClose();
                  onInvite();
                }}
              />
            </Row>
          ) : null}

          <ErrorBanner message={error} />

          <View style={styles.section}>
            <Text style={[typography.label, { color: t.muted }]}>
              Members ({group.members.length})
            </Text>
            {group.members.map((member) => (
              <View
                key={member.email}
                style={[styles.personRow, { borderBottomColor: t.separator }]}
              >
                <Avatar photo={member.photo} name={member.name} size={34} />
                <View style={styles.personInfo}>
                  <Text style={[typography.body, { color: t.text, fontWeight: "600" }]} numberOfLines={1}>
                    {member.name}
                    {member.isMe ? " (You)" : ""}
                  </Text>
                </View>
                {member.isOwner ? (
                  <Chip>Owner</Chip>
                ) : group.isOwner ? (
                  <Btn
                    title="Remove"
                    variant="ghost"
                    loading={busyEmail === member.email}
                    disabled={busyEmail !== null}
                    onPress={() =>
                      setConfirmRemove({ email: member.email, name: member.name, pending: false })
                    }
                  />
                ) : null}
              </View>
            ))}
          </View>

          {group.isOwner && group.pendingInvites.length > 0 ? (
            <View style={styles.section}>
              <Text style={[typography.label, { color: t.muted }]}>
                Pending invites ({group.pendingInvites.length})
              </Text>
              {group.pendingInvites.map((invite) => (
                <View
                  key={invite.email}
                  style={[styles.personRow, { borderBottomColor: t.separator }]}
                >
                  <Avatar photo={invite.photo} name={invite.name} size={34} />
                  <View style={styles.personInfo}>
                    <Text style={[typography.body, { color: t.text, fontWeight: "600" }]} numberOfLines={1}>
                      {invite.name}
                    </Text>
                    <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
                      Invited
                    </Text>
                  </View>
                  <Btn
                    title="Cancel"
                    variant="ghost"
                    loading={busyEmail === invite.email}
                    disabled={busyEmail !== null}
                    onPress={() =>
                      setConfirmRemove({ email: invite.email, name: invite.name, pending: true })
                    }
                  />
                </View>
              ))}
            </View>
          ) : null}

          <View style={[styles.dangerWrap, { borderTopColor: t.separator }]}>
            {group.isOwner ? (
              <Btn
                title="Delete group"
                variant="danger"
                icon="trash-outline"
                onPress={() => setConfirmDelete(true)}
              />
            ) : (
              <Btn
                title="Leave group"
                variant="danger"
                icon="exit-outline"
                onPress={() => setConfirmLeave(true)}
              />
            )}
          </View>
        </View>
      </Sheet>

      <ConfirmDialog
        visible={confirmRemove !== null}
        title={confirmRemove?.pending ? "Cancel invite?" : "Remove member?"}
        message={
          confirmRemove?.pending
            ? `${confirmRemove.name} won't be able to join this group.`
            : `${confirmRemove?.name ?? "This person"} will lose access to this group immediately.`
        }
        confirmLabel={confirmRemove?.pending ? "Cancel invite" : "Remove"}
        onConfirm={() => {
          if (confirmRemove) void runRemove(confirmRemove.email);
        }}
        onClose={() => setConfirmRemove(null)}
      />

      <ConfirmDialog
        visible={confirmDelete}
        title="Delete group?"
        message="Everyone will lose access to this group immediately. Your own devotionals stay saved."
        confirmLabel="Delete group"
        onConfirm={() => {
          void onDeleteGroup().catch((e: unknown) => setError(errorMessage(e)));
        }}
        onClose={() => setConfirmDelete(false)}
      />

      <ConfirmDialog
        visible={confirmLeave}
        title="Leave group?"
        message="You'll stop sharing devotional progress with this group."
        confirmLabel="Leave group"
        onConfirm={() => {
          void onLeaveGroup().catch((e: unknown) => setError(errorMessage(e)));
        }}
        onClose={() => setConfirmLeave(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  summary: { gap: 2 },
  section: { gap: spacing.xs },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  personInfo: { flex: 1, minWidth: 0, gap: 1 },
  dangerWrap: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
