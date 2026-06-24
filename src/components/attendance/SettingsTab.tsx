import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { TAG_COLOUR_NAMES } from "../../../shared/attendanceTags";
import { AttendanceTagPill } from "@/components/attendance/AttendanceTagPill";
import {
  Btn,
  Card,
  errorMessage,
  Field,
  LoadingState,
  Muted,
  Txt,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

type TagDraft = { id?: Id<"attendanceTags">; name: string; colour?: string };

/** Event tag colours and names for the current staff year. */
export function SettingsTab({ year }: { year: number }) {
  const t = useAppTheme();
  const tags = useQuery(api.attendanceTags.list, { year });
  const saveTags = useMutation(api.attendanceTags.saveAll);

  const [tagDrafts, setTagDrafts] = useState<TagDraft[]>([]);
  const [tagDeletes, setTagDeletes] = useState<Id<"attendanceTags">[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tags) {
      setTagDrafts(tags.map((tag) => ({ id: tag._id, name: tag.name, colour: tag.colour })));
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
        <Card key={tag.id ?? `new-${i}`} style={{ marginBottom: spacing.sm, gap: spacing.sm }}>
          <Field
            label="Name"
            value={tag.name}
            onChangeText={(name) =>
              setTagDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, name } : x)))
            }
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {TAG_COLOUR_NAMES.map((colour) => (
              <Pressable
                key={colour}
                onPress={() =>
                  setTagDrafts((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, colour } : x))
                  )
                }
              >
                <AttendanceTagPill
                  name={colour}
                  colour={colour}
                  selected={tag.colour === colour}
                  small
                />
              </Pressable>
            ))}
          </View>
          {tag.id ? (
            <Btn
              title="Remove"
              variant="danger"
              onPress={() => {
                setTagDeletes((d) => [...d, tag.id!]);
                setTagDrafts((prev) => prev.filter((_, j) => j !== i));
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
    </>
  );
}
