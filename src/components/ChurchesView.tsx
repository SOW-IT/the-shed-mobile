import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  CHURCH_GROUPS,
  churchCampuses,
  churchFilterCounts,
  churchPeopleMatching,
  isChurchFilterActive,
  mainCampus,
  NO_CAMPUS,
  NO_CHURCH_FILTER,
  togglePicked,
  type ChurchFilter,
} from "../../shared/churches";
import { subgroupColour, subgroupLabel } from "../../shared/rollcall";
import { ChromeScreen } from "./ChromeScreen";
import { ChurchMap, churchMapAvailable, type ChurchPin } from "./ChurchMap";
import { type Church, ChurchDetails, ChurchForm, useCanEditChurches } from "./ChurchPicker";
import { radius, spacing, typography, useAppTheme } from "../theme";
import { Btn, Card, EmptyState, FadeInView, hapticSelect, LoadingState, ScrollCap, SearchField, stagger } from "./ui";

type Entry = NonNullable<ReturnType<typeof useQuery<typeof api.churches.directory>>>[number] & {
  everyone: number;
};

const PEOPLE_PREVIEW = 5;
const PERSON_ROW_HEIGHT = 44;
const EXPANDED_VISIBLE_ROWS = 8;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const campusName = (campus: string) => (campus === NO_CAMPUS ? "No campus" : subgroupLabel(campus));

/**
 * One option in the filter: picked (tinted, ticked) or not (outlined). A
 * campus shows its colour as a dot, then as the tick once picked.
 */
function FilterChip({
  on,
  label,
  count,
  colour,
  locked,
  onPress,
}: {
  on: boolean;
  label: string;
  count: number;
  colour?: string;
  locked?: boolean;
  onPress: () => void;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      role="checkbox"
      aria-checked={on}
      accessibilityLabel={`${label}, ${plural(count, "person", "people")}${locked ? ", only staff and campus leaders see them" : ""}`}
      onPress={() => {
        hapticSelect();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        on
          ? { backgroundColor: t.primarySoft, borderColor: t.primarySoft, paddingLeft: 8 }
          : { backgroundColor: t.card, borderColor: t.border, paddingLeft: colour ? 11 : 14 },
        pressed && { opacity: 0.7 },
      ]}
    >
      {on ? (
        <Ionicons name="checkmark-circle" size={18} color={colour ?? (t.dark ? t.text : t.primary)} />
      ) : colour ? (
        <View style={[styles.dot, { backgroundColor: colour }]} />
      ) : null}
      <Text style={[styles.chipText, { color: t.text }]}>{label}</Text>
      {locked ? <Ionicons name="lock-closed" size={11} color={t.muted} /> : null}
      <Text style={[styles.chipCount, { color: t.muted }]}>{count}</Text>
    </Pressable>
  );
}

/** One filter's options in a line that scrolls sideways when it doesn't fit. */
function FilterRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="list"
      accessibilityLabel={title}
      style={styles.chipScroll}
      contentContainerStyle={styles.chips}
    >
      {children}
    </ScrollView>
  );
}

function ChurchCard({
  entry,
  seesMembers,
  onSelect,
  onEdit,
  onClose,
}: {
  entry: Entry;
  seesMembers: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onClose?: () => void;
}) {
  const t = useAppTheme();
  const router = useRouter();
  const expanded = Boolean(onClose);
  const shownPeople = expanded ? entry.people : entry.people.slice(0, PEOPLE_PREVIEW);
  const hiddenCount = entry.people.length - shownPeople.length;
  const rows = shownPeople.map((person, index) => {
    const email = person.email;
    const row = (
      <>
        <Text style={[typography.body, { color: t.text, flex: 1 }]} numberOfLines={1}>
          {person.name}
        </Text>
        {person.campus ? (
          <View style={[styles.campus, { backgroundColor: t.ghost }]}>
            <View style={[styles.dot, { backgroundColor: subgroupColour(person.campus) }]} />
            <Text style={[typography.caption, { color: t.ghostText, fontWeight: "700" }]}>
              {subgroupLabel(person.campus)}
            </Text>
          </View>
        ) : null}
        <Text style={[typography.caption, styles.role, { color: t.muted }]} numberOfLines={1}>
          {person.role}
        </Text>
      </>
    );
    const key = `${index}:${person.memberId ?? email ?? person.name}`;
    return email ? (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityLabel={`Open ${person.name}, ${person.role}`}
        onPress={() => router.push({ pathname: "/person/[email]", params: { email } })}
        style={({ pressed }) => [styles.person, { borderTopColor: t.separator }, pressed && { opacity: 0.6 }]}
      >
        {row}
      </Pressable>
    ) : (
      <View key={key} style={[styles.person, { borderTopColor: t.separator }]}>
        {row}
      </View>
    );
  });
  const card = (
    <Card style={[{ gap: spacing.md }, expanded ? { borderWidth: 2, borderColor: t.primary } : null]}>
      {onClose ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }) => [styles.close, { backgroundColor: t.ghost }, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="close" size={18} color={t.ghostText} />
        </Pressable>
      ) : null}
      <ChurchDetails church={entry.church} onEdit={onEdit} bare />
      {entry.people.length === 0 ? (
        <Text style={[typography.caption, { color: t.muted }]}>
          {seesMembers ? "Nobody has picked it yet." : "No staff or campus leaders have picked it yet."}
        </Text>
      ) : (
        <View>
          <Text style={[typography.label, styles.peopleTitle, { color: t.muted }]}>
            {entry.people.length === entry.everyone
              ? plural(entry.people.length, "person", "people")
              : `${entry.people.length} of ${plural(entry.everyone, "person", "people")}`}
          </Text>
          {expanded ? (
            <ScrollCap maxHeight={PERSON_ROW_HEIGHT * EXPANDED_VISIBLE_ROWS} count={entry.people.length}>
              {rows}
            </ScrollCap>
          ) : (
            rows
          )}
          {hiddenCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show all ${entry.people.length} people`}
              onPress={onSelect}
              style={({ pressed }) => [styles.person, { borderTopColor: t.separator }, pressed && { opacity: 0.6 }]}
            >
              <Text style={[typography.caption, { color: t.primary, fontWeight: "700", flex: 1 }]}>
                {hiddenCount} more
              </Text>
              <Ionicons name="chevron-forward" size={16} color={t.primary} />
            </Pressable>
          ) : null}
        </View>
      )}
    </Card>
  );
  return onSelect ? (
    <Pressable accessible={false} onPress={onSelect} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {card}
    </Pressable>
  ) : (
    card
  );
}

/**
 * The Churches page: every church staff and members go to, where it meets and
 * when, and who goes there. Staff pick theirs in their Profile; a member's is
 * set when editing their attendance record. Members only show for staff and
 * campus leaders.
 */
export function ChurchesView() {
  const t = useAppTheme();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const directory = useQuery(api.churches.directory);
  // Staff and campus leaders can edit churches, and they're who gets members.
  const canEdit = useCanEditChurches();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ChurchFilter>(NO_CHURCH_FILTER);
  const [form, setForm] = useState<{ church: Church | null } | null>(null);
  const [selectedId, setSelectedId] = useState<Id<"churches"> | null>(null);
  const { church: linkedChurch } = useLocalSearchParams<{ church?: string }>();
  const [followedLink, setFollowedLink] = useState<string | undefined>(undefined);
  if (linkedChurch !== followedLink) {
    setFollowedLink(linkedChurch);
    if (linkedChurch) {
      setSelectedId(linkedChurch as Id<"churches">);
      setSearch("");
      setFilter(NO_CHURCH_FILTER);
    }
  }
  useEffect(() => {
    if (followedLink) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [followedLink]);
  const choose = (churchId: Id<"churches"> | null) => {
    setSelectedId(churchId);
    if (linkedChurch) router.setParams({ church: undefined });
  };
  const showOnMap = (churchId: Id<"churches">) => {
    choose(churchId);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const q = search.trim().toLowerCase();
  const filtering = isChurchFilterActive(filter);
  const everyone = (directory ?? []).flatMap((entry) => entry.people);
  const groups = CHURCH_GROUPS.filter(({ key }) => key !== "member" || canEdit);
  const campuses = churchCampuses(everyone, subgroupLabel);
  const matchesSearch = (entry: { church: { name: string }; people: readonly { name: string }[] }) =>
    !q ||
    entry.church.name.toLowerCase().includes(q) ||
    entry.people.some((p) => p.name.toLowerCase().includes(q));
  const searched = (directory ?? []).filter(matchesSearch);
  const counts = churchFilterCounts(searched.flatMap((entry) => entry.people), filter);
  const shown: Entry[] = searched
    .map((entry) => ({
      ...entry,
      people: churchPeopleMatching(entry.people, filter),
      everyone: entry.people.length,
    }))
    .filter((entry) => (!filtering || entry.people.length > 0) && matchesSearch(entry));
  const shownPeople = shown.reduce((sum, entry) => sum + entry.people.length, 0);
  const pins: ChurchPin[] = shown
    .filter((entry) => entry.church.location)
    .map((entry) => {
      const campus = mainCampus(entry.people);
      return {
        church: entry.church,
        people: entry.people.length,
        colour: campus ? subgroupColour(campus) : null,
      };
    });
  const selected = shown.find((entry) => entry.church._id === selectedId) ?? null;

  return (
    <ChromeScreen scrollRef={scrollRef}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={[typography.largeTitle, { color: t.text }]}>
            Churches
          </Text>
          <Text style={[typography.caption, { color: t.muted }]}>
            {canEdit
              ? "Where staff, campus leaders and members go to church."
              : "Where staff and campus leaders go to church."}
          </Text>
        </View>
        {canEdit ? (
          <Btn title="Add" icon="add" variant="tonal" onPress={() => setForm({ church: null })} />
        ) : null}
      </View>
      {directory === undefined ? (
        <LoadingState />
      ) : directory.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title="No churches yet"
          message={canEdit ? "Add the first one." : "Staff will add them soon."}
        />
      ) : (
        <>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search churches or people" />
          <View style={styles.filters}>
            <FilterRow title="Who">
              {groups.map(({ key, label }) => (
                <FilterChip
                  key={key}
                  on={filter.groups.includes(key)}
                  label={label}
                  count={counts.groups.get(key) ?? 0}
                  locked={key === "member"}
                  onPress={() => setFilter((prev) => ({ ...prev, groups: togglePicked(prev.groups, key) }))}
                />
              ))}
            </FilterRow>
            {campuses.length > 1 ? (
              <FilterRow title="Campus">
                {campuses.map((campus) => (
                  <FilterChip
                    key={campus || "none"}
                    on={filter.campuses.includes(campus)}
                    label={campusName(campus)}
                    count={counts.campuses.get(campus) ?? 0}
                    colour={campus === NO_CAMPUS ? undefined : subgroupColour(campus)}
                    onPress={() => setFilter((prev) => ({ ...prev, campuses: togglePicked(prev.campuses, campus) }))}
                  />
                ))}
              </FilterRow>
            ) : null}
          </View>
          <View style={[styles.summary, { borderTopColor: t.separator }]}>
            <Text style={[typography.caption, { color: t.muted, flex: 1 }]} accessibilityLiveRegion="polite">
              {plural(shown.length, "church", "churches")} · {plural(shownPeople, "person", "people")}
            </Text>
            {filtering ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setFilter(NO_CHURCH_FILTER)}
                hitSlop={8}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
              >
                <Text style={[typography.caption, { color: t.primary, fontWeight: "700" }]}>Show everyone</Text>
              </Pressable>
            ) : null}
          </View>
          {churchMapAvailable && pins.length > 0 ? (
            <FadeInView>
              <ChurchMap pins={pins} selectedId={selected?.church._id ?? null} onSelect={choose} />
            </FadeInView>
          ) : null}
          {selected ? (
            <ChurchCard
              entry={selected}
              seesMembers={canEdit}
              onEdit={canEdit ? () => setForm({ church: selected.church }) : undefined}
              onClose={() => choose(null)}
            />
          ) : null}
          {shown
            .filter((entry) => entry !== selected)
            .map((entry, index) => (
              <FadeInView key={entry.church._id} delay={stagger(index)}>
                <ChurchCard
                  entry={entry}
                  seesMembers={canEdit}
                  onSelect={() => showOnMap(entry.church._id)}
                  onEdit={canEdit ? () => setForm({ church: entry.church }) : undefined}
                />
              </FadeInView>
            ))}
          {shown.length === 0 ? (
            <View style={styles.nothing}>
              <Text style={[typography.caption, { color: t.muted, textAlign: "center" }]}>
                {filtering ? "Nobody matches these filters." : "Nothing matches."}
              </Text>
              {filtering ? (
                <Btn title="Show everyone" variant="ghost" onPress={() => setFilter(NO_CHURCH_FILTER)} />
              ) : null}
            </View>
          ) : null}
        </>
      )}
      <ChurchForm
        visible={form !== null}
        church={form?.church ?? null}
        onClose={() => setForm(null)}
        onSaved={() => setForm(null)}
      />
    </ChromeScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  filters: { gap: spacing.sm },
  // Runs to the screen's edges so the last option peeks out when it scrolls.
  chipScroll: { marginHorizontal: -spacing.lg },
  chips: { flexDirection: "row", gap: spacing.sm - 2, paddingHorizontal: spacing.lg },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingRight: 12,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipText: { fontSize: 13.5, fontWeight: "600", letterSpacing: -0.1 },
  chipCount: { fontSize: 12.5, fontWeight: "600", fontVariant: ["tabular-nums"] },
  dot: { width: 9, height: 9, borderRadius: 5 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  peopleTitle: { marginBottom: spacing.xs },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: PERSON_ROW_HEIGHT,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  role: { maxWidth: "45%", textAlign: "right" },
  nothing: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  campus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  close: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 1,
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
