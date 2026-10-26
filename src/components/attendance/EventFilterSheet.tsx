import { useQuery } from "convex/react";
import { StyleSheet, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  EVENT_HOST_LABEL,
  eventListFilterCount,
  isWeekliesTagName,
  subgroupMatches,
  TAG_LIST_LABEL,
  tagListOf,
  type EventHostFilter,
  type TagList,
} from "../../../shared/rollcall";
import { AttendanceTagPill } from "@/components/attendance/AttendanceTagPill";
import { Btn, Muted, Row, Segmented, Sheet, Txt } from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

export type EventsFilter = { tagIds: Id<"attendanceTags">[]; host?: EventHostFilter };

export const NO_EVENTS_FILTER: EventsFilter = { tagIds: [] };

const TAG_LISTS: TagList[] = ["weeklies", "events"];

const HOST_SEGMENTS = [
  { key: "all", label: "All" },
  { key: "here", label: EVENT_HOST_LABEL.here },
  { key: "shared", label: "Shared" },
];

export function EventFilterSheet({
  visible,
  onClose,
  subgroup,
  filter,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  subgroup: string;
  filter: EventsFilter;
  onChange: (filter: EventsFilter) => void;
}) {
  const t = useAppTheme();
  const tags = useQuery(api.attendanceTags.list, {});
  const inScope = (tag: Doc<"attendanceTags">) =>
    !tag.subgroups?.length ||
    tag.subgroups.some((tagSubgroup) => subgroupMatches(tagSubgroup, subgroup));
  const shownTags = (tags ?? []).filter(
    (tag) => !isWeekliesTagName(tag.name) && (inScope(tag) || filter.tagIds.includes(tag._id))
  );
  const toggleTag = (tagId: Id<"attendanceTags">) =>
    onChange({
      ...filter,
      tagIds: filter.tagIds.includes(tagId)
        ? filter.tagIds.filter((id) => id !== tagId)
        : [...filter.tagIds, tagId],
    });
  const changeHost = (key: string) =>
    onChange({ ...filter, host: key === "here" || key === "shared" ? key : undefined });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filter events"
      footer={
        <Row spread>
          <Btn
            title="Clear all"
            variant="ghost"
            disabled={eventListFilterCount(filter) === 0}
            onPress={() => onChange(NO_EVENTS_FILTER)}
          />
          <Btn title="Done" onPress={onClose} />
        </Row>
      }
    >
      <View style={styles.section}>
        <Txt style={[typography.label, { color: t.muted }]}>Host</Txt>
        <Segmented
          segments={HOST_SEGMENTS}
          active={filter.host ?? "all"}
          onChange={changeHost}
        />
      </View>
      {TAG_LISTS.map((list) => {
        const listTags = shownTags.filter((tag) => tagListOf(tag) === list);
        if (listTags.length === 0) return null;
        return (
          <View key={list} style={styles.section}>
            <Txt style={[typography.label, { color: t.muted }]}>{TAG_LIST_LABEL[list]}</Txt>
            <View style={styles.wrap}>
              {listTags.map((tag) => (
                <AttendanceTagPill
                  key={tag._id}
                  name={tag.name}
                  colour={tag.colour}
                  selected={filter.tagIds.includes(tag._id)}
                  onPress={() => toggleTag(tag._id)}
                />
              ))}
            </View>
          </View>
        );
      })}
      {tags === undefined ? null : shownTags.length === 0 ? (
        <Muted>No tags yet. Add them in Tags.</Muted>
      ) : (
        <Muted>Pick several tags to see events with any of them.</Muted>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
