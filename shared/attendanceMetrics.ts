import { eventStaffYear } from "./flow";
import {
  eventIncludesSubgroup,
  isOrgWideSubgroup,
  subgroupMatches,
} from "./rollcall";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export const MANUAL_REFRESH_COOLDOWN_MS = WEEK_MS;

export const METRICS_THRESHOLDS = {
  regularMinEvents: 3,
  regularWeeklyRate: 0.5,
  atRiskMissedWeeklies: 3,
  lapsedDays: 30,
  newcomerDays: 30,
  reengagedGapDays: 30,
  rollingAvgWindow: 4,
  recentWeeklyWindow: 6,
  followUpLimit: 60,
  trendPointLimit: 40,
  minEventsForInsights: 1,
} as const;

export const RANGE_WEEKS = [1, 4, 52] as const;
export type RangeWeeks = (typeof RANGE_WEEKS)[number];

export const RANGE_LABELS: Record<RangeWeeks, string> = {
  1: "Past week",
  4: "Past month",
  52: "Past year",
};

export const rangeLabel = (weeks: number): string =>
  weeks in RANGE_LABELS
    ? RANGE_LABELS[weeks as RangeWeeks]
    : weeks === 1
      ? "1 wk"
      : `${weeks} wks`;

export const STAFF_YEAR_RANGE = 0;

export const GENERAL_RECENT_YEARS = 5;

export type PersonKind = "staff" | "member";

export type MetricsPerson = {
  key: string;
  name: string;
  kind: PersonKind;
  subtitle?: string;
  photo?: string | null;
  breakdown?: Record<string, string>;
  breakdownByYear?: Record<string, Record<string, string>>;
  isStudentLeader?: boolean;
  leaderByYear?: Record<string, boolean>;
  campuses?: string[];
  campusesByYear?: Record<string, string[]>;
};

export type MetricsEvent = {
  id: string;
  name: string;
  dateStart: number;
  subgroups: string[];
  collaborative: boolean;
  isWeeklyMeeting: boolean;
};

export type MetricsAttendance = {
  eventId: string;
  personKey: string;
  signInTime: number;
};

export type ComputeInput = {
  now: number;
  subgroup: string;
  rangeStartMs: number;
  historyStartMs: number;
  events: MetricsEvent[];
  attendance: MetricsAttendance[];
  persons: MetricsPerson[];
  includeCollaborative: boolean;
};

export type TrendPoint = { at: number; label: string; value: number };
export type SplitPoint = { at: number; label: string; fresh: number; returning: number };
export type CompositionPoint = {
  at: number;
  label: string;
  primary: number;
  rest: number;
};

export type MetricsSummary = {
  avgAttendance: number;
  avgAttendancePrev: number | null;
  changePct: number | null;
  avgWeeklyAttendance: number | null;
  avgWeeklyAttendancePrev: number | null;
  weeklyChangePct: number | null;
  eventsHeld: number;
  uniqueAttendees: number;
  newcomers: number;
  followUpCount: number;
  weeklyConsistency: number | null;
  leaderShare?: number | null;
  homeCampusShare?: number | null;
};

export type FollowUpReasonCode =
  | "at_risk"
  | "lapsed"
  | "newcomer_no_return"
  | "reengaged"
  | "declining";

export type FollowUpPerson = {
  key: string;
  name: string;
  kind: PersonKind;
  subtitle?: string;
  photo?: string | null;
  lastAttended: number | null;
  recentCount: number;
  reasonCode: FollowUpReasonCode;
  reason: string;
};

export type MetricsBreakdown = {
  field: string;
  rows: { label: string; value: number }[];
};

export type SubgroupMetricsData = {
  summary: MetricsSummary;
  attendanceByEvent: TrendPoint[];
  rollingAverage: TrendPoint[];
  weeklyTrend: TrendPoint[];
  uniqueByMonth: TrendPoint[];
  newVsReturning: SplitPoint[];
  leadersVsOthers?: CompositionPoint[];
  campusMix?: CompositionPoint[];
  followUps: FollowUpPerson[];
  breakdowns: MetricsBreakdown[];
  hasEnoughHistory: boolean;
  hasWeeklyMeetings: boolean;
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const shortDate = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

const monthKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
};

const monthLabel = (ms: number): string => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(-2)}`;
};

const daysBetween = (from: number, to: number): number =>
  Math.max(0, Math.round((to - from) / DAY_MS));

export const humanGap = (from: number, to: number): string => {
  const days = daysBetween(from, to);
  if (days <= 1) return "1 day";
  if (days < 14) return `${days} days`;
  return `${Math.round(days / 7)} weeks`;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

const roundRatio = (n: number): number => Math.round(n * 1000) / 1000;

export function computeSubgroupMetrics(input: ComputeInput): SubgroupMetricsData {
  const { now, subgroup, rangeStartMs, historyStartMs, includeCollaborative } = input;
  const T = METRICS_THRESHOLDS;

  const personByKey = new Map(input.persons.map((p) => [p.key, p]));
  const yearKey = (at: number) => String(eventStaffYear(at));
  const isLeaderAt = (key: string, at: number): boolean => {
    const person = personByKey.get(key);
    if (!person) return false;
    const yearly = person.leaderByYear?.[yearKey(at)];
    return yearly ?? !!person.isStudentLeader;
  };
  const campusesAt = (key: string, at: number): string[] | undefined => {
    const person = personByKey.get(key);
    if (!person) return undefined;
    return person.campusesByYear?.[yearKey(at)] ?? person.campuses;
  };

  const events = input.events
    .filter(
      (e) =>
        eventIncludesSubgroup(e.subgroups, subgroup) &&
        e.dateStart <= now &&
        e.dateStart >= historyStartMs &&
        (includeCollaborative || !e.collaborative)
    )
    .sort((a, b) => a.dateStart - b.dateStart);
  const eventIds = new Set(events.map((e) => e.id));
  const eventById = new Map(events.map((e) => [e.id, e]));
  const hasWeeklyMeetings = events.some((e) => e.isWeeklyMeeting);

  const attendeesByEvent = new Map<string, Set<string>>();
  const timeline = new Map<string, number[]>();
  const weeklyTimeline = new Map<string, number[]>();

  for (const row of input.attendance) {
    if (!eventIds.has(row.eventId)) continue;
    if (!row.personKey) continue;
    const event = eventById.get(row.eventId)!;
    let set = attendeesByEvent.get(row.eventId);
    if (!set) attendeesByEvent.set(row.eventId, (set = new Set()));
    if (set.has(row.personKey)) continue;
    set.add(row.personKey);
    (timeline.get(row.personKey) ?? setDefault(timeline, row.personKey)).push(
      event.dateStart
    );
    if (event.isWeeklyMeeting) {
      (
        weeklyTimeline.get(row.personKey) ??
        setDefault(weeklyTimeline, row.personKey)
      ).push(event.dateStart);
    }
  }
  for (const list of timeline.values()) list.sort((a, b) => a - b);
  for (const list of weeklyTimeline.values()) list.sort((a, b) => a - b);

  const countFor = (eventId: string): number =>
    attendeesByEvent.get(eventId)?.size ?? 0;

  const periodEvents = events.filter((e) => e.dateStart >= rangeStartMs);
  const periodLen = Math.max(0, now - rangeStartMs);
  const prevStartMs = rangeStartMs - periodLen;
  const prevEvents = events.filter(
    (e) => e.dateStart >= prevStartMs && e.dateStart < rangeStartMs
  );

  const avg = (list: MetricsEvent[]): number =>
    list.length === 0
      ? 0
      : round1(list.reduce((sum, e) => sum + countFor(e.id), 0) / list.length);

  const avgAttendance = avg(periodEvents);
  const avgAttendancePrev = prevEvents.length ? avg(prevEvents) : null;
  const changePct =
    avgAttendancePrev && avgAttendancePrev > 0
      ? Math.round(((avgAttendance - avgAttendancePrev) / avgAttendancePrev) * 100)
      : null;

  const periodWeeklies = periodEvents.filter((e) => e.isWeeklyMeeting);
  const prevWeeklies = prevEvents.filter((e) => e.isWeeklyMeeting);
  const avgWeeklyAttendance = periodWeeklies.length ? avg(periodWeeklies) : null;
  const avgWeeklyAttendancePrev = prevWeeklies.length ? avg(prevWeeklies) : null;
  const weeklyChangePct =
    avgWeeklyAttendance !== null && avgWeeklyAttendancePrev && avgWeeklyAttendancePrev > 0
      ? Math.round(
          ((avgWeeklyAttendance - avgWeeklyAttendancePrev) / avgWeeklyAttendancePrev) * 100
        )
      : null;

  const periodAttendees = new Set<string>();
  for (const e of periodEvents) {
    for (const key of attendeesByEvent.get(e.id) ?? []) periodAttendees.add(key);
  }

  const newcomerCutoff = Math.max(rangeStartMs, now - T.newcomerDays * DAY_MS);
  let newcomers = 0;
  for (const key of periodAttendees) {
    const first = timeline.get(key)?.[0];
    if (first !== undefined && first >= newcomerCutoff) newcomers += 1;
  }

  const weeklyCounts = periodWeeklies.map((e) => countFor(e.id));
  const peakWeekly = weeklyCounts.reduce((m, c) => Math.max(m, c), 0);
  const weeklyConsistency =
    weeklyCounts.length > 0 && peakWeekly > 0
      ? roundRatio(
          weeklyCounts.reduce((s, c) => s + c, 0) / weeklyCounts.length / peakWeekly
        )
      : null;

  const trimTrend = <E,>(list: E[]): E[] =>
    list.length > T.trendPointLimit ? list.slice(-T.trendPointLimit) : list;

  const attendanceByEvent: TrendPoint[] = trimTrend(
    periodEvents.map((e) => ({
      at: e.dateStart,
      label: shortDate(e.dateStart),
      value: countFor(e.id),
    }))
  );

  const rollingAverage: TrendPoint[] = attendanceByEvent.map((pt, i, arr) => {
    const from = Math.max(0, i - (T.rollingAvgWindow - 1));
    const slice = arr.slice(from, i + 1);
    return {
      at: pt.at,
      label: pt.label,
      value: round1(slice.reduce((s, p) => s + p.value, 0) / slice.length),
    };
  });

  const weeklyTrend: TrendPoint[] = trimTrend(
    periodWeeklies.map((e) => ({
      at: e.dateStart,
      label: shortDate(e.dateStart),
      value: countFor(e.id),
    }))
  );

  const monthOrder: string[] = [];
  const monthAt = new Map<string, number>();
  const monthSets = new Map<string, Set<string>>();
  for (const e of events) {
    const key = monthKey(e.dateStart);
    if (!monthSets.has(key)) {
      monthSets.set(key, new Set());
      monthOrder.push(key);
      monthAt.set(key, e.dateStart);
    }
    for (const person of attendeesByEvent.get(e.id) ?? [])
      monthSets.get(key)!.add(person);
  }
  const uniqueByMonth: TrendPoint[] = monthOrder.slice(-6).map((key) => ({
    at: monthAt.get(key)!,
    label: monthLabel(monthAt.get(key)!),
    value: monthSets.get(key)!.size,
  }));

  const splitEvents = hasWeeklyMeetings ? periodWeeklies : periodEvents;
  const splitTimeline = hasWeeklyMeetings ? weeklyTimeline : timeline;
  const seenBefore = new Set<string>();
  for (const [key, list] of splitTimeline) {
    if (list[0] < rangeStartMs) seenBefore.add(key);
  }
  const newVsReturning: SplitPoint[] = trimTrend(
    splitEvents.map((e) => {
      let fresh = 0;
      let returning = 0;
      for (const key of attendeesByEvent.get(e.id) ?? []) {
        if (seenBefore.has(key)) returning += 1;
        else {
          fresh += 1;
          seenBefore.add(key);
        }
      }
      return { at: e.dateStart, label: shortDate(e.dateStart), fresh, returning };
    })
  );

  const leaderPoints: CompositionPoint[] = splitEvents.map((e) => {
    let primary = 0;
    let rest = 0;
    for (const key of attendeesByEvent.get(e.id) ?? []) {
      if (isLeaderAt(key, e.dateStart)) primary += 1;
      else rest += 1;
    }
    return { at: e.dateStart, label: shortDate(e.dateStart), primary, rest };
  });
  const leaderSum = leaderPoints.reduce((s, p) => s + p.primary, 0);
  const leaderTotal = leaderPoints.reduce((s, p) => s + p.primary + p.rest, 0);
  const leaderShare =
    leaderTotal > 0 ? roundRatio(leaderSum / leaderTotal) : null;
  const leadersVsOthers = trimTrend(leaderPoints);

  let campusMix: CompositionPoint[] | undefined;
  let homeCampusShare: number | null | undefined;
  if (!isOrgWideSubgroup(subgroup)) {
    const campusPoints: CompositionPoint[] = splitEvents.map((e) => {
      let primary = 0;
      let rest = 0;
      for (const key of attendeesByEvent.get(e.id) ?? []) {
        const campuses = campusesAt(key, e.dateStart);
        if (!campuses || campuses.length === 0) continue;
        if (campuses.some((c) => subgroupMatches(c, subgroup))) primary += 1;
        else rest += 1;
      }
      return { at: e.dateStart, label: shortDate(e.dateStart), primary, rest };
    });
    const homeSum = campusPoints.reduce((s, p) => s + p.primary, 0);
    const knownTotal = campusPoints.reduce((s, p) => s + p.primary + p.rest, 0);
    homeCampusShare =
      knownTotal > 0 ? roundRatio(homeSum / knownTotal) : null;
    campusMix = trimTrend(campusPoints);
  }

  const weeklyEventsAsc = events.filter((e) => e.isWeeklyMeeting);
  const lastNWeeklies = weeklyEventsAsc.slice(-T.atRiskMissedWeeklies);
  const recentCutoff = rangeStartMs;
  const recentWeeklies = weeklyEventsAsc.slice(-T.recentWeeklyWindow);

  const followUps: FollowUpPerson[] = [];
  for (const [key, attended] of timeline) {
    const person = personByKey.get(key);
    if (!person) continue;
    const first = attended[0];
    const last = attended[attended.length - 1];
    const total = attended.length;
    const recentCount = attended.filter((t) => t >= recentCutoff).length;
    const weekliesAttended = new Set(weeklyTimeline.get(key) ?? []);

    const recentWeeklyHits = recentWeeklies.filter((e) =>
      weekliesAttended.has(e.dateStart)
    ).length;
    const weeklyRate =
      recentWeeklies.length > 0 ? recentWeeklyHits / recentWeeklies.length : 0;
    const isRegular =
      recentCount >= T.regularMinEvents || weeklyRate >= T.regularWeeklyRate;

    const missedAllRecentWeeklies =
      lastNWeeklies.length >= T.atRiskMissedWeeklies &&
      lastNWeeklies.every((e) => !weekliesAttended.has(e.dateStart));

    const classify = (): { code: FollowUpReasonCode; reason: string } | null => {
      if (isRegular && missedAllRecentWeeklies) {
        return {
          code: "at_risk",
          reason: `Missed the last ${T.atRiskMissedWeeklies} weekly meetings`,
        };
      }
      if (total >= T.regularMinEvents && last < now - T.lapsedDays * DAY_MS) {
        return {
          code: "lapsed",
          reason: `Used to attend regularly, absent for ${humanGap(last, now)}`,
        };
      }
      if (
        total === 1 &&
        first >= newcomerCutoff &&
        weeklyEventsAsc.some((e) => e.dateStart > first)
      ) {
        return {
          code: "newcomer_no_return",
          reason: `Newcomer: first attended ${humanGap(first, now)} ago, hasn't returned`,
        };
      }
      if (attended.length >= 2 && last >= now - T.reengagedGapDays * DAY_MS) {
        const prior = attended[attended.length - 2];
        if (last - prior >= T.reengagedGapDays * DAY_MS) {
          return {
            code: "reengaged",
            reason: `Returned after ${humanGap(prior, last)} away`,
          };
        }
      }
      const midMs = recentCutoff + (now - recentCutoff) / 2;
      const recentHalf = attended.filter((t) => t >= midMs).length;
      const priorHalf = attended.filter(
        (t) => t >= recentCutoff && t < midMs
      ).length;
      if (priorHalf >= 2 && recentHalf < priorHalf) {
        return {
          code: "declining",
          reason: `Attending less than before (${priorHalf} → ${recentHalf})`,
        };
      }
      return null;
    };

    const verdict = classify();
    if (!verdict) continue;
    followUps.push({
      key,
      name: person.name,
      kind: person.kind,
      subtitle: person.subtitle,
      photo: person.photo,
      lastAttended: last,
      recentCount,
      reasonCode: verdict.code,
      reason: verdict.reason,
    });
  }

  const reasonRank: Record<FollowUpReasonCode, number> = {
    at_risk: 0,
    lapsed: 1,
    declining: 2,
    newcomer_no_return: 3,
    reengaged: 4,
  };
  followUps.sort((a, b) => {
    const r = reasonRank[a.reasonCode] - reasonRank[b.reasonCode];
    if (r !== 0) return r;
    return (a.lastAttended ?? 0) - (b.lastAttended ?? 0);
  });
  const cappedFollowUps = followUps.slice(0, T.followUpLimit);

  const latestPeriodAt = new Map<string, number>();
  for (const e of periodEvents) {
    for (const key of attendeesByEvent.get(e.id) ?? []) {
      const prev = latestPeriodAt.get(key);
      if (prev === undefined || e.dateStart > prev) latestPeriodAt.set(key, e.dateStart);
    }
  }
  const breakdownFor = (key: string): Record<string, string> | undefined => {
    const person = personByKey.get(key);
    if (!person) return undefined;
    const at = latestPeriodAt.get(key);
    if (at !== undefined && person.breakdownByYear) {
      const yearly = person.breakdownByYear[String(eventStaffYear(at))];
      if (yearly) return yearly;
    }
    return person.breakdown;
  };
  const breakdownFields = new Map<string, Map<string, Set<string>>>();
  for (const key of periodAttendees) {
    const breakdown = breakdownFor(key);
    if (!breakdown) continue;
    for (const [field, value] of Object.entries(breakdown)) {
      if (!value) continue;
      let byValue = breakdownFields.get(field);
      if (!byValue) breakdownFields.set(field, (byValue = new Map()));
      (byValue.get(value) ?? setDefault(byValue, value, new Set())).add(key);
    }
  }
  const breakdowns: MetricsBreakdown[] = [...breakdownFields.entries()].map(
    ([field, byValue]) => ({
      field,
      rows: [...byValue.entries()]
        .map(([label, keys]) => ({ label, value: keys.size }))
        .sort((a, b) => b.value - a.value),
    })
  );

  return {
    summary: {
      avgAttendance,
      avgAttendancePrev,
      changePct,
      avgWeeklyAttendance,
      avgWeeklyAttendancePrev,
      weeklyChangePct,
      eventsHeld: periodEvents.length,
      uniqueAttendees: periodAttendees.size,
      newcomers,
      followUpCount: followUps.length,
      weeklyConsistency,
      leaderShare,
      homeCampusShare,
    },
    attendanceByEvent,
    rollingAverage,
    weeklyTrend,
    uniqueByMonth,
    newVsReturning,
    leadersVsOthers,
    campusMix,
    followUps: cappedFollowUps,
    breakdowns,
    hasWeeklyMeetings,
    hasEnoughHistory: periodEvents.length >= T.minEventsForInsights,
  };
}

export const REASON_LABELS: Record<FollowUpReasonCode, string> = {
  at_risk: "Follow-up suggested",
  lapsed: "Been away a while",
  declining: "Attending less lately",
  newcomer_no_return: "New — hasn't returned",
  reengaged: "Recently returned",
};

function setDefault<K, V>(map: Map<K, V>, key: K, value?: V): V {
  const v = value ?? ([] as unknown as V);
  map.set(key, v);
  return v;
}

export const rangeStartFor = (
  now: number,
  rangeWeeks: number,
  staffYearStartMs: number
): number =>
  rangeWeeks === STAFF_YEAR_RANGE
    ? staffYearStartMs
    : now - rangeWeeks * WEEK_MS;
