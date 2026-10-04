import { v } from "convex/values";

export const trendPoint = v.object({
  at: v.number(),
  label: v.string(),
  value: v.number(),
});

export const splitPoint = v.object({
  at: v.number(),
  label: v.string(),
  fresh: v.number(),
  returning: v.number(),
});

const compositionPoint = v.object({
  at: v.number(),
  label: v.string(),
  primary: v.number(),
  rest: v.number(),
});

export const followUp = v.object({
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
  avgWeeklyAttendance: v.union(v.number(), v.null()),
  avgWeeklyAttendancePrev: v.union(v.number(), v.null()),
  weeklyChangePct: v.union(v.number(), v.null()),
  eventsHeld: v.number(),
  uniqueAttendees: v.number(),
  newcomers: v.number(),
  followUpCount: v.number(),
  weeklyConsistency: v.union(v.number(), v.null()),
  leaderShare: v.optional(v.union(v.number(), v.null())),
  homeCampusShare: v.optional(v.union(v.number(), v.null())),
});

export const metricsDataValidator = v.object({
  summary,
  attendanceByEvent: v.array(trendPoint),
  rollingAverage: v.array(trendPoint),
  weeklyTrend: v.array(trendPoint),
  uniqueByMonth: v.array(trendPoint),
  newVsReturning: v.array(splitPoint),
  leadersVsOthers: v.optional(v.array(compositionPoint)),
  campusMix: v.optional(v.array(compositionPoint)),
  followUps: v.array(followUp),
  breakdowns: v.array(breakdown),
  hasEnoughHistory: v.boolean(),
  hasWeeklyMeetings: v.boolean(),
});

const viewCard = v.object({
  label: v.string(),
  value: v.string(),
  delta: v.optional(
    v.object({
      text: v.string(),
      direction: v.union(v.literal("up"), v.literal("down"), v.literal("flat")),
    })
  ),
  hint: v.optional(v.string()),
  tone: v.optional(v.union(v.literal("default"), v.literal("positive"))),
  info: v.optional(v.object({ title: v.string(), body: v.string() })),
});

const legendItem = v.object({ key: v.string(), colour: v.string(), label: v.string() });

const segmentPoint = v.object({
  at: v.number(),
  label: v.string(),
  segments: v.array(v.object({ key: v.string(), value: v.number(), colour: v.string() })),
});

export const viewBlockValidator = v.union(
  v.object({ type: v.literal("updated"), computedAt: v.number() }),
  v.object({ type: v.literal("label"), text: v.string() }),
  v.object({ type: v.literal("heading"), text: v.string() }),
  v.object({ type: v.literal("caption"), text: v.string() }),
  v.object({
    type: v.literal("cards"),
    cards: v.array(viewCard),
    layout: v.optional(v.union(v.literal("row"), v.literal("grid"))),
  }),
  v.object({
    type: v.literal("stacked"),
    title: v.string(),
    subtitle: v.optional(v.string()),
    legend: v.array(legendItem),
    labels: v.object({ fresh: v.string(), returning: v.string() }),
    points: v.array(splitPoint),
  }),
  v.object({
    type: v.literal("multiBars"),
    title: v.string(),
    subtitle: v.optional(v.string()),
    legend: v.array(legendItem),
    points: v.array(segmentPoint),
    stacked: v.boolean(),
    axisMax: v.optional(v.number()),
    keepZeros: v.optional(v.boolean()),
  }),
  v.object({
    type: v.literal("bars"),
    title: v.string(),
    colour: v.union(v.literal("primary"), v.literal("success"), v.literal("accent")),
    points: v.array(trendPoint),
  }),
  v.object({
    type: v.literal("breakdown"),
    title: v.string(),
    rows: v.array(v.object({ label: v.string(), value: v.number() })),
  }),
  v.object({
    type: v.literal("followUps"),
    title: v.string(),
    people: v.array(followUp),
    total: v.number(),
    preview: v.number(),
    emptyText: v.string(),
  }),
  v.object({
    type: v.literal("empty"),
    icon: v.string(),
    title: v.string(),
    message: v.string(),
  })
);
