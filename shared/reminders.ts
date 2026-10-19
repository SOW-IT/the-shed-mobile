import { daysSince } from "./datetime";
import { formatDate, isValidDateString, isValidDateTimeString } from "./forms";

const DAY_MS = 24 * 60 * 60 * 1000;

export const reminderDelayMs = (count: number): number => {
  if (count === 0) return DAY_MS;
  if (count === 1) return 3 * DAY_MS;
  return 7 * DAY_MS;
};

export type ReminderTrail = { lastReminderAt?: number; reminderCount?: number };

export const reminderDue = (
  trail: ReminderTrail,
  lastMovement: number,
  now: number
): { due: boolean; count: number; days: number } => {
  const movedSinceReminder =
    trail.lastReminderAt !== undefined && lastMovement > trail.lastReminderAt;
  const count = movedSinceReminder
    ? 0
    : (trail.reminderCount ?? (trail.lastReminderAt ? 1 : 0));
  const baseline =
    count === 0 ? lastMovement : Math.max(lastMovement, trail.lastReminderAt ?? lastMovement);
  return {
    due: now - baseline >= reminderDelayMs(count),
    count,
    days: daysSince(lastMovement, now),
  };
};

export const plural = (n: number, noun: string, nouns = `${noun}s`): string =>
  `${n} ${n === 1 ? noun : nouns}`;

export const forDays = (days: number): string =>
  days === 0 ? "since today" : `for ${plural(days, "day")}`;

export const daysBetweenYmd = (from: string, to: string): number | null => {
  if (!isValidDateString(from) || !isValidDateString(to)) return null;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
};

export const dueText = (dueDate: string, today: string): string => {
  const days = daysBetweenYmd(today, dueDate);
  if (days === null) return "";
  const when =
    days > 1
      ? `in ${days} days`
      : days === 1
        ? "tomorrow"
        : days === 0
          ? "today"
          : `overdue by ${plural(-days, "day")}`;
  return `needed by ${formatDate(dueDate)} (${when})`;
};

export const eventTimingText = (startsAt: string, today: string): string => {
  if (!isValidDateTimeString(startsAt)) return "";
  const days = daysBetweenYmd(today, startsAt.slice(0, 10));
  if (days === null) return "";
  if (days > 1) return `the event is in ${days} days`;
  if (days === 1) return "the event is tomorrow";
  if (days === 0) return "the event is today";
  return `the event was ${plural(-days, "day")} ago`;
};

export type ReminderKind = "reimbursement" | "design" | "event";

export const KIND_NOUNS: Record<ReminderKind, [string, string]> = {
  reimbursement: ["reimbursement request", "reimbursement requests"],
  design: ["design request", "design requests"],
  event: ["event form", "event forms"],
};

export const summarizeWaiting = (counts: Partial<Record<ReminderKind, number>>): string => {
  const parts = (Object.keys(KIND_NOUNS) as ReminderKind[])
    .filter((kind) => (counts[kind] ?? 0) > 0)
    .map((kind) => plural(counts[kind]!, KIND_NOUNS[kind][0], KIND_NOUNS[kind][1]));
  const total = parts.length === 0 ? 0 : Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  if (total === 0) return "Nothing is waiting on you.";
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${list} ${total === 1 ? "is" : "are"} waiting on you.`;
};

export const reminderSubject = (total: number): string =>
  `Reminder: ${total === 1 ? "1 thing is" : `${total} things are`} waiting on you in THE SHED`;
