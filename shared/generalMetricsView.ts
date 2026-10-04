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

export const ppDelta = (
  cur: number | null | undefined,
  prev: number | null | undefined
): Delta => {
  if (cur === null || cur === undefined) return undefined;
  if (prev === null || prev === undefined) return undefined;
  const diff = Math.round((cur - prev) * 10) / 10;
  if (diff === 0) return { text: "0pp", direction: "flat" };
  return {
    text: `${diff > 0 ? "+" : ""}${fmtAvg(diff)}pp`,
    direction: diff > 0 ? "up" : "down",
  };
};

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

function headlineBlocks(trends: StaffTrendsData): ViewBlock[] {
  const i = trends.years.length - 1;
  const year = trends.years[i];
  const prev = i > 0 ? trends.years[i - 1] : undefined;
  const hint = prev !== undefined ? `${year} vs ${prev}` : String(year);
  const blocks: ViewBlock[] = [
    {
      type: "cards",
      cards: [
        {
          label: "Staff",
          value: String(trends.staff[i]),
          delta: yoyDelta(trends.staff[i], i > 0 ? trends.staff[i - 1] : undefined),
          hint,
        },
        {
          label: "Student leaders",
          value: String(trends.studentLeaders[i]),
          delta: yoyDelta(trends.studentLeaders[i], i > 0 ? trends.studentLeaders[i - 1] : undefined),
          hint,
          tone: "positive",
        },
      ],
    },
  ];
  // The newest year's retention is blank until that year is complete, so show
  // the latest year that has one.
  const r = trends.retention.overall;
  let j = r.length - 1;
  while (j >= 0 && r[j] === null) j -= 1;
  if (j >= 0) {
    const retentionHint = j > 0 ? `${trends.years[j]} vs ${trends.years[j - 1]}` : String(trends.years[j]);
    blocks.push(
      { type: "label", text: "Retention" },
      {
        type: "cards",
        cards: RATE_GROUPS.filter((g) => trends.retention[g.key][j] !== null).map((g) => ({
          label: g.label,
          value: fmtPct(trends.retention[g.key][j]),
          delta: ppDelta(trends.retention[g.key][j], j > 0 ? trends.retention[g.key][j - 1] : undefined),
          hint: retentionHint,
          tone: "positive",
        })),
      }
    );
  }
  return blocks;
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

  const staffBreakdown: SplitPoint[] = years.map((y, i) => ({
    at: y,
    label: yearLabel(y),
    returning: trends.staff[idx(i)],
    fresh: trends.studentLeaders[idx(i)],
  }));
  const campusSeries = trends.studentLeadersByCampus.filter((c) => !isNoiseCampus(c.campus));
  const leadersByCampus: ViewSegmentPoint[] = years.map((y, i) => ({
    at: y,
    label: yearLabel(y),
    segments: campusSeries.map((c) => ({
      key: campusAcronym(c.campus),
      value: c.counts[idx(i)],
      colour: subgroupColour(c.campus),
    })),
  }));
  const retention: ViewSegmentPoint[] = years
    .map((y, i) => ({
      at: y,
      label: yearLabel(y),
      segments: RATE_GROUPS.map((g, k) => ({
        key: RATE_LEGEND[k].key,
        value: trends.retention[g.key][idx(i)],
        colour: RATE_LEGEND[k].colour,
      })).filter((s): s is { key: string; value: number; colour: string } => s.value !== null),
    }))
    .filter((p) => p.segments.length > 0);

  const blocks: ViewBlock[] = [
    ...headlineBlocks(trends),
    {
      type: "stacked",
      title: "Staff & student leaders",
      legend: [
        { key: "returning", colour: "primary", label: "Staff" },
        { key: "fresh", colour: "accent", label: "Student leaders" },
      ],
      labels: { fresh: "Student leaders", returning: "Staff" },
      points: staffBreakdown,
    },
    {
      type: "multiBars",
      title: "Student leaders by campus",
      legend: trends.campuses
        .filter((c) => !isNoiseCampus(c))
        .map((c) => ({ key: campusAcronym(c), colour: subgroupColour(c), label: campusAcronym(c) })),
      points: leadersByCampus,
      stacked: true,
    },
  ];
  if (retention.length > 0) {
    blocks.push({
      type: "multiBars",
      title: "Retention",
      legend: RATE_LEGEND,
      points: retention,
      stacked: false,
      axisMax: 100,
      keepZeros: true,
    });
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
  const prevYear = i > 0 ? trends.years[i - 1] : undefined;
  const at = <T,>(arr: T[]): T | undefined => (i > 0 ? arr[i - 1] : undefined);
  const hint = prevYear !== undefined ? `vs ${prevYear}` : undefined;

  const headcount: ViewCard[] = [
    { label: "Staff", value: String(trends.staff[i]), delta: yoyDelta(trends.staff[i], at(trends.staff)), hint },
    {
      label: "Student leaders",
      value: String(trends.studentLeaders[i]),
      delta: yoyDelta(trends.studentLeaders[i], at(trends.studentLeaders)),
      hint,
      tone: "positive",
    },
    ...trends.studentLeadersByCampus
      .filter((c) => c.counts[i] > 0 && !isNoiseCampus(c.campus))
      .map((c) => ({
        label: campusAcronym(c.campus),
        value: String(c.counts[i]),
        delta: yoyDelta(c.counts[i], at(c.counts)),
        hint,
      })),
  ];

  const retention: ViewCard[] = RATE_GROUPS.filter((g) => trends.retention[g.key][i] !== null).map(
    (g) => ({
      label: g.label,
      value: fmtPct(trends.retention[g.key][i]),
      delta: ppDelta(trends.retention[g.key][i], at(trends.retention[g.key])),
      hint,
      tone: "positive",
    })
  );

  const caIndex = campusAttendance ? campusAttendance.years.indexOf(year) : -1;
  const attendance: ViewCard[] =
    campusAttendance && caIndex >= 0
      ? campusAttendance.campuses
          .filter((c) => c.averages[caIndex] > 0 && !isNoiseCampus(c.campus))
          .map((c) => ({
            label: campusAcronym(c.campus),
            value: fmtAvg(c.averages[caIndex]),
            delta: yoyDelta(c.averages[caIndex], caIndex > 0 ? c.averages[caIndex - 1] : undefined),
            hint,
          }))
      : [];

  const blocks: ViewBlock[] = [{ type: "cards", layout: "grid", cards: headcount }];
  if (retention.length > 0) {
    blocks.push({ type: "label", text: "Retention" }, { type: "cards", layout: "grid", cards: retention });
  }
  if (attendance.length > 0) {
    blocks.push({ type: "label", text: "Weekly avg" }, { type: "cards", layout: "grid", cards: attendance });
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
