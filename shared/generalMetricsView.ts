import { GENERAL_RECENT_YEARS, type SplitPoint } from "./attendanceMetrics";
import { subgroupColour } from "./rollcall";
import {
  type ViewBlock,
  type ViewCard,
  type ViewLegendItem,
  type ViewSegmentPoint,
} from "./attendanceMetricsView";

// Insights → General, laid out on the server like the Attendance tab (see
// attendanceMetricsView.ts). The app draws the blocks; wording, order and which
// charts appear ship with a Convex deploy.

type Series = {
  overall: (number | null)[];
  staff: (number | null)[];
  studentLeaders: (number | null)[];
};

export type StaffTrendsData = {
  years: number[];
  allStaff: number[];
  staff: number[];
  studentLeaders: number[];
  campuses: string[];
  studentLeadersByCampus: { campus: string; counts: number[] }[];
  turnover: Series;
  retention: Series;
  tenure2Plus: Series;
  avgTenureYears: Series;
  lifetimeTenure2Plus: { overall: number; staff: number; studentLeaders: number };
  lifetimeAvgTenureYears: { overall: number; staff: number; studentLeaders: number };
};

export type CampusAttendanceData = {
  years: number[];
  campuses: { campus: string; averages: number[] }[];
};

export type GeneralScope = number | "all" | null;

type Delta = ViewCard["delta"];

const CAMPUS_ACRONYM: Record<string, string> = {
  "Australian Catholic University": "ACU",
  "E2E Test Campus": "E2E",
  "Macquarie University": "MACQ",
  "University of New South Wales": "UNSW",
  "University of Sydney": "USYD",
  "University of Technology, Sydney": "UTS",
  "Western Sydney University": "WSU",
};
export const campusAcronym = (name: string) => CAMPUS_ACRONYM[name] ?? name;

const isNoiseCampus = (name: string) => /e2e\s*test/i.test(name);

export const fmtAvg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const fmtPct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${fmtAvg(n)}%`;

const yearLabel = (y: number) => `'${String(y).slice(-2)}`;

export const yoyDelta = (cur: number, prev: number | undefined): Delta => {
  if (prev === undefined) return undefined;
  if (prev === 0) return cur > 0 ? { text: "new", direction: "up" } : undefined;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return {
    text: `${pct > 0 ? "+" : ""}${pct}%`,
    direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
  };
};

const stepDelta = (unit: string) => (
  cur: number | null | undefined,
  prev: number | null | undefined
): Delta => {
  if (cur === null || cur === undefined) return undefined;
  if (prev === null || prev === undefined) return undefined;
  const diff = Math.round((cur - prev) * 10) / 10;
  if (diff === 0) return { text: `0${unit}`, direction: "flat" };
  return {
    text: `${diff > 0 ? "+" : ""}${fmtAvg(diff)}${unit}`,
    direction: diff > 0 ? "up" : "down",
  };
};
export const ppDelta = stepDelta("pp");
export const yearsDelta = stepDelta("y");

const RATE_LEGEND: ViewLegendItem[] = [
  { key: "Overall", colour: "text", label: "Overall" },
  { key: "Staff", colour: "primary", label: "Staff" },
  { key: "SLs", colour: "accent", label: "Student leaders" },
];

const RATE_GROUPS = [
  { key: "overall", label: "Overall" },
  { key: "staff", label: "Staff" },
  { key: "studentLeaders", label: "Student leaders" },
] as const;

const comparisonText = (years: number[], i: number) =>
  i > 0 ? `${years[i]} vs ${years[i - 1]}` : String(years[i]);

const comparisonLabel = (years: number[], i: number): ViewBlock => ({
  type: "label",
  text: comparisonText(years, i),
});

// A new staff year has no rates until its roster is complete (from 1 January,
// see computeStaffTrends): every one of its rate series is null until then.
const ratesCounted = (trends: StaffTrendsData, i: number) =>
  trends.avgTenureYears.overall[i] !== null;

const ratesPendingCaption = (year: number): ViewBlock => ({
  type: "caption",
  text: `${year}'s retention and years served are counted from 1 January, once its roster is filled in.`,
});

// The per-group cards for one staff year: retention and average years served,
// split into overall, staff and student leaders. Deltas compare with the year
// before; the comparison itself is labelled once, not on every card.
function rateCards(
  series: Series,
  i: number,
  format: (n: number) => string,
  delta: (cur: number | null, prev: number | null | undefined) => Delta
): ViewCard[] {
  return RATE_GROUPS.filter((g) => series[g.key][i] !== null).map((g) => ({
    label: g.label,
    value: format(series[g.key][i] as number),
    delta: delta(series[g.key][i], i > 0 ? series[g.key][i - 1] : undefined),
    tone: "positive",
  }));
}

function rateChart(
  title: string,
  years: number[],
  start: number,
  series: Series,
  axisMax?: number
): ViewBlock | null {
  const points: ViewSegmentPoint[] = years
    .map((y, i) => ({
      at: y,
      label: yearLabel(y),
      segments: RATE_GROUPS.map((g, k) => ({
        key: RATE_LEGEND[k].key,
        value: series[g.key][start + i],
        colour: RATE_LEGEND[k].colour,
      })).filter((s): s is { key: string; value: number; colour: string } => s.value !== null),
    }))
    .filter((p) => p.segments.length > 0);
  if (points.length === 0) return null;
  return { type: "multiBars", title, legend: RATE_LEGEND, points, stacked: false, axisMax, keepZeros: true };
}

function allYearsView(
  trends: StaffTrendsData,
  campusAttendance: CampusAttendanceData | null,
  scope: GeneralScope
): ViewBlock[] {
  const trendYearCount = scope === "all" ? Number.POSITIVE_INFINITY : GENERAL_RECENT_YEARS;
  const start =
    trends.years.length > trendYearCount ? trends.years.length - trendYearCount : 0;
  const years = trends.years.slice(start);
  const idx = (i: number) => start + i;
  const last = trends.years.length - 1;

  const blocks: ViewBlock[] = [
    comparisonLabel(trends.years, last),
    {
      type: "cards",
      cards: [
        {
          label: "Staff",
          value: String(trends.staff[last]),
          delta: yoyDelta(trends.staff[last], last > 0 ? trends.staff[last - 1] : undefined),
        },
        {
          label: "Student leaders",
          value: String(trends.studentLeaders[last]),
          delta: yoyDelta(
            trends.studentLeaders[last],
            last > 0 ? trends.studentLeaders[last - 1] : undefined
          ),
          tone: "positive",
        },
      ],
    },
  ];
  let rated = last;
  while (rated >= 0 && !ratesCounted(trends, rated)) rated -= 1;
  if (rated < last) blocks.push(ratesPendingCaption(trends.years[last]));
  const rateLabel = (name: string) =>
    rated === last ? name : `${name} · ${comparisonText(trends.years, rated)}`;
  const retention = rated >= 0 ? rateCards(trends.retention, rated, fmtPct, ppDelta) : [];
  if (retention.length > 0) {
    blocks.push({ type: "label", text: rateLabel("Retention") }, { type: "cards", cards: retention });
  }
  const avgYears = rated >= 0 ? rateCards(trends.avgTenureYears, rated, fmtAvg, yearsDelta) : [];
  if (avgYears.length > 0) {
    blocks.push(
      { type: "label", text: rateLabel("Avg years served") },
      { type: "cards", cards: avgYears }
    );
  }

  const campusSeries = trends.studentLeadersByCampus.filter((c) => !isNoiseCampus(c.campus));
  blocks.push(
    {
      type: "stacked",
      title: "Staff & student leaders",
      legend: [
        { key: "returning", colour: "primary", label: "Staff" },
        { key: "fresh", colour: "accent", label: "Student leaders" },
      ],
      labels: { fresh: "Student leaders", returning: "Staff" },
      points: years.map((y, i) => ({
        at: y,
        label: yearLabel(y),
        returning: trends.staff[idx(i)],
        fresh: trends.studentLeaders[idx(i)],
      })),
    },
    {
      type: "multiBars",
      title: "Student leaders by campus",
      legend: trends.campuses
        .filter((c) => !isNoiseCampus(c))
        .map((c) => ({ key: campusAcronym(c), colour: subgroupColour(c), label: campusAcronym(c) })),
      points: years.map((y, i) => ({
        at: y,
        label: yearLabel(y),
        segments: campusSeries.map((c) => ({
          key: campusAcronym(c.campus),
          value: c.counts[idx(i)],
          colour: subgroupColour(c.campus),
        })),
      })),
      stacked: true,
    }
  );
  for (const chart of [
    rateChart("Retention", years, start, trends.retention, 100),
    rateChart("Avg years served", years, start, trends.avgTenureYears),
    rateChart("Served 2+ years", years, start, trends.tenure2Plus, 100),
  ]) {
    if (chart) blocks.push(chart);
  }
  const campusWeekly = campusWeeklyPoints(campusAttendance, trendYearCount);
  if (campusWeekly) {
    blocks.push({
      type: "multiBars",
      title: "Weekly avg by campus",
      legend: (campusWeekly[0]?.segments ?? []).map((s) => ({ key: s.key, colour: s.colour, label: s.key })),
      points: campusWeekly,
      stacked: false,
    });
  }
  return blocks;
}

function campusWeeklyPoints(
  data: CampusAttendanceData | null,
  trendYearCount: number
): ViewSegmentPoint[] | null {
  if (!data || data.years.length === 0 || data.campuses.length === 0) return null;
  const start = data.years.length > trendYearCount ? data.years.length - trendYearCount : 0;
  const yearSlice = data.years.slice(start);
  const live = data.campuses.filter(
    (c) => !isNoiseCampus(c.campus) && yearSlice.some((_, i) => c.averages[start + i] > 0)
  );
  if (live.length === 0) return null;
  return yearSlice.map((y, i) => ({
    at: y,
    label: yearLabel(y),
    segments: live.map((c) => ({
      key: campusAcronym(c.campus),
      value: c.averages[start + i],
      colour: subgroupColour(c.campus),
    })),
  }));
}

function yearView(
  trends: StaffTrendsData,
  campusAttendance: CampusAttendanceData | null,
  year: number,
  i: number
): ViewBlock[] {
  const at = <T,>(arr: T[]): T | undefined => (i > 0 ? arr[i - 1] : undefined);
  const headcount: ViewCard[] = [
    { label: "Staff", value: String(trends.staff[i]), delta: yoyDelta(trends.staff[i], at(trends.staff)) },
    {
      label: "Student leaders",
      value: String(trends.studentLeaders[i]),
      delta: yoyDelta(trends.studentLeaders[i], at(trends.studentLeaders)),
      tone: "positive",
    },
    ...trends.studentLeadersByCampus
      .filter((c) => c.counts[i] > 0 && !isNoiseCampus(c.campus))
      .map((c) => ({
        label: campusAcronym(c.campus),
        value: String(c.counts[i]),
        delta: yoyDelta(c.counts[i], at(c.counts)),
      })),
  ];
  const blocks: ViewBlock[] = [
    comparisonLabel(trends.years, i),
    { type: "cards", layout: "grid", cards: headcount },
  ];
  if (!ratesCounted(trends, i)) blocks.push(ratesPendingCaption(year));
  const retention = rateCards(trends.retention, i, fmtPct, ppDelta);
  if (retention.length > 0) {
    blocks.push({ type: "label", text: "Retention" }, { type: "cards", layout: "grid", cards: retention });
  }
  const avgYears = rateCards(trends.avgTenureYears, i, fmtAvg, yearsDelta);
  if (avgYears.length > 0) {
    blocks.push(
      { type: "label", text: "Avg years served" },
      { type: "cards", layout: "grid", cards: avgYears }
    );
  }
  // Weekly meetings run on the calendar year, so this is calendar `year`.
  const caIndex = campusAttendance ? campusAttendance.years.indexOf(year) : -1;
  const attendance: ViewCard[] =
    campusAttendance && caIndex >= 0
      ? campusAttendance.campuses
          .filter((c) => c.averages[caIndex] > 0 && !isNoiseCampus(c.campus))
          .map((c) => ({
            label: campusAcronym(c.campus),
            value: fmtAvg(c.averages[caIndex]),
            delta: yoyDelta(c.averages[caIndex], caIndex > 0 ? c.averages[caIndex - 1] : undefined),
          }))
      : [];
  if (attendance.length > 0) {
    blocks.push(
      { type: "label", text: `Weekly avg · Jan–Dec ${year}` },
      { type: "cards", layout: "grid", cards: attendance }
    );
  }
  return blocks;
}

export function buildGeneralView(input: {
  trends: StaffTrendsData;
  campusAttendance: CampusAttendanceData | null;
  scope: GeneralScope;
  signedIn: boolean;
}): ViewBlock[] {
  const { trends, campusAttendance, scope, signedIn } = input;
  if (trends.years.length === 0) {
    return [
      {
        type: "empty",
        icon: "sparkles-outline",
        title: "No staff history yet",
        message: "Staff-trend insights appear once there's at least one staff year on record.",
      },
    ];
  }
  const yearIndex = typeof scope === "number" ? trends.years.indexOf(scope) : -1;
  if (signedIn && typeof scope === "number" && yearIndex >= 0) {
    return yearView(trends, campusAttendance, scope, yearIndex);
  }
  return allYearsView(trends, campusAttendance, scope);
}
