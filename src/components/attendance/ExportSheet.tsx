import { Ionicons } from "@expo/vector-icons";
import { useConvex, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
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
import {
  Btn,
  ErrorBanner,
  errorMessage,
  Field,
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

/** Parse a YYYY-MM-DD string to ms at the given edge of that local day. */
const parseDay = (value: string, edge: "start" | "end"): number | null => {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const date =
    edge === "start"
      ? new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0)
      : new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
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
  const fields = useQuery(api.attendanceMetadata.list, { year, subgroup });
  const tags = useQuery(api.attendanceTags.list, isEvent ? "skip" : { year });

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedTags, setSelectedTags] = useState<Id<"attendanceTags">[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[] | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on open
    setFromDate("");
    setToDate("");
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
    const dateStart = fromDate ? parseDay(fromDate, "start") : undefined;
    const dateEnd = toDate ? parseDay(toDate, "end") : undefined;
    if (fromDate && dateStart === null) {
      setError("Enter a valid From date (YYYY-MM-DD) or leave it blank.");
      return;
    }
    if (toDate && dateEnd === null) {
      setError("Enter a valid To date (YYYY-MM-DD) or leave it blank.");
      return;
    }
    if (dateStart != null && dateEnd != null && dateEnd < dateStart) {
      setError("The To date can't be before the From date.");
      return;
    }
    // Keep chosen fields in their canonical (ordered) order for the columns.
    const chosenKeys = orderedFieldKeys.filter(isSelected);

    setDownloading(true);
    try {
      let exportEvents: ExportEventForCsv[];
      let label: string;
      if (isEvent) {
        const data = await convex.query(api.attendanceExport.eventForExport, {
          eventId,
        });
        if (!data) throw new Error("This event is no longer available.");
        exportEvents = [data.event];
        label = data.event.name;
      } else {
        const data = await convex.query(api.attendanceExport.eventsForExport, {
          subgroup,
          dateStart: dateStart ?? undefined,
          dateEnd: dateEnd ?? undefined,
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
          disabled={fields === undefined}
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
            Time range (optional)
          </Txt>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Field
                label="From (YYYY-MM-DD)"
                value={fromDate}
                onChangeText={setFromDate}
                placeholder="all time"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="To (YYYY-MM-DD)"
                value={toDate}
                onChangeText={setToDate}
                placeholder="all time"
              />
            </View>
          </View>

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
