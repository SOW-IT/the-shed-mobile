import { type ViewCard } from "./attendanceMetricsView";
import { sydneyYmd } from "./flow";
import { subgroupColour, subgroupLabel } from "./rollcall";
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
  type MonthRow,
  type PeopleRow,
  type Pill,
  type WeeklyBlock,
} from "./weeklyInsightsView";

const THIS_COLOUR = "primary";
const LAST_COLOUR = "#9CA3AFA6";
const FOLLOW_UP_PREVIEW = 5;

const ROLE_META: Record<SowRole, { section: string; label: string; colour: string }> = {
  leader: { section: "Campus leaders", label: "Campus leader", colour: "#0F766E" },
  staff: { section: "Organisers (other staff)", label: "Organiser", colour: "#6B7280" },
  none: { section: "No staff profile", label: "No staff profile", colour: "#D97706" },
};

const REGULAR_FILTER = { key: "regular", label: "Regular", colour: "#16A34A" };

const fullDate = (at: number) => `${dayLabel(at)} ${sydneyYmd(new Date(at)).year}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const pct = (n: number) => `${Math.round(n * 100)}%`;

const campusName = (campus: string | null) => (campus ? subgroupLabel(campus) : "No campus");

const keep = (label: string) => label.replace(/ /g, " ");

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

function twigCards(result: TwigResult): ViewCard[] {
  const { summary: s, last, lastLabel } = result;
  const vs = (value: string) => (last && lastLabel ? `vs ${value} in ${keep(lastLabel)}` : undefined);
  const compare = last
    ? result.running
      ? ` Compared with ${lastLabel}, the same point in last staff year.`
      : ` Compared with staff year ${lastLabel}.`
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
      value: String(s.regulars),
      delta: countDelta(s.regulars, last?.regulars ?? null),
      hint: last ? vs(String(last.regulars)) : undefined,
      info: {
        title: "Regulars",
        body: `Campus leaders who came to at least half of this staff year's TWIGs.${compare}`,
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
      tags: [r.role, ...(r.regular ? ["regular"] : [])],
      category: rolePill(r),
      primary: `${r.attended}/${r.held} · ${pct(r.pct)}`,
      secondary: r.regular ? `Regular. ${lastCame(r.lastAt)}` : lastCame(r.lastAt),
      warning: r.role === "none" ? `No staff profile for ${result.year}` : undefined,
      pct: r.pct,
      last: r.lastAt,
    };
  });
}

export function buildTwigBlocks(input: {
  result: TwigResult;
  people: SowPeople;
  missesForFollowUp: number;
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
      },
      ...noRollBlock(result.noRoll, "TWIG"),
    ];
  }
  const count = `${plural(held.length, "TWIG")}${result.running ? " so far" : ""}`;
  const blocks: WeeklyBlock[] = [
    {
      type: "caption",
      text: result.lastLabel
        ? `Staff year ${year}: ${count}, compared with ${result.lastLabel}. Only campus leaders are counted.`
        : `Staff year ${year}: ${count}. There's no earlier staff year to compare with. Only campus leaders are counted.`,
    },
    { type: "cards", layout: "grid", cards: twigCards(result) },
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
    rows: result.byCampus.map((c) => ({ label: campusName(c.campus), value: c.value })),
  });
  if (result.running) {
    const followRows: FollowRow[] = result.followUp.map((r) => ({
      key: r.key,
      name: people.get(r.key)?.name ?? "Unknown",
      photo: people.get(r.key)?.photo ?? null,
      category: rolePill(r),
      reason: `Regular, but missed the last ${input.missesForFollowUp} TWIGs`,
      secondary: lastCame(r.lastAt),
    }));
    blocks.push({
      type: "followUpGroups",
      title: "Needs follow-up",
      icon: "heart-outline",
      groups: followRows.length
        ? [{ key: "missed", title: "Regulars who stopped coming", people: followRows }]
        : [],
      preview: FOLLOW_UP_PREVIEW,
      emptyText: "Every regular came to one of the last two TWIGs.",
    });
  }
  const rows = twigRows(result, people);
  const present = new Set(rows.flatMap((r) => r.tags));
  blocks.push({
    type: "people",
    title: "Everyone",
    subtitle: `Everyone who came to a TWIG in staff year ${year}. Organisers aren't counted; anyone with no staff profile is flagged.`,
    sections: SOW_ROLE_ORDER.map((key) => ({ key, label: ROLE_META[key].section })),
    filters: [
      ...SOW_ROLE_ORDER.filter((key) => present.has(key)).map((key) => ({
        key,
        label: ROLE_META[key].label,
        colour: ROLE_META[key].colour,
      })),
      ...(present.has("regular") ? [REGULAR_FILTER] : []),
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

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const monthYear = (at: number) => {
  const { month, year } = sydneyYmd(new Date(at));
  return `${MONTH_NAMES[month - 1]} ${year}`;
};

export function buildPpnBlocks(input: { result: PpnResult }): WeeklyBlock[] {
  const { result } = input;
  const { year, totals } = result;
  if (result.rows.length === 0) {
    return [
      {
        type: "empty",
        icon: "calendar-outline",
        title: "No PPNs yet",
        message: `No PPN in staff year ${year} has a roll yet. PPNs here are events tagged both TWIG and PPN.`,
      },
      ...noRollBlock(result.noRoll, "PPN"),
    ];
  }
  const rows: MonthRow[] = result.rows.map((row) => ({
    key: row.event.id,
    title: `${fullDate(row.event.at)} · ${row.event.name}`,
    value: String(row.total),
    delta: row.last ? countDelta(row.total, row.last.total) : undefined,
    hint: row.last
      ? `vs ${row.last.total} in ${monthYear(row.last.event.at)}`
      : `No PPN in ${monthYear(row.event.at).split(" ")[0]} last staff year`,
    lines: [row.firstTimers ? `${plural(row.firstTimers, "first-timer")}` : "No first-timers"],
    splits: [
      {
        title: "By campus",
        parts: row.byCampus.map((c) => ({
          label: campusName(c.campus),
          value: c.value,
          colour: c.campus ? subgroupColour(c.campus) : undefined,
        })),
      },
      {
        title: "Who",
        parts: SOW_ROLE_ORDER.map((role) => ({
          label: role === "leader" ? "Campus leaders" : role === "staff" ? "Staff" : "Others",
          value: row.byRole[role],
          colour: ROLE_META[role].colour,
        })),
      },
    ],
  }));
  const others = totals.byRole.none;
  return [
    {
      type: "caption",
      text:
        `Staff year ${year}: ${plural(result.rows.length, "PPN")}, ${plural(totals.signIns, "sign-in")} from ${plural(totals.people, "person", "people")}` +
        ` (${totals.byRole.leader} from campus leaders, ${totals.byRole.staff} from other staff, ${others} from others).` +
        (others ? ` Others have no staff profile for ${year}; they're counted, not flagged.` : ""),
    },
    {
      type: "monthRows",
      title: "Month by month",
      subtitle: "Everyone who signed in, against the same month last staff year. A first-timer is at their first PPN ever.",
      rows,
      emptyText: "No PPNs yet.",
    },
    ...noRollBlock(result.noRoll, "PPN"),
  ];
}
