import Ionicons from "@expo/vector-icons/Ionicons";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, type ScrollViewInstance, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Btn,
  EmptyState,
  LoadingState,
  MultiSelect,
  SearchField,
  SowSpinner,
} from "@/components/ui";
import { FilterBar } from "@/components/attendance/FilterBar";
import { useListTopOnChange } from "@/hooks/useListTopOnChange";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import {
  PAGER_PAGE_BOTTOM_INSET,
  PAGER_PAGE_CONTENT,
  TopBarScrollProps,
  usePagerTopBarInset,
} from "@/components/PagerScreen";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const PAGE_SIZE = 30;

type AuditEntityType =
  | "event"
  | "member"
  | "tag"
  | "metadata"
  | "attendance";

const ENTITY_ICON: Record<AuditEntityType, keyof typeof Ionicons.glyphMap> = {
  event: "calendar-outline",
  member: "person-outline",
  tag: "pricetag-outline",
  metadata: "options-outline",
  attendance: "checkmark-done-outline",
};

const ENTITY_LABEL: Record<AuditEntityType, string> = {
  event: "Events",
  member: "Members",
  tag: "Tags",
  metadata: "Fields",
  attendance: "Roll-call",
};

const timeAgo = (ms: number): string => {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
};

export function AuditTab({
  scrollProps,
  loadMoreRef,
}: {
  scrollProps?: TopBarScrollProps;
  loadMoreRef?: MutableRefObject<(() => void) | null>;
}) {
  const t = useAppTheme();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [entityTypes, setEntityTypes] = useState<AuditEntityType[]>([]);
  const [actorEmails, setActorEmails] = useState<string[]>([]);
  const [eventIds, setEventIds] = useState<Id<"events">[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const convex = useConvex();
  const [options, setOptions] =
    useState<FunctionReturnType<typeof api.attendanceAudit.filterOptions>>();
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [optionsAttempt, setOptionsAttempt] = useState(0);

  useEffect(() => {
    if (!filtersOpen) return;
    let live = true;
    convex.query(api.attendanceAudit.filterOptions, {}).then(
      (next) => {
        if (!live) return;
        setOptions(next);
        setOptionsFailed(false);
      },
      () => {
        if (live) setOptionsFailed(true);
      }
    );
    return () => {
      live = false;
    };
  }, [convex, filtersOpen, optionsAttempt]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(id);
  }, [search]);

  const scopeKey = JSON.stringify([debouncedSearch, entityTypes, actorEmails, eventIds]);
  const listRef = useRef<ScrollViewInstance>(null);
  const onListScrollEnd = useListTopOnChange(listRef, scopeKey);
  const topBarInset = usePagerTopBarInset();
  const {
    rows: accumulated,
    result: page,
    hasMore,
    refreshing,
  } = usePagedQuery(api.attendanceAudit.list, {
    scopeKey,
    args: (cursor) => ({
      search: debouncedSearch || undefined,
      entityTypes: entityTypes.length ? entityTypes : undefined,
      actorEmails: actorEmails.length ? actorEmails : undefined,
      eventIds: eventIds.length ? eventIds : undefined,
      paginationOpts: { numItems: PAGE_SIZE, cursor },
    }),
    rowsOf: (result) => result.page,
    keyOf: (row) => row.id,
    loadMoreRef,
    keepRowsWhileLoading: true,
  });

  const activeFilterCount =
    entityTypes.length + actorEmails.length + eventIds.length;
  const narrowed = activeFilterCount > 0 || debouncedSearch.trim() !== "";

  const entityOptions = useMemo(
    () => [
      ...(Object.keys(ENTITY_LABEL) as AuditEntityType[]).map((k) => ({
        label: ENTITY_LABEL[k],
        value: k,
      })),
    ],
    []
  );

  const actorOptions = useMemo(
    () => [
      ...(options?.actors ?? []).map((a) => ({
        label: a.name,
        value: a.email,
      })),
    ],
    [options]
  );

  const eventOptions = useMemo(
    () => [
      ...(options?.events ?? []).map((e) => ({ label: e.label, value: e.id })),
    ],
    [options]
  );

  return (
    <Animated.ScrollView
      ref={listRef}
      onScrollEndDrag={onListScrollEnd}
      onMomentumScrollEnd={onListScrollEnd}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[0]}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[
        PAGER_PAGE_CONTENT,
        { paddingTop: topBarInset, paddingBottom: PAGER_PAGE_BOTTOM_INSET },
      ]}
      {...scrollProps}
    >
      <View
        style={[styles.stickyControls, { backgroundColor: t.background }]}
      >
      <FilterBar
        count={activeFilterCount}
        open={filtersOpen}
        onToggle={() => setFiltersOpen((open) => !open)}
        onClear={() => {
          setEntityTypes([]);
          setActorEmails([]);
          setEventIds([]);
        }}
      >
        <MultiSelect
          label="Action type"
          values={entityTypes}
          options={entityOptions}
          placeholder="All actions"
          onSelect={(values) => setEntityTypes(values as AuditEntityType[])}
        />
        {optionsFailed ? (
          <View style={styles.optionsStatus}>
            <Text style={[typography.caption, styles.optionsStatusText, { color: t.muted }]}>
              Couldn&apos;t load the people and events to filter by.
            </Text>
            <Btn
              title="Try again"
              variant="ghost"
              onPress={() => {
                setOptionsFailed(false);
                setOptionsAttempt((attempt) => attempt + 1);
              }}
            />
          </View>
        ) : options === undefined ? (
          <View style={styles.optionsStatus}>
            <SowSpinner size={18} />
            <Text style={[typography.caption, styles.optionsStatusText, { color: t.muted }]}>
              Loading the people and events to filter by…
            </Text>
          </View>
        ) : null}
        <MultiSelect
          label="Performed by"
          values={actorEmails}
          options={actorOptions}
          placeholder="Anyone"
          onSelect={setActorEmails}
        />
        <MultiSelect
          label="Event"
          values={eventIds}
          options={eventOptions}
          placeholder="All events"
          onSelect={(values) => setEventIds(values as Id<"events">[])}
        />
      </FilterBar>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search the audit trail…"
        clearLabel="Clear audit search"
        loading={search !== debouncedSearch || refreshing}
        style={styles.search}
      />
      </View>

      <View style={[styles.sectionHeader, { borderBottomColor: t.separator }]}>
        <Text style={[typography.label, { color: t.muted }]}>Activity</Text>
      </View>

      {accumulated.length === 0 && (page === undefined || hasMore) ? (
        <LoadingState />
      ) : accumulated.length === 0 && narrowed ? (
        <EmptyState
          icon="search-outline"
          title="No matches"
          message="Nothing in the audit trail matches this search or these filters."
        />
      ) : accumulated.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No activity yet"
          message="Attendance changes will appear here as they happen."
        />
      ) : (
        <>
          {accumulated.map((row) => (
            <View
              key={row.id}
              style={[
                styles.row,
                { backgroundColor: t.card, borderColor: t.separator },
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: t.ghost }]}>
                <Ionicons
                  name={ENTITY_ICON[row.entityType]}
                  size={18}
                  color={t.ghostText}
                />
              </View>
              <View style={styles.rowText}>
                <Text
                  style={[typography.headline, styles.summary, { color: t.text }]}
                >
                  {row.summary}
                </Text>
                {row.detail ? (
                  <Text style={[typography.caption, { color: t.muted }]}>
                    {row.detail}
                  </Text>
                ) : null}
                <Text style={[typography.caption, { color: t.faint }]}>
                  {row.actorName} · {timeAgo(row.at)}
                </Text>
              </View>
            </View>
          ))}
          {hasMore ? (
            <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
              <SowSpinner size={36} />
            </View>
          ) : null}
        </>
      )}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  stickyControls: { gap: spacing.sm, paddingTop: spacing.sm },
  optionsStatus: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  optionsStatusText: { flexShrink: 1 },
  search: { marginTop: spacing.xs, marginBottom: spacing.sm },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
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
  summary: { marginBottom: 1 },
});
