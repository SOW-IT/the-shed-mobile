import { csvLine } from "./csv";
import { pad2, toTimeInputValue } from "../../shared/datetime";
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
/** Column header for attendance rate on the person × event matrix export. */
export const ATTENDANCE_PCT_HEADER = "Attendance %";

/** True when `key` is the reserved sign-in Notes column (not metadata). */
export const isNotesExportFieldKey = (key: string): boolean =>
  key.trim().toLowerCase() === NOTES_HEADER.toLowerCase();

/**
 * A metadata field whose name collides with a reserved export column
 * (Notes, or Attendance % on the matrix layout).
 */
export const isReservedExportFieldKey = (key: string): boolean => {
  const k = key.trim().toLowerCase();
  return (
    k === NOTES_HEADER.toLowerCase() ||
    k === ATTENDANCE_PCT_HEADER.toLowerCase()
  );
};

/** dd.mm.yyyy for a date. */
const formatDate = (ms: number): string => {
  const d = new Date(ms);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
};

/** dd.mm.yyyy HH:MM for a date+time. */
const formatDateTime = (ms: number): string =>
  `${formatDate(ms)} ${toTimeInputValue(new Date(ms))}`;

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
  // note column. Other reserved names (e.g. Attendance %) are dropped too.
  const includeNotes = fieldKeys.some(isNotesExportFieldKey);
  const metadataKeys = fieldKeys.filter((key) => !isReservedExportFieldKey(key));
  const tableHeader = csvLine([
    ...ATTENDEE_HEADERS,
    ...metadataKeys,
    ...(includeNotes ? [NOTES_HEADER] : []),
  ]);
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
        ...(includeNotes ? [row.notes ?? ""] : []),
      ])
    );
    return [...info, "", tableHeader, ...rows].join("\r\n");
  });
  // Two blank lines between events, so a section break is distinct from the
  // single blank line separating an event's info block from its table.
  return sections.join("\r\n\r\n\r\n");
};

/**
 * Person × event attendance grid (one row per person, one column per event).
 *
 * Layout matches a classic roll-call sheet:
 *   1. A "Total Attendance" summary row with the headcount for each event
 *   2. A header row: Name, Email, chosen metadata, Attendance %, then each event
 *   3. One body row per person — "Y" when they signed in, blank when they didn't,
 *      plus Attendance % = events attended / events that had any attendance
 *      (zero-headcount events still appear as columns, but don't drag % down —
 *      matching the spreadsheet people migrate from)
 *
 * People are de-duplicated by {@link ExportEvent}'s per-row `identityKey`
 * (email / member id / attendance row id) — **never by display name**, so two
 * people called "John Smith" stay as two rows. The same person across events
 * still merges correctly via a stable key. Metadata is taken from their most
 * recent sign-in. Notes and sign-in timestamps don't fit a multi-event grid,
 * so they're omitted even if selected for the list export.
 */
export const buildAttendanceMatrixCsv = (
  events: ExportEvent[],
  fieldKeys: string[]
): string => {
  const metadataKeys = fieldKeys.filter((key) => !isReservedExportFieldKey(key));
  const eventLabels = uniqueEventLabels(events);

  type Person = {
    name: string;
    email: string;
    metadata: Record<string, string>;
    /** Event ids this person signed in to (presence only). */
    attended: Set<string>;
    /** Most recent sign-in time, used to pick which metadata snapshot to keep. */
    lastSignIn: number;
  };

  const people = new Map<string, Person>();
  for (const event of events) {
    for (const row of event.rows) {
      const key = matrixPersonKey(row);
      const existing = people.get(key);
      if (!existing) {
        people.set(key, {
          name: row.name,
          email: row.email,
          metadata: { ...row.metadata },
          attended: new Set([event._id]),
          lastSignIn: row.signInTime,
        });
        continue;
      }
      existing.attended.add(event._id);
      // Prefer the most recent sign-in's name + metadata (profiles can change).
      if (row.signInTime >= existing.lastSignIn) {
        existing.lastSignIn = row.signInTime;
        existing.name = row.name;
        existing.metadata = { ...row.metadata };
        // Keep a non-empty email if a later row is missing one.
        if (row.email) existing.email = row.email;
      } else if (!existing.email && row.email) {
        existing.email = row.email;
      }
    }
  }

  const sorted = [...people.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  const personColCount = 2 + metadataKeys.length + 1; // Name, Email, meta…, %
  const totalsRow = csvLine([
    "Total Attendance",
    ...Array(personColCount - 1).fill(""),
    ...events.map((e) => String(e.attendanceCount)),
  ]);
  const header = csvLine([
    "Name",
    "Email",
    ...metadataKeys,
    ATTENDANCE_PCT_HEADER,
    ...eventLabels,
  ]);
  // Zero-headcount events (cancelled / not rolled) stay as columns but are
  // excluded from the denominator so they don't drag every % down.
  const countedEvents = events.filter((e) => e.attendanceCount > 0);
  const totalCounted = countedEvents.length;
  const body = sorted.map((person) => {
    const attended = countedEvents.reduce(
      (n, e) => n + (person.attended.has(e._id) ? 1 : 0),
      0
    );
    const pct =
      totalCounted === 0
        ? "0%"
        : `${Math.round((attended / totalCounted) * 100)}%`;
    return csvLine([
      person.name,
      person.email,
      ...metadataKeys.map((key) => person.metadata[key] ?? ""),
      pct,
      ...events.map((e) => (person.attended.has(e._id) ? "Y" : "")),
    ]);
  });

  return [totalsRow, header, ...body].join("\r\n");
};

/**
 * Stable matrix row key. Prefer the backend `identityKey` (never name-based).
 * Fallback for incomplete fixtures: email when present, else a unique key from
 * sign-in time alone — display name is never part of the key.
 */
const matrixPersonKey = (row: {
  identityKey?: string;
  email: string;
  signInTime: number;
}): string => {
  if (row.identityKey?.trim()) return row.identityKey.trim();
  if (row.email.trim()) return `email:${row.email.trim().toLowerCase()}`;
  return `anon:${row.signInTime}`;
};

/**
 * Column labels for events. Unique names stay as-is; duplicates get a
 * "dd.mm.yyyy" suffix. If the dated label still collides (same name + same day),
 * a "#2" / "#3" … occurrence suffix is appended.
 */
const uniqueEventLabels = (events: ExportEvent[]): string[] => {
  const nameCounts = new Map<string, number>();
  for (const e of events) {
    nameCounts.set(e.name, (nameCounts.get(e.name) ?? 0) + 1);
  }
  const baseLabels = events.map((e) =>
    (nameCounts.get(e.name) ?? 0) > 1
      ? `${e.name} (${formatDate(e.dateStart)})`
      : e.name
  );
  const seen = new Map<string, number>();
  return baseLabels.map((label) => {
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return n === 1 ? label : `${label} #${n}`;
  });
};

/** A filesystem-safe slug for the export filename (e.g. campus label). */
export const exportSlug = (label: string): string =>
  label.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "export";
