import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { TAG_COLOUR_NAMES, tagColourHex } from "../../../shared/attendanceTags";
import { isOrgWideSubgroup, isWeekliesTagName, tagListOf, tagScope, type TagList } from "../../../shared/rollcall";
import { AttendanceTagPill } from "@/components/attendance/AttendanceTagPill";
import type { SaveControls } from "@/components/attendance/MetadataTab";
import { SubgroupScopePicker } from "@/components/attendance/SubgroupScopePicker";
import {
  Btn,
  Card,
  errorMessage,
  Field,
  IconButton,
  LoadingState,
  Muted,
  SectionTitle,
  Segmented,
  Sheet,
  Txt,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

type TagDraft = {
  id?: Id<"attendanceTags">;
  name: string;
  colour?: string;
  subgroups?: string[];
  list: TagList;
};

const withList = (draft: TagDraft, list: TagList): TagDraft =>
  list === "weeklies" ? { ...draft, list, subgroups: tagScope(list, draft.subgroups) } : { ...draft, list };

const LISTS: { list: TagList; title: string; hint: string }[] = [
  { list: "weeklies", title: "Weeklies", hint: "Labels for a weekly, like BAM or PPN." },
  { list: "events", title: "Other events", hint: "For every other kind of event." },
];

const normalizeTag = (tag: TagDraft) => ({
  id: tag.id,
  name: tag.name.trim(),
  colour: tag.colour ?? "",
  subgroups: [...(tag.subgroups ?? [])].sort(),
  list: tag.list,
});

const tagsEqual = (a: TagDraft[], b: TagDraft[]) =>
  JSON.stringify(a.map(normalizeTag)) === JSON.stringify(b.map(normalizeTag));

export function SettingsTab({
  subgroups,
  onSaveStateChange,
}: {
  subgroups: string[];
  onSaveStateChange?: (controls: SaveControls) => void;
}) {
  const t = useAppTheme();
  const allTags = useQuery(api.attendanceTags.list, {});
  const tags = allTags?.filter((tag) => !isWeekliesTagName(tag.name));
  const saveTags = useMutation(api.attendanceTags.saveAll);

  const [tagDrafts, setTagDrafts] = useState<TagDraft[]>([]);
  const [tagDeletes, setTagDeletes] = useState<Id<"attendanceTags">[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [deleteText, setDeleteText] = useState("");
  const [colourIndex, setColourIndex] = useState<number | null>(null);

  useEffect(() => {
    if (allTags) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync drafts from server
      setTagDrafts(
        allTags
          .filter((tag) => !isWeekliesTagName(tag.name))
          .map((tag) => ({
            id: tag._id,
            name: tag.name,
            colour: tag.colour,
            subgroups: tag.subgroups,
            list: tagListOf(tag),
          }))
      );
      setTagDeletes([]);
    }
  }, [allTags]);

  const serverTagDrafts: TagDraft[] = (tags ?? []).map((tag) => ({
    id: tag._id,
    name: tag.name,
    colour: tag.colour,
    subgroups: tag.subgroups,
    list: tagListOf(tag),
  }));
  const tagsChanged =
    tagDeletes.length > 0 || !tagsEqual(tagDrafts, serverTagDrafts);

  const saveTagsNow = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveTags({ tags: tagDrafts.map((draft) => withList(draft, draft.list)), deleteIds: tagDeletes });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const revertTags = () => {
    setTagDrafts(serverTagDrafts);
    setTagDeletes([]);
    setError(null);
  };

  useEffect(() => {
    onSaveStateChange?.({
      dirty: tagsChanged,
      saving,
      save: () => void saveTagsNow(),
      revert: revertTags,
      error,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagsChanged, saving, tagDrafts, tagDeletes, error]);

  if (tags === undefined) return <LoadingState />;

  const scopeFor = (list: TagList) =>
    list === "weeklies" ? subgroups.filter((subgroup) => !isOrgWideSubgroup(subgroup)) : subgroups;

  const addTag = (list: TagList) =>
    setTagDrafts((prev) => [
      ...prev,
      { name: "", colour: "blue", subgroups: [...scopeFor(list)], list },
    ]);

  const indexed = tagDrafts.map((tag, i) => ({ tag, i }));

  return (
    <>
      {LISTS.map((section) => (
        <View key={section.list} style={{ marginBottom: spacing.md }}>
          <SectionTitle>{section.title}</SectionTitle>
          <Muted>{section.hint}</Muted>
          <View style={{ height: spacing.sm }} />
          {indexed.filter(({ tag }) => tag.list === section.list).map(({ tag, i }) => (
            <Card
              key={tag.id ?? `new-${i}`}
              style={[
                styles.tagCard,
                {
                  borderColor: tag.colour ? tagColourHex(tag.colour) : t.separator,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <AttendanceTagPill
                  name={tag.name.trim() || "New tag"}
                  colour={tag.colour}
                />
                <IconButton
                  name={tag.id ? "trash-outline" : "close"}
                  size={32}
                  color={tag.id ? t.danger : t.ghostText}
                  bg={tag.id ? t.dangerSoft : t.ghost}
                  accessibilityLabel={tag.id ? "Remove tag" : "Discard tag"}
                  onPress={() => {
                    if (tag.id) {
                      setDeleteIndex(i);
                      setDeleteText("");
                    } else {
                      setTagDrafts((prev) => prev.filter((_, j) => j !== i));
                    }
                  }}
                />
              </View>

              <Field
                label="Name"
                value={tag.name}
                onChangeText={(name) =>
                  setTagDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, name } : x)))
                }
              />

              <View style={{ gap: spacing.xs }}>
                <Muted>Colour</Muted>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Choose colour, currently ${tag.colour ?? "blue"}`}
                  onPress={() => setColourIndex(i)}
                  style={({ pressed }) => [
                    styles.colourPickerButton,
                    { borderColor: t.border, backgroundColor: t.card },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={styles.colourPickerValue}>
                    <View
                      style={[
                        styles.colourDot,
                        { backgroundColor: tagColourHex(tag.colour ?? "blue") },
                      ]}
                    />
                    <Text style={[typography.body, { color: t.text, fontWeight: "700" }]}>
                      {tag.colour ?? "blue"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={18} color={t.ghostText} />
                </Pressable>
              </View>

              <View style={{ gap: spacing.xs }}>
                <Muted>Used on</Muted>
                <Segmented
                  segments={LISTS.map((l) => ({ key: l.list, label: l.title }))}
                  active={tag.list}
                  onChange={(key) =>
                    setTagDrafts((prev) =>
                      prev.map((x, j) => (j === i ? withList(x, key as TagList) : x))
                    )
                  }
                />
              </View>

              <View style={{ gap: spacing.xs }}>
                <Muted>Applies to</Muted>
                <SubgroupScopePicker
                  subgroups={scopeFor(tag.list)}
                  isSelected={(subgroup) =>
                    tag.subgroups?.length ? tag.subgroups.includes(subgroup) : true
                  }
                  onToggle={(subgroup) =>
                    setTagDrafts((prev) =>
                      prev.map((x, j) => {
                        if (j !== i) return x;
                        const set = new Set(x.subgroups?.length ? x.subgroups : scopeFor(x.list));
                        if (set.has(subgroup)) set.delete(subgroup);
                        else set.add(subgroup);
                        if (set.size === 0) return x;
                        return { ...x, subgroups: [...set] };
                      })
                    )
                  }
                />
              </View>
            </Card>
          ))}
          <Btn
            title={section.list === "weeklies" ? "Add weekly tag" : "Add event tag"}
            variant="ghost"
            onPress={() => addTag(section.list)}
          />
        </View>
      ))}

      {error ? (
        <Txt style={[typography.caption, { color: t.danger, marginTop: spacing.sm }]}>
          {error}
        </Txt>
      ) : null}
      <Sheet
        visible={deleteIndex !== null}
        onClose={() => setDeleteIndex(null)}
        title="Delete tag"
        footer={
          <Btn
            title="Delete tag"
            variant="danger"
            disabled={
              deleteIndex === null ||
              deleteText.trim() !== tagDrafts[deleteIndex]?.name.trim()
            }
            onPress={() => {
              if (deleteIndex === null) return;
              const tag = tagDrafts[deleteIndex];
              if (tag?.id) setTagDeletes((d) => [...d, tag.id!]);
              setTagDrafts((prev) => prev.filter((_, j) => j !== deleteIndex));
              setDeleteIndex(null);
            }}
          />
        }
      >
        <Muted>
          This removes the tag from all events that use it. Type{" "}
          <Text style={{ fontWeight: "800" }}>
            {deleteIndex !== null ? tagDrafts[deleteIndex]?.name?.trim() : ""}
          </Text>{" "}
          to confirm.
        </Muted>
        <Field
          label="Tag name"
          value={deleteText}
          onChangeText={setDeleteText}
          placeholder={deleteIndex !== null ? tagDrafts[deleteIndex]?.name : ""}
        />
      </Sheet>
      <Sheet
        visible={colourIndex !== null}
        onClose={() => setColourIndex(null)}
        title="Choose tag colour"
      >
        <View style={{ gap: spacing.sm }}>
          {TAG_COLOUR_NAMES.map((colour) => {
            const selected =
              colourIndex !== null && tagDrafts[colourIndex]?.colour === colour;
            return (
              <Pressable
                key={colour}
                accessibilityRole="button"
                accessibilityLabel={`Colour ${colour}`}
                accessibilityState={{ selected }}
                onPress={() => {
                  setTagDrafts((prev) =>
                    prev.map((x, j) => (j === colourIndex ? { ...x, colour } : x))
                  );
                  setColourIndex(null);
                }}
                style={({ pressed }) => [
                  styles.colourOption,
                  { borderColor: selected ? t.primary : t.border, backgroundColor: t.card },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={styles.colourPickerValue}>
                  <View
                    style={[
                      styles.colourDot,
                      { backgroundColor: tagColourHex(colour) },
                    ]}
                  />
                  <Text style={[typography.body, { color: t.text, fontWeight: "700" }]}>
                    {colour}
                  </Text>
                </View>
                {selected ? <Ionicons name="checkmark" size={20} color={t.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  tagCard: {
    marginBottom: spacing.sm,
    gap: spacing.sm,
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  colourPickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  colourPickerValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  colourDot: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
  },
  colourOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderWidth: 2,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
