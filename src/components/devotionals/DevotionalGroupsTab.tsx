import { Btn, Card, Chip, EmptyState, ErrorBanner, Muted, SectionTitle, errorMessage } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  formatGroupDateRange,
  INVITE_SHARING_NOTE,
  SHARING_LEVEL_LABELS,
} from "@shared/devotionalGroups";
import { todayDevotionalDate } from "@shared/devotionals";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { GroupFormSheet, type GroupFormValues } from "./GroupFormSheet";
import { SharingSettingsSheet } from "./SharingSettingsSheet";

const PAST_PAGE = 10;

export const DevotionalGroupsTab = () => {
  const t = useAppTheme();
  const router = useRouter();
  const today = todayDevotionalDate();
  const summary = useQuery(api.devotionalGroups.mySummary, { today });
  const past = usePaginatedQuery(api.devotionalGroups.pastGroups, { today }, { initialNumItems: PAST_PAGE });
  const pastGroups = past.results;
  const createGroup = useMutation(api.devotionalGroups.create);
  const respondInvite = useMutation(api.devotionalGroups.respondInvite);

  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (values: GroupFormValues) => {
    const { groupId } = await createGroup(values);
    router.push(`/devotionals/groups/${groupId}`);
  };

  const handleInviteAction = async (groupId: Id<"devotionalGroups">, accept: boolean) => {
    setError(null);
    setRespondingId(groupId);
    try {
      await respondInvite({ groupId, accept });
      if (accept) router.push(`/devotionals/groups/${groupId}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRespondingId(null);
    }
  };

  const personalLabel = summary?.personalSharingLevel
    ? SHARING_LEVEL_LABELS[summary.personalSharingLevel]
    : "Group default";

  return (
    <View style={styles.stack} testID="devotional-groups-tab">
      <View style={styles.actionsRow}>
        <Btn
          title="Create group"
          icon="add"
          onPress={() => setCreateOpen(true)}
        />
        <Pressable
          onPress={() => setSettingsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Group sharing settings"
          testID="groups-settings-btn"
          style={({ pressed }) => [
            styles.settingsPill,
            t.surfaceEdge,
            { backgroundColor: t.card },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="settings-outline" size={16} color={t.primary} />
          <Text style={[typography.caption, { color: t.text, fontWeight: "600" }]} numberOfLines={1}>
            Sharing: {personalLabel}
          </Text>
        </Pressable>
      </View>

      <ErrorBanner message={error} />

      {summary === undefined ? (
        <Muted>Loading...</Muted>
      ) : (
        <>
          {summary.invites.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle chip={summary.invites.length}>Invites</SectionTitle>
              {summary.invites.map((invite) => (
                <Card key={invite.groupId} style={styles.inviteCard}>
                  <Pressable
                    onPress={() => router.push(`/devotionals/groups/${invite.groupId}`)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.inviteInfo, pressed && { opacity: 0.75 }]}
                  >
                    <Text style={[typography.headline, { color: t.text }]} numberOfLines={1}>
                      {invite.groupName}
                    </Text>
                    <Muted>Invited by {invite.ownerName}</Muted>
                  </Pressable>
                  <Muted>{INVITE_SHARING_NOTE}</Muted>
                  <View style={styles.inviteActions}>
                    <Btn
                      title="Accept"
                      variant="primary"
                      loading={respondingId === invite.groupId}
                      disabled={respondingId !== null}
                      onPress={() => void handleInviteAction(invite.groupId, true)}
                    />
                    <Btn
                      title="Decline"
                      variant="ghost"
                      disabled={respondingId !== null}
                      onPress={() => void handleInviteAction(invite.groupId, false)}
                    />
                  </View>
                </Card>
              ))}
            </View>
          ) : null}

          {summary.groups.length === 0 && summary.invites.length === 0 && pastGroups.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="No groups yet"
              message="Share daily devotional progress with a group."
              action={{ label: "Create group", onPress: () => setCreateOpen(true) }}
            />
          ) : summary.groups.length > 0 ? (
            <View style={styles.section}>
              {summary.invites.length > 0 || pastGroups.length > 0 ? (
                <SectionTitle chip={summary.groups.length}>Current and upcoming</SectionTitle>
              ) : null}
              {summary.groups.map((group) => {
                const todayTotal = group.todayTotal ?? group.memberCount;
                const ratio =
                  group.todayDone !== null && todayTotal > 0
                    ? Math.min(1, group.todayDone / todayTotal)
                    : null;
                const allDone =
                  group.todayDone !== null &&
                  todayTotal > 0 &&
                  group.todayDone >= todayTotal;
                return (
                  <Pressable
                    key={group.id}
                    onPress={() => router.push(`/devotionals/groups/${group.id}`)}
                    accessibilityRole="button"
                    testID={`devotional-group-card-${group.id}`}
                    style={({ pressed }) => [pressed && { opacity: 0.78 }]}
                  >
                    <Card style={styles.groupCard}>
                      <View style={styles.groupTop}>
                        <View style={styles.groupTitleWrap}>
                          <Text style={[typography.headline, { color: t.text }]} numberOfLines={1}>
                            {group.name}
                          </Text>
                          <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
                            {formatGroupDateRange(group.startDate, group.endDate)}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={t.faint} />
                      </View>

                      <View style={styles.metaRow}>
                        <Chip>
                          {`${group.memberCount} ${group.memberCount === 1 ? "member" : "members"}`}
                        </Chip>
                        <Chip>{SHARING_LEVEL_LABELS[group.sharingLevel]}</Chip>
                        {group.isOwner ? <Chip>Owner</Chip> : null}
                      </View>

                      {group.todayDone !== null && ratio !== null ? (
                        <View style={styles.progressBlock}>
                          <View style={styles.progressTextRow}>
                            <Text
                              style={[
                                typography.caption,
                                {
                                  color: allDone ? t.success : t.text,
                                  fontWeight: "700",
                                },
                              ]}
                            >
                              {group.todayDone} of {todayTotal} done today
                            </Text>
                            {allDone ? (
                              <Ionicons name="checkmark-circle" size={16} color={t.success} />
                            ) : null}
                          </View>
                          <View style={[styles.barTrack, { backgroundColor: t.ghost }]}>
                            <View
                              style={[
                                styles.barFill,
                                {
                                  width: `${Math.round(ratio * 100)}%`,
                                  backgroundColor: allDone ? t.devoCalendar.full.bg : t.primary,
                                },
                              ]}
                            />
                          </View>
                        </View>
                      ) : null}
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {pastGroups.length > 0 ? (
            <View style={styles.section} testID="devotional-past-groups">
              <SectionTitle>Past groups</SectionTitle>
              {pastGroups.map((group) => (
                <Pressable
                  key={group.id}
                  onPress={() => router.push(`/devotionals/groups/${group.id}`)}
                  accessibilityRole="button"
                  testID={`devotional-past-group-${group.id}`}
                  style={({ pressed }) => [pressed && { opacity: 0.78 }]}
                >
                  <Card style={styles.groupCard}>
                    <View style={styles.groupTop}>
                      <View style={styles.groupTitleWrap}>
                        <Text style={[typography.headline, { color: t.text }]} numberOfLines={1}>
                          {group.name}
                        </Text>
                        <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
                          {formatGroupDateRange(group.startDate, group.endDate)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={t.faint} />
                    </View>
                    <View style={styles.metaRow}>
                      <Chip>
                        {`${group.memberCount} ${group.memberCount === 1 ? "member" : "members"}`}
                      </Chip>
                      {group.isOwner ? <Chip>Owner</Chip> : null}
                    </View>
                  </Card>
                </Pressable>
              ))}
              {past.status === "CanLoadMore" || past.status === "LoadingMore" ? (
                <Btn
                  title="Show more"
                  variant="ghost"
                  loading={past.status === "LoadingMore"}
                  onPress={() => past.loadMore(PAST_PAGE)}
                />
              ) : null}
            </View>
          ) : null}
        </>
      )}

      <GroupFormSheet
        visible={createOpen}
        title="New group"
        submitLabel="Create group"
        onSubmit={handleCreate}
        onClose={() => setCreateOpen(false)}
      />

      <SharingSettingsSheet
        visible={settingsOpen}
        personalLevel={summary?.personalSharingLevel ?? null}
        onClose={() => setSettingsOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  settingsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: "100%",
  },
  section: { gap: spacing.sm },
  inviteCard: { gap: spacing.sm },
  inviteInfo: { gap: 2 },
  inviteActions: { flexDirection: "row", gap: spacing.sm },
  groupCard: { gap: spacing.sm },
  groupTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupTitleWrap: { flex: 1, gap: 2 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  progressBlock: { gap: spacing.xs },
  progressTextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  barTrack: {
    height: 7,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: radius.full,
  },
});
