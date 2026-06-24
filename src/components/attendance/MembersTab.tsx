import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { universityColour } from "../../../shared/flow";
import { contrastingText } from "../../../shared/rollcall";
import { orderedSelectOptions } from "../../../shared/attendanceMemberMeta";
import {
  Avatar,
  Btn,
  Card,
  EmptyState,
  LoadingState,
  Muted,
  Select,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

const PAGE_SIZE = 30;

export function MembersTab({
  year,
  onEditMember,
}: {
  year: number;
  onEditMember: (memberId: Id<"attendanceMembers">) => void;
}) {
  const t = useAppTheme();
  const ensureDefaults = useMutation(api.attendanceMetadata.ensureDefaults);
  const ensureForStaff = useMutation(api.attendanceMembers.ensureForStaff);
  const metadata = useQuery(api.attendanceMetadata.list, { year });

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [accumulated, setAccumulated] = useState<
    {
      key: string;
      kind: "staff" | "member";
      name: string;
      email?: string;
      memberId?: string;
      subtitle?: string;
      university?: string;
      photo?: string | null;
    }[]
  >([]);

  useEffect(() => {
    void ensureDefaults({ year });
  }, [year, ensureDefaults]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paging on filter change
    setCursor(null);
    setAccumulated([]);
  }, [debouncedSearch, sortKey, sortAsc, filters, year]);

  const page = useQuery(api.attendanceMembers.list, {
    year,
    search: debouncedSearch || undefined,
    sortKey,
    sortAsc,
    filters: Object.keys(filters).length ? filters : undefined,
    paginationOpts: { numItems: PAGE_SIZE, cursor: cursor ?? null },
  });

  useEffect(() => {
    if (!page?.page) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- append paginated member rows
    setAccumulated((prev) => {
      if (!cursor) return page.page;
      const seen = new Set(prev.map((r) => r.key));
      return [...prev, ...page.page.filter((r) => !seen.has(r.key))];
    });
  }, [page, cursor]);

  const sortOptions = useMemo(
    () => [
      { label: "Name", value: "name" },
      ...(metadata ?? []).map((f) => ({ label: f.key, value: f._id })),
    ],
    [metadata]
  );

  if (metadata === undefined) return <LoadingState />;

  return (
    <>
      <View style={[styles.search, { backgroundColor: t.inputBackground }]}>
        <TextInput
          style={[styles.searchInput, { color: t.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search members…"
          placeholderTextColor={t.faint}
        />
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        <Select
          label="Sort by"
          value={sortKey}
          options={sortOptions}
          onSelect={setSortKey}
        />
        <Btn
          title={sortAsc ? "Asc ↑" : "Desc ↓"}
          variant="ghost"
          onPress={() => setSortAsc((v) => !v)}
        />
      </View>

      {(metadata ?? [])
        .filter((f) => f.type === "select")
        .map((field) => (
          <Select
            key={field._id}
            label={`Filter: ${field.key}`}
            value={filters[field._id] ?? "all"}
            options={[
              { label: "All", value: "all" },
              { label: "Unselected", value: "unset" },
              ...orderedSelectOptions(field.values, field.lockedValues).map(
                ({ id, label }) => ({ label, value: id })
              ),
            ]}
            onSelect={(v) =>
              setFilters((prev) => {
                const next = { ...prev };
                if (v === "all") delete next[field._id];
                else next[field._id] = v;
                return next;
              })
            }
          />
        ))}

      {page === undefined && accumulated.length === 0 ? (
        <LoadingState />
      ) : accumulated.length === 0 ? (
        <EmptyState icon="people-outline" title="No members match" />
      ) : (
        <>
          <Muted>
            {page?.total ?? accumulated.length} member
            {(page?.total ?? accumulated.length) === 1 ? "" : "s"}
          </Muted>
          {accumulated.map((row) => {
            const campusColour = row.university
              ? universityColour(row.university)
              : undefined;
            const textColour = campusColour ? contrastingText(campusColour) : t.text;
            const mutedColour = campusColour
              ? `${textColour}99`
              : undefined;

            return (
              <Card
                key={row.key}
                style={{
                  marginBottom: spacing.sm,
                  ...(campusColour ? { backgroundColor: campusColour } : {}),
                }}
              >
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { opacity: 0.6 },
                  ]}
                  onPress={() => {
                    if (row.memberId) {
                      onEditMember(row.memberId as Id<"attendanceMembers">);
                    } else if (row.kind === "staff" && row.email) {
                      void ensureForStaff({ year, staffEmail: row.email })
                        .then(onEditMember)
                        .catch((e) => console.error("ensureForStaff failed", e));
                    }
                  }}
                >
                  <Avatar photo={row.photo ?? null} name={row.name} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.headline, { color: textColour }]}>
                      {row.name}
                    </Text>
                    {row.subtitle ? (
                      campusColour ? (
                        <Text style={[typography.caption, { color: mutedColour }]}>
                          {row.subtitle}
                        </Text>
                      ) : (
                        <Muted>{row.subtitle}</Muted>
                      )
                    ) : null}
                  </View>
                </Pressable>
              </Card>
            );
          })}
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

const styles = {
  search: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 15 },
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
};
