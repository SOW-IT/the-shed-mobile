import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { MemberRow } from "@/components/attendance/MemberRow";
import { useHeldValue } from "@/hooks/useHeldValue";
import { useListTopOnChange } from "@/hooks/useListTopOnChange";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import {
  ROLE_FIELD_KEY,
  orderedRoleFilterOptions,
  orderedSelectOptions,
} from "../../../shared/attendanceMemberMeta";
import {
  Btn,
  EmptyState,
  LoadingState,
  MultiSelect,
  SearchField,
  Select,
  SowSpinner,
} from "@/components/ui";
import {
  PAGER_PAGE_CONTENT,
  PAGER_TOP_BAR_INSET,
  TopBarScrollProps,
  usePagerFooterClearance,
} from "@/components/PagerScreen";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const PAGE_SIZE = 30;

export function MembersTab({
  year,
  onEditMember,
  scrollProps,
  loadMoreRef,
}: {
  year: number;
  onEditMember: (memberId: Id<"attendanceMembers">) => void;
  scrollProps?: TopBarScrollProps;
  loadMoreRef?: MutableRefObject<(() => void) | null>;
}) {
  const t = useAppTheme();
  const footerClearancePadding = usePagerFooterClearance();
  const ensureDefaults = useMutation(api.attendanceMetadata.ensureDefaults);
  const ensureForStaff = useMutation(api.attendanceMembers.ensureForStaff);
  const metadata = useQuery(api.attendanceMetadata.list, {});

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    void ensureDefaults({}).catch(() => {});
  }, [ensureDefaults]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(id);
  }, [search]);

  const scopeKey = JSON.stringify([year, debouncedSearch, sortKey, sortAsc, filters]);
  const listRef = useRef<ScrollView>(null);
  const onListScrollEnd = useListTopOnChange(listRef, scopeKey);
  const {
    rows: accumulated,
    result: page,
    hasMore,
    refreshing,
  } = usePagedQuery(api.attendanceMembers.list, {
    scopeKey,
    args: (cursor) => ({
      year,
      search: debouncedSearch || undefined,
      sortKey,
      sortAsc,
      filters: Object.keys(filters).length ? filters : undefined,
      paginationOpts: { numItems: PAGE_SIZE, cursor },
    }),
    rowsOf: (result) => result.page,
    keyOf: (row) => row.key,
    loadMoreRef,
    keepRowsWhileLoading: true,
  });

  const sortOptions = useMemo(
    () => [
      { label: "Name", value: "name" },
      ...(metadata ?? []).map((f) => ({ label: f.key, value: f._id })),
    ],
    [metadata]
  );

  const selectFilters = useMemo(
    () => (metadata ?? []).filter((f) => f.type === "select"),
    [metadata]
  );
  const activeFilterCount = Object.values(filters).reduce(
    (count, values) => count + values.length,
    0
  );
  // Held too, so the count doesn't blink while a new search loads.
  const total = useHeldValue(page?.total, "total").value ?? accumulated.length;

  if (metadata === undefined) return <LoadingState />;

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
        styles.selfScrollingPage,
        { paddingBottom: footerClearancePadding },
      ]}
      {...scrollProps}
    >
      <View style={[styles.stickyControls, { backgroundColor: t.background }]}>
      <View style={styles.filterSummary}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersOpen }}
          onPress={() => setFiltersOpen((open) => !open)}
          style={({ pressed }) => [
            styles.filterButton,
            { backgroundColor: t.ghost },
            pressed && { opacity: 0.72 },
          ]}
        >
          <Ionicons name="filter-outline" size={16} color={t.ghostText} />
          <Text style={[styles.filterButtonText, { color: t.ghostText }]}>
            Filters
          </Text>
        </Pressable>
        <Text style={[typography.caption, { color: t.muted }]}>
          {activeFilterCount} active
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={activeFilterCount === 0}
          onPress={() => setFilters({})}
          style={({ pressed }) => [
            styles.clearFilters,
            activeFilterCount === 0 && { opacity: 0.45 },
            pressed && { opacity: 0.65 },
          ]}
        >
          <Text style={[typography.caption, styles.clearFiltersText, { color: t.primary }]}>
            Clear All
          </Text>
        </Pressable>
      </View>

      {filtersOpen ? (
        <View
          style={[
            styles.filterPanel,
            {
              backgroundColor: t.card,
              borderColor: t.separator,
            },
          ]}
        >
          <View style={styles.sortRow}>
            <View style={styles.sortSelect}>
              <Select
                label="Sort by"
                value={sortKey}
                options={sortOptions}
                onSelect={setSortKey}
              />
            </View>
            <Btn
              title={sortAsc ? "Asc" : "Desc"}
              variant="ghost"
              onPress={() => setSortAsc((v) => !v)}
            />
          </View>

          {selectFilters.map((field) => (
            <MultiSelect
              key={field._id}
              label={`Filter: ${field.key}`}
              values={filters[field._id] ?? []}
              options={[
                { label: "Unselected", value: "unset" },
                ...(field.key === ROLE_FIELD_KEY
                  ? orderedRoleFilterOptions(field.values, field.lockedValues)
                  : orderedSelectOptions(field.values, field.lockedValues)
                ).map(({ id, label }) => ({ label, value: id })),
              ]}
              placeholder="All"
              onSelect={(values) =>
                setFilters((prev) => {
                  const next = { ...prev };
                  if (values.length === 0) delete next[field._id];
                  else next[field._id] = values;
                  return next;
                })
              }
            />
          ))}
        </View>
      ) : null}

        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search members…"
          clearLabel="Clear member search"
          loading={search !== debouncedSearch || refreshing}
          style={styles.search}
        />
      </View>

      <View style={[styles.sectionHeader, { borderBottomColor: t.separator }]}>
        <Text style={[typography.label, { color: t.muted }]}>MEMBERS</Text>
        <View style={[styles.totalPill, { backgroundColor: t.ghost }]}>
          <Text style={[styles.totalPillText, { color: t.ghostText }]}>
            TOTAL: {total}
          </Text>
        </View>
      </View>

      {page === undefined && accumulated.length === 0 ? (
        <LoadingState />
      ) : accumulated.length === 0 ? (
        <EmptyState icon="people-outline" title="No members match" />
      ) : (
        <View>
          {accumulated.map((row) => (
            <MemberRow
              key={row.key}
              name={row.name}
              subtitle={row.subtitle}
              photo={row.photo}
              university={row.university}
              roles={row.roles}
              onPress={() => {
                if (row.memberId) {
                  onEditMember(row.memberId as Id<"attendanceMembers">);
                } else if (row.email) {
                  void ensureForStaff({ staffEmail: row.email, staffYear: year })
                    .then(onEditMember)
                    .catch((e) => console.error("ensureForStaff failed", e));
                }
              }}
            />
          ))}
          {hasMore ? (
            <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
              <SowSpinner size={36} />
            </View>
          ) : null}
        </View>
      )}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  selfScrollingPage: { paddingTop: PAGER_TOP_BAR_INSET },
  stickyControls: { gap: spacing.sm, paddingTop: spacing.sm },
  filterSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 36,
  },
  filterButtonText: { fontSize: 13, fontWeight: "700" },
  clearFilters: {
    marginLeft: "auto",
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  clearFiltersText: { fontWeight: "600" },
  filterPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  sortSelect: { flex: 1 },
  search: { marginTop: spacing.xs, marginBottom: spacing.sm },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  totalPill: {
    borderRadius: radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  totalPillText: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.2 },
});
