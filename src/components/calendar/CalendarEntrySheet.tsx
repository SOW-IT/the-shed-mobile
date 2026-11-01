import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  calendarCategoryLabel,
  ENTRY_CATEGORIES,
  hourAfter,
  MAX_ENTRY_NAME,
  MAX_ENTRY_NOTES,
  PICKABLE_CATEGORIES,
  type Due,
  type EntryCategory,
  type PickableCategory,
} from "@shared/calendar";
import {
  addDaysToDateInputValue,
  parseDateTimeInputValues,
  toDateInputValue,
  toTimeInputValue,
} from "@shared/datetime";
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
  Segmented,
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
  due: Due | null;
};

const KINDS = [
  { key: "event", label: "Event" },
  { key: "deadline", label: "Deadline" },
];
const DEFAULT_DUE_TIME = "09:00";

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
  time,
  subgroups,
  defaultSubgroup,
  entry,
}: {
  visible: boolean;
  onClose: () => void;
  day: string;
  // "18:00" when a time was picked on the week view.
  time?: string;
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
  const [deadline, setDeadline] = useState(false);
  const [allDay, setAllDay] = useState(true);
  const [dueTime, setDueTime] = useState(DEFAULT_DUE_TIME);
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
      // A deadline has no length, so if it's switched to an event it runs an hour.
      const fromTime = entry.due === "day" ? DEFAULT_DUE_TIME : toTimeInputValue(new Date(entry.dateStart));
      setStartTime(fromTime);
      setEndTime(entry.due ? hourAfter(fromTime) : toTimeInputValue(new Date(entry.dateEnd)));
      setWhere(entry.subgroups);
      setCategory(entry.category);
      setNotes(entry.notes ?? "");
      setAttendance(false);
      setDeadline(entry.due !== null);
      setAllDay(entry.due !== "time");
      setDueTime(entry.due === "time" ? toTimeInputValue(new Date(entry.dateStart)) : DEFAULT_DUE_TIME);
    } else {
      setName("");
      setDateStr(day);
      setEndDateStr(day);
      setMultiDay(false);
      setStartTime(time ?? "17:00");
      setEndTime(time ? hourAfter(time) : "19:00");
      setWhere([defaultSubgroup]);
      setCategory(isOrgWideSubgroup(defaultSubgroup) ? "sow" : "campus");
      setNotes("");
      setAttendance(false);
      setDeadline(false);
      setAllDay(true);
      setDueTime(time ?? DEFAULT_DUE_TIME);
    }
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [visible, entry, day, time, defaultSubgroup]);

  const DateInput = Platform.OS === "web" ? WebDateInput : NativeDateInput;
  const TimeInput = Platform.OS === "web" ? WebTimeInput : NativeTimeInput;

  const save = () =>
    runBusy(
      busy,
      setBusy,
      setError,
      async () => {
        if (deadline) {
          const at = parseDateTimeInputValues(dateStr, allDay ? "00:00" : dueTime);
          if (at === null) throw new Error("Enter a valid date (YYYY-MM-DD) and time (HH:MM).");
          const due: Due = allDay ? "day" : "time";
          const fields = { name, dateStart: at, dateEnd: at, subgroups: where, category, notes, due };
          await (entry ? updateEntry({ id: entry.id, ...fields }) : addEntry(fields));
          return;
        }
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
                title={entry ? "Save" : attendance && !deadline ? "Create Event" : "Add to Calendar"}
                loading={busy}
                disabled={
                  !name.trim() ||
                  where.length === 0 ||
                  // TWIG and PPN need their tags loaded before the event can carry them.
                  (attendance && !deadline && (category === "twig" || category === "ppn") && tags === undefined)
                }
                onPress={() => void save()}
              />
            </View>
          </View>
        }
      >
        <Segmented
          segments={KINDS}
          active={deadline ? "deadline" : "event"}
          onChange={(key) => {
            const next = key === "deadline";
            setDeadline(next);
            // A new deadline starts as one; an event's usual campus or SOW wouldn't say much.
            if (next && !entry && (category === "campus" || category === "sow")) setCategory("deadline");
          }}
        />
        {deadline ? (
          <Muted>Something due or going out on a day, like applications closing or a post going live.</Muted>
        ) : null}
        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder={deadline ? "e.g. Applications close" : "e.g. Marketing meeting"}
          autoCapitalize="sentences"
          maxLength={MAX_ENTRY_NAME}
        />
        <DateInput
          label={multiDay && !deadline ? "Start date" : "Date"}
          value={dateStr}
          onChange={(value) => {
            setDateStr(value);
            if (endDateStr < value) setEndDateStr(addDaysToDateInputValue(value, 1) ?? value);
          }}
        />
        {deadline ? (
          <>
            <Checkbox checked={allDay} onToggle={() => setAllDay(!allDay)} label="All day" />
            {allDay ? null : <TimeInput label="Time" value={dueTime} onChange={setDueTime} />}
          </>
        ) : (
          <>
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
          </>
        )}
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
        {entry || deadline ? null : (
          <Checkbox
            checked={attendance}
            onToggle={() => setAttendance(!attendance)}
            label="Take attendance at this event"
          />
        )}
        {attendance && !entry && !deadline ? (
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
        {/* Inside the sheet: iOS won't show a second modal beside one that's open. */}
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
      </Sheet>
    </>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
});
