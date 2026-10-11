import { v } from "convex/values";
import { viewBlockValidator } from "./metricsData";

// Validators for the campus weeklies view (shared/weeklyInsightsView.ts).

const pill = v.object({ label: v.string(), colour: v.string() });

const peopleRow = v.object({
  key: v.string(),
  name: v.string(),
  photo: v.optional(v.union(v.string(), v.null())),
  section: v.string(),
  tags: v.array(v.string()),
  category: pill,
  primary: v.string(),
  secondary: v.string(),
  warning: v.optional(v.string()),
  pct: v.number(),
  last: v.number(),
});

const followRow = v.object({
  key: v.string(),
  name: v.string(),
  photo: v.optional(v.union(v.string(), v.null())),
  category: pill,
  reason: v.string(),
  secondary: v.string(),
});

export const weeklyBlockValidator = v.union(
  ...viewBlockValidator.members,
  v.object({
    type: v.literal("people"),
    title: v.string(),
    subtitle: v.optional(v.string()),
    sections: v.array(v.object({ key: v.string(), label: v.string() })),
    filters: v.array(
      v.object({ key: v.string(), label: v.string(), colour: v.optional(v.string()) })
    ),
    sorts: v.array(
      v.object({
        key: v.union(v.literal("pct"), v.literal("name"), v.literal("last")),
        label: v.string(),
      })
    ),
    rows: v.array(peopleRow),
    emptyText: v.string(),
  }),
  v.object({
    type: v.literal("followUpGroups"),
    title: v.string(),
    icon: v.string(),
    groups: v.array(
      v.object({ key: v.string(), title: v.string(), people: v.array(followRow) })
    ),
    preview: v.number(),
    emptyText: v.string(),
  }),
  v.object({
    type: v.literal("memberHeader"),
    name: v.string(),
    photo: v.optional(v.union(v.string(), v.null())),
    lines: v.array(v.string()),
    category: v.optional(pill),
    reason: v.optional(v.string()),
    memberId: v.optional(v.union(v.string(), v.null())),
  }),
  v.object({
    type: v.literal("keyValues"),
    title: v.string(),
    rows: v.array(v.object({ label: v.string(), value: v.string() })),
  }),
  v.object({
    type: v.literal("termHistory"),
    title: v.string(),
    rows: v.array(
      v.object({ key: v.string(), label: v.string(), primary: v.string(), category: pill })
    ),
  }),
  v.object({
    type: v.literal("weekGrid"),
    title: v.string(),
    subtitle: v.optional(v.string()),
    weeks: v.array(v.object({ label: v.string(), came: v.boolean() })),
  }),
  v.object({
    type: v.literal("eventList"),
    title: v.string(),
    rows: v.array(
      v.object({ title: v.string(), subtitle: v.string(), tag: v.optional(v.string()) })
    ),
    emptyText: v.string(),
  })
);

/** The term and week a weekly was created with (see shared WeeklyMark). */
export const weeklyMarkValidator = v.object({
  year: v.number(),
  slot: v.number(),
  week: v.number(),
});

export const weeklySettingsFields = {
  regularShare: v.number(),
  termGapDays: v.number(),
  carryOverWeeklies: v.number(),
  followUpMisses: v.number(),
  newcomerMisses: v.number(),
  freshWeeklies: v.number(),
  newcomerPromoteWeeklies: v.number(),
  visitorMinWeeklies: v.number(),
  termCampuses: v.array(v.string()),
  jointWeeklies: v.optional(v.boolean()),
  staffRoles: v.array(v.string()),
  leaderRoles: v.array(v.string()),
};

export const termWeeklyValidator = v.object({
  eventId: v.id("events"),
  at: v.number(),
  week: v.number(),
  count: v.number(),
});

export const termFactsFields = {
  subgroup: v.string(),
  termKey: v.string(),
  label: v.string(),
  year: v.number(),
  slot: v.number(),
  system: v.union(v.literal("terms"), v.literal("semesters")),
  weeklies: v.array(termWeeklyValidator),
  // Person key → indexes into `weeklies`.
  attendance: v.array(v.object({ key: v.string(), indexes: v.array(v.number()) })),
};
