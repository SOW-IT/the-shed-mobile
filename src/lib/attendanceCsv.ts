import { csvLine } from "./csv";
import { pad2, toTimeInputValue } from "../../shared/datetime";
import { subgroupLabel } from "../../shared/rollcall";
import type { ExportEvent } from "../../convex/attendanceExport";

export type ExportEventForCsv = ExportEvent;

const ATTENDEE_HEADERS = ["Sign In", "Name", "Email"] as const;

export const NOTES_HEADER = "Notes";
export const ATTENDANCE_PCT_HEADER = "Attendance %";

export const isNotesExportFieldKey = (key: string): boolean =>
  key.trim().toLowerCase() === NOTES_HEADER.toLowerCase();

export const isReservedExportFieldKey = (key: string): boolean => {
  const k = key.trim().toLowerCase();
  return (
    k === NOTES_HEADER.toLowerCase() ||
    k === ATTENDANCE_PCT_HEADER.toLowerCase()
  );
};

const formatDate = (ms: number): string => {
  const d = new Date(ms);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
};

const formatDateTime = (ms: number): string =>
  `${formatDate(ms)} ${toTimeInputValue(new Date(ms))}`;

export const buildAttendanceCsv = (
  events: ExportEvent[],
  fieldKeys: string[]
): string => {
  const includeNotes = fieldKeys.some(isNotesExportFieldKey);
  const metadataKeys = fieldKeys.filter((key) => !isReservedExportFieldKey(key));
  const tableHeader = csvLine([
    ...ATTENDEE_HEADERS,
    ...metadataKeys,
    ...(includeNotes ? [NOTES_HEADER] : []),
  ]);
  const sections = events.map((event) => {
    const collaboration = event.collaborators.map(subgroupLabel).join(", ");
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
  return sections.join("\r\n\r\n\r\n");
};

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
    attended: Set<string>;
    lastSignIn: number;
  };

  const people = new Map<string, Person>();
  for (const event of events) {
    for (let rowIndex = 0; rowIndex < event.rows.length; rowIndex += 1) {
      const row = event.rows[rowIndex];
      const key = matrixPersonKey(row, event._id, rowIndex);
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
      if (row.signInTime >= existing.lastSignIn) {
        existing.lastSignIn = row.signInTime;
        existing.name = row.name;
        existing.metadata = { ...row.metadata };
        if (row.email) existing.email = row.email;
      } else if (!existing.email && row.email) {
        existing.email = row.email;
      }
    }
  }

  const sorted = [...people.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  const personColCount = 2 + metadataKeys.length + 1;
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

const matrixPersonKey = (
  row: {
    identityKey?: string;
    email: string;
    signInTime: number;
  },
  eventId: string,
  rowIndex: number
): string => {
  if (row.identityKey?.trim()) return row.identityKey.trim();
  if (row.email.trim()) return `email:${row.email.trim().toLowerCase()}`;
  return `anon:${eventId}:${rowIndex}`;
};

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

export const exportSlug = (label: string): string =>
  label.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "export";
