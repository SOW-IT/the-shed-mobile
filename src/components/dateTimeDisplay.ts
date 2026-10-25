import { parseTimeInputValue } from "@shared/datetime";

export const formatDateDisplay = (d: Date): string =>
  d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export const formatTimeDisplay = (d: Date): string =>
  d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });

export const inputToTime = (value: string): Date | null => {
  const parts = parseTimeInputValue(value);
  if (!parts) return null;
  const d = new Date();
  d.setHours(parts.hours, parts.minutes, 0, 0);
  return d;
};
