import { v } from "convex/values";
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
  isOrgWideSubgroup,
  normalizeSubgroups,
  personDisplayName,
  SOW_SUBGROUP,
  subgroupLabel,
} from "../shared/rollcall";
import { CAMPUS_FIELD_KEY } from "../shared/attendanceMemberMeta";
import {
  computeSubgroupMetrics,
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
import { isAssigned } from "./staffMembers";
import { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import { currentStaffYear, nightlyJobsPaused, optionalProfile } from "./model";
import { metricsDataValidator, viewBlockValidator } from "./metricsData";
import { readCampusWeeklyAverages } from "./weeklyInsights";
import { photoFor } from "./photo";
import {
  ATTENDANCE_RANGE_OPTIONS,
  buildAttendanceView,
} from "../shared/attendanceMetricsView";

const HISTORY_WEEKS = 52;
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

const requestedRanges = (raw?: number[]): number[] => {
  const wanted = raw?.length ? raw : [...ALL_RANGES];
  return ALL_RANGES.filter((rangeWeeks) => wanted.includes(rangeWeeks));
};

const MEMBER_PREFIX = "member:";

const sanitize = (data: SubgroupMetricsData): SubgroupMetricsData =>
  JSON.parse(JSON.stringify(data));

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

    const metricsEvents: MetricsEvent[] = events.map((e) => ({
      id: e._id,
      name: e.name,
      dateStart: e.dateStart,
      subgroups: e.subgroups,
      collaborative: normalizeSubgroups(e.subgroups).length > 1,
      isWeeklyMeeting: !!e.weekly,
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
        const key = `${MEMBER_PREFIX}${row.memberId}`;
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
  args: {
    subgroup: v.string(),
    staffYear: v.optional(v.number()),
    ranges: v.optional(v.array(v.number())),
  },
  returns: v.null(),
  handler: async (ctx, { subgroup, staffYear, ranges: rawRanges }) => {
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

    const ranges = requestedRanges(rawRanges);
    if (ranges.length === 0) return null;

    const snapshots = ranges.flatMap((rangeWeeks) => {
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
    return null;
  },
});

async function resolvePersons(
  ctx: QueryCtx,
  keys: string[],
  year: number
): Promise<MetricsPerson[]> {
  const years = [year - 2, year - 1, year];
  const profileByMemberYear = new Map<string, Doc<"staffProfiles">>();
  for (const y of years) {
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", y))
      .collect();
    for (const p of profiles) {
      if (p.memberId && isAssigned(p)) profileByMemberYear.set(`${p.memberId}:${y}`, p);
    }
  }
  const matchProfile = (
    memberId: string,
    y: number
  ): Doc<"staffProfiles"> | undefined => profileByMemberYear.get(`${memberId}:${y}`);

  const metadataFields = await ctx.db.query("attendanceMetadata").collect();
  const campusField = metadataFields.find((f) => f.key === CAMPUS_FIELD_KEY);
  const memberCampus = (
    metadata: Record<string, string> | undefined
  ): string | undefined => {
    const raw = campusField ? metadata?.[campusField._id] : undefined;
    if (!raw) return undefined;
    const label = campusField?.values?.[raw] ?? raw;
    return label && label !== "Other" ? label : undefined;
  };
  const persons: MetricsPerson[] = [];
  for (const key of keys) {
    if (!key.startsWith(MEMBER_PREFIX)) continue;
    const memberKey = key.slice(MEMBER_PREFIX.length);
    const id = ctx.db.normalizeId("attendanceMembers", memberKey);
    const member = id ? await ctx.db.get(id) : null;
    const latest = [...years].reverse().map((y) => matchProfile(memberKey, y)).find(Boolean);
    if (!latest) {
      const campus = memberCampus(member?.metadata);
      persons.push({
        key,
        kind: "member",
        name: member?.name ?? "Unknown",
        photo: null,
        breakdown: buildBreakdown("Member", undefined),
        // Leaders are leaders through their staff profile, never a Role
        // saved on a member.
        isStudentLeader: false,
        campuses: campus ? [campus] : undefined,
      });
      continue;
    }
    const profile = matchProfile(memberKey, year);
    const roles = profile ? [...new Set(assignmentsOf(profile).map((a) => a.role))] : [];
    const campuses = profile ? campusesOf(profile) : [];
    const user = latest.userId ? await ctx.db.get(latest.userId) : null;
    const breakdownByYear: Record<string, Record<string, string>> = {};
    const leaderByYear: Record<string, boolean> = {};
    const campusesByYear: Record<string, string[]> = {};
    for (const y of years) {
      const yearProfile = matchProfile(memberKey, y);
      const yearRoles = yearProfile
        ? [...new Set(assignmentsOf(yearProfile).map((a) => a.role))]
        : [];
      const yearCampuses = yearProfile ? campusesOf(yearProfile) : [];
      breakdownByYear[String(y)] = yearProfile
        ? buildBreakdown(yearRoles[0], yearCampuses[0])
        : buildBreakdown("Member", undefined);
      leaderByYear[String(y)] = yearRoles.some(roleNeedsUniversity);
      campusesByYear[String(y)] = yearCampuses;
    }
    persons.push({
      key,
      kind: profile ? "staff" : "member",
      name: personDisplayName(latest.name ?? member?.name, latest.email),
      subtitle: profile ? roles.join(" · ") || undefined : undefined,
      photo: await photoFor(ctx, user, latest.email),
      breakdown: profile
        ? buildBreakdown(roles[0], campuses[0])
        : buildBreakdown("Member", undefined),
      breakdownByYear,
      isStudentLeader: roles.some(roleNeedsUniversity),
      leaderByYear,
      campuses,
      campusesByYear,
    });
  }
  return persons;
}

function campusesOf(profile: Doc<"staffProfiles">): string[] {
  return [
    ...new Set(
      assignmentsOf(profile).flatMap((a) =>
        a.university && roleNeedsUniversity(a.role) ? [a.university] : []
      )
    ),
  ];
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

function metricsYears(): number[] {
  const years = [currentStaffYear()];
  if (withinPrefillWindow()) {
    const incoming = incomingStaffYear();
    if (!years.includes(incoming)) years.push(incoming);
  }
  return years;
}

export const recomputeAll = internalMutation({
  args: { staffYear: v.optional(v.number()), nightly: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.nightly && nightlyJobsPaused()) return null;
    // Only the org-wide SOW view uses these Snapshots now; each campus's view
    // is built from its weekly meetings by weeklyInsights.rebuildAll.
    const years = args.staffYear ? [args.staffYear] : metricsYears();
    for (const year of years) {
      const universities = await ctx.db
        .query("universities")
        .withIndex("by_year_and_name", (q) => q.eq("year", year))
        .take(100);
      for (const subgroup of [SOW_SUBGROUP, ...universities.map((u) => u.name)]) {
        await ctx.scheduler.runAfter(0, internal.attendanceMetrics.recomputeSubgroup, {
          subgroup,
          staffYear: year,
        });
      }
    }
    await ctx.scheduler.runAfter(
      0,
      internal.generalMetrics.recomputeCampusWeeklyAttendance,
      {}
    );
    await ctx.scheduler.runAfter(0, internal.generalMetrics.recomputeStaffTrends, {});
    await ctx.scheduler.runAfter(0, internal.rosterHistory.rebuild, {});
    await ctx.scheduler.runAfter(0, internal.memberPairSuggestions.rebuild, {});
    return null;
  },
});

async function newestSnapshot(
  ctx: QueryCtx,
  subgroup: string,
  rangeWeeks: number,
  includeCollaborative: boolean,
  staffYear: number
): Promise<Doc<"attendanceMetricsSnapshots"> | null> {
  const rows = await ctx.db
    .query("attendanceMetricsSnapshots")
    .withIndex("by_subgroup_range_year", (q) =>
      q
        .eq("subgroup", canonicalSubgroup(subgroup))
        .eq("rangeWeeks", rangeWeeks)
        .eq("includeCollaborative", includeCollaborative)
        .eq("staffYear", staffYear)
    )
    .collect();
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => (b.computedAt > a.computedAt ? b : a));
}

export const view = query({
  args: {
    subgroup: v.string(),
    rangeWeeks: v.number(),
    includeCollaborative: v.optional(v.boolean()),
  },
  returns: v.union(v.null(), v.object({ blocks: v.array(viewBlockValidator) })),
  handler: async (ctx, { subgroup, rangeWeeks, includeCollaborative = true }) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const orgWide = isOrgWideSubgroup(subgroup);
    const [snapshot, campusWeekly] = await Promise.all([
      newestSnapshot(ctx, subgroup, rangeWeeks, includeCollaborative, currentStaffYear()),
      orgWide
        ? readCampusWeeklyAverages(ctx, caller.year, rangeWeeks, includeCollaborative)
        : Promise.resolve([]),
    ]);
    return { blocks: buildAttendanceView({ snapshot, orgWide, campusWeekly }) };
  },
});

export const rangeOptions = query({
  args: {},
  returns: v.array(
    v.object({ weeks: v.number(), label: v.string(), isDefault: v.optional(v.boolean()) })
  ),
  handler: async () => ATTENDANCE_RANGE_OPTIONS.map((o) => ({ ...o })),
});

export { METRICS_THRESHOLDS };
