import { ConvexError, v } from "convex/values";
import {
  assignmentsOf,
  incomingStaffYear,
  roleNeedsUniversity,
  staffYearStartMs,
  withinPrefillWindow,
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
  CAMPUS_FIELD_KEY,
  ROLE_FIELD_KEY,
  roleFilterMatches,
  STUDENT_LEADER_ROLE_FILTER_LABEL,
} from "../shared/attendanceMemberMeta";
import {
  computeSubgroupMetrics,
  DAY_MS,
  MANUAL_REFRESH_COOLDOWN_MS,
  METRICS_THRESHOLDS,
  RANGE_WEEKS,
  rangeStartFor,
  WEEK_MS,
  type MetricsAttendance,
  type MetricsEvent,
  type MetricsPerson,
  type SubgroupMetricsData,
} from "../shared/attendanceMetrics";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { currentStaffYear, optionalProfile, requireAttendanceManager } from "./model";
import { metricsDataValidator } from "./metricsData";

const LIVE_RANGE_MAX_MS = 2 * 365 * DAY_MS;

const HISTORY_WEEKS = 110;
const MAX_EVENTS = 800;
const MAX_EVENT_SCAN = 4000;
const MAX_PERSONS = 1200;
const ATTENDANCE_CHUNK = 100;

const metricsEventValidator = v.object({
  id: v.string(),
  name: v.string(),
  dateStart: v.number(),
  subgroups: v.array(v.string()),
  collaborative: v.boolean(),
  isWeeklyMeeting: v.boolean(),
});

const metricsPersonValidator = v.object({
  key: v.string(),
  name: v.string(),
  kind: v.union(v.literal("staff"), v.literal("member")),
  subtitle: v.optional(v.string()),
  photo: v.optional(v.union(v.string(), v.null())),
  breakdown: v.optional(v.record(v.string(), v.string())),
  breakdownByYear: v.optional(
    v.record(v.string(), v.record(v.string(), v.string()))
  ),
  isStudentLeader: v.optional(v.boolean()),
  leaderByYear: v.optional(v.record(v.string(), v.boolean())),
  campuses: v.optional(v.array(v.string())),
  campusesByYear: v.optional(v.record(v.string(), v.array(v.string()))),
});

const ALL_RANGES = [...RANGE_WEEKS] as const;
const COLLAB_VARIANTS = [true, false] as const;

const STAFF_PREFIX = "staff:";
const MEMBER_PREFIX = "member:";

const sanitize = (data: SubgroupMetricsData): SubgroupMetricsData =>
  JSON.parse(JSON.stringify(data));

export async function markSubgroupsDirty(
  ctx: MutationCtx,
  subgroups: string[]
): Promise<void> {
  const now = Date.now();
  const seen = new Set<string>();
  for (const raw of [...subgroups, SOW_SUBGROUP]) {
    const subgroup = canonicalSubgroup(raw);
    if (seen.has(subgroup)) continue;
    seen.add(subgroup);
    const existing = await ctx.db
      .query("attendanceMetricsDirty")
      .withIndex("by_subgroup", (q) => q.eq("subgroup", subgroup))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { since: now });
    } else {
      await ctx.db.insert("attendanceMetricsDirty", { subgroup, since: now });
    }
  }
}

export const gatherEvents = internalQuery({
  args: {
    subgroup: v.string(),
    loadStart: v.number(),
    loadEnd: v.number(),
  },
  returns: v.object({
    eventIds: v.array(v.id("events")),
    metricsEvents: v.array(metricsEventValidator),
  }),
  handler: async (ctx, { subgroup, loadStart, loadEnd }) => {
    const canonical = canonicalSubgroup(subgroup);
    const scanned = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) =>
        q.gte("dateStart", loadStart).lte("dateStart", loadEnd)
      )
      .order("desc")
      .take(MAX_EVENT_SCAN);
    const events = scanned
      .filter((e) => eventIncludesSubgroup(e.subgroups, canonical))
      .slice(0, MAX_EVENTS);

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
    return { eventIds: events.map((e) => e._id), metricsEvents };
  },
});

export const gatherAttendanceChunk = internalQuery({
  args: { eventIds: v.array(v.id("events")) },
  returns: v.array(
    v.object({
      eventId: v.string(),
      personKey: v.string(),
      signInTime: v.number(),
    })
  ),
  handler: async (ctx, { eventIds }) => {
    const perEvent = await Promise.all(
      eventIds.map((id) =>
        ctx.db
          .query("attendance")
          .withIndex("by_event", (q) => q.eq("eventId", id))
          .collect()
      )
    );
    const out: MetricsAttendance[] = [];
    eventIds.forEach((id, i) => {
      for (const row of perEvent[i]) {
        const key = personKey(row);
        if (!key) continue;
        out.push({ eventId: id, personKey: key, signInTime: row.signInTime });
      }
    });
    return out;
  },
});

export const gatherPersons = internalQuery({
  args: { keys: v.array(v.string()), year: v.number() },
  returns: v.array(metricsPersonValidator),
  handler: (ctx, { keys, year }) => resolvePersons(ctx, keys, year),
});

export const recomputeSubgroup = internalAction({
  args: { subgroup: v.string(), staffYear: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { subgroup, staffYear }) => {
    const startedAt = Date.now();
    const canonical = canonicalSubgroup(subgroup);
    const year = staffYear ?? currentStaffYear();
    const now = startedAt;
    const loadStart = Math.min(
      staffYearStartMs(year),
      now - HISTORY_WEEKS * WEEK_MS
    );

    const { eventIds, metricsEvents } = await ctx.runQuery(
      internal.attendanceMetrics.gatherEvents,
      { subgroup: canonical, loadStart, loadEnd: now }
    );

    const attendance: MetricsAttendance[] = [];
    const uniqueKeys = new Set<string>();
    for (let i = 0; i < eventIds.length; i += ATTENDANCE_CHUNK) {
      const rows = await ctx.runQuery(
        internal.attendanceMetrics.gatherAttendanceChunk,
        { eventIds: eventIds.slice(i, i + ATTENDANCE_CHUNK) }
      );
      for (const row of rows) {
        attendance.push(row);
        uniqueKeys.add(row.personKey);
      }
    }

    const persons = await ctx.runQuery(internal.attendanceMetrics.gatherPersons, {
      keys: [...uniqueKeys].slice(0, MAX_PERSONS),
      year,
    });

    const snapshots = ALL_RANGES.flatMap((rangeWeeks) => {
      const rangeStartMs = rangeStartFor(now, rangeWeeks, staffYearStartMs(year));
      return COLLAB_VARIANTS.map((includeCollaborative) => ({
        rangeWeeks,
        includeCollaborative,
        data: sanitize(
          computeSubgroupMetrics({
            now,
            subgroup: canonical,
            rangeStartMs,
            historyStartMs: loadStart,
            events: metricsEvents,
            attendance,
            persons,
            includeCollaborative,
          })
        ),
      }));
    });

    await ctx.runMutation(internal.attendanceMetrics.writeSnapshots, {
      subgroup: canonical,
      staffYear: year,
      computedAt: now,
      snapshots,
    });
    await ctx.runMutation(internal.attendanceMetrics.clearDirty, {
      subgroup: canonical,
      upTo: startedAt,
    });
    return null;
  },
});

async function resolvePersons(
  ctx: QueryCtx,
  keys: string[],
  year: number
): Promise<MetricsPerson[]> {
  const years = [year - 2, year - 1, year];
  const profilesByYear = new Map<number, Map<string, Doc<"staffProfiles">>>();
  for (const y of years) {
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", y))
      .collect();
    profilesByYear.set(
      y,
      new Map(profiles.map((p) => [p.email.toLowerCase(), p]))
    );
  }
  const matchProfile = (
    email: string,
    y: number
  ): Doc<"staffProfiles"> | undefined => {
    const profileByEmail = profilesByYear.get(y);
    if (!profileByEmail) return undefined;
    for (const candidate of staffEmailCandidates(email)) {
      const hit = profileByEmail.get(candidate);
      if (hit) return hit;
    }
    return undefined;
  };

  const metadataFields = await ctx.db.query("attendanceMetadata").collect();
  const campusField = metadataFields.find((f) => f.key === CAMPUS_FIELD_KEY);
  const roleField = metadataFields.find((f) => f.key === ROLE_FIELD_KEY);
  const memberCampus = (
    metadata: Record<string, string> | undefined
  ): string | undefined => {
    const raw = campusField ? metadata?.[campusField._id] : undefined;
    if (!raw) return undefined;
    const label = campusField?.values?.[raw] ?? raw;
    return label && label !== "Other" ? label : undefined;
  };
  const memberRoleLabel = (
    metadata: Record<string, string> | undefined
  ): string | undefined => {
    const raw = roleField ? metadata?.[roleField._id] : undefined;
    if (!raw) return undefined;
    return roleField?.values?.[raw] ?? raw;
  };

  const persons: MetricsPerson[] = [];
  for (const key of keys) {
    if (key.startsWith(STAFF_PREFIX)) {
      const email = key.slice(STAFF_PREFIX.length);
      const profile = matchProfile(email, year);
      const roles = profile
        ? [...new Set(assignmentsOf(profile).map((a) => a.role))]
        : [];
      const isStaff = !!profile && assignmentsOf(profile).length > 0;
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
      const breakdownByYear: Record<string, Record<string, string>> = {};
      const leaderByYear: Record<string, boolean> = {};
      const campusesByYear: Record<string, string[]> = {};
      for (const y of years) {
        const yearProfile = matchProfile(email, y);
        const yearRoles = yearProfile
          ? [...new Set(assignmentsOf(yearProfile).map((a) => a.role))]
          : [];
        const yearIsStaff =
          !!yearProfile && assignmentsOf(yearProfile).length > 0;
        const yearCampuses = yearProfile
          ? [
              ...new Set(
                assignmentsOf(yearProfile).flatMap((a) =>
                  a.university && roleNeedsUniversity(a.role) ? [a.university] : []
                )
              ),
            ]
          : [];
        breakdownByYear[String(y)] = yearIsStaff
          ? buildBreakdown(yearRoles[0], yearCampuses[0])
          : buildBreakdown("Member", undefined);
        leaderByYear[String(y)] = yearRoles.some(roleNeedsUniversity);
        campusesByYear[String(y)] = yearCampuses;
      }
      persons.push({
        key,
        kind: isStaff ? "staff" : "member",
        name: personDisplayName(profile?.name, email),
        subtitle: isStaff ? roles.join(" · ") || undefined : undefined,
        photo: user?.image ?? null,
        breakdown: isStaff
          ? buildBreakdown(roles[0], campuses[0])
          : buildBreakdown("Member", undefined),
        breakdownByYear,
        isStudentLeader: roles.some(roleNeedsUniversity),
        leaderByYear,
        campuses,
        campusesByYear,
      });
    } else if (key.startsWith(MEMBER_PREFIX)) {
      const id = ctx.db.normalizeId("attendanceMembers", key.slice(MEMBER_PREFIX.length));
      const member = id ? await ctx.db.get(id) : null;
      const campus = memberCampus(member?.metadata);
      persons.push({
        key,
        kind: "member",
        name: member?.name ?? "Unknown",
        photo: null,
        breakdown: buildBreakdown("Member", undefined),
        isStudentLeader: roleFilterMatches(
          STUDENT_LEADER_ROLE_FILTER_LABEL,
          [],
          memberRoleLabel(member?.metadata) ?? null
        ),
        campuses: campus ? [campus] : undefined,
      });
    }
  }
  return persons;
}

function buildBreakdown(
  role: string | undefined,
  campus: string | undefined
): Record<string, string> {
  const breakdown: Record<string, string> = {};
  if (role) breakdown.Role = role;
  if (campus) breakdown.Campus = subgroupLabel(campus);
  return breakdown;
}

export const writeSnapshots = internalMutation({
  args: {
    subgroup: v.string(),
    staffYear: v.number(),
    computedAt: v.number(),
    snapshots: v.array(
      v.object({
        rangeWeeks: v.number(),
        includeCollaborative: v.boolean(),
        data: metricsDataValidator,
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, { subgroup, staffYear, computedAt, snapshots }) => {
    for (const snap of snapshots) {
      const matches = await ctx.db
        .query("attendanceMetricsSnapshots")
        .withIndex("by_subgroup_range_year", (q) =>
          q
            .eq("subgroup", subgroup)
            .eq("rangeWeeks", snap.rangeWeeks)
            .eq("includeCollaborative", snap.includeCollaborative)
            .eq("staffYear", staffYear)
        )
        .collect();
      const doc = {
        subgroup,
        rangeWeeks: snap.rangeWeeks,
        includeCollaborative: snap.includeCollaborative,
        staffYear,
        computedAt,
        data: snap.data,
      };
      if (matches.length === 0) {
        await ctx.db.insert("attendanceMetricsSnapshots", doc);
      } else {
        await ctx.db.patch(matches[0]._id, doc);
        for (const extra of matches.slice(1)) await ctx.db.delete(extra._id);
      }
    }
    return null;
  },
});

export const clearDirty = internalMutation({
  args: { subgroup: v.string(), upTo: v.number() },
  returns: v.null(),
  handler: async (ctx, { subgroup, upTo }) => {
    const rows = await ctx.db
      .query("attendanceMetricsDirty")
      .withIndex("by_subgroup", (q) => q.eq("subgroup", subgroup))
      .collect();
    for (const row of rows) if (row.since <= upTo) await ctx.db.delete(row._id);
    return null;
  },
});

export const recomputeAll = internalMutation({
  args: { staffYear: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const year = args.staffYear ?? currentStaffYear();
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .collect();
    const subgroups = [SOW_SUBGROUP, ...universities.map((u) => u.name)];
    for (const subgroup of subgroups) {
      await ctx.scheduler.runAfter(0, internal.attendanceMetrics.recomputeSubgroup, {
        subgroup,
        staffYear: year,
      });
    }
    return null;
  },
});

export const recomputeDirty = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const dirty = await ctx.db.query("attendanceMetricsDirty").collect();
    const targets = new Set(dirty.map((r) => r.subgroup));

    const years = [currentStaffYear()];
    if (withinPrefillWindow()) {
      const incoming = incomingStaffYear();
      if (!years.includes(incoming)) years.push(incoming);
    }

    const snapshots = await ctx.db.query("attendanceMetricsSnapshots").collect();
    for (const year of years) {
      const universities = await ctx.db
        .query("universities")
        .withIndex("by_year_and_name", (q) => q.eq("year", year))
        .collect();
      const expected = [SOW_SUBGROUP, ...universities.map((u) => u.name)].map(
        canonicalSubgroup
      );
      const yearReady = new Set<string>();
      for (const row of snapshots) {
        if (row.staffYear === year) {
          yearReady.add(
            `${row.subgroup}\0${row.rangeWeeks}\0${row.includeCollaborative}`
          );
        }
      }
      for (const subgroup of expected) {
        const complete = ALL_RANGES.every((rangeWeeks) =>
          COLLAB_VARIANTS.every((includeCollaborative) =>
            yearReady.has(`${subgroup}\0${rangeWeeks}\0${includeCollaborative}`)
          )
        );
        if (!complete) targets.add(subgroup);
      }
    }

    for (const subgroup of targets) {
      for (const year of years) {
        await ctx.scheduler.runAfter(
          0,
          internal.attendanceMetrics.recomputeSubgroup,
          { subgroup, staffYear: year }
        );
      }
    }
    return null;
  },
});

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
    const year = currentStaffYear();
    const rows = await ctx.db
      .query("attendanceMetricsSnapshots")
      .withIndex("by_subgroup_range_year", (q) =>
        q
          .eq("subgroup", canonicalSubgroup(subgroup))
          .eq("rangeWeeks", rangeWeeks)
          .eq("includeCollaborative", includeCollaborative)
          .eq("staffYear", year)
      )
      .collect();
    if (rows.length === 0) return null;
    const row = rows.reduce((a, b) => (b.computedAt > a.computedAt ? b : a));
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

export const canReadMetrics = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => !!(await optionalProfile(ctx)),
});

export const liveSnapshot = action({
  args: {
    subgroup: v.string(),
    rangeStartMs: v.number(),
    rangeEndMs: v.number(),
    includeCollaborative: v.boolean(),
  },
  returns: v.union(
    v.null(),
    v.object({
      computedAt: v.number(),
      data: metricsDataValidator,
    })
  ),
  handler: async (ctx, { subgroup, rangeStartMs, rangeEndMs, includeCollaborative }) => {
    const allowed = await ctx.runQuery(internal.attendanceMetrics.canReadMetrics, {});
    if (!allowed) return null;

    if (
      !Number.isFinite(rangeStartMs) ||
      !Number.isFinite(rangeEndMs) ||
      rangeEndMs <= rangeStartMs
    ) {
      throw new ConvexError("Custom range needs a start before the end.");
    }
    if (rangeEndMs - rangeStartMs > LIVE_RANGE_MAX_MS) {
      throw new ConvexError("Custom range can't be longer than two years.");
    }

    const canonical = canonicalSubgroup(subgroup);
    const year = currentStaffYear();
    const now = rangeEndMs;
    const periodLen = rangeEndMs - rangeStartMs;
    const loadStart = Math.min(
      rangeStartMs - periodLen,
      now - HISTORY_WEEKS * WEEK_MS
    );

    const { eventIds, metricsEvents } = await ctx.runQuery(
      internal.attendanceMetrics.gatherEvents,
      { subgroup: canonical, loadStart, loadEnd: now }
    );

    const attendance: MetricsAttendance[] = [];
    const uniqueKeys = new Set<string>();
    for (let i = 0; i < eventIds.length; i += ATTENDANCE_CHUNK) {
      const rows = await ctx.runQuery(
        internal.attendanceMetrics.gatherAttendanceChunk,
        { eventIds: eventIds.slice(i, i + ATTENDANCE_CHUNK) }
      );
      for (const row of rows) {
        attendance.push(row);
        uniqueKeys.add(row.personKey);
      }
    }

    const persons = await ctx.runQuery(internal.attendanceMetrics.gatherPersons, {
      keys: [...uniqueKeys].slice(0, MAX_PERSONS),
      year,
    });

    const data = sanitize(
      computeSubgroupMetrics({
        now,
        subgroup: canonical,
        rangeStartMs,
        historyStartMs: loadStart,
        events: metricsEvents,
        attendance,
        persons,
        includeCollaborative,
      })
    );

    return { computedAt: Date.now(), data };
  },
});

export const campusWeeklyAverages = query({
  args: {
    rangeWeeks: v.number(),
    includeCollaborative: v.optional(v.boolean()),
  },
  returns: v.union(
    v.null(),
    v.array(v.object({ campus: v.string(), avgWeekly: v.number() }))
  ),
  handler: async (ctx, { rangeWeeks, includeCollaborative = true }) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const { year } = caller;
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .collect();

    const perCampus = await Promise.all(
      universities.map(async (uni) => {
        const rows = await ctx.db
          .query("attendanceMetricsSnapshots")
          .withIndex("by_subgroup_range_year", (q) =>
            q
              .eq("subgroup", canonicalSubgroup(uni.name))
              .eq("rangeWeeks", rangeWeeks)
              .eq("includeCollaborative", includeCollaborative)
              .eq("staffYear", year)
          )
          .collect();
        if (rows.length === 0) return null;
        const row = rows.reduce((a, b) => (b.computedAt > a.computedAt ? b : a));
        const avg = row.data.summary.avgWeeklyAttendance;
        return avg === null ? null : { campus: uni.name, avgWeekly: avg };
      })
    );
    return perCampus
      .filter((c): c is { campus: string; avgWeekly: number } => c !== null)
      .sort((a, b) => b.avgWeekly - a.avgWeekly);
  },
});

export const recomputeNow = mutation({
  args: { subgroup: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { subgroup }) => {
    await requireAttendanceManager(ctx);
    if (subgroup) {
      const canonical = canonicalSubgroup(subgroup);
      const rows = await ctx.db
        .query("attendanceMetricsSnapshots")
        .withIndex("by_subgroup_and_range", (q) => q.eq("subgroup", canonical))
        .collect();
      const year = currentStaffYear();
      const latestComputedAt = rows
        .filter((r) => r.staffYear === year)
        .reduce((max, r) => (r.computedAt > max ? r.computedAt : max), 0);
      if (latestComputedAt > 0) {
        const elapsed = Date.now() - latestComputedAt;
        if (elapsed < MANUAL_REFRESH_COOLDOWN_MS) {
          const days = Math.ceil((MANUAL_REFRESH_COOLDOWN_MS - elapsed) / DAY_MS);
          throw new ConvexError(
            `Insights for this group were refreshed recently. You can refresh again in ${days} day${days === 1 ? "" : "s"}.`
          );
        }
      }
      await ctx.scheduler.runAfter(0, internal.attendanceMetrics.recomputeSubgroup, {
        subgroup: canonical,
        staffYear: currentStaffYear(),
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.attendanceMetrics.recomputeAll, {});
    }
    return null;
  },
});

export { METRICS_THRESHOLDS };
