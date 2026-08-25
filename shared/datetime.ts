export const pad2 = (value: number): string => String(value).padStart(2, "0");

export const toDateInputValue = (date: Date): string =>
  `${String(date.getFullYear()).padStart(4, "0")}-${pad2(
    date.getMonth() + 1
  )}-${pad2(date.getDate())}`;

export const toTimeInputValue = (date: Date): string =>
  `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

export const parseDateInputValue = (value: string): Date | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

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
