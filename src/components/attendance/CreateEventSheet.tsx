import { AttendanceTagPill } from "@/components/attendance/AttendanceTagPill";
import { CampusMark } from "@/components/CampusMark";
import {
  NativeDateInput,
  NativeTimeInput,
} from "@/components/NativeDateTimeField";
import {
  Btn,
  CannotUndo,
  Checkbox,
  ConfirmDialog,
  dismissKeyboard,
  errorMessage,
  Field,
  LoadingState,
  Segmented,
  Select,
  Sheet,
  Txt,
} from "@/components/ui";
import { WebDateInput, WebTimeInput } from "@/components/WebDateTimeInput";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { SYDNEY_TIME_ZONE } from "../../../shared/flow";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  addDaysToDateInputValue,
  pad2,
  toDateInputValue,
  toTimeInputValue,
} from "../../../shared/datetime";
import {
  endDateAfterStartChange,
  eventWindowFromInputs,
  isMultiDayEvent,
  isOrgWideSubgroup,
  subgroupLabel,
  subgroupMatches,
} from "../../../shared/rollcall";
import { termLabel, weeklyName } from "../../../shared/weeklyInsights";

const defaultDate = (): string => toDateInputValue(new Date());

const defaultTime = (hour: number): string => `${pad2(hour)}:00`;

const dateInputFromMs = (ms: number): string => toDateInputValue(new Date(ms));

const timeInputFromMs = (ms: number): string => toTimeInputValue(new Date(ms));

type EditableEvent = Pick<
  Doc<"events">,
  "_id" | "name" | "dateStart" | "dateEnd" | "subgroups" | "tagIds" | "weekly"
>;

type Kind = "weekly" | "event";
type TermPick = { year: number; slot: number };
const termValue = (p: TermPick) => `${p.year}:${p.slot}`;

export function CreateEventSheet({
  visible,
  onClose,
  onDeleted,
  subgroup,
  subgroups,
  event,
}: {
  visible: boolean;
  onClose: () => void;
  onDeleted?: () => void;
  subgroup: string;
  subgroups: string[];
  event?: EditableEvent;
}) {
  const t = useAppTheme();
  const router = useRouter();
  const isEditing = event !== undefined;
  const ownerGroup = event?.subgroups[0] ?? subgroup;
  const tags = useQuery(api.attendanceTags.list, {});
  const ensureMetadata = useMutation(api.attendanceMetadata.ensureDefaults);
  const createEvent = useMutation(api.events.create);
  const updateEvent = useMutation(api.events.update);
  const removeEvent = useMutation(api.events.remove);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  // A Weekly's term, week and name are pre-filled from the campus's other
  // weeklies (weeklyInsights.suggestWeekly) until the leader changes them.
  const [kind, setKind] = useState<Kind>("event");
  const [initialKind, setInitialKind] = useState<Kind>("event");
  const [term, setTerm] = useState<TermPick | null>(null);
  const [weekText, setWeekText] = useState("");
  const [weekTouched, setWeekTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Id<"attendanceTags">[]>([]);
  const [collaborators, setCollaborators] = useState<string[]>([subgroup]);
  const [dateStr, setDateStr] = useState(defaultDate());
  const [endDateStr, setEndDateStr] = useState(defaultDate());
  const [multiDay, setMultiDay] = useState(false);
  const [startTime, setStartTime] = useState(defaultTime(17));
  const [endTime, setEndTime] = useState(defaultTime(19));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const deleteImpact = useQuery(
    api.events.deletePreview,
    deleteOpen && event ? { eventId: event._id } : "skip"
  );
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [initial, setInitial] = useState({
    name: "",
    tags: [] as Id<"attendanceTags">[],
    collaborators: [subgroup],
    dateStr: defaultDate(),
    endDateStr: defaultDate(),
    startTime: defaultTime(17),
    endTime: defaultTime(19),
  });
  const openedRef = useRef(false);
  const eventName = event?.name ?? "";

  useEffect(() => {
    if (visible) void ensureMetadata({}).catch(() => {});
  }, [visible, ensureMetadata]);

  useEffect(() => {
    if (!visible) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    if (!isEditing) return;
    const snapshot = {
      name: event?.name ?? "",
      tags: event?.tagIds ?? [],
      collaborators: event?.subgroups ?? [ownerGroup],
      dateStr: event ? dateInputFromMs(event.dateStart) : defaultDate(),
      endDateStr: event ? dateInputFromMs(event.dateEnd) : defaultDate(),
      startTime: event ? timeInputFromMs(event.dateStart) : defaultTime(17),
      endTime: event ? timeInputFromMs(event.dateEnd) : defaultTime(19),
    };
    const weeklyTagged = (event?.tagIds ?? []).some(
      (id) => tags?.find((tag) => tag._id === id)?.name === "Weekly Meeting"
    );
    const savedKind: Kind = event?.weekly || weeklyTagged ? "weekly" : "event";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the event's saved fields on the open transition (edit mode)
    setStep(0);
    setName(snapshot.name);
    setNameTouched(true);
    setKind(savedKind);
    setInitialKind(savedKind);
    setTerm(event?.weekly ? { year: event.weekly.year, slot: event.weekly.slot } : null);
    setWeekText(event?.weekly ? String(event.weekly.week) : "");
    setWeekTouched(!!event?.weekly);
    setSelectedTags(snapshot.tags);
    setCollaborators(snapshot.collaborators);
    setDateStr(snapshot.dateStr);
    setEndDateStr(snapshot.endDateStr);
    setMultiDay(snapshot.dateStr !== snapshot.endDateStr);
    setStartTime(snapshot.startTime);
    setEndTime(snapshot.endTime);
    setError(null);
    setSubmitting(false);
    setDeleteOpen(false);
    setDeleteText("");
    setConfirmCancel(false);
    setInitial(snapshot);
  }, [visible, ownerGroup, event, isEditing, tags]);

  const resetForm = () => {
    setStep(0);
    setName("");
    setNameTouched(false);
    setKind("event");
    setInitialKind("event");
    setTerm(null);
    setWeekText("");
    setWeekTouched(false);
    setSelectedTags([]);
    setCollaborators([subgroup]);
    setDateStr(defaultDate());
    setEndDateStr(defaultDate());
    setMultiDay(false);
    setStartTime(defaultTime(17));
    setEndTime(defaultTime(19));
    setError(null);
    setSubmitting(false);
    setInitial({
      name: "",
      tags: [],
      collaborators: [subgroup],
      dateStr: defaultDate(),
      endDateStr: defaultDate(),
      startTime: defaultTime(17),
      endTime: defaultTime(19),
    });
  };

  const canBeWeekly = !isOrgWideSubgroup(ownerGroup);
  const preview = eventWindowFromInputs({
    startDate: dateStr,
    startTime,
    endDate: multiDay ? endDateStr : dateStr,
    endTime,
  });
  const suggestAt = "error" in preview ? null : preview.dateStart;
  const suggestion = useQuery(
    api.weeklyInsights.suggestWeekly,
    visible && canBeWeekly && kind === "weekly" && suggestAt !== null
      ? { subgroup: ownerGroup, dateStart: suggestAt, eventId: event?._id }
      : "skip"
  );
  const weekly = kind === "weekly" && canBeWeekly;
  const pickedTerm = term ?? suggestion?.suggested ?? null;
  const weekValue = weekTouched ? weekText : suggestion ? String(suggestion.suggested.week) : "";
  const weekNumber = Number(weekValue);
  const weekValid = Number.isInteger(weekNumber) && weekNumber >= 1 && weekNumber <= 20;
  const termOptions = [
    ...(suggestion?.options ?? []),
    ...(pickedTerm && suggestion && !suggestion.options.some((o) => o.year === pickedTerm.year && o.slot === pickedTerm.slot)
      ? [{ year: pickedTerm.year, slot: pickedTerm.slot, label: termLabel(suggestion.system, pickedTerm.slot, pickedTerm.year) }]
      : []),
  ].map((o) => ({ value: termValue(o), label: o.label }));
  const nameValue =
    weekly && !nameTouched && pickedTerm && weekValid && suggestion
      ? weeklyName(suggestion.system, pickedTerm.slot, weekNumber)
      : name;
  const weeklyReady = !weekly || (!!pickedTerm && weekValid);

  const steps = ["Name", "Tags", "Collaboration", "Schedule"];
  const maxStep = steps.length - 1;

  const visibleTags = (tags ?? []).filter(
    (tag) => {
      return (
        !tag.subgroups?.length ||
        tag.subgroups.some((tagSubgroup) => {
          return collaborators.some((collaborator) => {
            return subgroupMatches(tagSubgroup, collaborator);
          });
        })
      );
    },
  );

  const toggleTag = (id: Id<"attendanceTags">) => {
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleCollaborator = (sg: string) => {
    if (sg === ownerGroup) return;
    setCollaborators((prev) => {
      if (prev.includes(sg)) {
        const next = prev.filter((x) => x !== sg);
        return next.includes(ownerGroup) ? next : [ownerGroup, ...next];
      }
      return [...prev, sg];
    });
  };

  const changeStartDate = (next: string) => {
    setEndDateStr((end) => endDateAfterStartChange(dateStr, next, end));
    setDateStr(next);
  };

  // A one-day event ends on its start date; ticking multi-day starts the end
  // on the next day.
  const toggleMultiDay = () => {
    if (multiDay) {
      setMultiDay(false);
      setEndDateStr(dateStr);
      return;
    }
    setMultiDay(true);
    setEndDateStr(addDaysToDateInputValue(dateStr, 1) ?? dateStr);
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const schedule = eventWindowFromInputs({
      startDate: dateStr,
      startTime,
      endDate: multiDay ? endDateStr : dateStr,
      endTime,
    });
    if ("error" in schedule) {
      setError(schedule.error);
      setSubmitting(false);
      return;
    }
    const { dateStart, dateEnd } = schedule;
    try {
      const mark = weekly && pickedTerm ? { ...pickedTerm, week: weekNumber } : null;
      const payload = {
        name: nameValue,
        dateStart,
        dateEnd,
        subgroups: collaborators,
        tagIds: selectedTags.length ? selectedTags : undefined,
      };
      if (event) {
        await updateEvent({
          eventId: event._id,
          ...payload,
          // Switching an event away from Weekly takes its term, week and tag off.
          ...(mark ? { weekly: mark } : initialKind === "weekly" ? { weekly: null } : {}),
        });
        onClose();
        return;
      }
      const eventId = await createEvent({ ...payload, ...(mark ? { weekly: mark } : {}) });
      resetForm();
      onClose();
      router.push({
        pathname: "/attendance/event/[eventId]",
        params: { eventId },
      });
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!event || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await removeEvent({ eventId: event._id });
      await dismissKeyboard();
      setDeleteOpen(false);
      onClose();
      onDeleted?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const sameMembers = <T,>(a: readonly T[], b: readonly T[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  const dirty =
    nameValue !== initial.name ||
    kind !== initialKind ||
    (weekly &&
      (!event?.weekly ||
        pickedTerm?.year !== event.weekly.year ||
        pickedTerm?.slot !== event.weekly.slot ||
        weekNumber !== event.weekly.week)) ||
    !sameMembers(selectedTags, initial.tags) ||
    !sameMembers(collaborators, initial.collaborators) ||
    dateStr !== initial.dateStr ||
    endDateStr !== initial.endDateStr ||
    startTime !== initial.startTime ||
    endTime !== initial.endTime;

  const requestClose = () => {
    if (isEditing && dirty) {
      setConfirmCancel(true);
      return;
    }
    onClose();
  };

  const isLastStep = step >= maxStep;
  const leftButton =
    step === 0 ? (
      <Btn title="Cancel" variant="ghost" onPress={requestClose} />
    ) : (
      <Btn title="Back" variant="ghost" onPress={() => setStep((s) => s - 1)} />
    );
  const saveButton = (
    <Btn
      title="Save"
      onPress={() => void submit()}
      loading={submitting}
      disabled={!dirty}
    />
  );

  return (
    <Sheet
      visible={visible}
      onClose={requestClose}
      title={`${isEditing ? "Edit event" : "New event"} · ${steps[step]}`}
      headerRight={
        isEditing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete event"
            hitSlop={8}
            onPress={() => setDeleteOpen(true)}
            style={({ pressed }) => [
              {
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: t.dangerSoft,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="trash-outline" size={18} color={t.danger} />
          </Pressable>
        ) : null
      }
      footer={
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.sm,
          }}
        >
          {leftButton}
          {isEditing && !isLastStep ? saveButton : null}
          {!isLastStep ? (
            <Btn
              title="Next"
              onPress={() => setStep((s) => s + 1)}
              disabled={step === 0 && (!nameValue.trim() || !weeklyReady)}
            />
          ) : isEditing ? (
            saveButton
          ) : (
            <Btn
              title="Create"
              onPress={() => void submit()}
              loading={submitting}
              disabled={!weeklyReady}
            />
          )}
        </View>
      }
    >
      <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.sm }}>
        {steps.map((label, i) => {
          const reachable = i <= step || (!!nameValue.trim() && weeklyReady);
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`Step ${i + 1}: ${label}`}
              accessibilityState={{ selected: i === step }}
              disabled={!reachable}
              onPress={() => setStep(i)}
              style={({ pressed }) => [
                { flex: 1, paddingVertical: 10 },
                pressed && reachable && { opacity: 0.6 },
              ]}
            >
              <View
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i <= step ? t.primary : t.border,
                }}
              />
            </Pressable>
          );
        })}
      </View>

      {step === 0 ? (
        <View style={{ gap: spacing.md }}>
          {canBeWeekly ? (
            <View style={{ gap: spacing.xs }}>
              <Txt style={[typography.label, { color: t.muted }]}>Type</Txt>
              <Segmented
                segments={[
                  { key: "weekly", label: "Weekly" },
                  { key: "event", label: "Other event" },
                ]}
                active={kind}
                onChange={(key) => setKind(key as Kind)}
              />
            </View>
          ) : null}
          {weekly ? (
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
              <View style={{ flex: 2 }}>
                <Select
                  label={suggestion?.system === "semesters" ? "Semester" : "Term"}
                  value={pickedTerm ? termValue(pickedTerm) : ""}
                  options={termOptions}
                  placeholder={suggestion ? "Choose" : "Loading…"}
                  onSelect={(value) => {
                    const [year, slot] = value.split(":").map(Number);
                    setTerm({ year, slot });
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Week"
                  value={weekValue}
                  onChangeText={(text) => {
                    setWeekText(text.replace(/\D/g, "").slice(0, 2));
                    setWeekTouched(true);
                  }}
                  keyboardType="numeric"
                  maxLength={2}
                  placeholder="1"
                  accessibilityLabel="Week number"
                />
              </View>
            </View>
          ) : null}
          {weekly && weekValue.trim() && !weekValid ? (
            <Txt style={{ color: t.errorText }}>The week is a number from 1 to 20.</Txt>
          ) : null}
          <Field
            label="Event name"
            value={nameValue}
            onChangeText={(text) => {
              setName(text);
              setNameTouched(true);
            }}
            placeholder={weekly ? "e.g. Weeklies T3W5" : "e.g. Hot Pot Night"}
          />
          {weekly && collaborators.length > 1 ? (
            <Txt style={{ color: t.faint }}>
              {"Weeklies shared with other campuses don't count in Insights."}
            </Txt>
          ) : null}
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ gap: spacing.sm }}>
          <Txt style={[typography.label, { color: t.muted }]}>Tags</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {visibleTags.map((tag) => (
              <AttendanceTagPill
                key={tag._id}
                name={tag.name}
                colour={tag.colour}
                selected={selectedTags.includes(tag._id)}
                onPress={() => toggleTag(tag._id)}
              />
            ))}
          </View>
          {visibleTags.length === 0 ? (
            <Txt style={{ color: t.faint }}>Add tags in Tags first.</Txt>
          ) : null}
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: spacing.sm }}>
          <Txt style={[typography.label, { color: t.muted }]}>
            Allow other groups to view this event
          </Txt>
          {subgroups.map((sg) => {
            const isOwner = sg === ownerGroup;
            return (
              <Pressable
                key={sg}
                disabled={isOwner}
                onPress={() => toggleCollaborator(sg)}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    padding: 10,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: collaborators.includes(sg)
                      ? t.primary
                      : t.border,
                    opacity: pressed ? 0.7 : isOwner ? 0.62 : 1,
                  },
                ]}
              >
                <CampusMark campus={sg} size="sm" />
                <Txt>
                  {subgroupLabel(sg)}
                  {isOwner ? " · owner" : ""}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {step === maxStep ? (
        <View style={{ gap: spacing.sm }}>
          {Platform.OS === "web" ? (
            <>
              <WebDateInput
                label={multiDay ? "Start date" : "Date"}
                value={dateStr}
                onChange={changeStartDate}
              />
              <Checkbox
                checked={multiDay}
                onToggle={toggleMultiDay}
                label="Multi-day event"
              />
              {multiDay ? (
                <WebDateInput
                  label="End date"
                  value={endDateStr}
                  min={addDaysToDateInputValue(dateStr, 1) ?? dateStr}
                  onChange={setEndDateStr}
                />
              ) : null}
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <WebTimeInput
                  label="Start time"
                  value={startTime}
                  onChange={setStartTime}
                />
                <WebTimeInput
                  label="End time"
                  value={endTime}
                  onChange={setEndTime}
                />
              </View>
            </>
          ) : (
            <>
              <NativeDateInput
                label={multiDay ? "Start date" : "Date"}
                value={dateStr}
                onChange={changeStartDate}
              />
              <Checkbox
                checked={multiDay}
                onToggle={toggleMultiDay}
                label="Multi-day event"
              />
              {multiDay ? (
                <NativeDateInput
                  label="End date"
                  value={endDateStr}
                  min={addDaysToDateInputValue(dateStr, 1) ?? dateStr}
                  onChange={setEndDateStr}
                />
              ) : null}
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <NativeTimeInput
                  label="Start time"
                  value={startTime}
                  onChange={setStartTime}
                />
                <NativeTimeInput
                  label="End time"
                  value={endTime}
                  onChange={setEndTime}
                />
              </View>
            </>
          )}
        </View>
      ) : null}

      {error ? (
        <Txt
          style={[
            typography.caption,
            { color: t.danger, marginTop: spacing.sm },
          ]}
        >
          {error}
        </Txt>
      ) : null}

      {isEditing ? (
        <Sheet
          visible={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          title="Delete event"
          footer={
            <Btn
              title={
                deleteImpact && deleteImpact.total > 0
                  ? `Delete event and ${deleteImpact.total} record${
                      deleteImpact.total === 1 ? "" : "s"
                    }`
                  : "Delete event"
              }
              variant="danger"
              loading={submitting}
              disabled={
                deleteImpact === undefined ||
                deleteText.trim().replace(/\s+/g, " ").toLowerCase() !==
                  eventName.trim().replace(/\s+/g, " ").toLowerCase()
              }
              onPress={() => void onDelete()}
            />
          }
        >
          {deleteImpact === undefined ? (
            <LoadingState />
          ) : (
            <>
              <View
                style={[
                  styles.deleteWarning,
                  { backgroundColor: t.dangerSoft, borderColor: t.danger },
                ]}
              >
                <View style={styles.row}>
                  <Ionicons name="warning" size={20} color={t.danger} />
                  <Txt style={[typography.headline, { color: t.danger, flex: 1 }]}>
                    {deleteImpact && deleteImpact.total > 0
                      ? `Removes ${deleteImpact.total} attendance record${
                          deleteImpact.total === 1 ? "" : "s"
                        }`
                      : "No one is signed in to this event"}
                  </Txt>
                </View>
                {deleteImpact && deleteImpact.total > 0 ? (
                  <Txt style={[typography.body, { color: t.text }]}>
                    It&apos;s deleted from rolls, exports and Insights.
                  </Txt>
                ) : null}
                <CannotUndo />
              </View>
              {deleteImpact && deleteImpact.total > 0 ? (
                <>
                  <Txt style={[typography.label, { color: t.muted, marginTop: spacing.sm }]}>
                    ATTENDANCE DELETED
                  </Txt>
                  <View
                    style={[
                      styles.deleteList,
                      { borderColor: t.separator, backgroundColor: t.card },
                    ]}
                  >
                    {deleteImpact.people.map((p) => (
                      <View key={p.attendanceId} style={styles.row}>
                        <Ionicons name="close-circle" size={14} color={t.danger} />
                        <Txt
                          style={[typography.body, { color: t.text, flex: 1 }]}
                          numberOfLines={1}
                        >
                          {p.name}
                        </Txt>
                        <Txt style={[typography.caption, { color: t.muted }]}>
                          {new Date(p.signInTime).toLocaleString("en-AU", {
                            timeZone: SYDNEY_TIME_ZONE,
                            ...(event &&
                            isMultiDayEvent(event.dateStart, event.dateEnd)
                              ? { weekday: "short", day: "numeric", month: "short" }
                              : {}),
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Txt>
                      </View>
                    ))}
                    {deleteImpact.total > deleteImpact.people.length ? (
                      <Txt style={[typography.caption, { color: t.muted }]}>
                        and {deleteImpact.total - deleteImpact.people.length} more
                      </Txt>
                    ) : null}
                  </View>
                  <Txt style={[typography.body, { color: t.text, marginTop: spacing.sm }]}>
                    Duplicate event? Sign these people in to the right one first.
                  </Txt>
                </>
              ) : null}
              <Txt style={[typography.body, { color: t.text, marginTop: spacing.sm }]}>
                Type <Txt style={{ fontWeight: "800" }}>{eventName.trim()}</Txt> to
                delete.
              </Txt>
              <Field
                label="Event name"
                testID="delete-event-confirm-name"
                value={deleteText}
                onChangeText={setDeleteText}
                placeholder={eventName}
              />
            </>
          )}
        </Sheet>
      ) : null}

      <ConfirmDialog
        visible={confirmCancel}
        title="Discard changes?"
        message="Your unsaved changes will be lost."
        confirmLabel="Discard"
        onConfirm={() => {
          setTimeout(onClose, 0);
        }}
        onClose={() => setConfirmCancel(false)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  deleteWarning: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  deleteList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
});
