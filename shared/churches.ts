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

export type ChurchPersonGroup = "leader" | "staff" | "member";

export const CHURCH_GROUPS: readonly { key: ChurchPersonGroup; label: string }[] = [
  { key: "leader", label: "Campus leaders" },
  { key: "staff", label: "Staff" },
  { key: "member", label: "Members" },
];

export const NO_CAMPUS = "";

export type ChurchFilter = { groups: readonly ChurchPersonGroup[]; campuses: readonly string[] };

export const NO_CHURCH_FILTER: ChurchFilter = { groups: [], campuses: [] };

export const isChurchFilterActive = (filter: ChurchFilter) => filter.groups.length > 0 || filter.campuses.length > 0;

export const togglePicked = <K extends string>(picked: readonly K[], key: K): K[] =>
  picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key];

type Filterable = { group: ChurchPersonGroup; campus: string | null };

const campusKey = (person: Filterable) => person.campus ?? NO_CAMPUS;

const groupShown = (person: Filterable, filter: ChurchFilter) =>
  filter.groups.length === 0 || filter.groups.includes(person.group);

const campusShown = (person: Filterable, filter: ChurchFilter) =>
  filter.campuses.length === 0 || filter.campuses.includes(campusKey(person));

export const churchPeopleMatching = <P extends Filterable>(people: readonly P[], filter: ChurchFilter): P[] =>
  people.filter((person) => groupShown(person, filter) && campusShown(person, filter));

export const churchCampuses = (people: readonly Filterable[], label: (campus: string) => string): string[] => {
  const campuses = [...new Set(people.flatMap((person) => (person.campus ? [person.campus] : [])))].sort((a, b) =>
    label(a).localeCompare(label(b))
  );
  return people.some((person) => !person.campus) ? [...campuses, NO_CAMPUS] : campuses;
};

export const churchFilterCounts = <E extends { people: readonly Filterable[] }>(
  churches: readonly E[],
  filter: ChurchFilter,
  shows: (church: E, people: E["people"][number][]) => boolean = () => true
) => {
  const groups = new Map<ChurchPersonGroup, number>();
  const campuses = new Map<string, number>();
  const tally = <K>(counts: Map<K, number>, byOption: Map<K, E["people"][number][]>, church: E) => {
    for (const [option, people] of byOption) {
      if (shows(church, people)) counts.set(option, (counts.get(option) ?? 0) + people.length);
    }
  };
  for (const church of churches) {
    const byGroup = new Map<ChurchPersonGroup, E["people"][number][]>();
    const byCampus = new Map<string, E["people"][number][]>();
    for (const person of church.people) {
      if (campusShown(person, filter)) byGroup.set(person.group, [...(byGroup.get(person.group) ?? []), person]);
      if (groupShown(person, filter)) byCampus.set(campusKey(person), [...(byCampus.get(campusKey(person)) ?? []), person]);
    }
    tally(groups, byGroup, church);
    tally(campuses, byCampus, church);
  }
  return { groups, campuses };
};

export const mainCampus = (people: readonly Filterable[]): string | null => {
  const counts = new Map<string, number>();
  for (const person of people) {
    if (person.campus) counts.set(person.campus, (counts.get(person.campus) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [campus, count] of counts) {
    if (best === null || count > counts.get(best)! || (count === counts.get(best) && campus < best)) best = campus;
  }
  return best;
};
