import { parseTimeInputValue } from "@shared/datetime";

/** How date and time fields show their value, the same on native and web. */
export const formatDateDisplay = (d: Date): string =>
  d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export const formatTimeDisplay = (d: Date): string =>
  d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** An HH:MM value as today's date at that time, for display and pickers. */
export const inputToTime = (value: string): Date | null => {
  const parts = parseTimeInputValue(value);
  if (!parts) return null;
  const d = new Date();
  d.setHours(parts.hours, parts.minutes, 0, 0);
  return d;
};
