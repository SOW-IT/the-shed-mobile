const MINOR_WORDS = new Set(["of", "the", "and", "&", "at", "in"]);

export const churchAcronym = (name: string): string =>
  name
    .replace(/\([^)]*\)/g, " ")
    .split(/[\s-]+/)
    .filter((word) => word && !MINOR_WORDS.has(word.toLowerCase()))
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
    .join("")
    .toUpperCase() || name.trim();

export const churchPagePath = (churchId: string) => `/churches?church=${encodeURIComponent(churchId)}`;

export type ServiceTime = { day: number; time: string };

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const MAX_SERVICES = 10;

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isServiceTime = (service: ServiceTime) =>
  Number.isInteger(service.day) && service.day >= 0 && service.day <= 6 && CLOCK.test(service.time);

export const sortServices = (services: readonly ServiceTime[]): ServiceTime[] =>
  [...new Map(services.map((s) => [`${s.day}|${s.time}`, { day: s.day, time: s.time }])).values()].sort(
    (a, b) => a.day - b.day || a.time.localeCompare(b.time)
  );

export const formatClock = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  const hour = hours % 12 || 12;
  const suffix = hours < 12 ? "am" : "pm";
  return minutes ? `${hour}:${String(minutes).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
};

const joinWithAnd = (items: string[]) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items.join("");

export const formatServices = (services: readonly ServiceTime[]): string | null => {
  const byDay = new Map<number, string[]>();
  for (const service of sortServices(services)) {
    byDay.set(service.day, [...(byDay.get(service.day) ?? []), formatClock(service.time)]);
  }
  if (byDay.size === 0) return null;
  return [...byDay].map(([day, times]) => `${WEEKDAYS[day]} ${joinWithAnd(times)}`).join(" · ");
};

const WEEKDAY_PREFIXES = WEEKDAYS.map((day) => day.slice(0, 3).toLowerCase());
const TOKEN = /([a-z]+)|(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/gi;

export const parseServiceTimes = (text: string): ServiceTime[] => {
  let day = 0;
  const services: ServiceTime[] = [];
  for (const [, word, hour, minute, meridiem] of text.matchAll(TOKEN)) {
    if (word) {
      const found = WEEKDAY_PREFIXES.indexOf(word.slice(0, 3).toLowerCase());
      if (found !== -1 && word.length >= 3) day = found;
      continue;
    }
    const h = Number(hour);
    if (h < 1 || h > 12) continue;
    const hours = (h % 12) + (meridiem.toLowerCase() === "pm" ? 12 : 0);
    const time = `${String(hours).padStart(2, "0")}:${minute ?? "00"}`;
    if (CLOCK.test(time)) services.push({ day, time });
  }
  return sortServices(services);
};

export const cleanWebsite = (text: string | undefined): string | undefined | null => {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  if (/\s/.test(trimmed)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
};

export const websiteLabel = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

export const cleanInstagram = (text: string | undefined): string | undefined | null => {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  const handle = trimmed
    .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null;
};

export const instagramUrl = (handle: string) => `https://www.instagram.com/${handle}/`;
