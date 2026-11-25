import { SignInPrompt } from "@/components/SignInPrompt";
import {
  Avatar,
  Btn,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  IconButton,
  LoadingState,
  Muted,
  Screen,
  type ToastState,
  errorMessage,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { monthGrid, shiftMonth } from "@shared/calendar";
import {
  completionTier,
  formatGroupDateRange,
  initialGroupMonth,
  INVITE_SHARING_NOTE,
  isDateInRange,
  monthOverlapsRange,
  monthWithinRange,
  SHARING_LEVEL_LABELS,
} from "@shared/devotionalGroups";
import { isFutureDevotionalDate, todayDevotionalDate } from "@shared/devotionals";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { GroupFormSheet, type GroupFormValues } from "./GroupFormSheet";
import { GroupSettingsSheet } from "./GroupSettingsSheet";
import { InviteMembersSheet } from "./InviteMembersSheet";

const WEEKDAYS = [
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
  { key: "sun", label: "S" },
] as const;

const monthLabel = (year: number, month: number) =>
  new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );

const dayHeading = (key: string, today: string) => {
  const [y, m, d] = key.split("-").map(Number);
  const label = new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
  return key === today ? `Today · ${label}` : label;
};

const fullDateLabel = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
};

export const DevotionalGroupScreen = ({
  groupId,
  onBack,
}: {
  groupId: Id<"devotionalGroups">;
  onBack: () => void;
}) => {
  const t = useAppTheme();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const today = todayDevotionalDate();

  const group = useQuery(
    api.devotionalGroups.getGroup,
    isAuthenticated ? { groupId, today } : "skip"
  );

  const [periodOverride, setPeriodOverride] = useState<{ year: number; month: number } | null>(null);
  const [selectedDayOverride, setSelectedDayOverride] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const respondInvite = useMutation(api.devotionalGroups.respondInvite);
  const updateGroup = useMutation(api.devotionalGroups.update);
  const removeMember = useMutation(api.devotionalGroups.removeMember);
  const removeGroup = useMutation(api.devotionalGroups.removeGroup);
  const leaveGroup = useMutation(api.devotionalGroups.leave);
  const markRead = useMutation(api.notifications.markReadForDevotionalGroup);

  const groupKind = group?.kind ?? null;
  useEffect(() => {
    if (!isAuthenticated || !groupKind) return;
    void markRead({ groupId }).catch(() => {});
  }, [isAuthenticated, groupKind, groupId, markRead]);

  const isMember = group?.kind === "member";
  const defaultPeriod = isMember
    ? initialGroupMonth(today, group.startDate, group.endDate)
    : (() => {
        const [y, m] = today.split("-").map(Number);
        return { year: y, month: m };
      })();
  const activePeriod =
    periodOverride &&
    isMember &&
    monthOverlapsRange(periodOverride.year, periodOverride.month, group.startDate, group.endDate)
      ? periodOverride
      : defaultPeriod;

  const defaultSelectedDay = isMember
    ? isDateInRange(today, group.startDate, group.endDate)
      ? today
      : today > group.endDate
        ? group.endDate
        : null
    : null;
  const selectedDay =
    selectedDayOverride &&
    isMember &&
    isDateInRange(selectedDayOverride, group.startDate, group.endDate) &&
    !isFutureDevotionalDate(selectedDayOverride, today)
      ? selectedDayOverride
      : defaultSelectedDay;

  const progress = useQuery(
    api.devotionalGroups.monthProgress,
    isAuthenticated && isMember
      ? { groupId, year: activePeriod.year, month: activePeriod.month }
      : "skip"
  );

  const day = useQuery(
    api.devotionalGroups.dayDetail,
    isAuthenticated && isMember && selectedDay ? { groupId, date: selectedDay } : "skip"
  );

  if (isLoading) {
    return (
      <Screen title="Group" onBack={onBack}>
        <LoadingState />
      </Screen>
    );
  }

  if (!isAuthenticated) {
    return (
      <Screen title="Group" onBack={onBack}>
        <SignInPrompt what="page" />
      </Screen>
    );
  }

  if (group === undefined) {
    return (
      <Screen title="Group" onBack={onBack}>
        <LoadingState />
      </Screen>
    );
  }

  if (group === null) {
    return (
      <Screen title="Group" onBack={onBack}>
        <EmptyState
          icon="people-outline"
          title="Group not found"
          message="You may no longer have access to this group."
          action={{ label: "Back to Devotionals", onPress: onBack }}
        />
      </Screen>
    );
  }

  if (group.kind === "invited") {
    const respond = async (accept: boolean) => {
      setError(null);
      setResponding(true);
      try {
        await respondInvite({ groupId, accept });
        if (!accept) onBack();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setResponding(false);
      }
    };

    return (
      <Screen title={group.name} onBack={onBack}>
        <Card style={styles.inviteCard}>
          <View style={styles.inviteHeader}>
            <View style={[styles.inviteIcon, { backgroundColor: t.primarySoft }]}>
              <Ionicons name="people" size={24} color={t.dark ? t.text : t.primary} />
            </View>
            <View style={styles.inviteText}>
              <Text style={[typography.title, { color: t.text }]}>{group.name}</Text>
              <Muted>Invited by {group.ownerName}</Muted>
            </View>
          </View>
          <Muted>{INVITE_SHARING_NOTE}</Muted>
          <ErrorBanner message={error} />
          <View style={styles.inviteButtons}>
            <Btn
              title="Accept"
              loading={responding}
              onPress={() => void respond(true)}
            />
            <Btn
              title="Decline"
              variant="ghost"
              disabled={responding}
              onPress={() => void respond(false)}
            />
          </View>
        </Card>
      </Screen>
    );
  }

  const rangeBounds = monthWithinRange(
    activePeriod.year,
    activePeriod.month,
    group.startDate,
    group.endDate
  );

  const stepMonth = (dir: -1 | 1) => {
    if (dir === -1 && !rangeBounds.hasPrev) return;
    if (dir === 1 && !rangeBounds.hasNext) return;
    setPeriodOverride(shiftMonth(activePeriod.year, activePeriod.month, dir));
  };

  const todayInRange = isDateInRange(today, group.startDate, group.endDate);
  const todayDone = group.todayDone ?? 0;
  const todayTotal = group.todayTotal ?? group.memberCount;
  const todayRatio = todayTotal > 0 ? Math.min(1, todayDone / todayTotal) : 0;
  const todayAllDone = todayInRange && todayTotal > 0 && todayDone >= todayTotal;

  const handleEdit = async (values: GroupFormValues) => {
    await updateGroup({ groupId, ...values });
    setToast({ text: "Group updated" });
  };

  return (
    <Screen
      title={group.name}
      subtitle={`${formatGroupDateRange(group.startDate, group.endDate)} · ${SHARING_LEVEL_LABELS[group.sharingLevel]}`}
      onBack={onBack}
      toast={toast}
      headerRight={
        <View style={styles.headerActions}>
          {group.isOwner ? (
            <IconButton
              name="person-add-outline"
              accessibilityLabel="Invite Members"
              onPress={() => setInviteOpen(true)}
            />
          ) : null}
          <IconButton
            name={group.isOwner ? "settings-outline" : "people-outline"}
            accessibilityLabel={group.isOwner ? "Group settings" : "Group info"}
            onPress={() => setSettingsOpen(true)}
          />
        </View>
      }
    >
      <Card style={styles.todayCard} >
        {todayInRange ? (
          <>
            <View style={styles.todayTop} testID="group-today-progress">
              <View style={styles.todayNumbers}>
                <Text style={[typography.title, { color: t.text }]}>
                  {todayDone} of {todayTotal} done today
                </Text>
                <Text style={[typography.caption, { color: todayAllDone ? t.success : t.muted }]}>
                  {todayAllDone
                    ? "Everyone is done today"
                    : `${Math.round(todayRatio * 100)}% complete`}
                </Text>
              </View>
              {todayAllDone ? (
                <View style={[styles.doneBadge, { backgroundColor: t.devoCalendar.full.bg }]}>
                  <Ionicons name="checkmark" size={18} color={t.devoCalendar.full.text} />
                </View>
              ) : null}
            </View>
            <View style={[styles.progressTrack, { backgroundColor: t.ghost }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(todayRatio * 100)}%`,
                    backgroundColor: todayAllDone ? t.devoCalendar.full.bg : t.primary,
                  },
                ]}
              />
            </View>
          </>
        ) : (
          <View style={styles.todayNumbers}>
            <Text style={[typography.headline, { color: t.text }]}>
              {today < group.startDate
                ? `Starts ${fullDateLabel(group.startDate)}`
                : `Ended ${fullDateLabel(group.endDate)}`}
            </Text>
            <Muted>
              {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
            </Muted>
          </View>
        )}

        <View style={styles.todayActions}>
          {todayInRange ? (
            group.meDoneToday ? (
              <View style={styles.meDoneRow}>
                <Ionicons name="checkmark-circle" size={16} color={t.success} />
                <Text style={[typography.caption, { color: t.success, fontWeight: "700" }]}>
                  You&apos;re done today
                </Text>
              </View>
            ) : (
              <Btn
                title="Log today"
                icon="book-outline"
                onPress={() => router.push(`/devotionals/${today}`)}
              />
            )
          ) : null}
          {group.isOwner ? (
            <Btn
              title="Invite Members"
              variant="tonal"
              icon="person-add-outline"
              onPress={() => setInviteOpen(true)}
            />
          ) : null}
        </View>
      </Card>

      <Card style={styles.calendarCard}>
        <View style={styles.monthHeader}>
          <IconButton
            name="chevron-back"
            size={36}
            accessibilityLabel="Previous month"
            disabled={!rangeBounds.hasPrev}
            onPress={() => stepMonth(-1)}
          />
          <Text style={[typography.headline, styles.monthTitle, { color: t.text }]} numberOfLines={1}>
            {monthLabel(activePeriod.year, activePeriod.month)}
          </Text>
          <IconButton
            name="chevron-forward"
            size={36}
            accessibilityLabel="Next month"
            disabled={!rangeBounds.hasNext}
            onPress={() => stepMonth(1)}
          />
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((w) => (
            <Text key={w.key} style={[styles.weekday, typography.caption, { color: t.faint }]}>
              {w.label}
            </Text>
          ))}
        </View>

        <View style={styles.grid} testID="group-calendar-grid">
          {monthGrid(activePeriod.year, activePeriod.month).map((week) => (
            <View key={week[0].key} style={styles.weekRow}>
              {week.map((cell) => {
                const inRange = cell.inMonth && isDateInRange(cell.key, group.startDate, group.endDate);
                const future = isFutureDevotionalDate(cell.key, today);
                const total = progress?.dayTotals[cell.key] ?? group.memberCount;
                const done = progress?.doneCounts[cell.key] ?? 0;
                const tier = completionTier(done, total, future);
                const palette = t.devoCalendar[tier];
                const isToday = cell.key === today;
                const isSelected = cell.key === selectedDay;
                const isFull = inRange && !future && tier === "full";
                const tappable = inRange && !future;

                const glowStyle = isFull
                  ? Platform.OS === "web"
                    ? { boxShadow: `0px 0px 10px ${t.devoCalendar.full.glow}` }
                    : {
                        shadowColor: t.devoCalendar.full.bg,
                        shadowOpacity: 0.4,
                        shadowRadius: 6,
                        shadowOffset: { width: 0, height: 1 },
                        elevation: 3,
                      }
                  : null;

                return (
                  <Pressable
                    key={cell.key}
                    disabled={!tappable}
                    onPress={() => setSelectedDayOverride(cell.key)}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !tappable, selected: isSelected }}
                    accessibilityLabel={
                      inRange
                        ? future
                          ? `${fullDateLabel(cell.key)}, upcoming`
                          : `${fullDateLabel(cell.key)}, ${done} of ${total} done`
                        : fullDateLabel(cell.key)
                    }
                    testID={`group-day-${cell.key}`}
                    style={({ pressed }) => [
                      styles.dayCell,
                      inRange
                        ? {
                            backgroundColor: palette.bg,
                            borderColor: isSelected
                              ? t.text
                              : isToday
                                ? t.primary
                                : palette.border,
                            borderWidth: isSelected ? 2 : isToday ? 1.5 : 1,
                          }
                        : styles.outOfRangeCell,
                      glowStyle,
                      pressed && tappable && { opacity: 0.72 },
                    ]}
                  >
                    <View style={styles.dayTopRow}>
                      <Text
                        style={[
                          styles.dayNumText,
                          {
                            color: inRange ? palette.text : t.faint,
                            opacity: inRange ? 1 : 0.3,
                            fontWeight: isToday || isFull ? "800" : "600",
                          },
                        ]}
                      >
                        {cell.day}
                      </Text>
                      {isFull ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={11}
                          color={t.devoCalendar.full.text}
                        />
                      ) : null}
                    </View>
                    {inRange && !future ? (
                      <Text
                        style={[styles.ratioText, { color: palette.subtext }]}
                        numberOfLines={1}
                      >
                        {done}/{total}
                      </Text>
                    ) : (
                      <View style={styles.ratioPlaceholder} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </Card>

      {selectedDay ? (
        <Card style={styles.detailCard} >
          <View style={styles.detailHeader} testID="group-day-detail">
            <Text style={[typography.section, { color: t.text, flex: 1 }]}>
              {dayHeading(selectedDay, today)}
            </Text>
            {day ? (
              <Chip>
                {`${day.doneCount} of ${day.totalMembers} done`}
              </Chip>
            ) : null}
          </View>

          {day === undefined ? (
            <Muted>Loading...</Muted>
          ) : day === null ? (
            <Muted>Select a day in the group range.</Muted>
          ) : (
            <View style={styles.memberDetailList}>
              {day.members.map((member) => (
                <View
                  key={member.email}
                  testID={`day-member-${member.email}`}
                  style={[styles.memberDetailRow, { borderTopColor: t.separator }]}
                >
                  <View style={styles.memberHeaderRow}>
                    <Avatar photo={member.photo} name={member.name} size={34} />
                    <View style={styles.memberNameWrap}>
                      <Text style={[typography.body, { color: t.text, fontWeight: "700" }]} numberOfLines={1}>
                        {member.name}
                        {member.isMe ? " (You)" : ""}
                      </Text>
                      <Text
                        style={[
                          typography.caption,
                          { color: member.done ? t.success : t.muted },
                        ]}
                      >
                        {member.done ? "Done" : "Not done"}
                      </Text>
                    </View>
                    <Ionicons
                      name={member.done ? "checkmark-circle" : "ellipse-outline"}
                      size={22}
                      color={member.done ? t.success : t.faint}
                    />
                  </View>

                  {member.passage ? (
                    <View style={[styles.passageBox, { backgroundColor: t.inputBackground, borderColor: t.border }]}>
                      <Ionicons name="book-outline" size={14} color={t.primary} />
                      <Text style={[typography.label, { color: t.text, flex: 1 }]}>
                        {member.passage}
                      </Text>
                    </View>
                  ) : null}

                  {member.notes ? (
                    <View style={styles.textBlock}>
                      <Text style={[typography.caption, { color: t.muted, fontWeight: "700" }]}>
                        Notes
                      </Text>
                      <Text style={[typography.body, { color: t.text }]}>{member.notes}</Text>
                    </View>
                  ) : null}

                  {member.prayer ? (
                    <View style={styles.textBlock}>
                      <Text style={[typography.caption, { color: t.muted, fontWeight: "700" }]}>
                        Prayer
                      </Text>
                      <Text style={[typography.body, { color: t.text }]}>{member.prayer}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </Card>
      ) : null}

      <InviteMembersSheet
        visible={inviteOpen}
        groupId={groupId}
        onClose={() => setInviteOpen(false)}
      />

      <GroupSettingsSheet
        visible={settingsOpen}
        group={group}
        onEdit={() => setEditOpen(true)}
        onInvite={() => setInviteOpen(true)}
        onRemoveMember={async (email) => {
          await removeMember({ groupId, email });
          setToast({ text: "Removed" });
        }}
        onDeleteGroup={async () => {
          await removeGroup({ groupId });
          setSettingsOpen(false);
          onBack();
        }}
        onLeaveGroup={async () => {
          await leaveGroup({ groupId });
          setSettingsOpen(false);
          onBack();
        }}
        onClose={() => setSettingsOpen(false)}
      />

      <GroupFormSheet
        visible={editOpen}
        title="Edit group"
        submitLabel="Save changes"
        initial={{
          name: group.name,
          startDate: group.startDate,
          endDate: group.endDate,
          sharingLevel: group.sharingLevel,
        }}
        onSubmit={handleEdit}
        onClose={() => setEditOpen(false)}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  inviteCard: { gap: spacing.md },
  inviteHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  inviteIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteText: { flex: 1, gap: 2 },
  inviteButtons: { flexDirection: "row", gap: spacing.sm },
  todayCard: { gap: spacing.sm },
  todayTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  todayNumbers: { flex: 1, gap: 2 },
  doneBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: { height: 10, borderRadius: radius.full, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: radius.full },
  todayActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  meDoneRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  calendarCard: { gap: spacing.sm },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  monthTitle: { flex: 1, textAlign: "center" },
  weekRow: { flexDirection: "row", gap: 4 },
  weekday: { flex: 1, textAlign: "center", fontWeight: "700" },
  grid: { gap: 4 },
  dayCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: radius.sm + 2,
    minHeight: 46,
    gap: 2,
  },
  outOfRangeCell: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "transparent",
  },
  dayTopRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  dayNumText: { fontSize: 13, lineHeight: 16 },
  ratioText: { fontSize: 10.5, fontWeight: "700", lineHeight: 13 },
  ratioPlaceholder: { height: 13 },
  detailCard: { gap: spacing.sm },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  memberDetailList: { gap: 0 },
  memberDetailRow: {
    gap: spacing.xs + 2,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  memberHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  memberNameWrap: { flex: 1, minWidth: 0, gap: 1 },
  passageBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    borderWidth: 1,
    borderRadius: radius.sm + 2,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  textBlock: { gap: 2, paddingLeft: 2 },
});
