import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { TAG_COLOUR_NAMES, tagColourHex } from "../../../shared/attendanceTags";
import { subgroupColour, subgroupLabel } from "../../../shared/rollcall";
import { AttendanceTagPill } from "@/components/attendance/AttendanceTagPill";
import {
  Btn,
  Card,
  errorMessage,
  Field,
  LoadingState,
  Muted,
  Sheet,
  Txt,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

type TagDraft = {
  id?: Id<"attendanceTags">;
  name: string;
  colour?: string;
  subgroups?: string[];
};

/** Event tag colours and names for the current staff year. */
export function SettingsTab({ year, subgroups }: { year: number; subgroups: string[] }) {
  const t = useAppTheme();
  const tags = useQuery(api.attendanceTags.list, { year });
  const saveTags = useMutation(api.attendanceTags.saveAll);

  const [tagDrafts, setTagDrafts] = useState<TagDraft[]>([]);
  const [tagDeletes, setTagDeletes] = useState<Id<"attendanceTags">[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [colourIndex, setColourIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [deleteText, setDeleteText] = useState("");

  useEffect(() => {
    if (tags) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync drafts from server
      setTagDrafts(
        tags.map((tag) => ({
          id: tag._id,
          name: tag.name,
          colour: tag.colour,
          subgroups: tag.subgroups,
        }))
      );
      setTagDeletes([]);
    }
  }, [tags]);

  if (tags === undefined) return <LoadingState />;

  const addTag = () =>
    setTagDrafts((prev) => [...prev, { name: "", colour: "blue" }]);

  const saveTagsNow = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveTags({ year, tags: tagDrafts, deleteIds: tagDeletes });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <View style={{ marginBottom: spacing.md }}>
        <Muted>Event categories (e.g. Weekly Meeting) with colours.</Muted>
      </View>
      {tagDrafts.map((tag, i) => (
        <Card
          key={tag.id ?? `new-${i}`}
          style={[
            styles.tagCard,
            {
              borderColor: tag.colour ? tagColourHex(tag.colour) : t.separator,
            },
          ]}
        >
          <Field
            label="Name"
            value={tag.name}
            onChangeText={(name) =>
              setTagDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, name } : x)))
            }
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setColourIndex(i)}
            style={({ pressed }) => [
              styles.colourButton,
              { borderColor: t.separator },
              pressed && { opacity: 0.7 },
            ]}
          >
            <AttendanceTagPill
              name={tag.colour ? `Colour: ${tag.colour}` : "Choose colour"}
              colour={tag.colour}
              small
            />
          </Pressable>
          <View style={{ gap: spacing.xs }}>
            <Muted>Applies to</Muted>
            <View style={styles.scopeRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setTagDrafts((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, subgroups: undefined } : x))
                  )
                }
              >
                <AttendanceTagPill name="All groups" selected={!tag.subgroups?.length} small />
              </Pressable>
              {subgroups.map((subgroup) => (
                <Pressable
                  key={subgroup}
                  accessibilityRole="button"
                  onPress={() =>
                    setTagDrafts((prev) =>
                      prev.map((x, j) => {
                        if (j !== i) return x;
                        const set = new Set(x.subgroups ?? []);
                        if (set.has(subgroup)) set.delete(subgroup);
                        else set.add(subgroup);
                        return { ...x, subgroups: [...set] };
                      })
                    )
                  }
                >
                  <AttendanceTagPill
                    name={subgroupLabel(subgroup)}
                    selected={tag.subgroups?.includes(subgroup)}
                    colour={subgroupColour(subgroup)}
                    small
                  />
                </Pressable>
              ))}
            </View>
          </View>
          {tag.id ? (
            <Btn
              title="Remove"
              variant="danger"
              onPress={() => {
                setDeleteIndex(i);
                setDeleteText("");
              }}
            />
          ) : (
            <Btn
              title="Discard"
              variant="ghost"
              onPress={() => setTagDrafts((prev) => prev.filter((_, j) => j !== i))}
            />
          )}
        </Card>
      ))}
      <Btn title="Add tag" variant="ghost" onPress={addTag} />
      <Btn title="Save tags" onPress={() => void saveTagsNow()} loading={saving} />

      {error ? (
        <Txt style={[typography.caption, { color: t.danger, marginTop: spacing.sm }]}>
          {error}
        </Txt>
      ) : null}
      <Sheet
        visible={colourIndex !== null}
        onClose={() => setColourIndex(null)}
        title="Choose tag colour"
      >
        <View style={styles.scopeRow}>
          {TAG_COLOUR_NAMES.map((colour) => (
            <Pressable
              key={colour}
              onPress={() => {
                if (colourIndex === null) return;
                setTagDrafts((prev) =>
                  prev.map((x, j) => (j === colourIndex ? { ...x, colour } : x))
                );
                setColourIndex(null);
              }}
            >
              <AttendanceTagPill
                name={colour}
                colour={colour}
                selected={tagDrafts[colourIndex ?? -1]?.colour === colour}
                small
              />
            </Pressable>
          ))}
        </View>
      </Sheet>
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
          This removes the tag from all events that use it. Type the tag name to confirm.
        </Muted>
        <Field
          label="Tag name"
          value={deleteText}
          onChangeText={setDeleteText}
          placeholder={deleteIndex !== null ? tagDrafts[deleteIndex]?.name : ""}
        />
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
  colourButton: {
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.full,
    padding: 2,
  },
  scopeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
});
