import type { Due } from "./calendar";
import { SYDNEY_TIME_ZONE } from "./flow";

export type AuditedEntry = {
  name: string;
  dateStart: number;
  dateEnd: number;
  notes?: string;
  due?: Due;
  colour?: string;
};

export type EntryChange = { field: string; from: string; to: string };

export const CALENDAR_AUDIT_ACTIONS = ["added", "edited", "removed", "attendance"] as const;
export type CalendarAuditAction = (typeof CALENDAR_AUDIT_ACTIONS)[number];

export const NOTES_SHOWN = 80;

const withPlainSpaces = (text: string) => text.replace(/[\u202f\u00a0]/g, " ");

const dayOf = (ms: number) =>
  withPlainSpaces(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: SYDNEY_TIME_ZONE,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(ms))
  );

const timeOf = (ms: number) =>
  withPlainSpaces(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: SYDNEY_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(ms))
  );

export const entryWhen = (entry: AuditedEntry): string => {
  const startDay = dayOf(entry.dateStart);
  if (entry.due === "day") return `Due ${startDay}`;
  if (entry.due === "time") return `Due ${startDay}, ${timeOf(entry.dateStart)}`;
  const endDay = dayOf(entry.dateEnd);
  return startDay === endDay
    ? `${startDay}, ${timeOf(entry.dateStart)} to ${timeOf(entry.dateEnd)}`
    : `${startDay}, ${timeOf(entry.dateStart)} to ${endDay}, ${timeOf(entry.dateEnd)}`;
};

const notesShown = (notes?: string) => {
  if (!notes) return "none";
  const characters = [...notes];
  return characters.length > NOTES_SHOWN
    ? `${characters.slice(0, NOTES_SHOWN - 1).join("").trimEnd()}…`
    : notes;
};

const FIELDS: { field: string; show: (entry: AuditedEntry) => string }[] = [
  { field: "Name", show: (entry) => entry.name },
  { field: "Type", show: (entry) => (entry.due ? "Deadline" : "Event") },
  { field: "When", show: entryWhen },
  { field: "Notes", show: (entry) => notesShown(entry.notes) },
  { field: "Colour", show: (entry) => entry.colour ?? "category colour" },
];

export const entryChanges = (before: AuditedEntry, after: AuditedEntry): EntryChange[] =>
  FIELDS.flatMap(({ field, show }) => {
    const [from, to] = [show(before), show(after)];
    if (from !== to) return [{ field, from, to }];
    if (field === "Notes" && (before.notes ?? "") !== (after.notes ?? "")) {
      return [{ field, from: "earlier notes", to: "edited notes" }];
    }
    return [];
  });

export const auditHeadline = (action: CalendarAuditAction, name: string): string => {
  switch (action) {
    case "added":
      return `Added ${name}`;
    case "edited":
      return `Edited ${name}`;
    case "removed":
      return `Deleted ${name}`;
    case "attendance":
      return `Turned ${name} into an attendance event`;
  }
};
