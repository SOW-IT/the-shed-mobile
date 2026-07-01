/**
 * Convex validators for a precomputed Attendance metrics snapshot. Kept in a
 * dependency-free module so both `schema.ts` (the stored `data` column) and
 * `attendanceMetrics.ts` (function `returns`) share one definition — the
 * runtime mirror of {@link SubgroupMetricsData} in shared/attendanceMetrics.ts.
 */

import { v } from "convex/values";

const trendPoint = v.object({
  at: v.number(),
  label: v.string(),
  value: v.number(),
});

const splitPoint = v.object({
  at: v.number(),
  label: v.string(),
  fresh: v.number(),
  returning: v.number(),
});

const followUp = v.object({
  key: v.string(),
  name: v.string(),
  kind: v.union(v.literal("staff"), v.literal("member")),
  subtitle: v.optional(v.string()),
  photo: v.optional(v.union(v.string(), v.null())),
  lastAttended: v.union(v.number(), v.null()),
  recentCount: v.number(),
  reasonCode: v.union(
    v.literal("at_risk"),
    v.literal("lapsed"),
    v.literal("newcomer_no_return"),
    v.literal("reengaged"),
    v.literal("declining")
  ),
  reason: v.string(),
});

const breakdown = v.object({
  field: v.string(),
  rows: v.array(v.object({ label: v.string(), value: v.number() })),
});

const summary = v.object({
  avgAttendance: v.number(),
  avgAttendancePrev: v.union(v.number(), v.null()),
  changePct: v.union(v.number(), v.null()),
  eventsHeld: v.number(),
  uniqueAttendees: v.number(),
  newcomers: v.number(),
  followUpCount: v.number(),
  weeklyConsistency: v.union(v.number(), v.null()),
});

export const metricsDataValidator = v.object({
  summary,
  attendanceByEvent: v.array(trendPoint),
  rollingAverage: v.array(trendPoint),
  weeklyTrend: v.array(trendPoint),
  uniqueByMonth: v.array(trendPoint),
  newVsReturning: v.array(splitPoint),
  followUps: v.array(followUp),
  breakdowns: v.array(breakdown),
  hasEnoughHistory: v.boolean(),
});
