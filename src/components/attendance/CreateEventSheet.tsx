import { AttendanceTagPill } from "@/components/attendance/AttendanceTagPill";
import { CampusMark } from "@/components/CampusMark";
import {
  NativeDateInput,
  NativeTimeInput,
} from "@/components/NativeDateTimeField";
import {
  Btn,
  ConfirmDialog,
  errorMessage,
  Field,
  Sheet,
  Txt,
} from "@/components/ui";
import { WebDateInput, WebTimeInput } from "@/components/WebDateTimeInput";
import { spacing, typography, useAppTheme } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  nextDateForWeekday,
  subgroupLabel,
  subgroupMatches,
  WEEKLY_MEETING_TAG_NAME,
  weeklyMeetingSlot,
} from "../../../shared/rollcall";

const parseDateTime = (dateStr: string, timeStr: string): number | null => {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !timeMatch) return null;
  const d = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );
  return d.getTime();
};

const defaultDate = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const defaultTime = (hour: number): string =>
  `${String(hour).padStart(2, "0")}:00`;

const dateInputFromMs = (ms: number): string => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const timeInputFromMs = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
};

type EditableEvent = Pick<
  Doc<"events">,
  "_id" | "name" | "dateStart" | "dateEnd" | "subgroups" | "tagIds"
>;

export function CreateEventSheet({
  visible,
  onClose,
  onDeleted,
  year,
  subgroup,
  subgroups,
  event,
}: {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful delete (e.g. navigate away from the event screen). */
  onDeleted?: () => void;
  year: number;
  subgroup: string;
  subgroups: string[];
  event?: EditableEvent;
}) {
  const t = useAppTheme();
  const router = useRouter();
  // The event's staff year is derived by callers from its start date and passed
  // in as `year` (events no longer store a year column).
  const formYear = year;
  const isEditing = event !== undefined;
  const ownerGroup = event?.subgroups[0] ?? subgroup;
  const tags = useQuery(api.attendanceTags.list, { year: formYear });
  const ensureMetadata = useMutation(api.attendanceMetadata.ensureDefaults);
  const createEvent = useMutation(api.events.create);
  const updateEvent = useMutation(api.events.update);
  const removeEvent = useMutation(api.events.remove);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [selectedTags, setSelectedTags] = useState<Id<"attendanceTags">[]>([]);
  const [collaborators, setCollaborators] = useState<string[]>([subgroup]);
  const [dateStr, setDateStr] = useState(defaultDate());
  const [startTime, setStartTime] = useState(defaultTime(17));
  const [endTime, setEndTime] = useState(defaultTime(19));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  // The editable fields captured when the sheet opened — the baseline the Save
  // button and the discard guard compare against (independent of later `event`
  // refreshes from the parent).
  const [initial, setInitial] = useState({
    name: "",
    tags: [] as Id<"attendanceTags">[],
    collaborators: [subgroup],
    dateStr: defaultDate(),
    startTime: defaultTime(17),
    endTime: defaultTime(19),
  });
  const openedRef = useRef(false);
  // Apply the weekly-meeting schedule pre-fill once per opening.
  const weeklyAppliedRef = useRef(false);
  const eventName = event?.name ?? "";

  // A "Weekly Meeting"-tagged event for a campus with a known slot gets its
  // date/time pre-filled from that slot on the Schedule step.
  const weeklyMeetingTagIds = new Set(
    (tags ?? [])
      .filter((tag) => {
        return (
          tag.name.trim().toLowerCase() ===
          WEEKLY_MEETING_TAG_NAME.toLowerCase()
        );
      })
      .map((tag) => tag._id),
  );
  const slot = selectedTags.some((id) => weeklyMeetingTagIds.has(id))
    ? weeklyMeetingSlot(ownerGroup)
    : null;
  const slotWeekday = slot?.weekday ?? null;
  const slotStart = slot?.startHour ?? null;
  const slotEnd = slot?.endHour ?? null;

  useEffect(() => {
    if (visible) void ensureMetadata({});
  }, [visible, ensureMetadata]);

  // Initialise the wizard once per opening. Gating on the open transition keeps
  // a background `event` refresh from clobbering in-progress edits or moving the
  // dirty baseline. Editing reloads the event's saved values each open; a NEW
  // event deliberately keeps its in-progress draft across opens (like the Make
  // Request sheet), so cancelling and reopening resumes where you left off — the
  // draft is only cleared after a successful create (see `resetForm`).
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
      startTime: event ? timeInputFromMs(event.dateStart) : defaultTime(17),
      endTime: event ? timeInputFromMs(event.dateEnd) : defaultTime(19),
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the event's saved fields on the open transition (edit mode)
    setStep(0);
    setName(snapshot.name);
    setSelectedTags(snapshot.tags);
    setCollaborators(snapshot.collaborators);
    setDateStr(snapshot.dateStr);
    setStartTime(snapshot.startTime);
    setEndTime(snapshot.endTime);
    setError(null);
    setSubmitting(false);
    setDeleteOpen(false);
    setDeleteText("");
    setConfirmCancel(false);
    setInitial(snapshot);
    weeklyAppliedRef.current = false;
  }, [visible, ownerGroup, event, isEditing]);

  // Clear a new-event draft back to defaults — run after a successful create so
  // the next "New event" starts fresh rather than resuming the just-saved one.
  const resetForm = () => {
    setStep(0);
    setName("");
    setSelectedTags([]);
    setCollaborators([subgroup]);
    setDateStr(defaultDate());
    setStartTime(defaultTime(17));
    setEndTime(defaultTime(19));
    setError(null);
    setSubmitting(false);
    setInitial({
      name: "",
      tags: [],
      collaborators: [subgroup],
      dateStr: defaultDate(),
      startTime: defaultTime(17),
      endTime: defaultTime(19),
    });
    weeklyAppliedRef.current = false;
  };

  const steps = ["Name", "Tags", "Collaboration", "Schedule"];
  const maxStep = steps.length - 1;

  // When a new Weekly Meeting event reaches the Schedule step, pre-fill the next
  // matching weekday and the campus's slot times (once; the user can still edit).
  useEffect(() => {
    if (isEditing || step !== maxStep || slotWeekday === null) return;
    if (weeklyAppliedRef.current) return;
    weeklyAppliedRef.current = true;
    setDateStr(dateInputFromMs(nextDateForWeekday(slotWeekday).getTime()));
    setStartTime(defaultTime(slotStart!));
    setEndTime(defaultTime(slotEnd!));
  }, [isEditing, step, maxStep, slotWeekday, slotStart, slotEnd]);
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

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const dateStart = parseDateTime(dateStr, startTime);
    let dateEnd = parseDateTime(dateStr, endTime);
    if (dateStart === null || dateEnd === null) {
      setError("Enter a valid date (YYYY-MM-DD) and times (HH:MM).");
      setSubmitting(false);
      return;
    }
    if (dateEnd <= dateStart) dateEnd = dateStart + 2 * 60 * 60 * 1000;
    try {
      const payload = {
        name,
        dateStart,
        dateEnd,
        subgroups: collaborators,
        tagIds: selectedTags.length ? selectedTags : undefined,
      };
      if (event) {
        await updateEvent({ eventId: event._id, ...payload });
        onClose();
        return;
      }
      const eventId = await createEvent(payload);
      resetForm(); // draft saved into a real event now — start fresh next time
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
      setDeleteOpen(false);
      onClose();
      onDeleted?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  // Something changed since the sheet opened — compared against the snapshot
  // (not the live `event` prop, which can refresh underneath us).
  const sameMembers = <T,>(a: readonly T[], b: readonly T[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  const dirty =
    name !== initial.name ||
    !sameMembers(selectedTags, initial.tags) ||
    !sameMembers(collaborators, initial.collaborators) ||
    dateStr !== initial.dateStr ||
    startTime !== initial.startTime ||
    endTime !== initial.endTime;

  // New event: cancelling just closes and keeps the draft (nothing is lost, and
  // no second modal — which previously froze the app on iOS). Editing a real
  // event still confirms before dropping unsaved changes, since those can't be
  // resumed the way a draft can.
  const requestClose = () => {
    if (isEditing && dirty) {
      setConfirmCancel(true);
      return;
    }
    onClose();
  };

  // First step's left action cancels; later steps step back. On the last step
  // the right action saves/creates; edit mode also keeps a Save in the middle.
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
          {/* Edit mode keeps Save reachable from every step; on the last step it
              moves to the right (where it replaces Next). */}
          {isEditing && !isLastStep ? saveButton : null}
          {!isLastStep ? (
            <Btn
              title="Next"
              onPress={() => setStep((s) => s + 1)}
              disabled={step === 0 && !name.trim()}
            />
          ) : isEditing ? (
            saveButton
          ) : (
            <Btn
              title="Create"
              onPress={() => void submit()}
              loading={submitting}
            />
          )}
        </View>
      }
    >
      <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.sm }}>
        {steps.map((label, i) => {
          // Step back freely; only step forward once the name is filled (the
          // same guard the Next button uses).
          const reachable = i <= step || !!name.trim();
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`Step ${i + 1}: ${label}`}
              accessibilityState={{ selected: i === step }}
              disabled={!reachable}
              onPress={() => setStep(i)}
              // Tall, tappable hit area around a slim progress bar.
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
        <Field
          label="Event name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Weekly Meeting"
        />
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
                label="Date"
                value={dateStr}
                onChange={setDateStr}
              />
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
                label="Date"
                value={dateStr}
                onChange={setDateStr}
              />
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
              title="Delete event"
              variant="danger"
              loading={submitting}
              disabled={deleteText.trim() !== eventName.trim()}
              onPress={() => void onDelete()}
            />
          }
        >
          <Txt style={[typography.body, { color: t.text }]}>
            This permanently deletes the event and all attendance records for
            it. Type <Txt style={{ fontWeight: "800" }}>{eventName.trim()}</Txt>{" "}
            to confirm.
          </Txt>
          <Field
            label="Event name"
            value={deleteText}
            onChangeText={setDeleteText}
            placeholder={eventName}
          />
        </Sheet>
      ) : null}

      <ConfirmDialog
        visible={confirmCancel}
        title="Discard changes?"
        message="Your unsaved changes will be lost."
        confirmLabel="Discard"
        // Dismiss this dialog first, THEN close the sheet — closing the parent
        // modal while this one is still presented locks up the UI on iOS.
        onConfirm={() => {
          setConfirmCancel(false);
          onClose();
        }}
        onClose={() => setConfirmCancel(false)}
      />
    </Sheet>
  );
}
