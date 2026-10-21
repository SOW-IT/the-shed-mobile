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
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { SYDNEY_TIME_ZONE } from "../../../shared/flow";
import { typedMatches } from "../../../shared/typedConfirm";
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
  isWeekliesTagName,
  subgroupLabel,
  subgroupMatches,
  tagListOf,
} from "../../../shared/rollcall";
import {
  DEFAULT_WEEKLY_SETTINGS,
  nextWeeklyDate,
  termSystemFor,
  WEEK_MAX,
  weeklyName,
} from "../../../shared/weeklyInsights";

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

const WEEK_OPTIONS = Array.from({ length: WEEK_MAX }, (_, i) => ({
  value: String(i + 1),
  label: `Week ${i + 1}`,
}));

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
  const canBeWeekly = !isOrgWideSubgroup(ownerGroup);
  const startKind: Kind = canBeWeekly ? "weekly" : "event";
  const tags = useQuery(api.attendanceTags.list, {});
  const ensureMetadata = useMutation(api.attendanceMetadata.ensureDefaults);
  const createEvent = useMutation(api.events.create);
  const updateEvent = useMutation(api.events.update);
  const removeEvent = useMutation(api.events.remove);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>(startKind);
  const [initialKind, setInitialKind] = useState<Kind>(startKind);
  const [term, setTerm] = useState<TermPick | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [whenTouched, setWhenTouched] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Id<"attendanceTags">[]>([]);
  const [collaborators, setCollaborators] = useState<string[]>([subgroup]);
  const [sharing, setSharing] = useState(false);
  const [dateStr, setDateStr] = useState(defaultDate());
  const [endDateStr, setEndDateStr] = useState(defaultDate());
  const [multiDay, setMultiDay] = useState(false);
  const [startTime, setStartTime] = useState(defaultTime(17));
  const [endTime, setEndTime] = useState(defaultTime(19));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
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

  const resetForm = () => {
    setName("");
    setNameTouched(false);
    setWhenTouched(false);
    setKind(startKind);
    setInitialKind(startKind);
    setTerm(null);
    setWeek(null);
    setSelectedTags([]);
    setCollaborators([subgroup]);
    setSharing(false);
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

  const weekliesTagIds = new Set(
    (tags ?? []).filter((tag) => isWeekliesTagName(tag.name)).map((tag) => tag._id)
  );

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
    const savedKind: Kind = event?.weekly ? "weekly" : "event";
    const saved = event?.weekly;
    const namedByCode =
      !!saved &&
      (["terms", "semesters"] as const).some((system) => weeklyName(system, saved.slot, saved.week) === snapshot.name);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the event's saved fields on the open transition (edit mode)
    setName(snapshot.name);
    setNameTouched(!namedByCode);
    setWhenTouched(true);
    setKind(savedKind);
    setInitialKind(savedKind);
    setTerm(event?.weekly ? { year: event.weekly.year, slot: event.weekly.slot } : null);
    setWeek(event?.weekly?.week ?? null);
    setSelectedTags(snapshot.tags);
    setCollaborators(snapshot.collaborators);
    setSharing(snapshot.collaborators.length > 1);
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
  }, [visible, ownerGroup, event, isEditing]);

  const weekly = kind === "weekly" && canBeWeekly;
  const preview = eventWindowFromInputs({
    startDate: dateStr,
    startTime,
    endDate: multiDay ? endDateStr : dateStr,
    endTime,
  });
  const suggestAt = "error" in preview ? null : preview.dateStart;
  const suggestion = useQuery(
    api.weeklyInsights.suggestWeekly,
    visible && weekly && suggestAt !== null
      ? { subgroup: ownerGroup, dateStart: suggestAt, eventId: event?._id }
      : "skip"
  );

  const previous = suggestion?.previous ?? null;
  useEffect(() => {
    if (!visible || isEditing || whenTouched || !weekly || !previous) return;
    const start = dateInputFromMs(previous.dateStart);
    const next = nextWeeklyDate(start, defaultDate());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new weekly starts a week after the campus's last one, at its times
    setDateStr(next);
    setEndDateStr(next);
    setMultiDay(false);
    setStartTime(timeInputFromMs(previous.dateStart));
    setEndTime(timeInputFromMs(previous.dateEnd));
    setWhenTouched(true);
  }, [visible, isEditing, whenTouched, weekly, previous]);

  const termOptions = suggestion?.options ?? [];
  const termFits = (p: TermPick | null) =>
    !!p && termOptions.some((o) => o.year === p.year && o.slot === p.slot);
  const pickedTerm = termFits(term) ? term : (suggestion?.suggested ?? null);
  const pickedWeek = week ?? suggestion?.suggested.week ?? null;
  const code =
    weekly && pickedTerm && pickedWeek && suggestion
      ? weeklyName(suggestion.system, pickedTerm.slot, pickedWeek)
      : "";
  const nameValue = weekly && !nameTouched && code ? code : name;
  const weeklyReady = !weekly || (!!pickedTerm && !!pickedWeek);
  const duplicate =
    weekly && pickedTerm && pickedWeek
      ? (suggestion?.taken ?? []).find(
          (w) => w.year === pickedTerm.year && w.slot === pickedTerm.slot && w.week === pickedWeek
        )
      : undefined;

  const list = weekly ? "weeklies" : "events";
  const inScope = (tag: Doc<"attendanceTags">) =>
    tagListOf(tag) === list &&
    (!tag.subgroups?.length ||
      tag.subgroups.some((tagSubgroup) =>
        collaborators.some((collaborator) => subgroupMatches(tagSubgroup, collaborator))
      ));
  const visibleTags = (tags ?? []).filter(
    (tag) =>
      !isWeekliesTagName(tag.name) && (inScope(tag) || selectedTags.includes(tag._id))
  );
  const weekOptions = WEEK_OPTIONS.map((option) => {
    const held =
      pickedTerm &&
      (suggestion?.taken ?? []).find(
        (w) =>
          w.year === pickedTerm.year &&
          w.slot === pickedTerm.slot &&
          w.week === Number(option.value)
      );
    return held ? { ...option, label: `${option.label} · ${held.name}` } : option;
  });

  const changeKind = (next: Kind) => {
    if (next === kind) return;
    const keep = new Set(
      (tags ?? []).filter((tag) => tagListOf(tag) === (next === "weekly" ? "weeklies" : "events")).map((tag) => tag._id)
    );
    setSelectedTags((prev) => prev.filter((id) => keep.has(id) || weekliesTagIds.has(id)));
    if (next === "event" && !nameTouched) setName("");
    setKind(next);
  };

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
    setWhenTouched(true);
  };

  const toggleMultiDay = () => {
    setWhenTouched(true);
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
      const mark =
        weekly && pickedTerm && pickedWeek
          ? { year: pickedTerm.year, slot: pickedTerm.slot, week: pickedWeek }
          : null;
      const tagIds = selectedTags.filter((id) => !weekliesTagIds.has(id));
      const payload = {
        name: nameValue,
        dateStart,
        dateEnd,
        subgroups: collaborators,
        tagIds: tagIds.length ? tagIds : undefined,
      };
      if (event) {
        await updateEvent({
          eventId: event._id,
          ...payload,
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

  const onSave = () => {
    const unchangedMark =
      !!event?.weekly &&
      pickedTerm?.year === event.weekly.year &&
      pickedTerm?.slot === event.weekly.slot &&
      pickedWeek === event.weekly.week;
    if (duplicate && !isEditing && !unchangedMark) {
      setConfirmDuplicate(true);
      return;
    }
    void submit();
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
        pickedWeek !== event.weekly.week)) ||
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
    if (!isEditing) resetForm();
    onClose();
  };

  const system = suggestion?.system ?? termSystemFor(ownerGroup, DEFAULT_WEEKLY_SETTINGS);
  const termNoun = system === "terms" ? "Term" : "Semester";
  const otherGroups = subgroups.filter((sg) => sg !== ownerGroup);
  const DateInput = Platform.OS === "web" ? WebDateInput : NativeDateInput;
  const TimeInput = Platform.OS === "web" ? WebTimeInput : NativeTimeInput;

  return (
    <Sheet
      visible={visible}
      onClose={requestClose}
      title={isEditing ? "Edit event" : weekly ? "New weekly" : "New event"}
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
        <View style={styles.footer}>
          <Btn title="Cancel" variant="ghost" onPress={requestClose} />
          <Btn
            title={isEditing ? "Save" : weekly ? "Create weekly" : "Create event"}
            onPress={onSave}
            loading={submitting}
            disabled={!nameValue.trim() || !weeklyReady || (isEditing && !dirty)}
          />
        </View>
      }
    >
      <View style={{ gap: spacing.md }}>
        {canBeWeekly ? (
          <Segmented
            segments={[
              { key: "weekly", label: "Weekly" },
              { key: "event", label: "Other event" },
            ]}
            active={kind}
            onChange={(key) => changeKind(key as Kind)}
          />
        ) : null}

        {weekly ? (
          <View style={styles.row}>
            <View style={{ flex: 3 }}>
              <Select
                label={termNoun}
                value={pickedTerm ? termValue(pickedTerm) : ""}
                options={termOptions.map((o) => ({ value: termValue(o), label: o.label }))}
                placeholder={suggestion ? "Choose" : "Loading…"}
                onSelect={(value) => {
                  const [year, slot] = value.split(":").map(Number);
                  setTerm({ year, slot });
                }}
              />
            </View>
            <View style={{ flex: 2 }}>
              <Select
                label="Week"
                value={pickedWeek ? String(pickedWeek) : ""}
                options={weekOptions}
                placeholder={suggestion ? "Choose" : "Loading…"}
                onSelect={(value) => setWeek(Number(value))}
              />
            </View>
          </View>
        ) : null}

        <Field
          label="Name"
          value={nameValue}
          onChangeText={(text) => {
            setName(text);
            setNameTouched(true);
          }}
          placeholder={weekly ? code || "e.g. T3W5" : "e.g. Hot Pot Night"}
        />

        <View style={{ gap: spacing.sm }}>
          <DateInput
            label={multiDay ? "Start date" : "Date"}
            value={dateStr}
            onChange={changeStartDate}
          />
          {multiDay ? (
            <DateInput
              label="End date"
              value={endDateStr}
              min={addDaysToDateInputValue(dateStr, 1) ?? dateStr}
              onChange={(value) => {
                setEndDateStr(value);
                setWhenTouched(true);
              }}
            />
          ) : null}
          <View style={styles.row}>
            <TimeInput
              label="Start"
              value={startTime}
              onChange={(value) => {
                setStartTime(value);
                setWhenTouched(true);
              }}
            />
            <TimeInput
              label="End"
              value={endTime}
              onChange={(value) => {
                setEndTime(value);
                setWhenTouched(true);
              }}
            />
          </View>
          <Checkbox checked={multiDay} onToggle={toggleMultiDay} label="Runs over several days" />
        </View>

        <View style={{ gap: spacing.sm }}>
          <Txt style={[typography.label, { color: t.muted }]}>Tags</Txt>
          {visibleTags.length ? (
            <View style={styles.wrap}>
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
          ) : (
            <Txt style={{ color: t.faint }}>
              {weekly ? "No weekly tags yet. Add them in Tags." : "No tags yet. Add them in Tags."}
            </Txt>
          )}
        </View>

        <View style={{ gap: spacing.sm }}>
          <View style={[styles.row, { alignItems: "center" }]}>
            <Txt style={[typography.label, { color: t.muted, flex: 1 }]}>Shared with</Txt>
            {otherGroups.length && !sharing ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setSharing(true)}
                hitSlop={8}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
              >
                <Txt style={{ color: t.primary, fontWeight: "700" }}>+ Add campus</Txt>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.wrap}>
            {(sharing ? [ownerGroup, ...otherGroups] : collaborators).map((sg) => {
              const isOwner = sg === ownerGroup;
              const on = collaborators.includes(sg);
              return (
                <Pressable
                  key={sg}
                  disabled={isOwner}
                  accessibilityRole="checkbox"
                  accessibilityLabel={isOwner ? `${subgroupLabel(sg)}, owner` : subgroupLabel(sg)}
                  accessibilityState={{ checked: on, disabled: isOwner }}
                  onPress={() => toggleCollaborator(sg)}
                  style={({ pressed }) => [
                    styles.campusChip,
                    { borderColor: on ? t.primary : t.border, opacity: pressed && !isOwner ? 0.7 : 1 },
                  ]}
                >
                  <CampusMark campus={sg} circleDiameter={22} />
                  <Txt>{subgroupLabel(sg)}</Txt>
                  {isOwner ? <Ionicons name="lock-closed" size={12} color={t.muted} /> : null}
                </Pressable>
              );
            })}
          </View>
          {weekly && collaborators.length > 1 ? (
            <Txt style={{ color: t.faint }}>
              {"Weeklies shared with other campuses don't count in Insights."}
            </Txt>
          ) : null}
        </View>
      </View>

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
                deleteImpact === undefined || !typedMatches(deleteText, eventName)
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
                <View style={styles.inline}>
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
                    Attendance deleted
                  </Txt>
                  <View
                    style={[
                      styles.deleteList,
                      { borderColor: t.separator, backgroundColor: t.card },
                    ]}
                  >
                    {deleteImpact.people.map((p) => (
                      <View key={p.attendanceId} style={styles.inline}>
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

      <ConfirmDialog
        visible={confirmDuplicate}
        title={`Another ${code}?`}
        message={duplicate ? `${subgroupLabel(ownerGroup)} already has a weekly for ${code} ("${duplicate.name}"). Create this one as well?` : undefined}
        confirmLabel={isEditing ? "Save anyway" : "Create anyway"}
        destructive={false}
        onConfirm={() => void submit()}
        onClose={() => setConfirmDuplicate(false)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  inline: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  campusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 2,
  },
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
