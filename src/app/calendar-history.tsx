import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { auditHeadline, type CalendarAuditAction } from "@shared/calendarAudit";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import { backOr } from "@/lib/goBack";
import { sydneyDateTime } from "@/lib/sydneyTime";
import { EmptyState, Facts, LoadingState, LoadMoreFooter, Screen } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const PAGE_SIZE = 30;

type HistoryRow = NonNullable<FunctionReturnType<typeof api.calendarAudit.list>>["page"][number];

const ACTION_ICON: Record<CalendarAuditAction, keyof typeof Ionicons.glyphMap> = {
  added: "add-circle-outline",
  edited: "create-outline",
  removed: "trash-outline",
  attendance: "people-outline",
};

export default function CalendarHistoryScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const me = useQuery(api.directory.me);
  const isAdmin = !!me?.isAdmin;
  const { rows, hasMore, loadMore, loadingFirstPage, loadingMore } = usePagedQuery(api.calendarAudit.list, {
    scopeKey: isAdmin ? `calendar-history:${me?.email}` : "not-admin",
    args: (cursor) => (isAdmin ? { paginationOpts: { numItems: PAGE_SIZE, cursor } } : "skip"),
    rowsOf: (page) => page.page,
    keyOf: (row: HistoryRow) => row.id,
  });
  const goBack = () => backOr(router, "/calendar");

  if (me === undefined || (isAdmin && loadingFirstPage)) {
    return (
      <Screen title="Calendar history" onBack={goBack}>
        <LoadingState />
      </Screen>
    );
  }

  if (!isAdmin) {
    return (
      <Screen title="Calendar history" onBack={goBack}>
        <EmptyState
          icon="lock-closed-outline"
          title="Admins only"
          message="Only admins can see who changed the calendar."
        />
      </Screen>
    );
  }

  const renderRow = (row: HistoryRow) => {
    const open = row.eventId ? () => router.push(`/attendance/event/${row.eventId}`) : undefined;
    return (
      <Pressable
        key={row.id}
        onPress={open}
        disabled={!open}
        accessibilityRole={open ? "button" : undefined}
        style={({ pressed }) => [
          styles.row,
          t.surfaceEdge,
          { backgroundColor: t.card },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: t.ghost }]}>
          <Ionicons name={ACTION_ICON[row.action]} size={18} color={t.ghostText} />
        </View>
        <View style={styles.rowText}>
          <Text style={[typography.headline, { color: t.text }]}>{auditHeadline(row.action, row.name)}</Text>
          {row.changes.length > 0 ? (
            row.changes.map((change) => (
              <Text key={change.field} style={[typography.caption, { color: t.muted }]}>
                <Text style={{ fontWeight: "700" }}>{change.field}: </Text>
                {change.from} → {change.to}
              </Text>
            ))
          ) : (
            <Text style={[typography.caption, { color: t.muted }]}>{row.when}</Text>
          )}
          <Facts parts={[row.actorName, sydneyDateTime(row.at)]} style={{ color: t.faint }} />
        </View>
        {open ? <Ionicons name="chevron-forward" size={18} color={t.faint} /> : null}
      </Pressable>
    );
  };

  return (
    <Screen title="Calendar history" onBack={goBack} onEndReached={hasMore ? loadMore : undefined}>
      {rows.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title="No changes yet"
        />
      ) : (
        <>
          {rows.map(renderRow)}
          <LoadMoreFooter loadingMore={loadingMore} hasMore={hasMore} onLoadMore={loadMore} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
});
