import { csvLine } from "./csv";
import { subgroupLabel } from "../../shared/rollcall";
import type { ExportEvent } from "../../convex/attendanceExport";

/** Re-exported so UI code can type the export payload without reaching into Convex. */
export type ExportEventForCsv = ExportEvent;

/** Per-attendee table columns, before the chosen metadata fields and Notes. */
const ATTENDEE_HEADERS = ["Sign In", "Name", "Email"] as const;

/**
 * Trailing column header, reserved for the per-sign-in note. A metadata field
 * named "Notes" would otherwise emit a second, identically-named column, so any
 * such field is dropped here — the sign-in note is the canonical "Notes".
 */
export const NOTES_HEADER = "Notes";
/** A metadata field whose name collides with a reserved export column. */
export const isReservedExportFieldKey = (key: string): boolean =>
  key.trim().toLowerCase() === NOTES_HEADER.toLowerCase();

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
 * Builds the CSV. Each event is its own section: an event-level info block
 * (name, dates, tags, collaboration — written once for the event, not repeated
 * per person), a blank line, then an attendee table whose columns are the
 * per-person fields: Sign In, Name, Email, the chosen metadata fields (in
 * order), then Notes. Sections are separated by a blank line; an event with no
 * attendance still appears as its info block + header so it isn't dropped.
 */
export const buildAttendanceCsv = (
  events: ExportEvent[],
  fieldKeys: string[]
): string => {
  // Never let a metadata field named "Notes" duplicate the reserved sign-in
  // note column.
  const metadataKeys = fieldKeys.filter((key) => !isReservedExportFieldKey(key));
  const tableHeader = csvLine([...ATTENDEE_HEADERS, ...metadataKeys, NOTES_HEADER]);
  const sections = events.map((event) => {
    const collaboration = event.collaborators.map(subgroupLabel).join(", ");
    // Event-level info: one label/value row each, specific to the event.
    const info = [
      csvLine(["Event", event.name]),
      csvLine(["Start Date", formatDateTime(event.dateStart)]),
      csvLine(["End Date", formatDateTime(event.dateEnd)]),
      csvLine(["Tags", event.tags.join(", ")]),
      csvLine(["Collaboration", collaboration]),
    ];
    const rows = event.rows.map((row) =>
      csvLine([
        formatDateTime(row.signInTime),
        row.name,
        row.email,
        ...metadataKeys.map((key) => row.metadata[key] ?? ""),
        row.notes ?? "",
      ])
    );
    return [...info, "", tableHeader, ...rows].join("\r\n");
  });
  // Two blank lines between events, so a section break is distinct from the
  // single blank line separating an event's info block from its table.
  return sections.join("\r\n\r\n\r\n");
};

/** A filesystem-safe slug for the export filename (e.g. campus label). */
export const exportSlug = (label: string): string =>
  label.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "export";
