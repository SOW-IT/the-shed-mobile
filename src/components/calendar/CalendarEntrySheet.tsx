import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { hourAfter, MAX_ENTRY_NAME, MAX_ENTRY_NOTES, type Due } from "@shared/calendar";
import {
  addDaysToDateInputValue,
  parseDateTimeInputValues,
  toDateInputValue,
  toTimeInputValue,
} from "@shared/datetime";
import { eventWindowFromInputs, subgroupLabel } from "@shared/rollcall";
import type { AttendanceDraft } from "@/components/attendance/CreateEventSheet";
import { NativeDateInput, NativeTimeInput } from "@/components/NativeDateTimeField";
import { WebDateInput, WebTimeInput } from "@/components/WebDateTimeInput";
import {
  Btn,
  Checkbox,
  ConfirmDialog,
  ErrorBanner,
  Field,
  Muted,
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
  notes: string | null;
  due: Due | null;
};

const KINDS = [
  { key: "event", label: "Event" },
  { key: "deadline", label: "Deadline" },
];
const DEFAULT_DUE_TIME = "09:00";

// Adds or edits a calendar entry: an event or a deadline, with no campus.
// Ticking "Take attendance" picks where it's held and carries on in
// Attendance's event form (tags, weekly, other campuses), which creates the
// attendance event and, for an existing entry, replaces it.
export const CalendarEntrySheet = ({
  visible,
  onClose,
  day,
  time,
  subgroups,
  defaultSubgroup,
  entry,
  onTakeAttendance,
}: {
  visible: boolean;
  onClose: () => void;
  day: string;
  // "18:00" when a time was picked on the week view.
  time?: string;
  subgroups: string[];
  defaultSubgroup: string;
  entry?: EditableEntry;
  onTakeAttendance: (subgroup: string, draft: AttendanceDraft) => void;
}) => {
  const addEntry = useMutation(api.calendar.addEntry);
  const updateEntry = useMutation(api.calendar.updateEntry);
  const removeEntry = useMutation(api.calendar.removeEntry);

  const [name, setName] = useState("");
  const [dateStr, setDateStr] = useState(day);
  const [endDateStr, setEndDateStr] = useState(day);
  const [multiDay, setMultiDay] = useState(false);
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("19:00");
  const [where, setWhere] = useState(defaultSubgroup);
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
      // A deadline has no length, so if it's switched to an event it runs an hour;
      // one due at 11:59 pm becomes 11:00 to 11:59 pm.
      const dueAt = entry.due === "day" ? DEFAULT_DUE_TIME : toTimeInputValue(new Date(entry.dateStart));
      const fromTime = entry.due && hourAfter(dueAt) <= dueAt ? "23:00" : dueAt;
      setStartTime(entry.due ? fromTime : toTimeInputValue(new Date(entry.dateStart)));
      setEndTime(entry.due ? hourAfter(fromTime) : toTimeInputValue(new Date(entry.dateEnd)));
      setNotes(entry.notes ?? "");
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
      setNotes("");
      setDeadline(false);
      setAllDay(true);
      setDueTime(time ?? DEFAULT_DUE_TIME);
    }
    setWhere(defaultSubgroup);
    setAttendance(false);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [visible, entry, day, time, defaultSubgroup]);

  const DateInput = Platform.OS === "web" ? WebDateInput : NativeDateInput;
  const TimeInput = Platform.OS === "web" ? WebTimeInput : NativeTimeInput;
  const takingAttendance = attendance && !deadline;

  const eventWindow = () => {
    const window = eventWindowFromInputs({
      startDate: dateStr,
      startTime,
      endDate: multiDay ? endDateStr : dateStr,
      endTime,
    });
    if ("error" in window) throw new Error(window.error);
    return window;
  };

  const next = () => {
    try {
      eventWindow();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    onTakeAttendance(where, {
      name: name.trim(),
      dateStr,
      endDateStr: multiDay ? endDateStr : dateStr,
      startTime,
      endTime,
      replacesEntryId: entry?.id,
    });
  };

  const save = () =>
    runBusy(
      busy,
      setBusy,
      setError,
      async () => {
        let fields: { name: string; dateStart: number; dateEnd: number; notes: string; due?: Due };
        if (deadline) {
          const at = parseDateTimeInputValues(dateStr, allDay ? "00:00" : dueTime);
          if (at === null) throw new Error("Enter a valid date (YYYY-MM-DD) and time (HH:MM).");
          fields = { name, dateStart: at, dateEnd: at, notes, due: allDay ? "day" : "time" };
        } else {
          fields = { name, ...eventWindow(), notes };
        }
        await (entry ? updateEntry({ id: entry.id, ...fields }) : addEntry(fields));
      },
      onClose
    );

  return (
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
              title={takingAttendance ? "Next" : entry ? "Save" : "Add to Calendar"}
              icon={takingAttendance ? "arrow-forward" : undefined}
              loading={busy}
              disabled={!name.trim()}
              onPress={takingAttendance ? next : () => void save()}
            />
          </View>
        </View>
      }
    >
      <Segmented
        segments={KINDS}
        active={deadline ? "deadline" : "event"}
        onChange={(key) => setDeadline(key === "deadline")}
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
          <Checkbox
            checked={attendance}
            onToggle={() => setAttendance(!attendance)}
            label="Take attendance at this event"
          />
        </>
      )}
      {takingAttendance ? (
        <>
          <Select
            label="Where"
            value={where}
            options={subgroups.map((s) => ({ value: s, label: subgroupLabel(s) }))}
            onSelect={setWhere}
          />
          <Muted>
            {`Next: its tags, whether it's a weekly, and any other campuses, as in Attendance. ${
              entry
                ? `Once it's created, it replaces this calendar entry${entry.notes ? " (its notes aren't kept)" : ""}.`
                : "Leaders can then sign people in."
            }`}
          </Muted>
        </>
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
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
});
