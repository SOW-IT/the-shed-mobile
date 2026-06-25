import { buildCsv } from "./csv";
import { subgroupLabel } from "../../shared/rollcall";
import type { ExportEvent } from "../../convex/attendanceExport";

/** Re-exported so UI code can type the export payload without reaching into Convex. */
export type ExportEventForCsv = ExportEvent;

/** Base columns always present in an attendance export, in order. */
const BASE_HEADERS = [
  "Event",
  "Date",
  "Tags",
  "Collaboration",
  "Sign In",
  "Name",
  "Email",
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** dd.mm.yyyy for the event date column. */
const formatDate = (ms: number): string => {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

/** dd.mm.yyyy HH:MM for a sign-in timestamp. */
const formatDateTime = (ms: number): string => {
  const d = new Date(ms);
  return `${formatDate(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Flattens exported events into a single CSV: the base columns, then one column
 * per chosen metadata field (in the given order), then Notes. Each signed-in
 * person is one row; an event with no attendance still contributes one summary
 * row so it isn't silently dropped from the export.
 */
export const buildAttendanceCsv = (
  events: ExportEvent[],
  fieldKeys: string[]
): string => {
  const header = [...BASE_HEADERS, ...fieldKeys, "Notes"];
  const rows: string[][] = [];
  for (const event of events) {
    const collaboration = event.collaborators.map(subgroupLabel).join(", ");
    const eventCells = [
      event.name,
      `${formatDate(event.dateStart)}${
        event.dateEnd ? `–${formatDateTime(event.dateEnd)}` : ""
      }`,
      event.tags.join(", "),
      collaboration,
    ];
    if (event.rows.length === 0) {
      rows.push([
        ...eventCells,
        "",
        "",
        "",
        ...fieldKeys.map(() => ""),
        "",
      ]);
      continue;
    }
    for (const row of event.rows) {
      rows.push([
        ...eventCells,
        formatDateTime(row.signInTime),
        row.name,
        row.email,
        ...fieldKeys.map((key) => row.metadata[key] ?? ""),
        row.notes ?? "",
      ]);
    }
  }
  return buildCsv(header, rows);
};

/** A filesystem-safe slug for the export filename (e.g. campus label). */
export const exportSlug = (label: string): string =>
  label.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "export";
