import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  type FollowRow,
  type PeopleRow,
  type PeopleSortKey,
  type Pill,
  type WeeklyBlock,
} from "../../../shared/weeklyInsightsView";
import { Avatar, Btn, ReadableColumn, SearchField } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

// Draws the campus weeklies blocks (shared/weeklyInsightsView.ts). Like the
// rest of Insights, the server decides what's in them; this only draws.

type Block<T extends WeeklyBlock["type"]> = Extract<WeeklyBlock, { type: T }>;

export const WEEKLY_BLOCK_TYPES = new Set([
  "people",
  "followUpGroups",
  "memberHeader",
  "keyValues",
  "termHistory",
  "weekGrid",
  "eventList",
]);

const PAGE = 40;

function CategoryPill({ pill }: { pill: Pill }) {
  return (
    <View style={[styles.pill, { backgroundColor: `${pill.colour}22` }]}>
      <View style={[styles.dot, { backgroundColor: pill.colour }]} />
      <Text style={[typography.caption, { color: pill.colour, fontWeight: "700" }]} numberOfLines={1}>
        {pill.label}
      </Text>
    </View>
  );
}

function Panel({ title, icon, trailing, children }: { title: string; icon?: string; trailing?: ReactNode; children: ReactNode }) {
  const t = useAppTheme();
  return (
    <View style={[styles.panel, { backgroundColor: t.card }, t.shadowCard]}>
      <View style={styles.panelHeader}>
        {icon ? (
          <Ionicons
            name={(icon in Ionicons.glyphMap ? icon : "list-outline") as keyof typeof Ionicons.glyphMap}
            size={18}
            color={t.primary}
          />
        ) : null}
        <Text style={[typography.headline, { color: t.text, flex: 1 }]}>{title}</Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}

function PersonRow({
  name,
  photo,
  pill,
  lines,
  trailing,
  warning,
  onPress,
}: {
  name: string;
  photo?: string | null;
  pill: Pill;
  lines: string[];
  trailing?: string;
  warning?: string;
  onPress?: () => void;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.personRow, { borderTopColor: t.separator }, pressed && { opacity: 0.7 }]}
    >
      <Avatar photo={photo ?? null} name={name} size={40} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.nameLine}>
          <Text style={[typography.headline, { color: t.text, flexShrink: 1 }]} numberOfLines={1}>
            {name}
          </Text>
          <CategoryPill pill={pill} />
        </View>
        {lines.map((line, i) => (
          <Text key={i} style={[typography.caption, { color: t.muted }]} numberOfLines={2}>
            {line}
          </Text>
        ))}
        {warning ? (
          <Text style={[typography.caption, { color: t.warning, fontWeight: "700" }]}>{warning}</Text>
        ) : null}
      </View>
      {trailing ? (
        <Text style={[typography.caption, { color: t.text, fontWeight: "800" }]}>{trailing}</Text>
      ) : null}
    </Pressable>
  );
}

const SORT_DIRECTION: Record<PeopleSortKey, 1 | -1> = { pct: -1, name: 1, last: -1 };

function PeopleList({ block, onOpen }: { block: Block<"people">; onOpen?: (key: string) => void }) {
  const t = useAppTheme();
  const [search, setSearch] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const [sort, setSort] = useState<PeopleSortKey>(block.sorts[0]?.key ?? "pct");
  const [limit, setLimit] = useState(PAGE);

  // Within each section, people stay grouped by category (in the order the
  // server lists the category chips), then by the chosen sort.
  const rank = useMemo(() => new Map(block.filters.map((f, i) => [f.key, i])), [block.filters]);
  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = block.rows.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q)) &&
        (chips.length === 0 || chips.some((chip) => r.tags.includes(chip)))
    );
    const value = (r: PeopleRow) => (sort === "name" ? r.name.toLowerCase() : sort === "pct" ? r.pct : r.last);
    const compare = (a: PeopleRow, b: PeopleRow) => {
      const byCategory = (rank.get(a.tags[0]) ?? 99) - (rank.get(b.tags[0]) ?? 99);
      if (byCategory) return byCategory;
      const va = value(a);
      const vb = value(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * SORT_DIRECTION[sort] || a.name.localeCompare(b.name);
    };
    return block.sections
      .map((s) => ({ ...s, rows: rows.filter((r) => r.section === s.key).sort(compare) }))
      .filter((s) => s.rows.length > 0);
  }, [block, search, chips, sort, rank]);

  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  let shown = 0;
  const toggle = (key: string) => {
    setChips((current) => (current.includes(key) ? current.filter((c) => c !== key) : [...current, key]));
    setLimit(PAGE);
  };
  const searchFor = (text: string) => {
    setSearch(text);
    setLimit(PAGE);
  };

  return (
    <Panel
      title={block.title}
      icon="people-outline"
      trailing={<Text style={[typography.caption, { color: t.muted }]}>{total}</Text>}
    >
      {block.subtitle ? <Text style={[typography.caption, { color: t.muted }]}>{block.subtitle}</Text> : null}
      <SearchField value={search} onChangeText={searchFor} placeholder="Search by name" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {block.filters.map((f) => {
          const on = chips.includes(f.key);
          const colour = f.colour ?? t.warning;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => toggle(f.key)}
              style={[styles.chip, { borderColor: on ? colour : t.separator, backgroundColor: on ? `${colour}22` : t.card }]}
            >
              <View style={[styles.dot, { backgroundColor: colour }]} />
              <Text style={[typography.caption, { color: t.text, fontWeight: on ? "800" : "600" }]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.sortRow}>
        <Text style={[typography.caption, { color: t.muted }]}>Sort</Text>
        {block.sorts.map((s) => (
          <Pressable
            key={s.key}
            accessibilityRole="button"
            accessibilityState={{ selected: sort === s.key }}
            onPress={() => setSort(s.key)}
            style={[styles.sortChip, { backgroundColor: sort === s.key ? t.primarySoft : "transparent" }]}
          >
            <Text style={[typography.caption, { color: sort === s.key ? t.primary : t.muted, fontWeight: "700" }]}>
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {total === 0 ? (
        <Text style={[typography.caption, { color: t.muted, paddingVertical: spacing.md }]}>
          {block.rows.length === 0 ? block.emptyText : "Nobody matches."}
        </Text>
      ) : (
        sections.map((section) => {
          if (shown >= limit) return null;
          const rows = section.rows.slice(0, limit - shown);
          shown += rows.length;
          return (
            <View key={section.key}>
              <Text style={[typography.label, styles.sectionLabel, { color: t.muted }]}>
                {`${section.label} · ${section.rows.length}`}
              </Text>
              {rows.map((r) => (
                <PersonRow
                  key={r.key}
                  name={r.name}
                  photo={r.photo}
                  pill={r.category}
                  lines={[r.secondary]}
                  trailing={r.primary}
                  warning={r.warning}
                  onPress={() => onOpen?.(r.key)}
                />
              ))}
            </View>
          );
        })
      )}
      {total > limit ? (
        <Btn title={`Show ${Math.min(PAGE, total - limit)} more`} variant="ghost" onPress={() => setLimit(limit + PAGE)} />
      ) : null}
    </Panel>
  );
}

function FollowUpGroups({ block, onOpen }: { block: Block<"followUpGroups">; onOpen?: (key: string) => void }) {
  const t = useAppTheme();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const total = block.groups.reduce((n, g) => n + g.people.length, 0);
  return (
    <ReadableColumn maxWidth={640}>
      <Panel
        title={block.title}
        icon={block.icon}
        trailing={<Text style={[typography.caption, { color: t.muted }]}>{total}</Text>}
      >
        {total === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={22} color={t.success} />
            <Text style={[typography.caption, { color: t.muted }]}>{block.emptyText}</Text>
          </View>
        ) : (
          block.groups.map((group) => {
            const all = open[group.key];
            const people: FollowRow[] = all ? group.people : group.people.slice(0, block.preview);
            return (
              <View key={group.key}>
                <Text style={[typography.label, styles.sectionLabel, { color: t.muted }]}>
                  {`${group.title} · ${group.people.length}`}
                </Text>
                {people.map((p) => (
                  <PersonRow
                    key={p.key}
                    name={p.name}
                    photo={p.photo}
                    pill={p.category}
                    lines={[p.reason, p.secondary]}
                    onPress={() => onOpen?.(p.key)}
                  />
                ))}
                {group.people.length > block.preview ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setOpen({ ...open, [group.key]: !all })}
                    style={({ pressed }) => [styles.more, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={[typography.caption, { color: t.primary, fontWeight: "700" }]}>
                      {all ? "Show fewer" : `Show all ${group.people.length}`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })
        )}
      </Panel>
    </ReadableColumn>
  );
}

/** Draws a campus weeklies block, or nothing for a type it doesn't know. */
export function renderWeeklyBlock(
  block: WeeklyBlock,
  key: string,
  ctx: {
    onOpenPerson?: (personKey: string) => void;
    onEditMember?: (memberId: string) => void;
    colours: ReturnType<typeof useAppTheme>;
  }
): ReactNode {
  const t = ctx.colours;
  switch (block.type) {
    case "people":
      return <PeopleList key={key} block={block} onOpen={ctx.onOpenPerson} />;
    case "followUpGroups":
      return <FollowUpGroups key={key} block={block} onOpen={ctx.onOpenPerson} />;
    case "memberHeader":
      return (
        <View key={key} style={[styles.panel, styles.header, { backgroundColor: t.card }, t.shadowCard]}>
          <Avatar photo={block.photo ?? null} name={block.name} size={72} />
          <Text style={[typography.title, { color: t.text, textAlign: "center" }]}>{block.name}</Text>
          {block.lines.length ? (
            <Text style={[typography.body, { color: t.muted, textAlign: "center" }]}>{block.lines.join(" · ")}</Text>
          ) : null}
          {block.category ? (
            <View style={{ alignSelf: "center" }}>
              <CategoryPill pill={block.category} />
            </View>
          ) : null}
          {block.reason ? (
            <Text style={[typography.caption, { color: t.text, textAlign: "center" }]}>{block.reason}</Text>
          ) : null}
          {block.memberId && ctx.onEditMember ? (
            <Btn title="Edit member" icon="create-outline" variant="ghost" onPress={() => ctx.onEditMember?.(block.memberId!)} />
          ) : null}
        </View>
      );
    case "keyValues":
      return (
        <Panel key={key} title={block.title} icon="id-card-outline">
          {block.rows.map((row) => (
            <View key={row.label} style={[styles.kv, { borderTopColor: t.separator }]}>
              <Text style={[typography.caption, { color: t.muted, width: 120 }]}>{row.label}</Text>
              <Text style={[typography.body, { color: t.text, flex: 1 }]} selectable>
                {row.value}
              </Text>
            </View>
          ))}
        </Panel>
      );
    case "termHistory":
      return (
        <Panel key={key} title={block.title} icon="calendar-outline">
          {block.rows.map((row) => (
            <View key={row.key} style={[styles.kv, { borderTopColor: t.separator }]}>
              <Text style={[typography.headline, { color: t.text, width: 90 }]}>{row.label}</Text>
              <Text style={[typography.body, { color: t.text, flex: 1 }]}>{row.primary}</Text>
              <CategoryPill pill={row.category} />
            </View>
          ))}
        </Panel>
      );
    case "weekGrid":
      return (
        <Panel key={key} title={block.title} icon="grid-outline">
          {block.subtitle ? <Text style={[typography.caption, { color: t.muted }]}>{block.subtitle}</Text> : null}
          <View style={styles.grid}>
            {block.weeks.map((w, i) => (
              <View
                key={`${w.label}-${i}`}
                accessibilityLabel={`${w.label}: ${w.came ? "came" : "missed"}`}
                style={[
                  styles.week,
                  { borderColor: w.came ? t.success : t.separator, backgroundColor: w.came ? t.success : "transparent" },
                ]}
              >
                <Text style={[typography.caption, { color: w.came ? t.card : t.muted, fontWeight: "800" }]}>{w.label}</Text>
              </View>
            ))}
          </View>
        </Panel>
      );
    case "eventList":
      return (
        <Panel key={key} title={block.title} icon="list-outline">
          {block.rows.length === 0 ? (
            <Text style={[typography.caption, { color: t.muted }]}>{block.emptyText}</Text>
          ) : (
            block.rows.map((row, i) => (
              <View key={i} style={[styles.kv, { borderTopColor: t.separator }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typography.body, { color: t.text }]} numberOfLines={1}>
                    {row.title}
                  </Text>
                  <Text style={[typography.caption, { color: t.muted }]}>{row.subtitle}</Text>
                </View>
                {row.tag ? <CategoryPill pill={{ label: row.tag, colour: t.success }} /> : null}
              </View>
            ))
          )}
        </Panel>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  panelHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  header: { alignItems: "center", gap: spacing.sm },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nameLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  chipRow: { gap: spacing.xs, paddingVertical: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  sortRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  sortChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
  sectionLabel: { marginTop: spacing.sm, marginBottom: spacing.xs },
  empty: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  more: { alignSelf: "center", paddingVertical: spacing.sm },
  kv: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  week: {
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: "center",
  },
});
