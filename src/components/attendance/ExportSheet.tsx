import { Ionicons } from "@expo/vector-icons";
import { useConvex, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  parseDateInputValue,
  toDateInputValue,
} from "../../../shared/datetime";
import { subgroupLabel } from "../../../shared/rollcall";
import {
  ATTENDANCE_PCT_HEADER,
  buildAttendanceCsv,
  buildAttendanceMatrixCsv,
  exportSlug,
  isReservedExportFieldKey,
  NOTES_HEADER,
  type ExportEventForCsv,
} from "@/lib/attendanceCsv";
import { downloadCsv } from "@/lib/csvDownload";
import { NativeDateInput } from "@/components/NativeDateTimeField";
import { WebDateInput } from "@/components/WebDateTimeInput";
import {
  Btn,
  ErrorBanner,
  errorMessage,
  MultiSelect,
  Muted,
  Sheet,
  Txt,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

const LIST_ALWAYS_COLUMNS = ["Sign In", "Name", "Email"] as const;
const MATRIX_ALWAYS_COLUMNS = [
  "Name",
  "Email",
  ATTENDANCE_PCT_HEADER,
] as const;
const NOTES_FIELD_KEY = NOTES_HEADER;

type ExportFormat = "list" | "matrix";

const MIN_DATE = new Date(2024, 0, 1);

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const endOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

const toInputDate = (ms: number): string => toDateInputValue(new Date(ms));
const fromInputDate = (value: string): number | undefined =>
  parseDateInputValue(value)?.getTime();

const ToggleRow = ({
  label,
  checked,
  locked,
  disabled,
  onPress,
  radio,
  subtitle,
}: {
  label: string;
  checked: boolean;
  locked?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  radio?: boolean;
  subtitle?: string;
}) => {
  const t = useAppTheme();
  const inactive = Boolean(locked || disabled);
  const icon = radio
    ? checked
      ? "radio-button-on"
      : "radio-button-off"
    : checked
      ? "checkbox"
      : "square-outline";
  return (
    <Pressable
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 11,
          paddingHorizontal: 12,
          borderRadius: 12,
          backgroundColor: checked ? t.primarySoft : t.ghost,
          opacity: pressed && !inactive ? 0.7 : inactive && !locked ? 0.6 : 1,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={checked ? t.primary : t.faint}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={[typography.body, { color: t.text }]}>{label}</Txt>
        {subtitle ? (
          <Txt style={[typography.caption, { color: t.muted }]}>{subtitle}</Txt>
        ) : null}
      </View>
      {locked ? (
        <Ionicons name="lock-closed" size={14} color={t.faint} />
      ) : null}
    </Pressable>
  );
};

export function ExportSheet({
  visible,
  onClose,
  subgroup,
  eventId,
}: {
  visible: boolean;
  onClose: () => void;
  subgroup: string;
  eventId?: Id<"events">;
}) {
  const t = useAppTheme();
  const convex = useConvex();
  const isEvent = eventId !== undefined;

  const fields = useQuery(api.attendanceMetadata.list, { subgroup });
  const exportableFields = useMemo(
    () => (fields ?? []).filter((f) => !isReservedExportFieldKey(f.key)),
    [fields]
  );
  const tags = useQuery(api.attendanceTags.list, isEvent ? "skip" : {});

  const [fromMs, setFromMs] = useState<number | undefined>(undefined);
  const [toMs, setToMs] = useState<number | undefined>(undefined);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedTags, setSelectedTags] = useState<Id<"attendanceTags">[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[] | null>(null);
  const [format, setFormat] = useState<ExportFormat>("list");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMatrix = format === "matrix";

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on open
    setFromMs(undefined);
    setToMs(Date.now());
    setNowMs(Date.now());
    setSelectedTags([]);
    setSelectedKeys(null);
    setFormat("list");
    setDownloading(false);
    setError(null);
  }, [visible]);

  useEffect(() => {
    if (!fields || selectedKeys !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed once fields load
    setSelectedKeys([
      ...exportableFields.map((f) => f.key),
      ...(isMatrix ? [] : [NOTES_FIELD_KEY]),
    ]);
  }, [fields, exportableFields, selectedKeys, isMatrix]);

  const orderedFieldKeys = useMemo(
    () => [
      ...exportableFields.map((f) => f.key),
      ...(isMatrix ? [] : [NOTES_FIELD_KEY]),
    ],
    [exportableFields, isMatrix]
  );

  const setExportFormat = (next: ExportFormat) => {
    if (next === format) return;
    setFormat(next);
    setSelectedKeys((prev) => {
      if (prev === null) return null;
      const withoutNotes = prev.filter((k) => k !== NOTES_FIELD_KEY);
      return next === "list" ? [...withoutNotes, NOTES_FIELD_KEY] : withoutNotes;
    });
  };

  const fieldsReady = fields !== undefined;

  const toggleKey = (key: string) => {
    if (!fieldsReady) return;
    setSelectedKeys((prev) => {
      const base = prev ?? orderedFieldKeys;
      return base.includes(key)
        ? base.filter((k) => k !== key)
        : [...base, key];
    });
  };

  const isSelected = (key: string) =>
    (selectedKeys ?? orderedFieldKeys).includes(key);

  const download = async () => {
    setError(null);
    const dateStart = fromMs != null ? startOfDay(fromMs) : undefined;
    const dateEnd = toMs != null ? endOfDay(toMs) : undefined;
    const chosenKeys = orderedFieldKeys.filter(isSelected);

    setDownloading(true);
    try {
      let exportEvents: ExportEventForCsv[];
      let label: string;
      if (isEvent) {
        const data = await convex.query(api.attendanceExport.eventForExport, {
          eventId,
          subgroup,
        });
        if (!data) throw new Error("This event is no longer available.");
        exportEvents = [data.event];
        label = data.event.name;
      } else {
        const data = await convex.query(api.attendanceExport.eventsForExport, {
          subgroup,
          dateStart,
          dateEnd,
          tagIds: selectedTags.length ? selectedTags : undefined,
        });
        if (!data) throw new Error("You need to be signed in to export.");
        exportEvents = data.events;
        label = subgroupLabel(subgroup);
      }
      if (exportEvents.length === 0) {
        setError("No events match those filters.");
        setDownloading(false);
        return;
      }
      const csv = isMatrix
        ? buildAttendanceMatrixCsv(exportEvents, chosenKeys)
        : buildAttendanceCsv(exportEvents, chosenKeys);
      const slug = exportSlug(label);
      const filename = isMatrix
        ? `attendance-grid-${slug}.csv`
        : `attendance-${slug}.csv`;
      await downloadCsv(
        filename,
        csv,
        isEvent ? `Export ${label}` : `Export ${label} attendance`
      );
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={isEvent ? "Export event" : "Export attendance"}
      footer={
        <Btn
          title="Export CSV"
          loading={downloading}
          disabled={fields === undefined || (!isEvent && fromMs == null)}
          onPress={() => void download()}
        />
      }
    >
      {isEvent ? (
        <Muted>Export this event&apos;s attendance to a CSV file.</Muted>
      ) : (
        <Muted>
          Export attendance for {subgroupLabel(subgroup)} — including
          collaborative events — to a CSV file.
        </Muted>
      )}

      <Txt style={[typography.label, styles.heading, { color: t.muted }]}>
        Layout
      </Txt>
      <View style={{ gap: 6 }}>
        <ToggleRow
          radio
          label="List by event"
          subtitle="One section per event with each person's sign-in"
          checked={!isMatrix}
          onPress={() => setExportFormat("list")}
        />
        <ToggleRow
          radio
          label="Grid by person"
          subtitle="People down the side, events across the top, with attendance %"
          checked={isMatrix}
          onPress={() => setExportFormat("matrix")}
        />
      </View>

      {!isEvent ? (
        <>
          <Txt style={[typography.label, styles.heading, { color: t.muted }]}>
            Time range
          </Txt>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {Platform.OS === "web" ? (
              <>
                <WebDateInput
                  label="From"
                  value={fromMs ? toInputDate(fromMs) : ""}
                  min={toInputDate(MIN_DATE.getTime())}
                  max={toInputDate(toMs ?? nowMs)}
                  onChange={(s) => setFromMs(fromInputDate(s))}
                />
                <WebDateInput
                  label="To"
                  value={toMs ? toInputDate(toMs) : ""}
                  min={toInputDate(fromMs ?? MIN_DATE.getTime())}
                  max={toInputDate(nowMs)}
                  onChange={(s) => setToMs(fromInputDate(s))}
                />
              </>
            ) : (
              <>
                <NativeDateInput
                  label="From"
                  value={fromMs ? toInputDate(fromMs) : ""}
                  min={toInputDate(MIN_DATE.getTime())}
                  max={toInputDate(toMs ?? nowMs)}
                  placeholder="Any"
                  onChange={(s) => setFromMs(fromInputDate(s))}
                  onClear={() => setFromMs(undefined)}
                />
                <NativeDateInput
                  label="To"
                  value={toMs ? toInputDate(toMs) : ""}
                  min={toInputDate(fromMs ?? MIN_DATE.getTime())}
                  max={toInputDate(nowMs)}
                  placeholder="Any"
                  onChange={(s) => setToMs(fromInputDate(s))}
                  onClear={() => setToMs(undefined)}
                />
              </>
            )}
          </View>
          {fromMs == null ? (
            <Txt
              style={[
                typography.caption,
                { color: t.muted, marginTop: spacing.xs },
              ]}
            >
              Pick a start date to export. End date defaults to today.
            </Txt>
          ) : null}

          <Txt style={[typography.label, styles.heading, { color: t.muted }]}>
            Tags (optional)
          </Txt>
          <MultiSelect
            label="Filter by tags"
            values={selectedTags as unknown as string[]}
            options={(tags ?? []).map((tag) => ({
              label: tag.name,
              value: tag._id,
            }))}
            onSelect={(values) =>
              setSelectedTags(values as Id<"attendanceTags">[])
            }
            placeholder="All tags"
          />
        </>
      ) : null}

      <Txt style={[typography.label, styles.heading, { color: t.muted }]}>
        Fields to export
      </Txt>
      <View style={{ gap: 6 }}>
        {(isMatrix ? MATRIX_ALWAYS_COLUMNS : LIST_ALWAYS_COLUMNS).map(
          (label) => (
            <ToggleRow key={label} label={label} checked locked />
          )
        )}
        {exportableFields.map((field) => (
          <ToggleRow
            key={field._id}
            label={field.key}
            checked={isSelected(field.key)}
            disabled={!fieldsReady}
            onPress={() => toggleKey(field.key)}
          />
        ))}
        {!isMatrix ? (
          <ToggleRow
            key={NOTES_FIELD_KEY}
            label={NOTES_FIELD_KEY}
            checked={isSelected(NOTES_FIELD_KEY)}
            disabled={!fieldsReady}
            onPress={() => toggleKey(NOTES_FIELD_KEY)}
          />
        ) : null}
      </View>

      <ErrorBanner message={error} />
    </Sheet>
  );
}

const styles = {
  heading: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
};
