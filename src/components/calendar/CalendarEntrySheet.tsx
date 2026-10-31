import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  calendarCategoryLabel,
  ENTRY_CATEGORIES,
  MAX_ENTRY_NAME,
  MAX_ENTRY_NOTES,
  PICKABLE_CATEGORIES,
  type EntryCategory,
  type PickableCategory,
} from "@shared/calendar";
import { addDaysToDateInputValue, toDateInputValue, toTimeInputValue } from "@shared/datetime";
import { eventWindowFromInputs, isOrgWideSubgroup, subgroupLabel, tagListOf } from "@shared/rollcall";
import { NativeDateInput, NativeTimeInput } from "@/components/NativeDateTimeField";
import { WebDateInput, WebTimeInput } from "@/components/WebDateTimeInput";
import {
  Btn,
  Checkbox,
  ConfirmDialog,
  ErrorBanner,
  Field,
  Muted,
  MultiSelect,
  runBusy,
  Select,
  Sheet,
} from "@/components/ui";
import { spacing } from "@/theme";

export type EditableEntry = {
  id: Id<"calendarEntries">;
  name: string;
  dateStart: number;
  dateEnd: number;
  subgroups: string[];
  category: EntryCategory;
  notes: string | null;
};

const CATEGORY_OPTIONS = ENTRY_CATEGORIES.map((key) => ({
  value: key,
  label: calendarCategoryLabel(key),
}));

const isPickable = (c: EntryCategory): c is PickableCategory =>
  (PICKABLE_CATEGORIES as readonly string[]).includes(c);

// Adds a calendar entry, or an attendance event when "Take attendance" is ticked; edits entries.
export const CalendarEntrySheet = ({
  visible,
  onClose,
  day,
  subgroups,
  defaultSubgroup,
  entry,
}: {
  visible: boolean;
  onClose: () => void;
  day: string;
  subgroups: string[];
  defaultSubgroup: string;
  entry?: EditableEntry;
}) => {
  const tags = useQuery(api.attendanceTags.list, visible ? {} : "skip");
  const addEntry = useMutation(api.calendar.addEntry);
  const updateEntry = useMutation(api.calendar.updateEntry);
  const removeEntry = useMutation(api.calendar.removeEntry);
  const createEvent = useMutation(api.events.create);

  const [name, setName] = useState("");
  const [dateStr, setDateStr] = useState(day);
  const [endDateStr, setEndDateStr] = useState(day);
  const [multiDay, setMultiDay] = useState(false);
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("19:00");
  const [where, setWhere] = useState<string[]>([defaultSubgroup]);
  const [category, setCategory] = useState<EntryCategory>("campus");
  const [notes, setNotes] = useState("");
  const [attendance, setAttendance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!visible) return;
    /* eslint-disable react-hooks/set-state-in-effect -- load the entry, or start a new one on the picked day */
    if (entry) {
      const start = toDateInputValue(new Date(entry.dateStart));
      const end = toDateInputValue(new Date(entry.dateEnd));
      setName(entry.name);
      setDateStr(start);
      setEndDateStr(end);
      setMultiDay(start !== end);
      setStartTime(toTimeInputValue(new Date(entry.dateStart)));
      setEndTime(toTimeInputValue(new Date(entry.dateEnd)));
      setWhere(entry.subgroups);
      setCategory(entry.category);
      setNotes(entry.notes ?? "");
      setAttendance(false);
    } else {
      setName("");
      setDateStr(day);
      setEndDateStr(day);
      setMultiDay(false);
      setStartTime("17:00");
      setEndTime("19:00");
      setWhere([defaultSubgroup]);
      setCategory(isOrgWideSubgroup(defaultSubgroup) ? "sow" : "campus");
      setNotes("");
      setAttendance(false);
    }
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [visible, entry, day, defaultSubgroup]);

  const DateInput = Platform.OS === "web" ? WebDateInput : NativeDateInput;
  const TimeInput = Platform.OS === "web" ? WebTimeInput : NativeTimeInput;

  const save = () =>
    runBusy(
      busy,
      setBusy,
      setError,
      async () => {
        const window = eventWindowFromInputs({
          startDate: dateStr,
          startTime,
          endDate: multiDay ? endDateStr : dateStr,
          endTime,
        });
        if ("error" in window) throw new Error(window.error);
        const fields = { name, ...window, subgroups: where, category };
        if (entry) {
          await updateEntry({ id: entry.id, ...fields, notes });
        } else if (attendance) {
          // TWIG and PPN are tags on an attendance event, so Insights counts them.
          const tagNamed = (n: string) =>
            (tags ?? []).find((t) => t.name === n && tagListOf(t) === "events")?._id;
          const tagIds =
            category === "ppn"
              ? [tagNamed("TWIG"), tagNamed("PPN")]
              : category === "twig"
                ? [tagNamed("TWIG")]
                : [];
          const found = tagIds.filter((id): id is Id<"attendanceTags"> => id !== undefined);
          if (found.length < tagIds.length) {
            throw new Error(
              `Attendance has no ${category === "ppn" ? "TWIG and PPN tags" : "TWIG tag"} yet, so Insights couldn't count it. Add them under Attendance → Tags first.`
            );
          }
          await createEvent({
            name,
            ...window,
            subgroups: where,
            ...(found.length ? { tagIds: found } : {}),
            ...(isPickable(category) ? { category } : {}),
          });
        } else {
          await addEntry({ ...fields, notes });
        }
      },
      onClose
    );

  return (
    <>
      <Sheet
        visible={visible}
        onClose={onClose}
        title={entry ? "Edit calendar entry" : "Add to the calendar"}
        footer={
          <View style={{ gap: spacing.sm }}>
            <ErrorBanner message={error} />
            <View style={styles.row}>
              {entry ? (
                <Btn
                  title="Delete"
                  variant="danger"
                  icon="trash-outline"
                  onPress={() => setConfirmDelete(true)}
                />
              ) : (
                <Btn title="Cancel" variant="ghost" onPress={onClose} />
              )}
              <Btn
                title={entry ? "Save" : attendance ? "Create Event" : "Add to Calendar"}
                loading={busy}
                disabled={
                  !name.trim() ||
                  where.length === 0 ||
                  // TWIG and PPN need their tags loaded before the event can carry them.
                  (attendance && (category === "twig" || category === "ppn") && tags === undefined)
                }
                onPress={() => void save()}
              />
            </View>
          </View>
        }
      >
        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          autoCapitalize="sentences"
          maxLength={MAX_ENTRY_NAME}
        />
        <DateInput
          label={multiDay ? "Start date" : "Date"}
          value={dateStr}
          onChange={(value) => {
            setDateStr(value);
            if (endDateStr < value) setEndDateStr(addDaysToDateInputValue(value, 1) ?? value);
          }}
        />
        {multiDay ? (
          <DateInput
            label="End date"
            value={endDateStr}
            min={addDaysToDateInputValue(dateStr, 1) ?? dateStr}
            onChange={setEndDateStr}
          />
        ) : null}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <TimeInput label="Start" value={startTime} onChange={setStartTime} />
          </View>
          <View style={{ flex: 1 }}>
            <TimeInput label="End" value={endTime} onChange={setEndTime} />
          </View>
        </View>
        <Checkbox
          checked={multiDay}
          onToggle={() => {
            setMultiDay(!multiDay);
            if (!multiDay) setEndDateStr(addDaysToDateInputValue(dateStr, 1) ?? dateStr);
          }}
          label="Runs over several days"
        />
        <MultiSelect
          label="Where"
          values={where}
          options={subgroups.map((s) => ({ value: s, label: subgroupLabel(s) }))}
          onSelect={setWhere}
          placeholder="Pick campuses or SOW"
        />
        <Select
          label="Category"
          value={category}
          options={CATEGORY_OPTIONS}
          onSelect={(value) => setCategory(value as EntryCategory)}
        />
        {entry ? null : (
          <Checkbox
            checked={attendance}
            onToggle={() => setAttendance(!attendance)}
            label="Take attendance at this event"
          />
        )}
        {attendance && !entry ? (
          <Muted>
            This creates an attendance event, so leaders can sign people in. It shows on the
            calendar and in Attendance.
          </Muted>
        ) : (
          <Field
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            autoCapitalize="sentences"
            maxLength={MAX_ENTRY_NOTES}
            multiline
          />
        )}
      </Sheet>
      {entry ? (
        <ConfirmDialog
          visible={confirmDelete}
          title={`Delete "${entry.name}"?`}
          message="It comes off the calendar for everyone."
          confirmLabel="Delete"
          onConfirm={() => void runBusy(busy, setBusy, setError, () => removeEntry({ id: entry.id }), onClose)}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
});
