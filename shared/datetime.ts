/**
 * Pure date/time text helpers shared by the app — no React Native or Convex
 * imports, so the edge-runtime vitest suite can exercise them directly.
 *
 * Two groups live here:
 *  - the `YYYY-MM-DD` / `HH:MM` *input value* shapes used by the web date/time
 *    inputs and the native picker fields, which four screens had each grown
 *    their own copy of;
 *  - `compactAgo`, the "5m / 3h / 2d" stamp shown in the notification feed and
 *    the comment thread.
 *
 * Everything here is local-time: an event's schedule is the wall clock where it
 * happens, not UTC. (Sydney-anchored staff/calendar-year boundaries are a
 * different concern and live in ./flow.)
 */

/** Zero-pads to two digits — the width every date/time part is written at. */
export const pad2 = (value: number): string => String(value).padStart(2, "0");

/**
 * A date's local calendar day as `YYYY-MM-DD` (a date input's value shape).
 * The year is padded to four digits so the output is always the fixed width
 * {@link parseDateInputValue} accepts — no caller can reach a sub-1000 year
 * today, but a total formatter is one `padStart` away, so it may as well be.
 */
export const toDateInputValue = (date: Date): string =>
  `${String(date.getFullYear()).padStart(4, "0")}-${pad2(
    date.getMonth() + 1
  )}-${pad2(date.getDate())}`;

/** A date's local wall-clock time as `HH:MM` (a time input's value shape). */
export const toTimeInputValue = (date: Date): string =>
  `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

/**
 * `YYYY-MM-DD` → that day at local midnight, or null when the value is empty,
 * malformed, or names a day that doesn't exist. Strict on shape: every producer
 * (web `<input type="date">`, the native picker, {@link toDateInputValue}) emits
 * zero-padded parts, so a looser parse would only ever admit junk.
 */
export const parseDateInputValue = (value: string): Date | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // `new Date(year, …)` reads years 0–99 as 1900–1999, which would make
  // `toDateInputValue` and this function disagree on "0099-01-01". `setFullYear`
  // takes the year literally, so the pair round-trips at every year.
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  // Reject values that rolled over (e.g. "2024-02-31" → 2 March) rather than
  // silently accepting a different day than the one the user picked.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

/**
 * `HH:MM` (or `H:MM`) → its hour/minute parts, or null when malformed or out of
 * range. Returns parts rather than a Date because callers apply them to a day
 * they already have.
 */
export const parseTimeInputValue = (
  value: string
): { hours: number; minutes: number } | null => {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
};

/**
 * `YYYY-MM-DD` + `HH:MM` → epoch ms in local time, or null when either part is
 * bad.
 *
 * A wall-clock time that doesn't exist — the hour skipped by a DST
 * spring-forward, e.g. 02:30 on the first Sunday of October in Sydney — is
 * moved forward by the size of the gap (02:30 → 03:30). That is what `setHours`
 * does per spec, what the per-screen copies this replaced did, and what every
 * calendar app does; rejecting it instead would fail a plausible-looking time
 * with a generic "enter a valid time" once a year, which is the worse outcome.
 */
export const parseDateTimeInputValues = (
  dateValue: string,
  timeValue: string
): number | null => {
  const date = parseDateInputValue(dateValue);
  const time = parseTimeInputValue(timeValue);
  if (!date || !time) return null;
  date.setHours(time.hours, time.minutes, 0, 0);
  return date.getTime();
};

const MINUTE_MS = 60_000;

/**
 * Compact "time ago" for feed rows: `now`, `5m`, `3h`, `2d`, then an absolute
 * `12 Jun` once it's a week old (a "9d" is less readable than the date).
 */
export const compactAgo = (ms: number, now: number = Date.now()): string => {
  const mins = Math.floor((now - ms) / MINUTE_MS);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
};
