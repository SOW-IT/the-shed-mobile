import {
  RANGE_LABELS,
  RANGE_WEEKS,
  type FollowUpPerson,
  type SplitPoint,
  type SubgroupMetricsData,
  type TrendPoint,
} from "./attendanceMetrics";
import { subgroupColour } from "./rollcall";

export type ViewColour = "primary" | "success" | "accent";

export type ViewPaint = string;

export type ViewLegendItem = { key: string; colour: ViewPaint; label: string; shape?: "line" };

export type ViewSegmentPoint = {
  at: number;
  label: string;
  segments: { key: string; value: number; colour: ViewPaint }[];
};

export type ViewCard = {
  label: string;
  value: string;
  delta?: { text: string; direction: "up" | "down" | "flat" };
  hint?: string;
  tone?: "default" | "positive";
  info?: { title: string; body: string };
};

export type ViewBlock =
  | { type: "updated"; computedAt: number }
  | { type: "label"; text: string }
  | { type: "heading"; text: string }
  | { type: "caption"; text: string }
  | { type: "cards"; cards: ViewCard[]; layout?: "row" | "grid" }
  | {
      type: "stacked";
      title: string;
      subtitle?: string;
      legend: ViewLegendItem[];
      labels: { fresh: string; returning: string };
      points: SplitPoint[];
    }
  | {
      type: "multiBars";
      title: string;
      subtitle?: string;
      legend: ViewLegendItem[];
      points: ViewSegmentPoint[];
      stacked: boolean;
      axisMax?: number;
      keepZeros?: boolean;
      line?: { key: string; colour: ViewPaint; values: (number | null)[] };
      unit?: string;
    }
  | { type: "bars"; title: string; colour: ViewColour; points: TrendPoint[] }
  | { type: "breakdown"; title: string; rows: { label: string; value: number; colour?: ViewPaint }[] }
  | {
      type: "followUps";
      title: string;
      people: FollowUpPerson[];
      total: number;
      preview: number;
      emptyText: string;
    }
  | {
      type: "empty";
      icon: string;
      title: string;
      message: string;
      action?: { label: string; period: string };
    };

export const FOLLOW_UP_PREVIEW = 5;
export const FOLLOW_UP_MAX = 25;

export const DEFAULT_RANGE_WEEKS = 4;

export const ATTENDANCE_RANGE_OPTIONS = RANGE_WEEKS.map((weeks) => ({
  weeks,
  label: RANGE_LABELS[weeks],
  isDefault: weeks === DEFAULT_RANGE_WEEKS,
}));

export const resolveRangeWeeks = (
  picked: number,
  options: { weeks: number; isDefault?: boolean }[] | undefined
): number => {
  if (!options || options.length === 0) return picked;
  if (options.some((o) => o.weeks === picked)) return picked;
  return (options.find((o) => o.isDefault) ?? options[0]).weeks;
};

const deltaFor = (pct: number | null): ViewCard["delta"] =>
  pct === null
    ? undefined
    : {
        text: `${pct > 0 ? "+" : ""}${pct}%`,
        direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
      };

export function summaryCards(data: SubgroupMetricsData): ViewCard[] {
  const s = data.summary;
  const headline: ViewCard =
    data.hasWeeklyMeetings && s.avgWeeklyAttendance !== null
      ? {
          label: "Weeklies average",
          value: `${s.avgWeeklyAttendance}`,
          delta: deltaFor(s.weeklyChangePct),
          hint:
            s.avgWeeklyAttendancePrev !== null ? `vs ${s.avgWeeklyAttendancePrev}` : undefined,
          info: {
            title: "Weeklies average",
            body: "Average turnout at weeklies, compared with the previous period of the same length.",
          },
        }
      : {
          label: "Average per event",
          value: `${s.avgAttendance}`,
          delta: deltaFor(s.changePct),
          hint: s.avgAttendancePrev !== null ? `vs ${s.avgAttendancePrev}` : undefined,
          info: {
            title: "Average per event",
            body: "Average turnout per event, compared with the previous period of the same length. Events nobody signed in to aren't counted.",
          },
        };
  return [
    headline,
    {
      label: "People",
      value: `${s.uniqueAttendees}`,
      info: { title: "People", body: "Different people who came to at least one event." },
    },
    {
      label: "New people",
      value: `${s.newcomers}`,
      info: {
        title: "Newcomers",
        body: "People whose first event was in the last 30 days, or in this range if it's shorter.",
      },
    },
  ];
}

const NOT_READY: ViewBlock = {
  type: "empty",
  icon: "sparkles-outline",
  title: "Not ready yet",
  message: "Insights update overnight. Check back tomorrow.",
};

const NO_EVENTS: ViewBlock = {
  type: "empty",
  icon: "calendar-outline",
  title: "No events in this range",
  message: "Try a longer range.",
};

export function buildAttendanceView(input: {
  snapshot: { computedAt: number; data: SubgroupMetricsData } | null;
  orgWide: boolean;
  campusWeekly: { campus: string; avgWeekly: number }[];
}): ViewBlock[] {
  const { snapshot, orgWide, campusWeekly } = input;
  if (!snapshot) return [NOT_READY];
  const { data, computedAt } = snapshot;
  const updated: ViewBlock = { type: "updated", computedAt };

  if (orgWide) {
    const blocks: ViewBlock[] = [updated];
    if (campusWeekly.length > 0) {
      blocks.push(
        { type: "heading", text: "Weeklies" },
        {
          type: "breakdown",
          title: "Weeklies average by campus",
          rows: campusWeekly.map((c) => ({
            label: c.campus,
            value: c.avgWeekly,
            colour: subgroupColour(c.campus),
          })),
        }
      );
    }
    if (data.hasEnoughHistory) {
      blocks.push({ type: "heading", text: "SOW events" }, { type: "cards", cards: summaryCards(data) });
    }
    return blocks.length > 1 ? blocks : [updated, NO_EVENTS];
  }

  if (!data.hasEnoughHistory) return [updated, NO_EVENTS];
  const weekly = data.hasWeeklyMeetings && data.weeklyTrend.length > 0;
  return [
    updated,
    { type: "cards", cards: summaryCards(data) },
    weekly
      ? { type: "bars", title: "Weekly meetings", colour: "success", points: data.weeklyTrend }
      : { type: "bars", title: "Events", colour: "primary", points: data.attendanceByEvent },
    {
      type: "followUps",
      title: "Needs follow-up",
      people: data.followUps.slice(0, FOLLOW_UP_MAX),
      total: data.followUps.length,
      preview: FOLLOW_UP_PREVIEW,
      emptyText: "Nobody right now.",
    },
  ];
}
