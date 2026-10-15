import { roleNeedsUniversity, staffYearStartMs, sydneyYmd } from "./flow";
import { SOW_SUBGROUP, tagListOf, type TagList } from "./rollcall";
import { dayLabel, type WeeklyPerson } from "./weeklyInsights";

type SowMode = "twig" | "ppn";

type SowTab = { key: string; label: string; picker: "range" | "years"; pickerTitle?: string };

const STAFF_YEAR_PICKER = "Staff year (1 Oct to 30 Sep)";

export const SOW_TABS: SowTab[] = [
  { key: "campuses", label: "Campuses", picker: "range" },
  { key: "twig", label: "TWIG", picker: "years", pickerTitle: STAFF_YEAR_PICKER },
  { key: "ppn", label: "PPN", picker: "years", pickerTitle: STAFF_YEAR_PICKER },
];

export const isSowMode = (key: string): key is SowMode => key === "twig" || key === "ppn";

const TWIG_TAG_NAME = "TWIG";
const PPN_TAG_NAME = "PPN";

export type SowEvent = { id: string; name: string; at: number; people: string[] };

export type SowRole = "leader" | "staff" | "none";

export const SOW_ROLE_ORDER: SowRole[] = ["leader", "staff", "none"];

export type SowPeople = Map<string, WeeklyPerson>;

export function sowModeOf(tags: { name: string; list?: TagList }[]): SowMode | null {
  const has = (name: string) => tags.some((t) => t.name === name && tagListOf(t) === "events");
  if (!has(TWIG_TAG_NAME)) return null;
  return has(PPN_TAG_NAME) ? "ppn" : "twig";
}

export const roleIn = (person: WeeklyPerson | undefined, staffYear: number): SowRole => {
  const info = person?.infoByYear[String(staffYear)];
  if (!info) return "none";
  return info.roles.some(roleNeedsUniversity) ? "leader" : "staff";
};

export const campusIn = (person: WeeklyPerson | undefined, staffYear: number): string | null =>
  (person?.infoByYear[String(staffYear)] ?? person?.info)?.campus ?? null;

export const staffYearLabel = (year: number): string => `Staff year ${year}`;

export const isRunning = (year: number, now: number): boolean =>
  now >= staffYearStartMs(year) && now < staffYearStartMs(year + 1);

const round1 = (n: number) => Math.round(n * 10) / 10;

const byTime = (events: SowEvent[]) => [...events].sort((a, b) => a.at - b.at);

const heldOf = (events: SowEvent[]) => byTime(events.filter((e) => e.people.length > 0));

const noRollOf = (events: SowEvent[]) => byTime(events.filter((e) => e.people.length === 0));

type Split = { campus: string | null; value: number }[];

function splitByCampus(keys: string[], people: SowPeople, year: number): Split {
  const counts = new Map<string | null, number>();
  for (const key of keys) {
    const person = people.get(key);
    const campus = campusIn(person, year) ?? (roleIn(person, year) === "staff" ? SOW_SUBGROUP : null);
    counts.set(campus, (counts.get(campus) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([campus, value]) => ({ campus, value }))
    .sort(
      (a, b) =>
        b.value - a.value ||
        Number(a.campus === null) - Number(b.campus === null) ||
        (a.campus ?? "").localeCompare(b.campus ?? "")
    );
}

export type TwigSummary = { held: number; avg: number | null; people: number; regulars: number };

export type TwigRow = {
  key: string;
  role: SowRole;
  campus: string | null;
  attended: number;
  held: number;
  pct: number;
  lastAt: number;
  regular: boolean;
};

export type TwigResult = {
  year: number;
  running: boolean;
  held: SowEvent[];
  noRoll: SowEvent[];
  summary: TwigSummary;
  last: TwigSummary | null;
  lastLabel: string | null;
  counts: number[];
  lastCounts: number[];
  lastHeld: SowEvent[];
  byCampus: Split;
  rows: TwigRow[];
  followUp: TwigRow[];
};

type SowRules = { regularShare: number; followUpMisses: number };

const leadersAt = (event: SowEvent, people: SowPeople, year: number) =>
  event.people.filter((key) => roleIn(people.get(key), year) === "leader");

function twigSummary(held: SowEvent[], people: SowPeople, year: number, rules: SowRules): TwigSummary {
  const times = new Map<string, number>();
  let total = 0;
  for (const event of held) {
    for (const key of leadersAt(event, people, year)) {
      times.set(key, (times.get(key) ?? 0) + 1);
      total += 1;
    }
  }
  return {
    held: held.length,
    avg: held.length ? round1(total / held.length) : null,
    people: times.size,
    regulars: [...times.values()].filter((n) => n >= rules.regularShare * held.length).length,
  };
}

export function computeTwig(input: {
  year: number;
  events: SowEvent[];
  lastEvents: SowEvent[];
  people: SowPeople;
  now: number;
  rules: SowRules;
}): TwigResult {
  const { year, people, rules } = input;
  const held = heldOf(input.events);
  const lastHeld = heldOf(input.lastEvents);
  const running = isRunning(year, input.now);
  const cut = running ? staffYearStartMs(year - 1) + (input.now - staffYearStartMs(year)) : Infinity;
  const lastSoFar = lastHeld.filter((e) => e.at <= cut);
  const last = lastSoFar.length ? twigSummary(lastSoFar, people, year - 1, rules) : null;

  const seen = new Map<string, { attended: number; lastAt: number }>();
  for (const event of held) {
    for (const key of event.people) {
      const row = seen.get(key) ?? { attended: 0, lastAt: 0 };
      seen.set(key, { attended: row.attended + 1, lastAt: Math.max(row.lastAt, event.at) });
    }
  }
  const rows: TwigRow[] = [...seen.entries()].map(([key, { attended, lastAt }]) => {
    const role = roleIn(people.get(key), year);
    return {
      key,
      role,
      campus: campusIn(people.get(key), year),
      attended,
      held: held.length,
      pct: attended / held.length,
      lastAt,
      regular: role === "leader" && attended >= rules.regularShare * held.length,
    };
  });
  const recent = held.slice(-rules.followUpMisses);
  const followUp =
    running && held.length > rules.followUpMisses
      ? rows
          .filter((r) => r.regular && recent.every((e) => !e.people.includes(r.key)))
          .sort((a, b) => b.lastAt - a.lastAt)
      : [];

  return {
    year,
    running,
    held,
    noRoll: noRollOf(input.events),
    summary: twigSummary(held, people, year, rules),
    last,
    lastLabel: lastHeld.length ? (running ? `${year - 1} up to ${dayLabel(cut)}` : String(year - 1)) : null,
    counts: held.map((e) => leadersAt(e, people, year).length),
    lastCounts: lastHeld.map((e) => leadersAt(e, people, year - 1).length),
    lastHeld,
    byCampus: splitByCampus(held.flatMap((e) => leadersAt(e, people, year)), people, year),
    rows,
    followUp,
  };
}

export type PpnRow = {
  event: SowEvent;
  total: number;
  firstTimers: number;
  byRole: Record<SowRole, number>;
  byCampus: Split;
  last: { event: SowEvent; total: number } | null;
};

export type PpnResult = {
  year: number;
  rows: PpnRow[];
  noRoll: SowEvent[];
  totals: { signIns: number; people: number; firstTimers: number; byRole: Record<SowRole, number> };
};

const emptyRoles = (): Record<SowRole, number> => ({ leader: 0, staff: 0, none: 0 });

const monthOf = (at: number) => sydneyYmd(new Date(at)).month;

export function computePpn(input: {
  year: number;
  events: SowEvent[];
  lastEvents: SowEvent[];
  earlier: SowEvent[];
  people: SowPeople;
}): PpnResult {
  const { year, people } = input;
  const held = heldOf(input.events);
  const lastHeld = heldOf(input.lastEvents);
  const seen = new Set(heldOf(input.earlier).flatMap((e) => e.people));
  const everyone = new Set<string>();
  const totals = { signIns: 0, people: 0, firstTimers: 0, byRole: emptyRoles() };
  const rows: PpnRow[] = held.map((event) => {
    const byRole = emptyRoles();
    let firstTimers = 0;
    for (const key of event.people) {
      byRole[roleIn(people.get(key), year)] += 1;
      if (!seen.has(key)) firstTimers += 1;
      seen.add(key);
      everyone.add(key);
    }
    const lastEvent = lastHeld.find((e) => monthOf(e.at) === monthOf(event.at));
    totals.signIns += event.people.length;
    totals.firstTimers += firstTimers;
    for (const role of SOW_ROLE_ORDER) totals.byRole[role] += byRole[role];
    return {
      event,
      total: event.people.length,
      firstTimers,
      byRole,
      byCampus: splitByCampus(event.people, people, year),
      last: lastEvent ? { event: lastEvent, total: lastEvent.people.length } : null,
    };
  });
  totals.people = everyone.size;
  return { year, rows: rows.reverse(), noRoll: noRollOf(input.events), totals };
}
