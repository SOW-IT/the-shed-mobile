import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { MutableRefObject, useEffect, useMemo, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { campusPill } from "@/components/attendance/campusPill";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import {
  ROLE_FIELD_KEY,
  orderedRoleFilterOptions,
  orderedSelectOptions,
} from "../../../shared/attendanceMemberMeta";
import {
  Avatar,
  Btn,
  EmptyState,
  LoadingState,
  MultiSelect,
  Select,
  SowSpinner,
} from "@/components/ui";
import {
  PAGER_PAGE_BOTTOM_INSET_WITH_FOOTER,
  PAGER_PAGE_CONTENT,
  PAGER_TOP_BAR_INSET,
  TopBarScrollProps,
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

  const {
    rows: accumulated,
    result: page,
    hasMore,
  } = usePagedQuery(api.attendanceMembers.list, {
    scopeKey: JSON.stringify([year, debouncedSearch, sortKey, sortAsc, filters]),
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
  const total = page?.total ?? accumulated.length;

  if (metadata === undefined) return <LoadingState />;

  return (
    <Animated.ScrollView
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[0]}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[
        PAGER_PAGE_CONTENT,
        styles.selfScrollingPage,
        { paddingBottom: PAGER_PAGE_BOTTOM_INSET_WITH_FOOTER },
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

        <View style={[styles.search, { backgroundColor: t.inputBackground }]}>
          <Ionicons name="search-outline" size={18} color={t.faint} />
          <TextInput
            style={[styles.searchInput, { color: t.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search members…"
            placeholderTextColor={t.faint}
          />
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear member search"
              onPress={() => setSearch("")}
              style={({ pressed }) => [
                styles.searchClear,
                { backgroundColor: t.ghost },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="close" size={16} color={t.ghostText} />
            </Pressable>
          ) : null}
        </View>
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
          {accumulated.map((row) => {
            const pill = campusPill(row.university, row.roles, t);

            return (
              <Pressable
                key={row.key}
                style={({ pressed }) => [
                  styles.memberRow,
                  {
                    backgroundColor: t.card,
                    borderColor: pill.colour ?? t.separator,
                  },
                  pressed && { opacity: 0.66 },
                ]}
                onPress={() => {
                  if (row.memberId) {
                    onEditMember(row.memberId as Id<"attendanceMembers">);
                  } else if (row.email) {
                    void ensureForStaff({ staffEmail: row.email, staffYear: year })
                      .then(onEditMember)
                      .catch((e) => console.error("ensureForStaff failed", e));
                  }
                }}
              >
                <Avatar photo={row.photo ?? null} name={row.name} size={38} />
                <View style={styles.memberText}>
                  <Text
                    style={[typography.headline, styles.memberName, { color: t.text }]}
                    numberOfLines={1}
                  >
                    {row.name}
                  </Text>
                  {row.subtitle ? (
                    <Text
                      style={[typography.caption, { color: t.muted }]}
                      numberOfLines={1}
                    >
                      {row.subtitle}
                    </Text>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.campusPill,
                    {
                      backgroundColor: pill.background,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      styles.campusPillText,
                      { color: pill.text },
                    ]}
                    numberOfLines={1}
                  >
                    {pill.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
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
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 44,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 15 },
  searchClear: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
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
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  memberText: { flex: 1, minWidth: 0 },
  memberName: { marginBottom: 2 },
  campusPill: {
    maxWidth: 92,
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  campusPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
});
