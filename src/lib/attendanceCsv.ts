import { csvLine, escapeField } from "./csv";
import { subgroupLabel } from "../../shared/rollcall";
import type { ExportEvent } from "../../convex/attendanceExport";

/** Re-exported so UI code can type the export payload without reaching into Convex. */
export type ExportEventForCsv = ExportEvent;

/** Column headers in order: event-level columns, then attendee columns. */
const COLUMN_HEADERS = [
  "Start Date",
  "End Date",
  "Tags",
  "Collaboration",
  "Sign In",
  "Name",
  "Email",
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** dd.mm.yyyy for a date. */
const formatDate = (ms: number): string => {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

/** dd.mm.yyyy HH:MM for a date+time. */
const formatDateTime = (ms: number): string => {
  const d = new Date(ms);
  return `${formatDate(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Builds the CSV. Each event is its own titled section: a title row with the
 * event name, the column header, then one row per signed-in person. The chosen
 * metadata fields become columns (in the given order) between Email and Notes.
 * Sections are separated by a blank line; an event with no attendance still
 * appears as a titled, header-only section so it isn't silently dropped.
 */
export const buildAttendanceCsv = (
  events: ExportEvent[],
  fieldKeys: string[]
): string => {
  const header = csvLine([...COLUMN_HEADERS, ...fieldKeys, "Notes"]);
  const sections = events.map((event) => {
    const collaboration = event.collaborators.map(subgroupLabel).join(", ");
    const eventCells = [
      formatDateTime(event.dateStart),
      formatDateTime(event.dateEnd),
      event.tags.join(", "),
      collaboration,
    ];
    // The event name is the section title, not a column.
    const lines = [escapeField(event.name), header];
    for (const row of event.rows) {
      lines.push(
        csvLine([
          ...eventCells,
          formatDateTime(row.signInTime),
          row.name,
          row.email,
          ...fieldKeys.map((key) => row.metadata[key] ?? ""),
          row.notes ?? "",
        ])
      );
    }
    return lines.join("\r\n");
  });
  return sections.join("\r\n\r\n");
};

/** A filesystem-safe slug for the export filename (e.g. campus label). */
export const exportSlug = (label: string): string =>
  label.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "export";
