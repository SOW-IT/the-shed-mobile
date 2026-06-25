import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { subgroupLabel, subgroupMatches } from "../../../shared/rollcall";
import { AttendanceTagPill } from "@/components/attendance/AttendanceTagPill";
import { CampusMark } from "@/components/CampusMark";
import { WebDateInput, WebTimeInput } from "@/components/WebDateTimeInput";
import {
  Btn,
  errorMessage,
  Field,
  Sheet,
  Txt,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

const parseDateTime = (dateStr: string, timeStr: string): number | null => {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !timeMatch) return null;
  const d = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2])
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
    d.getMinutes()
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
  const eventName = event?.name ?? "";

  useEffect(() => {
    if (visible) void ensureMetadata({});
  }, [visible, ensureMetadata]);

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset wizard when sheet opens
      setStep(0);
      setName(event?.name ?? "");
      setSelectedTags(event?.tagIds ?? []);
      setCollaborators(event?.subgroups ?? [ownerGroup]);
      setDateStr(event ? dateInputFromMs(event.dateStart) : defaultDate());
      setStartTime(event ? timeInputFromMs(event.dateStart) : defaultTime(17));
      setEndTime(event ? timeInputFromMs(event.dateEnd) : defaultTime(19));
      setError(null);
      setSubmitting(false);
      setDeleteOpen(false);
      setDeleteText("");
    }
  }, [visible, ownerGroup, event]);

  const steps = ["Name", "Tags", "Collaboration", "Schedule"];
  const maxStep = steps.length - 1;
  const visibleTags = (tags ?? []).filter(
    (tag) =>
      !tag.subgroups?.length ||
      tag.subgroups.some((tagSubgroup) =>
        collaborators.some((collaborator) => subgroupMatches(tagSubgroup, collaborator))
      )
  );

  const toggleTag = (id: Id<"attendanceTags">) => {
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
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

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
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
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {step > 0 ? (
            <Btn title="Back" variant="ghost" onPress={() => setStep((s) => s - 1)} />
          ) : null}
          {step < maxStep ? (
            <Btn
              title="Next"
              onPress={() => setStep((s) => s + 1)}
              disabled={step === 0 && !name.trim()}
            />
          ) : (
            <Btn
              title={isEditing ? "Save" : "Create"}
              onPress={() => void submit()}
              loading={submitting}
            />
          )}
        </View>
      }
    >
      <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.md }}>
        {steps.map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= step ? t.primary : t.border,
            }}
          />
        ))}
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
            Collaboration — other groups can see this event
          </Txt>
          {subgroups
            .map((sg) => {
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
                      borderColor: collaborators.includes(sg) ? t.primary : t.border,
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
              <WebDateInput label="Date" value={dateStr} onChange={setDateStr} />
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
              <Field
                label="Date (YYYY-MM-DD)"
                value={dateStr}
                onChangeText={setDateStr}
                placeholder="2026-06-24"
              />
              <Field label="Start time (HH:MM)" value={startTime} onChangeText={setStartTime} />
              <Field label="End time (HH:MM)" value={endTime} onChangeText={setEndTime} />
            </>
          )}
        </View>
      ) : null}

      {error ? (
        <Txt style={[typography.caption, { color: t.danger, marginTop: spacing.sm }]}>
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
            This permanently deletes the event and all attendance records for it. Type the
            event name to confirm.
          </Txt>
          <Field
            label="Event name"
            value={deleteText}
            onChangeText={setDeleteText}
            placeholder={eventName}
          />
        </Sheet>
      ) : null}
    </Sheet>
  );
}
