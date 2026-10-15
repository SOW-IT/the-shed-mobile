import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  CHURCH_AUDIENCES,
  churchCampuses,
  churchPeopleMatching,
  isChurchFilterActive,
  mainCampus,
  NO_CHURCH_FILTER,
  type ChurchAudience,
  type ChurchFilter,
} from "../../shared/churches";
import { subgroupColour, subgroupLabel } from "../../shared/rollcall";
import { CampusMark } from "./CampusMark";
import { ChromeScreen } from "./ChromeScreen";
import { ChurchMap, churchMapAvailable, type ChurchPin } from "./ChurchMap";
import { type Church, ChurchDetails, ChurchForm, useCanEditChurches } from "./ChurchPicker";
import { radius, spacing, typography, useAppTheme } from "../theme";
import { Btn, Card, EmptyState, FadeInView, LoadingState, ScrollCap, SearchField, stagger } from "./ui";

type Entry = NonNullable<ReturnType<typeof useQuery<typeof api.churches.directory>>>[number] & {
  everyone: number;
};

const PEOPLE_PREVIEW = 5;
const PERSON_ROW_HEIGHT = 44;
const EXPANDED_VISIBLE_ROWS = 8;

function ChurchCard({
  entry,
  onSelect,
  onEdit,
  onClose,
}: {
  entry: Entry;
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
    <Card style={[{ gap: spacing.sm }, expanded ? { borderWidth: 2, borderColor: t.primary } : null]}>
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
      <ChurchDetails church={entry.church} onEdit={onEdit} />
      {entry.people.length === 0 ? (
        <Text style={[typography.caption, { color: t.muted }]}>Nobody has picked it yet.</Text>
      ) : (
        <View>
          <Text style={[styles.groupTitle, { color: t.muted }]}>
            People{" "}
            <Text style={{ color: t.faint }}>
              {entry.people.length === entry.everyone
                ? entry.people.length
                : `${entry.people.length} of ${entry.everyone}`}
            </Text>
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
 * set when editing their attendance record.
 */
export function ChurchesView() {
  const t = useAppTheme();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const directory = useQuery(api.churches.directory);
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
    }
  }
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
  const campuses = churchCampuses(
    (directory ?? []).flatMap((entry) => entry.people),
    subgroupLabel
  );
  const shown: Entry[] = (directory ?? [])
    .map((entry) => ({
      ...entry,
      people: churchPeopleMatching(entry.people, filter),
      everyone: entry.people.length,
    }))
    .filter(
      (entry) =>
        (!filtering || entry.people.length > 0) &&
        (!q ||
          entry.church.name.toLowerCase().includes(q) ||
          entry.people.some((p) => p.name.toLowerCase().includes(q)))
    );
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
  const toggleCampus = (campus: string) =>
    setFilter((prev) => ({
      ...prev,
      campuses: prev.campuses.includes(campus)
        ? prev.campuses.filter((c) => c !== campus)
        : [...prev.campuses, campus],
    }));

  return (
    <ChromeScreen scrollRef={scrollRef}>
      <View style={styles.header}>
        <Text style={[typography.largeTitle, { color: t.text, flex: 1 }]}>Churches</Text>
        {canEdit ? (
          <Btn title="Add a church" icon="add" variant="tonal" onPress={() => setForm({ church: null })} />
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
          <View style={[styles.audiences, { backgroundColor: t.ghost }]}>
            {CHURCH_AUDIENCES.map(({ key, label }) => {
              const on = filter.audience === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setFilter((prev) => ({ ...prev, audience: key as ChurchAudience }))}
                  style={({ pressed }) => [
                    styles.audience,
                    on && [{ backgroundColor: t.card }, t.shadowFloat],
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={[styles.audienceText, { color: on ? t.text : t.muted }, on && { fontWeight: "700" }]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {campuses.length > 1 ? (
            <View style={styles.chips}>
              {campuses.map((campus) => {
                const on = filter.campuses.includes(campus);
                return (
                  <Pressable
                    key={campus}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={subgroupLabel(campus)}
                    onPress={() => toggleCampus(campus)}
                    style={({ pressed }) => [
                      styles.campusChip,
                      {
                        borderColor: on ? t.primary : t.border,
                        backgroundColor: on ? t.primarySoft : "transparent",
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <CampusMark campus={campus} variant="circle" circleDiameter={18} />
                    <Text style={[typography.caption, styles.chipText, { color: t.text }]}>
                      {subgroupLabel(campus)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {churchMapAvailable && pins.length > 0 ? (
            <FadeInView>
              <ChurchMap pins={pins} selectedId={selected?.church._id ?? null} onSelect={choose} />
            </FadeInView>
          ) : null}
          {selected ? (
            <ChurchCard
              entry={selected}
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
                  onSelect={() => showOnMap(entry.church._id)}
                  onEdit={canEdit ? () => setForm({ church: entry.church }) : undefined}
                />
              </FadeInView>
            ))}
          {shown.length === 0 ? (
            <View style={styles.nothing}>
              <Text style={[typography.caption, { color: t.muted, textAlign: "center" }]}>Nothing matches.</Text>
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
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  groupTitle: { fontSize: 13, fontWeight: "700", marginTop: spacing.xs, marginBottom: spacing.xs },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: PERSON_ROW_HEIGHT,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  role: { maxWidth: "45%", textAlign: "right" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  audiences: { flexDirection: "row", borderRadius: radius.full, padding: 4 },
  audience: {
    flexGrow: 1,
    flexShrink: 1,
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: radius.full,
  },
  audienceText: { fontSize: 13, fontWeight: "600" },
  campusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 12,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 13, fontWeight: "700" },
  nothing: { alignItems: "center", gap: spacing.sm },
  campus: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
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
