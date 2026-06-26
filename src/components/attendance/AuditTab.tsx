import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Btn, EmptyState, LoadingState, Select } from "@/components/ui";
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
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
};

type AuditRow = {
  id: string;
  at: number;
  actorEmail: string;
  actorName: string;
  entityType: AuditEntityType;
  action: string;
  summary: string;
  eventId: string | null;
  detail: string | null;
};

export function AuditTab() {
  const t = useAppTheme();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [entityType, setEntityType] = useState<string>("all");
  const [actorEmail, setActorEmail] = useState<string>("all");
  const [eventId, setEventId] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [accumulated, setAccumulated] = useState<AuditRow[]>([]);

  const options = useQuery(api.attendanceAudit.filterOptions, {});

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paging on filter change
    setCursor(null);
    setAccumulated([]);
  }, [debouncedSearch, entityType, actorEmail, eventId]);

  const page = useQuery(api.attendanceAudit.list, {
    search: debouncedSearch || undefined,
    entityType:
      entityType === "all" ? undefined : (entityType as AuditEntityType),
    actorEmail: actorEmail === "all" ? undefined : actorEmail,
    eventId: eventId === "all" ? undefined : (eventId as Id<"events">),
    paginationOpts: { numItems: PAGE_SIZE, cursor: cursor ?? null },
  });

  useEffect(() => {
    if (!page?.page) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- append paginated rows
    setAccumulated((prev) => {
      if (!cursor) return page.page;
      const seen = new Set(prev.map((r) => r.id));
      return [...prev, ...page.page.filter((r) => !seen.has(r.id))];
    });
  }, [page, cursor]);

  const activeFilterCount =
    (entityType !== "all" ? 1 : 0) +
    (actorEmail !== "all" ? 1 : 0) +
    (eventId !== "all" ? 1 : 0);

  const entityOptions = useMemo(
    () => [
      { label: "All actions", value: "all" },
      ...(Object.keys(ENTITY_LABEL) as AuditEntityType[]).map((k) => ({
        label: ENTITY_LABEL[k],
        value: k,
      })),
    ],
    []
  );

  const actorOptions = useMemo(
    () => [
      { label: "Anyone", value: "all" },
      ...(options?.actors ?? []).map((a) => ({
        label: a.name,
        value: a.email,
      })),
    ],
    [options]
  );

  const eventOptions = useMemo(
    () => [
      { label: "All events", value: "all" },
      ...(options?.events ?? []).map((e) => ({ label: e.name, value: e.id })),
    ],
    [options]
  );

  return (
    <>
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
          onPress={() => {
            setEntityType("all");
            setActorEmail("all");
            setEventId("all");
          }}
          style={({ pressed }) => [
            styles.clearFilters,
            activeFilterCount === 0 && { opacity: 0.45 },
            pressed && { opacity: 0.65 },
          ]}
        >
          <Text
            style={[
              typography.caption,
              styles.clearFiltersText,
              { color: t.primary },
            ]}
          >
            Clear All
          </Text>
        </Pressable>
      </View>

      {filtersOpen ? (
        <View
          style={[
            styles.filterPanel,
            { backgroundColor: t.card, borderColor: t.separator },
          ]}
        >
          <Select
            label="Action type"
            value={entityType}
            options={entityOptions}
            onSelect={setEntityType}
          />
          <Select
            label="Performed by"
            value={actorEmail}
            options={actorOptions}
            onSelect={setActorEmail}
          />
          <Select
            label="Event"
            value={eventId}
            options={eventOptions}
            onSelect={setEventId}
          />
        </View>
      ) : null}

      <View style={[styles.search, { backgroundColor: t.inputBackground }]}>
        <Ionicons name="search-outline" size={18} color={t.faint} />
        <TextInput
          style={[styles.searchInput, { color: t.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search the audit trail…"
          placeholderTextColor={t.faint}
        />
        {search ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear audit search"
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

      <View style={[styles.sectionHeader, { borderBottomColor: t.separator }]}>
        <Text style={[typography.label, { color: t.muted }]}>ACTIVITY</Text>
      </View>

      {page === undefined && accumulated.length === 0 ? (
        <LoadingState />
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
          {page && !page.isDone ? (
            <Btn
              title="Load more"
              variant="ghost"
              onPress={() => setCursor(page.continueCursor)}
            />
          ) : null}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  filterSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 44,
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
