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

function allYearsView(
  trends: StaffTrendsData,
  campusAttendance: CampusAttendanceData | null,
  scope: GeneralScope,
  signedIn: boolean
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

  const rateByYear = (series: Series): ViewSegmentPoint[] =>
    years
      .map((y, i) => {
        const j = idx(i);
        const segments = [
          { key: "Overall", value: series.overall[j], colour: "text" },
          { key: "Staff", value: series.staff[j], colour: "primary" },
          { key: "SLs", value: series.studentLeaders[j], colour: "accent" },
        ].filter((s): s is { key: string; value: number; colour: string } => s.value !== null && s.value !== undefined);
        return { at: y, label: yearLabel(y), segments };
      })
      .filter((p) => p.segments.length > 0);

  const blocks: ViewBlock[] = [];

  const everOverall = trends.allStaff.some((n) => n > 0);
  const everStaff = trends.staff.some((n) => n > 0);
  const everLeaders = trends.studentLeaders.some((n) => n > 0);
  const life2 = trends.lifetimeTenure2Plus;
  const lifeAvg = trends.lifetimeAvgTenureYears;
  const lifetime = (
    show: boolean,
    label: string,
    value: string,
    hint: string
  ): ViewCard | null => (show ? { label, value, hint, tone: "positive" } : null);
  const lifetimeCards = [
    lifetime(everOverall, "Overall ≥2 years", fmtPct(life2.overall), "ever served · so far"),
    lifetime(everStaff, "Staff ≥2 years", fmtPct(life2.staff), "years in this role"),
    lifetime(everLeaders, "Student leaders ≥2 years", fmtPct(life2.studentLeaders), "years in this role"),
    lifetime(everOverall, "Overall avg years", fmtAvg(lifeAvg.overall), "years served so far"),
    lifetime(everStaff, "Staff avg years", fmtAvg(lifeAvg.staff), "years in this role so far"),
    lifetime(everLeaders, "Student leader avg years", fmtAvg(lifeAvg.studentLeaders), "years in this role so far"),
  ].filter((c): c is ViewCard => c !== null);
  if (signedIn && lifetimeCards.length > 0) {
    blocks.push(
      { type: "heading", text: "Tenure (staff profiles)" },
      {
        type: "caption",
        text: "Of everyone who has ever held a staff profile in each group: share with two or more years, and mean years served so far. Staff and student-leader cards count years in that role (not total time at The Shed).",
      },
      { type: "cards", layout: "grid", cards: lifetimeCards }
    );
  }

  blocks.push(
    {
      type: "stacked",
      title: "All staff",
      subtitle:
        years.length > 0
          ? `Staff + student leaders · ${years[0]}–${years[years.length - 1]}`
          : "Staff + student leaders per year",
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
      subtitle: "Per staff year",
      legend: trends.campuses
        .filter((c) => !isNoiseCampus(c))
        .map((c) => ({ key: campusAcronym(c), colour: subgroupColour(c), label: campusAcronym(c) })),
      points: leadersByCampus,
      stacked: true,
    }
  );

  const rateCharts: [string, string, Series, number | undefined][] = [
    ["Retention rate", "% of prior year's roster who stayed (axis 0–100)", trends.retention, 100],
    ["Serve at least 2 years", "% of people present with ≥2 years so far (axis 0–100)", trends.tenure2Plus, 100],
    ["Average years served so far", "Mean years so far among people present (staff/SL = in role)", trends.avgTenureYears, undefined],
  ];
  for (const [title, subtitle, series, axisMax] of rateCharts) {
    const points = rateByYear(series);
    if (points.length === 0) continue;
    blocks.push({
      type: "multiBars",
      title,
      subtitle,
      legend: RATE_LEGEND,
      points,
      stacked: false,
      axisMax,
      keepZeros: true,
    });
  }

  const campusWeekly = campusWeeklyPoints(campusAttendance, trendYearCount);
  if (campusWeekly) {
    blocks.push({
      type: "multiBars",
      title: "Weekly meeting attendance",
      subtitle: "Average per staff year (from 2025)",
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
  const baseline = prevYear !== undefined ? `vs ${prevYear}` : "no baseline";

  const headcount: ViewCard[] = [
    { label: "All staff", value: String(trends.allStaff[i]), delta: yoyDelta(trends.allStaff[i], at(trends.allStaff)), hint: baseline },
    { label: "Staff", value: String(trends.staff[i]), delta: yoyDelta(trends.staff[i], at(trends.staff)), hint: baseline },
    {
      label: "Student leaders",
      value: String(trends.studentLeaders[i]),
      delta: yoyDelta(trends.studentLeaders[i], at(trends.studentLeaders)),
      hint: baseline,
      tone: "positive",
    },
    ...trends.studentLeadersByCampus
      .filter((c) => c.counts[i] > 0 && !isNoiseCampus(c.campus))
      .map((c) => ({
        label: campusAcronym(c.campus),
        value: String(c.counts[i]),
        delta: yoyDelta(c.counts[i], at(c.counts)),
        hint: baseline,
      })),
  ];

  const retentionHint = (left: number | null | undefined, priorN: number | undefined) => {
    if (prevYear === undefined) return "needs a prior year";
    const parts: string[] = [`vs ${prevYear}`];
    if (priorN !== undefined) parts.push(`n=${priorN}`);
    if (left !== null && left !== undefined) parts.push(`${fmtAvg(left)}% left`);
    return parts.join(" · ");
  };
  const groups = [
    { key: "overall", name: "Overall", n: trends.allStaff },
    { key: "staff", name: "Staff", n: trends.staff },
    { key: "studentLeaders", name: "Student leader", n: trends.studentLeaders },
  ] as const;

  const retention: ViewCard[] = groups
    .filter((g) => trends.retention[g.key][i] !== null)
    .map((g) => ({
      label: `${g.name} retention`,
      value: fmtPct(trends.retention[g.key][i]),
      delta: ppDelta(trends.retention[g.key][i], at(trends.retention[g.key])),
      hint: retentionHint(trends.turnover[g.key][i], at(g.n)),
      tone: "positive",
    }));

  const tenureLabel = { overall: "Overall ≥2 years", staff: "Staff ≥2 years", studentLeaders: "Student leaders ≥2 years" };
  const tenure: ViewCard[] = groups
    .filter((g) => trends.tenure2Plus[g.key][i] !== null)
    .map((g) => ({
      label: tenureLabel[g.key],
      value: fmtPct(trends.tenure2Plus[g.key][i]),
      delta: ppDelta(trends.tenure2Plus[g.key][i], at(trends.tenure2Plus[g.key])),
      hint: `${g.key === "overall" ? "of people this year" : "years in this role"} · n=${g.n[i]}`,
      tone: "positive",
    }));

  const avgLabel = { overall: "Overall avg years", staff: "Staff avg years", studentLeaders: "Student leader avg years" };
  const avgYears: ViewCard[] = groups
    .filter((g) => trends.avgTenureYears[g.key][i] !== null)
    .map((g) => ({
      label: avgLabel[g.key],
      value: fmtAvg(trends.avgTenureYears[g.key][i] as number),
      delta: yearsDelta(trends.avgTenureYears[g.key][i], at(trends.avgTenureYears[g.key])),
      hint: `${g.key === "overall" ? "years served so far" : "years in this role so far"} · n=${g.n[i]}`,
    }));

  const caIndex = campusAttendance ? campusAttendance.years.indexOf(year) : -1;
  const attendance: ViewCard[] =
    campusAttendance && caIndex >= 0
      ? campusAttendance.campuses
          .filter((c) => c.averages[caIndex] > 0)
          .map((c) => ({
            label: campusAcronym(c.campus),
            value: fmtAvg(c.averages[caIndex]),
            delta: yoyDelta(c.averages[caIndex], caIndex > 0 ? c.averages[caIndex - 1] : undefined),
            hint: baseline,
          }))
      : [];

  const blocks: ViewBlock[] = [
    {
      type: "caption",
      text:
        prevYear !== undefined
          ? `Staff year ${year}, change vs ${prevYear}. Staff profiles only.`
          : `Staff year ${year}. No earlier year to compare against. Staff profiles only.`,
    },
    { type: "cards", layout: "grid", cards: headcount },
  ];
  if (retention.length > 0) {
    blocks.push(
      { type: "heading", text: "Retention" },
      { type: "caption", text: "Share of last year's roster still serving this year. The % who left is the complement." },
      { type: "cards", layout: "grid", cards: retention }
    );
  }
  if (tenure.length > 0) {
    blocks.push(
      { type: "heading", text: "Serve at least 2 years" },
      {
        type: "caption",
        text: "Of people present this year, the share with two or more years so far. Staff and student-leader cards count years in that role.",
      },
      { type: "cards", layout: "grid", cards: tenure }
    );
  }
  blocks.push(
    { type: "heading", text: "Average years served so far" },
    {
      type: "caption",
      text: "Mean distinct years so far among people present this year. Staff and student-leader cards count years in that role only.",
    },
    { type: "cards", layout: "grid", cards: avgYears }
  );
  if (attendance.length > 0) {
    blocks.push(
      { type: "heading", text: "Avg weekly meeting attendance" },
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
  return allYearsView(trends, campusAttendance, scope, signedIn);
}
