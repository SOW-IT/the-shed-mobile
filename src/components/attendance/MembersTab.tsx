import { useMutation, useQuery } from "convex/react";
import { MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import { Animated, type ScrollViewInstance, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { FilterBar } from "@/components/attendance/FilterBar";
import { MemberRow } from "@/components/attendance/MemberRow";
import { useHeldValue } from "@/hooks/useHeldValue";
import { useListTopOnChange } from "@/hooks/useListTopOnChange";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import {
  ROLE_FIELD_KEY,
  orderedSelectOptions,
} from "../../../shared/attendanceMemberMeta";
import { ROLE_FILTER_LABELS } from "../../../shared/memberRole";
import {
  Btn,
  EmptyState,
  ErrorBanner,
  errorMessage,
  LoadingState,
  MultiSelect,
  SearchField,
  Select,
  SowSpinner,
} from "@/components/ui";
import {
  PAGER_PAGE_CONTENT,
  TopBarScrollProps,
  usePagerFooterClearance,
  usePagerTopBarInset,
} from "@/components/PagerScreen";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const PAGE_SIZE = 30;

/**
 * Attendance → Members: the searchable, filterable member list for a year.
 * Pads its bottom to clear the tab's Create member footer.
 */
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
  const [openError, setOpenError] = useState<string | null>(null);
  useEffect(() => {
    void ensureDefaults({}).catch(() => {});
  }, [ensureDefaults]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(id);
  }, [search]);

  const scopeKey = JSON.stringify([year, debouncedSearch, sortKey, sortAsc, filters]);
  const listRef = useRef<ScrollViewInstance>(null);
  const onListScrollEnd = useListTopOnChange(listRef, scopeKey);
  const topBarInset = usePagerTopBarInset();
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
        { paddingTop: topBarInset, paddingBottom: footerClearancePadding },
      ]}
      {...scrollProps}
    >
      <View style={[styles.stickyControls, { backgroundColor: t.background }]}>
      <FilterBar
        count={activeFilterCount}
        open={filtersOpen}
        onToggle={() => setFiltersOpen((open) => !open)}
        onClear={() => setFilters({})}
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
            options={
              // Everyone has a worked-out Role, so there's no Unselected.
              field.key === ROLE_FIELD_KEY
                ? ROLE_FILTER_LABELS.map((label) => ({ label, value: label }))
                : [
                    { label: "Unselected", value: "unset" },
                    ...orderedSelectOptions(field.values, field.lockedValues).map(
                      ({ id, label }) => ({ label, value: id })
                    ),
                  ]
            }
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
      </FilterBar>

        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search members…"
          clearLabel="Clear member search"
          loading={search !== debouncedSearch || refreshing}
          style={styles.search}
        />
        <ErrorBanner message={openError} />
      </View>

      <View style={[styles.sectionHeader, { borderBottomColor: t.separator }]}>
        <Text style={[typography.label, { color: t.muted }]}>Members</Text>
        <View style={[styles.totalPill, { backgroundColor: t.ghost }]}>
          <Text style={[styles.totalPillText, { color: t.ghostText }]}>
            {`${total.toLocaleString("en-AU")} ${total === 1 ? "member" : "members"}`}
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
                setOpenError(null);
                if (row.memberId) {
                  onEditMember(row.memberId as Id<"attendanceMembers">);
                } else if (row.email) {
                  void ensureForStaff({ staffEmail: row.email, staffYear: year })
                    .then(onEditMember)
                    .catch((e) =>
                      setOpenError(`Couldn't open ${row.name}: ${errorMessage(e)}`)
                    );
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
  stickyControls: { gap: spacing.sm, paddingTop: spacing.sm },
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
