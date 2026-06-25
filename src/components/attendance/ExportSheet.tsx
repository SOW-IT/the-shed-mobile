import { Ionicons } from "@expo/vector-icons";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useConvex, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  CAMPUS_FIELD_KEY,
  GENDER_FIELD_KEY,
  ROLE_FIELD_KEY,
  STUDENT_YEAR_FIELD_KEY,
} from "../../../shared/attendanceMemberMeta";
import { subgroupLabel } from "../../../shared/rollcall";
import {
  buildAttendanceCsv,
  exportSlug,
  type ExportEventForCsv,
} from "@/lib/attendanceCsv";
import { downloadCsv } from "@/lib/csvDownload";
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

/** Metadata fields that must always be in the export (req: lock specific ones). */
const LOCKED_FIELD_KEYS = new Set<string>([
  STUDENT_YEAR_FIELD_KEY,
  GENDER_FIELD_KEY,
  CAMPUS_FIELD_KEY,
  ROLE_FIELD_KEY,
]);

/** Base columns that are always exported and can't be turned off. */
const ALWAYS_COLUMNS = ["Sign In", "Name", "Email"];

/** Earliest selectable export date. */
const MIN_DATE = new Date(2024, 0, 1);

const pad = (n: number) => String(n).padStart(2, "0");
const formatDay = (ms: number): string => {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};
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
const clamp = (ms: number, min: number, max: number): number =>
  Math.min(Math.max(ms, min), max);

/** ms → "YYYY-MM-DD" for an <input type="date"> value/min/max (web). */
const toInputDate = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** "YYYY-MM-DD" → ms at local midnight, or undefined when cleared/invalid. */
const fromInputDate = (value: string): number | undefined => {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
};

/** A tappable date field showing the chosen day (or a placeholder) with a clear affordance. */
const DateField = ({
  label,
  value,
  active,
  onOpen,
  onClear,
}: {
  label: string;
  value?: number;
  active: boolean;
  onOpen: () => void;
  onClear: () => void;
}) => {
  const t = useAppTheme();
  // The clear button is a sibling (not nested) so tapping it can't bubble up
  // and re-trigger the field's open/close toggle.
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <Txt style={[typography.label, { color: t.muted }]}>{label}</Txt>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          height: 44,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1.5,
          borderColor: active ? t.primary : "transparent",
          backgroundColor: t.inputBackground,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} date`}
          onPress={onOpen}
          style={({ pressed }) => [
            { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="calendar-outline" size={16} color={t.faint} />
          <Txt
            style={[
              typography.body,
              { flex: 1, color: value ? t.text : t.faint },
            ]}
          >
            {value ? formatDay(value) : "Any"}
          </Txt>
        </Pressable>
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label} date`}
            hitSlop={8}
            onPress={onClear}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="close-circle" size={16} color={t.faint} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

const ToggleRow = ({
  label,
  checked,
  locked,
  onPress,
}: {
  label: string;
  checked: boolean;
  locked?: boolean;
  onPress?: () => void;
}) => {
  const t = useAppTheme();
  return (
    <Pressable
      disabled={locked}
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
          opacity: pressed && !locked ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={20}
        color={checked ? t.primary : t.faint}
      />
      <Txt style={[typography.body, { color: t.text, flex: 1 }]}>{label}</Txt>
      {locked ? (
        <Ionicons name="lock-closed" size={14} color={t.faint} />
      ) : null}
    </Pressable>
  );
};

/**
 * Export attendance to CSV. In group mode (no `eventId`) it offers a date range,
 * a tag multi-select, and a metadata-field picker, then exports every event the
 * sub-group can see (including collaborative events). In event mode it exports
 * the single event with the same field picker.
 */
export function ExportSheet({
  visible,
  onClose,
  year,
  subgroup,
  eventId,
}: {
  visible: boolean;
  onClose: () => void;
  year: number;
  subgroup: string;
  /** When set, exports just this event instead of the whole sub-group. */
  eventId?: Id<"events">;
}) {
  const t = useAppTheme();
  const convex = useConvex();
  const isEvent = eventId !== undefined;

  // Only the metadata fields this sub-group can see (req: group-scoped list).
  // Metadata fields are global; tags are still per staff year.
  const fields = useQuery(api.attendanceMetadata.list, { subgroup });
  const tags = useQuery(api.attendanceTags.list, isEvent ? "skip" : { year });

  const [fromMs, setFromMs] = useState<number | undefined>(undefined);
  const [toMs, setToMs] = useState<number | undefined>(undefined);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  // Captured at mount and refreshed on open so the picker's max is "today".
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedTags, setSelectedTags] = useState<Id<"attendanceTags">[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[] | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on open
    setFromMs(undefined);
    // End date defaults to today; the start date is required before exporting.
    setToMs(Date.now());
    setPicking(null);
    setNowMs(Date.now());
    setSelectedTags([]);
    setSelectedKeys(null);
    setDownloading(false);
    setError(null);
  }, [visible]);

  // Default to every visible field selected (locked ones always on).
  useEffect(() => {
    if (!fields || selectedKeys !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed once fields load
    setSelectedKeys(fields.map((f) => f.key));
  }, [fields, selectedKeys]);

  const orderedFieldKeys = useMemo(
    () => (fields ?? []).map((f) => f.key),
    [fields]
  );

  const toggleKey = (key: string) => {
    if (LOCKED_FIELD_KEYS.has(key)) return;
    setSelectedKeys((prev) => {
      const base = prev ?? orderedFieldKeys;
      return base.includes(key)
        ? base.filter((k) => k !== key)
        : [...base, key];
    });
  };

  const isSelected = (key: string) =>
    LOCKED_FIELD_KEYS.has(key) || (selectedKeys ?? []).includes(key);

  const download = async () => {
    setError(null);
    // Whole-day bounds; the picker's min/max already keep From ≤ To ≤ today.
    const dateStart = fromMs != null ? startOfDay(fromMs) : undefined;
    const dateEnd = toMs != null ? endOfDay(toMs) : undefined;
    // Keep chosen fields in their canonical (ordered) order for the columns.
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
      const csv = buildAttendanceCsv(exportEvents, chosenKeys);
      await downloadCsv(
        `attendance-${exportSlug(label)}.csv`,
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
          // Group export needs a start date; event export has no range.
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
                <DateField
                  label="From"
                  value={fromMs}
                  active={picking === "from"}
                  onOpen={() => setPicking(picking === "from" ? null : "from")}
                  onClear={() => {
                    setFromMs(undefined);
                    setPicking(null);
                  }}
                />
                <DateField
                  label="To"
                  value={toMs}
                  active={picking === "to"}
                  onOpen={() => setPicking(picking === "to" ? null : "to")}
                  onClear={() => {
                    setToMs(undefined);
                    setPicking(null);
                  }}
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
          {Platform.OS !== "web" && picking ? (
            <View style={{ marginTop: spacing.sm, alignItems: "center" }}>
              {(() => {
                const today = nowMs;
                const minDate =
                  picking === "from"
                    ? MIN_DATE
                    : fromMs != null
                      ? new Date(fromMs)
                      : MIN_DATE;
                const maxDate =
                  picking === "from" && toMs != null
                    ? new Date(toMs)
                    : new Date(today);
                const current = picking === "from" ? fromMs : toMs;
                const initial = clamp(
                  current ?? (picking === "from" ? MIN_DATE.getTime() : today),
                  minDate.getTime(),
                  maxDate.getTime()
                );
                return (
                  <DateTimePicker
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "default"}
                    value={new Date(initial)}
                    minimumDate={minDate}
                    maximumDate={maxDate}
                    accentColor={t.primary}
                    onValueChange={(_event, date) => {
                      if (picking === "from") setFromMs(date.getTime());
                      else setToMs(date.getTime());
                      if (Platform.OS !== "ios") setPicking(null);
                    }}
                    onDismiss={() => setPicking(null)}
                  />
                );
              })()}
              {Platform.OS === "ios" ? (
                <Btn
                  title="Done"
                  variant="ghost"
                  onPress={() => setPicking(null)}
                />
              ) : null}
            </View>
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
        {ALWAYS_COLUMNS.map((label) => (
          <ToggleRow key={label} label={label} checked locked />
        ))}
        {(fields ?? []).map((field) => {
          const locked = LOCKED_FIELD_KEYS.has(field.key);
          return (
            <ToggleRow
              key={field._id}
              label={field.key}
              checked={isSelected(field.key)}
              locked={locked}
              onPress={() => toggleKey(field.key)}
            />
          );
        })}
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
