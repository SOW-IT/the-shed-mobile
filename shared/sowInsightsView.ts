import { type ViewCard } from "./attendanceMetricsView";
import { sydneyYmd } from "./flow";
import { isOrgWideSubgroup, subgroupColour, subgroupLabel } from "./rollcall";
import {
  SOW_ROLE_ORDER,
  type PpnResult,
  type SowEvent,
  type SowPeople,
  type SowRole,
  type TwigResult,
  type TwigRow,
} from "./sowInsights";
import { dayLabel } from "./weeklyInsights";
import {
  countDelta,
  type FollowRow,
  type PeopleRow,
  type Pill,
  type WeeklyBlock,
} from "./weeklyInsightsView";

const THIS_COLOUR = "primary";
const LAST_COLOUR = "#9CA3AFA6";
const FOLLOW_UP_PREVIEW = 5;

const PPN_ROLE_LABEL: Record<SowRole, string> = { leader: "Campus leaders", staff: "Other staff", none: "No staff profile" };

const ROLE_META: Record<SowRole, { section: string; label: string; colour: string }> = {
  leader: { section: "Campus leaders", label: "Campus leader", colour: "#0F766E" },
  staff: { section: "Organisers (other staff)", label: "Organiser", colour: "#6B7280" },
  none: { section: "No staff profile", label: "No staff profile", colour: "#D97706" },
};

const REGULAR_FILTER = { key: "regular", label: "Regular", colour: "#16A34A" };
const NOT_YET_FILTER = { key: "notYet", label: "Not yet", colour: "#DC2626" };

const fullDate = (at: number) => `${dayLabel(at)} ${sydneyYmd(new Date(at)).year}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const pct = (n: number) => `${Math.round(n * 100)}%`;

const campusName = (campus: string | null) => (campus ? subgroupLabel(campus) : "No campus");

const campusPage = (campus: string | null) => (campus && !isOrgWideSubgroup(campus) ? campus : undefined);

const campusBars = (split: { campus: string | null; value: number }[]) =>
  split.map((c) => ({
    label: campusName(c.campus),
    value: c.value,
    colour: campusPage(c.campus) ? subgroupColour(c.campus as string) : undefined,
  }));

const round1 = (n: number) => Math.round(n * 10) / 10;

const noRollBlock = (events: SowEvent[], what: string): WeeklyBlock[] =>
  events.length
    ? [
        {
          type: "eventList",
          title: "No roll taken",
          rows: [...events].reverse().map((e) => ({ title: e.name, subtitle: fullDate(e.at) })),
          emptyText: `Every ${what} had a roll.`,
        },
      ]
    : [];

const rolePill = (row: { role: SowRole; campus: string | null }): Pill =>
  row.role === "leader" && row.campus
    ? { label: subgroupLabel(row.campus), colour: subgroupColour(row.campus) }
    : { label: ROLE_META[row.role].label, colour: ROLE_META[row.role].colour };

const lastCame = (lastAt: number) => `Last came ${fullDate(lastAt)}`;

function twigCards(result: TwigResult, missesForFollowUp: number): ViewCard[] {
  const { summary: s, last, lastLabel } = result;
  const vs = (value: string) => `vs ${value}`;
  const compare = last
    ? result.running
      ? ` Compared with ${lastLabel}: the same point in last staff year.`
      : ` Compared with ${lastLabel}.`
    : "";
  return [
    {
      label: "Average attendance",
      value: s.avg === null ? "–" : String(s.avg),
      delta: countDelta(s.avg, last?.avg ?? null),
      hint: last?.avg != null ? vs(String(last.avg)) : undefined,
      info: {
        title: "Average attendance",
        body: `Campus leaders signed in per TWIG. Organisers and people with no staff profile aren't counted, and neither is a TWIG nobody signed in to.${compare}`,
      },
    },
    {
      label: "People",
      value: String(s.people),
      delta: countDelta(s.people, last?.people ?? null),
      hint: last ? vs(String(last.people)) : undefined,
      info: {
        title: "People",
        body: `How many different campus leaders came to at least one TWIG.${compare}`,
      },
    },
    {
      label: "Regulars",
      value: s.regulars === null ? "–" : String(s.regulars),
      delta: countDelta(s.regulars, last?.regulars ?? null),
      hint:
        s.regulars === null
          ? `After ${missesForFollowUp + 1} TWIGs`
          : last?.regulars != null
            ? vs(String(last.regulars))
            : undefined,
      info: {
        title: "Regulars",
        body: `Campus leaders who came to at least half of this staff year's TWIGs, counted once ${missesForFollowUp + 1} TWIGs have a roll.${compare}`,
      },
    },
  ];
}

function twigRows(result: TwigResult, people: SowPeople): PeopleRow[] {
  return result.rows.map((r: TwigRow) => {
    const person = people.get(r.key);
    const name = person?.name ?? "Unknown";
    return {
      key: r.key,
      name,
      photo: person?.photo ?? null,
      section: r.role,
      tags: [r.role, ...(r.regular ? ["regular"] : []), ...(r.attended === 0 ? ["notYet"] : [])],
      category: rolePill(r),
      primary: `${r.attended}/${r.held} · ${pct(r.pct)}`,
      secondary: r.attended === 0 ? "Hasn't come to a TWIG this staff year" : lastCame(r.lastAt),
      warning: r.role === "none" ? `No staff profile for ${result.year}` : undefined,
      badge: r.regular ? { label: REGULAR_FILTER.label, colour: REGULAR_FILTER.colour } : undefined,
      dimmed: r.role === "staff" ? true : undefined,
      subgroup: campusPage(r.campus),
      pct: r.pct,
      last: r.lastAt,
    };
  });
}

const seeYear = (year: number | undefined) =>
  year === undefined ? {} : { action: { label: `See ${year}`, period: String(year) } };

export function buildTwigBlocks(input: {
  result: TwigResult;
  people: SowPeople;
  missesForFollowUp: number;
  earlierYear?: number;
}): WeeklyBlock[] {
  const { result, people } = input;
  const { held, year } = result;
  if (held.length === 0) {
    return [
      {
        type: "empty",
        icon: "calendar-outline",
        title: "No TWIGs yet",
        message: `No TWIG in staff year ${year} has a roll yet. TWIGs are events tagged TWIG (and not PPN).`,
        ...seeYear(input.earlierYear),
      },
      ...noRollBlock(result.noRoll, "TWIG"),
    ];
  }
  const count = `${plural(held.length, "TWIG")}${result.running ? " so far" : ""}`;
  const blocks: WeeklyBlock[] = [
    {
      type: "caption",
      text: result.last
        ? `Staff year ${year}: ${count}, compared with ${result.lastLabel}. Only campus leaders are counted.`
        : result.lastLabel
          ? `Staff year ${year}: ${count}. No TWIG had a roll in ${result.lastLabel}, so there's nothing to compare with yet. Only campus leaders are counted.`
          : `Staff year ${year}: ${count}. There's no earlier staff year to compare with. Only campus leaders are counted.`,
    },
    { type: "cards", layout: "grid", cards: twigCards(result, input.missesForFollowUp) },
  ];
  const length = Math.max(result.counts.length, result.lastCounts.length);
  blocks.push({
    type: "multiBars",
    title: "TWIG by TWIG",
    subtitle: result.lastHeld.length
      ? `Campus leaders at each TWIG, against the same TWIG in ${year - 1}`
      : "Campus leaders at each TWIG",
    legend: [
      { key: "now", colour: THIS_COLOUR, label: String(year) },
      ...(result.lastHeld.length ? [{ key: "then", colour: LAST_COLOUR, label: String(year - 1) }] : []),
    ],
    points: Array.from({ length }, (_, i) => ({
      at: held[i]?.at ?? result.lastHeld[i].at,
      label: held[i] ? dayLabel(held[i].at) : `#${i + 1}`,
      segments: [
        { key: "now", value: result.counts[i] ?? 0, colour: THIS_COLOUR },
        ...(result.lastHeld.length
          ? [{ key: "then", value: result.lastCounts[i] ?? 0, colour: LAST_COLOUR }]
          : []),
      ],
    })),
    stacked: false,
    keepZeros: true,
  });
  blocks.push({
    type: "breakdown",
    title: "Campus leader sign-ins by campus",
    rows: campusBars(result.byCampus),
  });
  if (result.running) {
    const followRows: FollowRow[] = result.followUp.map((r) => ({
      key: r.key,
      name: people.get(r.key)?.name ?? "Unknown",
      photo: people.get(r.key)?.photo ?? null,
      category: rolePill(r),
      reason: `Regular, but missed the last ${input.missesForFollowUp} TWIGs`,
      secondary: lastCame(r.lastAt),
      subgroup: campusPage(r.campus),
    }));
    blocks.push({
      type: "followUpGroups",
      title: "Needs follow-up",
      icon: "heart-outline",
      groups: followRows.length
        ? [{ key: "missed", title: "Regulars who stopped coming", people: followRows }]
        : [],
      preview: FOLLOW_UP_PREVIEW,
      emptyText:
        held.length > input.missesForFollowUp
          ? `Every regular came to one of the last ${input.missesForFollowUp} TWIGs.`
          : `Follow-up starts once ${input.missesForFollowUp + 1} TWIGs have a roll.`,
    });
  }
  const rows = twigRows(result, people);
  const present = new Set(rows.flatMap((r) => r.tags));
  blocks.push({
    type: "people",
    title: "Everyone",
    subtitle: `Everyone who came to a TWIG in staff year ${year}, and campus leaders who haven't come this staff year.`,
    sections: SOW_ROLE_ORDER.map((key) => ({ key, label: ROLE_META[key].section })),
    filters: [
      ...SOW_ROLE_ORDER.filter((key) => present.has(key)).map((key) => ({
        key,
        label: ROLE_META[key].label,
        colour: ROLE_META[key].colour,
      })),
      ...(present.has("regular") ? [REGULAR_FILTER] : []),
      ...(present.has("notYet") ? [NOT_YET_FILTER] : []),
    ],
    sorts: [
      { key: "pct", label: "Attendance %" },
      { key: "name", label: "Name" },
      { key: "last", label: "Last came" },
    ],
    rows,
    emptyText: "Nobody has come to a TWIG yet.",
  });
  blocks.push(...noRollBlock(result.noRoll, "TWIG"));
  return blocks;
}

export function buildPpnBlocks(input: { result: PpnResult; earlierYear?: number }): WeeklyBlock[] {
  const { result } = input;
  const { year, totals } = result;
  if (result.rows.length === 0) {
    return [
      {
        type: "empty",
        icon: "calendar-outline",
        title: "No PPNs yet",
        message: `No PPN in staff year ${year} has a roll yet. PPNs here are events tagged both TWIG and PPN.`,
        ...seeYear(input.earlierYear),
      },
      ...noRollBlock(result.noRoll, "PPN"),
    ];
  }
  const ppns = [...result.rows].reverse();
  const avg = round1(totals.signIns / ppns.length);
  const lastAvg = result.lastAverage;
  const anyMatched = ppns.some((r) => r.last);
  const roles = SOW_ROLE_ORDER.filter((role) => totals.byRole[role] > 0);
  return [
    { type: "caption", text: `Staff year ${year}: ${plural(ppns.length, "PPN")}.` },
    { type: "heading", text: "Turnout" },
    {
      type: "cards",
      layout: "grid",
      cards: [
        {
          label: "Average per PPN",
          value: String(avg),
          delta: countDelta(avg, lastAvg),
          hint: lastAvg === null ? undefined : `vs ${lastAvg}`,
          info: {
            title: "Average per PPN",
            body: "Everyone who signed in, per PPN, against last staff year's PPNs up to the same date.",
          },
        },
        {
          label: "People",
          value: String(totals.people),
          info: { title: "People", body: "Different people at one or more PPNs this staff year." },
        },
      ],
    },
    {
      type: "multiBars",
      title: "PPN by PPN",
      subtitle: anyMatched ? `Everyone at each PPN, against the same month in ${year - 1}` : "Everyone at each PPN",
      legend: [
        { key: "now", colour: THIS_COLOUR, label: String(year) },
        ...(anyMatched ? [{ key: "then", colour: LAST_COLOUR, label: String(year - 1) }] : []),
      ],
      points: ppns.map((r) => ({
        at: r.event.at,
        label: dayLabel(r.event.at),
        segments: [
          { key: "now", value: r.total, colour: THIS_COLOUR },
          ...(r.last ? [{ key: "then", value: r.last.total, colour: LAST_COLOUR }] : []),
        ],
      })),
      stacked: false,
      keepZeros: true,
    },
    { type: "heading", text: "Who came" },
    {
      type: "cards",
      layout: "grid",
      cards: [
        {
          label: "Campus leaders",
          value: pct(totals.byRole.leader / totals.signIns),
          hint: `${totals.byRole.leader} of ${plural(totals.signIns, "sign-in")}`,
          info: { title: "Campus leaders", body: "The share of sign-ins from campus leaders." },
        },
        {
          label: "First-timers",
          value: String(totals.firstTimers),
          info: { title: "First-timers", body: "People at their first PPN ever." },
        },
      ],
    },
    {
      type: "multiBars",
      title: "Who came",
      legend: roles.map((role) => ({ key: role, colour: ROLE_META[role].colour, label: PPN_ROLE_LABEL[role] })),
      points: ppns.map((r) => ({
        at: r.event.at,
        label: dayLabel(r.event.at),
        segments: roles.map((role) => ({ key: role, value: r.byRole[role], colour: ROLE_META[role].colour })),
      })),
      stacked: true,
    },
    {
      type: "stacked",
      title: "First-timers",
      legend: [
        { key: "returning", colour: "primary", label: "Came before" },
        { key: "fresh", colour: "accent", label: "First PPN" },
      ],
      labels: { fresh: "First PPN", returning: "Came before" },
      points: ppns.map((r) => ({
        at: r.event.at,
        label: dayLabel(r.event.at),
        fresh: r.firstTimers,
        returning: r.total - r.firstTimers,
      })),
    },
    { type: "breakdown", title: "Sign-ins by campus", rows: campusBars(totals.byCampus) },
    ...noRollBlock(result.noRoll, "PPN"),
  ];
}
