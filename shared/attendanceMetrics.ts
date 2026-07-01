/**
 * Pure, shared logic for the Attendance → Insights (Metrics) dashboard.
 *
 * No Convex or React Native imports, so the backend precompute
 * (`convex/attendanceMetrics.ts`) and the app agree on ONE source of truth for
 * how leaders' insights are derived. All thresholds live in
 * {@link METRICS_THRESHOLDS} so they can be tuned without touching logic.
 *
 * The dashboard answers, for a sub-group and time range:
 *  - overall attendance trends and how they compare to the previous period
 *  - weekly-meeting health
 *  - who may need pastoral / leadership follow-up (with explainable reasons)
 *  - newcomers and recently re-engaged people
 *
 * Language is deliberately gentle — these are people, not numbers. Follow-up
 * reasons say "Follow-up suggested", never imply judgement.
 */

import { eventIncludesSubgroup } from "./rollcall";

// ───────────────────────────── Constants ──────────────────────────────────

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

/**
 * Tunable thresholds for every classification. Adjust here; the logic and the
 * explainable labels both read from this object so they never drift.
 */
export const METRICS_THRESHOLDS = {
  /** Regular: attended at least this many relevant events in the window… */
  regularMinEvents: 3,
  /** …measured over this many trailing weeks. */
  regularWindowWeeks: 8,
  /** …OR attended at least this fraction of recent weekly meetings. */
  regularWeeklyRate: 0.5,
  /** At risk: a regular who attended 0 of the last N weekly meetings held. */
  atRiskMissedWeeklies: 3,
  /** Lapsed: previously regular, but nothing in the last N days. */
  lapsedDays: 30,
  /** Newcomer: first-ever attendance within the last N days (or the period). */
  newcomerDays: 30,
  /** Re-engaged: attended recently after a prior gap of at least N days. */
  reengagedGapDays: 30,
  /** Rolling-average trend window, in events. */
  rollingAvgWindow: 4,
  /** How many recent weekly meetings define "recent" for the weekly rate. */
  recentWeeklyWindow: 6,
  /** Cap on the follow-up list so a snapshot stays well under Convex's 1MB. */
  followUpLimit: 60,
  /** Cap on per-event trend points kept in a snapshot. */
  trendPointLimit: 40,
  /** Minimum sub-group events before insights are meaningful. */
  minEventsForInsights: 3,
} as const;

/** The preset trailing-week ranges offered in the UI (plus "staff year"). */
export const RANGE_WEEKS = [4, 8, 12] as const;
export type RangeWeeks = (typeof RANGE_WEEKS)[number];

/** Sentinel `rangeWeeks` value meaning "the whole current staff year". */
export const STAFF_YEAR_RANGE = 0;

// ───────────────────────────── Input types ────────────────────────────────

export type PersonKind = "staff" | "member";

export type MetricsPerson = {
  /** `personKey` from shared/rollcall — the stable identity join key. */
  key: string;
  name: string;
  kind: PersonKind;
  subtitle?: string;
  photo?: string | null;
  /**
   * Field → value labels used for the optional metadata breakdowns
   * (e.g. { Campus: "USYD", Role: "Student Leader" }). Bounded and pre-resolved
   * by the backend so this module stays free of metadata-id plumbing.
   */
  breakdown?: Record<string, string>;
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
  /** Start of the display period (attendance before this is history/context). */
  rangeStartMs: number;
  /** Earliest event loaded — the classification look-back horizon. */
  historyStartMs: number;
  events: MetricsEvent[];
  attendance: MetricsAttendance[];
  persons: MetricsPerson[];
  /** Exclude multi-sub-group (collaborative) events when false. */
  includeCollaborative: boolean;
};

// ───────────────────────────── Output types ───────────────────────────────

export type TrendPoint = { at: number; label: string; value: number };
/** New (`fresh`) vs returning attendees for one point in time. */
export type SplitPoint = { at: number; label: string; fresh: number; returning: number };

export type MetricsSummary = {
  avgAttendance: number;
  avgAttendancePrev: number | null;
  /** Percentage change vs the previous comparable period; null if no baseline. */
  changePct: number | null;
  eventsHeld: number;
  uniqueAttendees: number;
  newcomers: number;
  followUpCount: number;
  /** 0..1 steadiness of weekly-meeting turnout; null when no weekly meetings. */
  weeklyConsistency: number | null;
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
  /** Attendances within the regular-window (trailing weeks). */
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
  followUps: FollowUpPerson[];
  breakdowns: MetricsBreakdown[];
  /** False when there aren't enough events yet to say anything useful. */
  hasEnoughHistory: boolean;
};

// ───────────────────────────── Formatting ─────────────────────────────────

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Deterministic short date label ("6 Jul") — locale-independent for tests. */
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

/** "3 days ago", "2 weeks ago" — for the explainable follow-up copy. */
export const humanGap = (from: number, to: number): string => {
  const days = daysBetween(from, to);
  if (days <= 1) return "1 day";
  if (days < 14) return `${days} days`;
  return `${Math.round(days / 7)} weeks`;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

// ───────────────────────────── Core compute ───────────────────────────────

/**
 * Build the dashboard snapshot for one sub-group over one time range. Pure:
 * given the same bounded inputs it always returns the same aggregates, so it
 * can be unit-tested exhaustively (see shared/attendanceMetrics.test.ts) and
 * run identically on the server precompute.
 */
export function computeSubgroupMetrics(input: ComputeInput): SubgroupMetricsData {
  const { now, subgroup, rangeStartMs, historyStartMs, includeCollaborative } = input;
  const T = METRICS_THRESHOLDS;

  const personByKey = new Map(input.persons.map((p) => [p.key, p]));

  // Sub-group events we care about, oldest → newest. Collaborative events are
  // optionally excluded so a leader can look at just their own group's rhythm.
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

  // eventId → distinct person keys who attended (dedupe defensive double rows).
  const attendeesByEvent = new Map<string, Set<string>>();
  // personKey → sorted attendance timestamps (event start times), any event.
  const timeline = new Map<string, number[]>();
  // personKey → sorted weekly-meeting attendance timestamps.
  const weeklyTimeline = new Map<string, number[]>();

  for (const row of input.attendance) {
    if (!eventIds.has(row.eventId)) continue;
    if (!row.personKey) continue;
    const event = eventById.get(row.eventId)!;
    let set = attendeesByEvent.get(row.eventId);
    if (!set) attendeesByEvent.set(row.eventId, (set = new Set()));
    if (set.has(row.personKey)) continue; // dedupe: one attendance per person/event
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

  // Period slices.
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

  // Unique attendees in the period.
  const periodAttendees = new Set<string>();
  for (const e of periodEvents) {
    for (const key of attendeesByEvent.get(e.id) ?? []) periodAttendees.add(key);
  }

  // Newcomers: first-ever attendance (over loaded history) landed in the period.
  let newcomers = 0;
  for (const key of periodAttendees) {
    const first = timeline.get(key)?.[0];
    if (first !== undefined && first >= rangeStartMs) newcomers += 1;
  }

  // Weekly-meeting consistency: steadiness of turnout across the period's
  // weekly meetings — average attendance ÷ peak attendance (1 = rock steady).
  const periodWeeklies = periodEvents.filter((e) => e.isWeeklyMeeting);
  const weeklyCounts = periodWeeklies.map((e) => countFor(e.id));
  const peakWeekly = weeklyCounts.reduce((m, c) => Math.max(m, c), 0);
  const weeklyConsistency =
    weeklyCounts.length > 0 && peakWeekly > 0
      ? round1(
          weeklyCounts.reduce((s, c) => s + c, 0) / weeklyCounts.length / peakWeekly
        )
      : null;

  // ── Trends ──
  // Keep only the most recent `trendPointLimit` points so a snapshot stays small.
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

  // Unique attendees per calendar month (last 6 months of loaded history).
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

  // New vs returning per period event: someone is "fresh" the first event they
  // ever appear at (over loaded history).
  const seenBefore = new Set<string>();
  // Prime with anyone whose first attendance predates the period.
  for (const [key, list] of timeline) {
    if (list[0] < rangeStartMs) seenBefore.add(key);
  }
  const newVsReturning: SplitPoint[] = trimTrend(
    periodEvents.map((e) => {
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

  // ── Follow-up classification ──
  // The chronological list of weekly meetings held (subgroup), for "missed the
  // last N" and the recent-rate checks.
  const weeklyEventsAsc = events.filter((e) => e.isWeeklyMeeting);
  const lastNWeeklies = weeklyEventsAsc.slice(-T.atRiskMissedWeeklies);
  const recentWeeklyCutoff = now - T.regularWindowWeeks * WEEK_MS;
  const recentWeeklies = weeklyEventsAsc.filter(
    (e) => e.dateStart >= recentWeeklyCutoff
  );

  const followUps: FollowUpPerson[] = [];
  for (const [key, attended] of timeline) {
    const person = personByKey.get(key);
    if (!person) continue; // unknown identity — skip rather than show "Unknown"
    const first = attended[0];
    const last = attended[attended.length - 1];
    const total = attended.length;
    const recentCount = attended.filter((t) => t >= recentWeeklyCutoff).length;
    const weekliesAttended = new Set(weeklyTimeline.get(key) ?? []);

    // Regular?
    const recentWeeklyHits = recentWeeklies.filter((e) =>
      weekliesAttended.has(e.dateStart)
    ).length;
    const weeklyRate =
      recentWeeklies.length > 0 ? recentWeeklyHits / recentWeeklies.length : 0;
    const isRegular =
      recentCount >= T.regularMinEvents || weeklyRate >= T.regularWeeklyRate;

    // At risk: a regular who attended none of the last N weekly meetings held.
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
      // Lapsed: attended enough historically to count as a regular, but has
      // been away longer than the lapse window.
      if (total >= T.regularMinEvents && last < now - T.lapsedDays * DAY_MS) {
        return {
          code: "lapsed",
          reason: `Used to attend regularly, absent for ${humanGap(last, now)}`,
        };
      }
      // Newcomer who hasn't returned: first attended within the newcomer window,
      // came once, and a relevant weekly meeting has since given them a chance.
      const newcomerCutoff = Math.min(rangeStartMs, now - T.newcomerDays * DAY_MS);
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
      // Re-engaged: back within the recent window after a long prior gap.
      if (attended.length >= 2 && last >= now - T.reengagedGapDays * DAY_MS) {
        const prior = attended[attended.length - 2];
        if (last - prior >= T.reengagedGapDays * DAY_MS) {
          return {
            code: "reengaged",
            reason: `Returned after ${humanGap(prior, last)} away`,
          };
        }
      }
      // Declining: fewer attendances in the most recent half of the window than
      // the half before it (and still attending, so not already lapsed).
      const half = T.regularWindowWeeks / 2;
      const midMs = now - half * WEEK_MS;
      const recentHalf = attended.filter((t) => t >= midMs).length;
      const priorHalf = attended.filter(
        (t) => t >= recentWeeklyCutoff && t < midMs
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

  // Urgency order for the list; then longest-absent first within a reason.
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

  // ── Optional metadata breakdowns (unique period attendees by field value) ──
  const breakdownFields = new Map<string, Map<string, Set<string>>>();
  for (const key of periodAttendees) {
    const person = personByKey.get(key);
    if (!person?.breakdown) continue;
    for (const [field, value] of Object.entries(person.breakdown)) {
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
      eventsHeld: periodEvents.length,
      uniqueAttendees: periodAttendees.size,
      newcomers,
      followUpCount: cappedFollowUps.length,
      weeklyConsistency,
    },
    attendanceByEvent,
    rollingAverage,
    weeklyTrend,
    uniqueByMonth,
    newVsReturning,
    followUps: cappedFollowUps,
    breakdowns,
    hasEnoughHistory: events.length >= T.minEventsForInsights,
  };
}

/** Human, non-judgemental heading for a follow-up reason group. */
export const REASON_LABELS: Record<FollowUpReasonCode, string> = {
  at_risk: "Follow-up suggested",
  lapsed: "Been away a while",
  declining: "Attending less lately",
  newcomer_no_return: "New — hasn't returned",
  reengaged: "Recently returned",
};

/** Set-and-return helper so timeline pushes read cleanly above. */
function setDefault<K, V>(map: Map<K, V>, key: K, value?: V): V {
  const v = value ?? ([] as unknown as V);
  map.set(key, v);
  return v;
}

/** The concrete start-of-range ms for a `rangeWeeks` selection. */
export const rangeStartFor = (
  now: number,
  rangeWeeks: number,
  staffYearStartMs: number
): number =>
  rangeWeeks === STAFF_YEAR_RANGE
    ? staffYearStartMs
    : now - rangeWeeks * WEEK_MS;
