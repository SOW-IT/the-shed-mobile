import { v } from "convex/values";
import {
  assignmentsOf,
  roleNeedsUniversity,
  staffYearStartMs,
} from "../shared/flow";
import {
  canonicalSubgroup,
  eventIncludesSubgroup,
  normalizeSubgroups,
  personDisplayName,
  personKey,
  SOW_SUBGROUP,
  subgroupLabel,
  WEEKLY_MEETING_TAG_NAME,
} from "../shared/rollcall";
import { staffEmailCandidates } from "../shared/rollcallImport";
import {
  computeSubgroupMetrics,
  METRICS_THRESHOLDS,
  RANGE_WEEKS,
  rangeStartFor,
  STAFF_YEAR_RANGE,
  WEEK_MS,
  type MetricsAttendance,
  type MetricsEvent,
  type MetricsPerson,
  type SubgroupMetricsData,
} from "../shared/attendanceMetrics";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { currentStaffYear, optionalProfile, requireAttendanceManager } from "./model";
import { metricsDataValidator } from "./metricsData";

/** How far back to load events for classification look-back (regulars, gaps). */
const HISTORY_WEEKS = 26;
/** Hard cap on events scanned per sub-group so a recompute stays bounded. */
const MAX_EVENTS = 800;
/** Hard cap on distinct people resolved (names/photos) per recompute. */
const MAX_PERSONS = 1200;

/** Every range we precompute: the UI presets plus the whole staff year. */
const ALL_RANGES = [...RANGE_WEEKS, STAFF_YEAR_RANGE] as const;
/** Collaborative-event variants precomputed so the UI toggle reads a snapshot. */
const COLLAB_VARIANTS = [true, false] as const;

const STAFF_PREFIX = "staff:";
const MEMBER_PREFIX = "member:";

/** Drop `undefined` fields so the object is a valid Convex value to store. */
const sanitize = (data: SubgroupMetricsData): SubgroupMetricsData =>
  JSON.parse(JSON.stringify(data));

/**
 * Gather the bounded event/attendance/person inputs for one sub-group and
 * compute + upsert every range × collaborative-filter snapshot. Runs as its own
 * scheduled mutation (one per sub-group) so each stays within a transaction's
 * limits even for the org-wide SOW group.
 */
export const recomputeSubgroup = internalMutation({
  args: { subgroup: v.string() },
  returns: v.null(),
  handler: async (ctx, { subgroup }) => {
    const canonical = canonicalSubgroup(subgroup);
    const year = currentStaffYear();
    const now = Date.now();
    // Look back far enough to classify regulars/lapsed/re-engaged, but never
    // before the current staff year's start (also covers the staff-year range).
    const loadStart = Math.min(
      staffYearStartMs(year),
      now - HISTORY_WEEKS * WEEK_MS
    );

    const scanned = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) => q.gte("dateStart", loadStart))
      .order("desc")
      .take(MAX_EVENTS);
    const events = scanned.filter((e) =>
      eventIncludesSubgroup(e.subgroups, canonical)
    );

    // Resolve which events are Weekly Meetings — any tag named "Weekly Meeting"
    // (year-scoped in the catalogue, but the name is what marks the pattern).
    const tagIds = new Set<Id<"attendanceTags">>();
    for (const e of events) for (const id of e.tagIds ?? []) tagIds.add(id);
    const tagDocs = await Promise.all([...tagIds].map((id) => ctx.db.get(id)));
    const weeklyTagIds = new Set(
      tagDocs
        .filter((t): t is Doc<"attendanceTags"> => !!t && t.name === WEEKLY_MEETING_TAG_NAME)
        .map((t) => t._id as Id<"attendanceTags">)
    );

    const metricsEvents: MetricsEvent[] = events.map((e) => ({
      id: e._id,
      name: e.name,
      dateStart: e.dateStart,
      subgroups: e.subgroups,
      collaborative: normalizeSubgroups(e.subgroups).length > 1,
      isWeeklyMeeting: (e.tagIds ?? []).some((id) => weeklyTagIds.has(id)),
    }));

    // Attendance for those events, keyed by the shared identity key.
    const attendanceRows = await Promise.all(
      events.map((e) =>
        ctx.db
          .query("attendance")
          .withIndex("by_event", (q) => q.eq("eventId", e._id))
          .collect()
      )
    );
    const attendance: MetricsAttendance[] = [];
    const uniqueKeys = new Set<string>();
    events.forEach((e, i) => {
      for (const row of attendanceRows[i]) {
        const key = personKey(row);
        if (!key) continue;
        attendance.push({ eventId: e._id, personKey: key, signInTime: row.signInTime });
        uniqueKeys.add(key);
      }
    });

    const persons = await resolvePersons(ctx, [...uniqueKeys].slice(0, MAX_PERSONS), year);

    for (const rangeWeeks of ALL_RANGES) {
      const rangeStartMs = rangeStartFor(now, rangeWeeks, staffYearStartMs(year));
      for (const includeCollaborative of COLLAB_VARIANTS) {
        const data = computeSubgroupMetrics({
          now,
          subgroup: canonical,
          rangeStartMs,
          historyStartMs: loadStart,
          events: metricsEvents,
          attendance,
          persons,
          includeCollaborative,
        });
        await upsertSnapshot(ctx, {
          subgroup: canonical,
          rangeWeeks,
          includeCollaborative,
          staffYear: year,
          computedAt: now,
          data: sanitize(data),
        });
      }
    }
    return null;
  },
});

/** Resolve display info (name, subtitle, photo, breakdown fields) per person. */
async function resolvePersons(
  ctx: MutationCtx,
  keys: string[],
  year: number
): Promise<MetricsPerson[]> {
  // Load the year's staff profiles once so staff keys are a map lookup.
  const profiles = await ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", year))
    .collect();
  const profileByEmail = new Map(profiles.map((p) => [p.email.toLowerCase(), p]));
  const matchProfile = (email: string): Doc<"staffProfiles"> | undefined => {
    for (const candidate of staffEmailCandidates(email)) {
      const hit = profileByEmail.get(candidate);
      if (hit) return hit;
    }
    return undefined;
  };

  const persons: MetricsPerson[] = [];
  for (const key of keys) {
    if (key.startsWith(STAFF_PREFIX)) {
      const email = key.slice(STAFF_PREFIX.length);
      const profile = matchProfile(email);
      const roles = profile
        ? [...new Set(assignmentsOf(profile).map((a) => a.role))]
        : [];
      const campuses = profile
        ? [
            ...new Set(
              assignmentsOf(profile).flatMap((a) =>
                a.university && roleNeedsUniversity(a.role) ? [a.university] : []
              )
            ),
          ]
        : [];
      const user = profile?.userId ? await ctx.db.get(profile.userId) : null;
      persons.push({
        key,
        kind: "staff",
        name: personDisplayName(profile?.name, email),
        subtitle: roles.join(" · ") || undefined,
        photo: user?.image ?? null,
        breakdown: buildBreakdown(roles[0], campuses[0]),
      });
    } else if (key.startsWith(MEMBER_PREFIX)) {
      const id = ctx.db.normalizeId("attendanceMembers", key.slice(MEMBER_PREFIX.length));
      const member = id ? await ctx.db.get(id) : null;
      persons.push({
        key,
        kind: "member",
        name: member?.name ?? "Unknown",
        photo: null,
        breakdown: buildBreakdown("Member", undefined),
      });
    }
  }
  return persons;
}

/** The (bounded) breakdown fields we can derive cheaply without metadata reads. */
function buildBreakdown(
  role: string | undefined,
  campus: string | undefined
): Record<string, string> {
  const breakdown: Record<string, string> = {};
  if (role) breakdown.Role = role;
  if (campus) breakdown.Campus = subgroupLabel(campus);
  return breakdown;
}

async function upsertSnapshot(
  ctx: MutationCtx,
  doc: {
    subgroup: string;
    rangeWeeks: number;
    includeCollaborative: boolean;
    staffYear: number;
    computedAt: number;
    data: SubgroupMetricsData;
  }
): Promise<void> {
  const existing = await ctx.db
    .query("attendanceMetricsSnapshots")
    .withIndex("by_subgroup_and_range", (q) =>
      q
        .eq("subgroup", doc.subgroup)
        .eq("rangeWeeks", doc.rangeWeeks)
        .eq("includeCollaborative", doc.includeCollaborative)
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, doc);
  } else {
    await ctx.db.insert("attendanceMetricsSnapshots", doc);
  }
}

/**
 * Cron entry (weekly, Thursdays): fan out a recompute per sub-group so each
 * runs in its own bounded transaction. Also callable to force a full refresh.
 */
export const recomputeAll = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const year = currentStaffYear();
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .collect();
    const subgroups = [SOW_SUBGROUP, ...universities.map((u) => u.name)];
    for (const subgroup of subgroups) {
      await ctx.scheduler.runAfter(0, internal.attendanceMetrics.recomputeSubgroup, {
        subgroup,
      });
    }
    return null;
  },
});

/**
 * Read the precomputed snapshot for a sub-group + range. Returns null when the
 * dashboard hasn't been computed yet (the client then shows a "not ready"
 * state). Authorization is the same as the rest of Attendance: any provisioned
 * staff member of the current staff year.
 */
export const snapshot = query({
  args: {
    subgroup: v.string(),
    rangeWeeks: v.number(),
    includeCollaborative: v.optional(v.boolean()),
  },
  returns: v.union(
    v.null(),
    v.object({
      subgroup: v.string(),
      rangeWeeks: v.number(),
      includeCollaborative: v.boolean(),
      staffYear: v.number(),
      computedAt: v.number(),
      data: metricsDataValidator,
    })
  ),
  handler: async (ctx, { subgroup, rangeWeeks, includeCollaborative = true }) => {
    if (!(await optionalProfile(ctx))) return null;
    const row = await ctx.db
      .query("attendanceMetricsSnapshots")
      .withIndex("by_subgroup_and_range", (q) =>
        q
          .eq("subgroup", canonicalSubgroup(subgroup))
          .eq("rangeWeeks", rangeWeeks)
          .eq("includeCollaborative", includeCollaborative)
      )
      .unique();
    if (!row) return null;
    return {
      subgroup: row.subgroup,
      rangeWeeks: row.rangeWeeks,
      includeCollaborative: row.includeCollaborative,
      staffYear: row.staffYear,
      computedAt: row.computedAt,
      data: row.data,
    };
  },
});

/**
 * Force a refresh now (campus leaders + admins). Schedules the same bounded
 * per-sub-group recompute the weekly cron uses, so the dashboard can be brought
 * up to date on demand without waiting for Thursday.
 */
export const recomputeNow = mutation({
  args: { subgroup: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { subgroup }) => {
    await requireAttendanceManager(ctx);
    if (subgroup) {
      await ctx.scheduler.runAfter(0, internal.attendanceMetrics.recomputeSubgroup, {
        subgroup: canonicalSubgroup(subgroup),
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.attendanceMetrics.recomputeAll, {});
    }
    return null;
  },
});

// Re-exported so callers/tests can reference the shared thresholds through the
// backend module too.
export { METRICS_THRESHOLDS };
