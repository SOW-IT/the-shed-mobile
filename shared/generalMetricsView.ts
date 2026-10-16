import { GENERAL_RECENT_YEARS } from "./attendanceMetrics";
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
};

type CampusAttendanceData = {
  years: number[];
  campuses: { campus: string; averages: number[] }[];
};

type GeneralScope = number | "all" | null;

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

const GROUP_LEGEND: ViewLegendItem[] = [
  { key: "Overall", colour: "text", label: "Overall", shape: "line" },
  { key: "Staff", colour: "primary", label: "Staff" },
  { key: "SLs", colour: "accent", label: "Student leaders" },
];

const RATE_GROUPS = [
  { key: "overall", label: "Overall" },
  { key: "staff", label: "Staff" },
  { key: "studentLeaders", label: "Student leaders" },
] as const;

const comparisonLabel = (years: number[], i: number): ViewBlock => ({
  type: "label",
  text: i > 0 ? `${years[i]} vs ${years[i - 1]}` : String(years[i]),
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
  }));
}

function groupChart(
  title: string,
  years: number[],
  start: number,
  series: Series,
  opts: { axisMax?: number; unit?: string } = {}
): ViewBlock | null {
  const [, staffKey, leaderKey] = GROUP_LEGEND;
  const points = years
    .map((y, i) => ({
      at: y,
      label: yearLabel(y),
      overall: series.overall[start + i],
      segments: [
        { key: staffKey.key, value: series.staff[start + i], colour: staffKey.colour },
        { key: leaderKey.key, value: series.studentLeaders[start + i], colour: leaderKey.colour },
      ].filter((seg): seg is { key: string; value: number; colour: string } => seg.value !== null),
    }))
    .filter((p) => p.segments.length > 0 || p.overall !== null);
  if (points.length === 0) return null;
  return {
    type: "multiBars",
    title,
    legend: GROUP_LEGEND,
    points: points.map(({ at, label, segments }) => ({ at, label, segments })),
    stacked: false,
    keepZeros: true,
    line: { key: GROUP_LEGEND[0].key, colour: GROUP_LEGEND[0].colour, values: points.map((p) => p.overall) },
    ...(opts.axisMax !== undefined ? { axisMax: opts.axisMax } : {}),
    ...(opts.unit ? { unit: opts.unit } : {}),
  };
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
  const previous = <T,>(arr: T[]): T | undefined => (last > 0 ? arr[last - 1] : undefined);
  const headcount: Series = { overall: trends.allStaff, staff: trends.staff, studentLeaders: trends.studentLeaders };

  const blocks: ViewBlock[] = [
    comparisonLabel(trends.years, last),
    { type: "heading", text: "People serving" },
    {
      type: "cards",
      cards: RATE_GROUPS.map((g) => ({
        label: g.label,
        value: String(headcount[g.key][last]),
        delta: yoyDelta(headcount[g.key][last] as number, previous(headcount[g.key]) as number | undefined),
      })),
    },
  ];
  const campusSeries = trends.studentLeadersByCampus.filter(
    (c) => !isNoiseCampus(c.campus) && years.some((_, i) => c.counts[idx(i)] > 0)
  );
  const people = groupChart("Staff & student leaders", years, start, headcount);
  if (people) blocks.push(people);
  if (campusSeries.length > 0) {
    blocks.push({
      type: "multiBars",
      title: "Student leaders by campus",
      legend: campusSeries.map(({ campus }) => ({
        key: campusAcronym(campus),
        colour: subgroupColour(campus),
        label: campusAcronym(campus),
      })),
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
    });
  }

  const retentionCards = rateCards(trends.retention, last, fmtPct, ppDelta);
  const retentionChart = groupChart("Retention", years, start, trends.retention, { axisMax: 100, unit: "%" });
  if (retentionCards.length > 0 || retentionChart) {
    blocks.push({ type: "heading", text: "Retention" });
    if (retentionCards.length > 0) blocks.push({ type: "cards", cards: retentionCards });
    if (retentionChart) blocks.push(retentionChart);
  }

  const avgYearsCards = rateCards(trends.avgTenureYears, last, fmtAvg, yearsDelta);
  const yearsCharts = [
    groupChart("Average years served", years, start, trends.avgTenureYears),
    groupChart("Served 2+ years", years, start, trends.tenure2Plus, { axisMax: 100, unit: "%" }),
  ].filter((c): c is ViewBlock => c !== null);
  if (avgYearsCards.length > 0 || yearsCharts.length > 0) {
    blocks.push({ type: "heading", text: "Years served" });
    if (avgYearsCards.length > 0) {
      blocks.push({ type: "label", text: "Average years served" }, { type: "cards", cards: avgYearsCards });
    }
    blocks.push(...yearsCharts);
  }

  const campusWeekly = campusWeeklyPoints(campusAttendance, trendYearCount);
  if (campusWeekly) {
    blocks.push(
      { type: "heading", text: "Weeklies" },
      {
        type: "multiBars",
        title: "Weeklies average by campus",
        subtitle: "Calendar years, Jan–Dec",
        legend: (campusWeekly[0]?.segments ?? []).map((s) => ({ key: s.key, colour: s.colour, label: s.key })),
        points: campusWeekly,
        stacked: false,
      }
    );
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
    { label: "Overall", value: String(trends.allStaff[i]), delta: yoyDelta(trends.allStaff[i], at(trends.allStaff)) },
    { label: "Staff", value: String(trends.staff[i]), delta: yoyDelta(trends.staff[i], at(trends.staff)) },
    {
      label: "Student leaders",
      value: String(trends.studentLeaders[i]),
      delta: yoyDelta(trends.studentLeaders[i], at(trends.studentLeaders)),
    },
  ];
  const byCampus: ViewCard[] = trends.studentLeadersByCampus
    .filter((c) => c.counts[i] > 0 && !isNoiseCampus(c.campus))
    .map((c) => ({
      label: campusAcronym(c.campus),
      value: String(c.counts[i]),
      delta: yoyDelta(c.counts[i], at(c.counts)),
    }));
  const blocks: ViewBlock[] = [
    comparisonLabel(trends.years, i),
    { type: "heading", text: "People serving" },
    { type: "cards", cards: headcount },
  ];
  if (byCampus.length > 0) {
    blocks.push(
      { type: "label", text: "Student leaders by campus" },
      { type: "cards", layout: "grid", cards: byCampus }
    );
  }
  const retention = rateCards(trends.retention, i, fmtPct, ppDelta);
  if (retention.length > 0) {
    blocks.push({ type: "heading", text: "Retention" }, { type: "cards", cards: retention });
  }
  const avgYears = rateCards(trends.avgTenureYears, i, fmtAvg, yearsDelta);
  const twoPlus = rateCards(trends.tenure2Plus, i, fmtPct, ppDelta);
  if (avgYears.length > 0 || twoPlus.length > 0) {
    blocks.push({ type: "heading", text: "Years served" });
    if (avgYears.length > 0) {
      blocks.push(
        { type: "label", text: "Average years served" },
        { type: "cards", cards: avgYears }
      );
    }
    if (twoPlus.length > 0) {
      blocks.push({ type: "label", text: "Served 2+ years" }, { type: "cards", cards: twoPlus });
    }
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
      { type: "heading", text: "Weeklies" },
      { type: "label", text: `Weeklies average by campus · Jan–Dec ${year}` },
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
