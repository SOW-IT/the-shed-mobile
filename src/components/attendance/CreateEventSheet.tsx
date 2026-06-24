import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { ALL_SUBGROUP, subgroupLabel } from "../../../shared/rollcall";
import { AttendanceTagPill } from "@/components/attendance/AttendanceTagPill";
import { CampusMark } from "@/components/CampusMark";
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

export function CreateEventSheet({
  visible,
  onClose,
  year,
  subgroup,
  subgroups,
}: {
  visible: boolean;
  onClose: () => void;
  year: number;
  subgroup: string;
  subgroups: string[];
}) {
  const t = useAppTheme();
  const router = useRouter();
  const tags = useQuery(api.attendanceTags.list, { year });
  const ensureMetadata = useMutation(api.attendanceMetadata.ensureDefaults);
  const createEvent = useMutation(api.events.create);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [selectedTags, setSelectedTags] = useState<Id<"attendanceTags">[]>([]);
  const [collaborators, setCollaborators] = useState<string[]>([subgroup]);
  const [dateStr, setDateStr] = useState(defaultDate());
  const [startTime, setStartTime] = useState(defaultTime(17));
  const [endTime, setEndTime] = useState(defaultTime(19));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) void ensureMetadata({ year });
  }, [visible, year, ensureMetadata]);

  useEffect(() => {
    if (visible) {
      setStep(0);
      setName("");
      setSelectedTags([]);
      setCollaborators([subgroup]);
      setDateStr(defaultDate());
      setStartTime(defaultTime(17));
      setEndTime(defaultTime(19));
      setError(null);
    }
  }, [visible, subgroup]);

  const isCampus = subgroup !== ALL_SUBGROUP;
  const steps = isCampus
    ? ["Name", "Tags", "Collaboration", "Schedule"]
    : ["Name", "Tags", "Schedule"];
  const maxStep = steps.length - 1;

  const toggleTag = (id: Id<"attendanceTags">) => {
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleCollaborator = (sg: string) => {
    setCollaborators((prev) => {
      if (prev.includes(sg)) {
        const next = prev.filter((x) => x !== sg);
        return next.length ? next : [subgroup];
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
      const eventId = await createEvent({
        name,
        dateStart,
        dateEnd,
        subgroups: collaborators,
        tagIds: selectedTags.length ? selectedTags : undefined,
      });
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

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`New event · ${steps[step]}`}
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
            <Btn title="Create" onPress={() => void submit()} loading={submitting} />
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
            {(tags ?? []).map((tag) => (
              <AttendanceTagPill
                key={tag._id}
                name={tag.name}
                colour={tag.colour}
                selected={selectedTags.includes(tag._id)}
                onPress={() => toggleTag(tag._id)}
              />
            ))}
          </View>
          {(tags ?? []).length === 0 ? (
            <Txt style={{ color: t.faint }}>Add tags in Settings first.</Txt>
          ) : null}
        </View>
      ) : null}

      {isCampus && step === 2 ? (
        <View style={{ gap: spacing.sm }}>
          <Txt style={[typography.label, { color: t.muted }]}>
            Collaboration — other groups can see this event
          </Txt>
          {subgroups
            .filter((sg) => sg !== subgroup)
            .map((sg) => (
              <Pressable
                key={sg}
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
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <CampusMark campus={sg} size="sm" />
                <Txt>{subgroupLabel(sg)}</Txt>
              </Pressable>
            ))}
        </View>
      ) : null}

      {step === maxStep ? (
        <View style={{ gap: spacing.sm }}>
          <Field
            label="Date (YYYY-MM-DD)"
            value={dateStr}
            onChangeText={setDateStr}
            placeholder="2026-06-24"
          />
          <Field label="Start time (HH:MM)" value={startTime} onChangeText={setStartTime} />
          <Field label="End time (HH:MM)" value={endTime} onChangeText={setEndTime} />
        </View>
      ) : null}

      {error ? (
        <Txt style={[typography.caption, { color: t.danger, marginTop: spacing.sm }]}>
          {error}
        </Txt>
      ) : null}
    </Sheet>
  );
}
