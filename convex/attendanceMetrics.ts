import { ConvexError, v } from "convex/values";
import {
  assignmentsOf,
  roleNeedsUniversity,
  staffYearStartMs,
} from "../shared/flow";
import {
  canonicalSubgroup,
  eventIncludesSubgroup,
  isOrgWideSubgroup,
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

/** How far back to load events for classification look-back (regulars, gaps). */
const HISTORY_WEEKS = 26;
/** Newest events *for the sub-group* kept per recompute (bounds the window). */
const MAX_EVENTS = 800;
/**
 * Raw events scanned (newest-first, all sub-groups) before filtering to one.
 * Sized well above a busy org's event count so a sparse sub-group's older
 * events aren't dropped just because other sub-groups filled the newest slots —
 * still bounded (event docs are small) so the transaction stays safe.
 */
const MAX_EVENT_SCAN = 4000;
/** Hard cap on distinct people resolved (names/photos) per recompute. */
const MAX_PERSONS = 1200;
/**
 * Events whose attendance is read per gather transaction. The recompute action
 * pages through events in chunks of this size so no single Convex read
 * transaction loads more than ~this many events' worth of attendance rows,
 * keeping each transaction well under the read/document limits even for a
 * busy org-wide (SOW) recompute.
 */
const ATTENDANCE_CHUNK = 100;

/** Convex validator mirroring shared `MetricsEvent`. */
const metricsEventValidator = v.object({
  id: v.string(),
  name: v.string(),
  dateStart: v.number(),
  subgroups: v.array(v.string()),
  collaborative: v.boolean(),
  isWeeklyMeeting: v.boolean(),
});

/** Convex validator mirroring shared `MetricsPerson`. */
const metricsPersonValidator = v.object({
  key: v.string(),
  name: v.string(),
  kind: v.union(v.literal("staff"), v.literal("member")),
  subtitle: v.optional(v.string()),
  photo: v.optional(v.union(v.string(), v.null())),
  breakdown: v.optional(v.record(v.string(), v.string())),
  isStudentLeader: v.optional(v.boolean()),
  campuses: v.optional(v.array(v.string())),
});

/**
 * Every range we precompute — the UI presets. The whole-staff-year range is
 * excluded for now (short trailing windows only); re-add STAFF_YEAR_RANGE here
 * and in the UI options to bring it back.
 */
const ALL_RANGES = [...RANGE_WEEKS] as const;
/** Collaborative-event variants precomputed so the UI toggle reads a snapshot. */
const COLLAB_VARIANTS = [true, false] as const;

const STAFF_PREFIX = "staff:";
const MEMBER_PREFIX = "member:";

/** Drop `undefined` fields so the object is a valid Convex value to store. */
const sanitize = (data: SubgroupMetricsData): SubgroupMetricsData =>
  JSON.parse(JSON.stringify(data));

/**
 * Flag sub-groups as needing a recompute after a roll-call / event change.
 * Cheap: one small, de-duped upsert per sub-group and NO recompute here — the
 * short-interval {@link recomputeDirty} cron drains these, so the dashboard
 * tracks attendance within minutes instead of waiting for the weekly cron. SOW
 * is always included, since its org-wide aggregate reflects every event.
 */
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
    // `.first()`, never `.unique()`: the by_subgroup index isn't a uniqueness
    // constraint and this runs inside roll-call writes, so a rare duplicate row
    // must not throw and break a sign-in. Bump `since` to now on an existing row
    // so a change landing mid-recompute isn't cleared by the worker's ack — the
    // ack only deletes flags dirtied at/before its start (see clearDirty).
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

/**
 * Bounded event gather for one sub-group: scan the newest events since
 * `loadStart`, filter to the sub-group, resolve which are Weekly Meetings, and
 * return the (bounded) `MetricsEvent[]` plus their ids. One transaction — reads
 * at most MAX_EVENT_SCAN event docs, well under Convex's limits.
 */
export const gatherEvents = internalQuery({
  args: { subgroup: v.string(), loadStart: v.number() },
  returns: v.object({
    eventIds: v.array(v.id("events")),
    metricsEvents: v.array(metricsEventValidator),
  }),
  handler: async (ctx, { subgroup, loadStart }) => {
    const canonical = canonicalSubgroup(subgroup);
    // Scan the newest MAX_EVENT_SCAN events since loadStart, THEN filter to this
    // sub-group and keep its newest MAX_EVENTS — so a sub-group that meets
    // rarely among many busier ones still gets its own older events, rather than
    // being crowded out of a small newest-N raw window.
    const scanned = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) => q.gte("dateStart", loadStart))
      .order("desc")
      .take(MAX_EVENT_SCAN);
    const events = scanned
      .filter((e) => eventIncludesSubgroup(e.subgroups, canonical))
      .slice(0, MAX_EVENTS);

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
    return { eventIds: events.map((e) => e._id), metricsEvents };
  },
});

/**
 * Attendance for a bounded chunk of events, keyed by the shared identity key.
 * The recompute action calls this once per {@link ATTENDANCE_CHUNK}-sized page
 * so each transaction reads only that chunk's attendance rows — the fix for
 * loading every event's attendance in one mutation.
 */
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

/** Resolve display info for the (bounded) set of people who attended. */
export const gatherPersons = internalQuery({
  args: { keys: v.array(v.string()), year: v.number() },
  returns: v.array(metricsPersonValidator),
  handler: (ctx, { keys, year }) => resolvePersons(ctx, keys, year),
});

/**
 * Recompute + persist every range × collaborative-filter snapshot for one
 * sub-group. Runs as an ACTION (scheduled one per sub-group) so it can page the
 * potentially large attendance read across several bounded query transactions
 * instead of reading every event's attendance in a single mutation — which,
 * for the org-wide SOW group over a staff year, could exceed Convex's per-
 * transaction read limits and leave snapshots missing or stale.
 */
export const recomputeSubgroup = internalAction({
  args: { subgroup: v.string() },
  returns: v.null(),
  handler: async (ctx, { subgroup }) => {
    // Ack anchor: dirty flags dirtied at/before `startedAt` are cleared once
    // this succeeds; a change landing mid-recompute bumps `since` past it and is
    // reprocessed next cron (see clearDirty / markSubgroupsDirty).
    const startedAt = Date.now();
    const canonical = canonicalSubgroup(subgroup);
    const year = currentStaffYear();
    const now = startedAt;
    // Load from the EARLIER of the staff-year start and a rolling ~26-week
    // window (hence Math.min), so a single gather serves every range we compute:
    // the staff-year range needs events back to the year's start, while the
    // weekly ranges want a classification look-back (regulars/lapsed/re-engaged)
    // that can reach into the previous staff year early in a new one.
    const loadStart = Math.min(
      staffYearStartMs(year),
      now - HISTORY_WEEKS * WEEK_MS
    );

    const { eventIds, metricsEvents } = await ctx.runQuery(
      internal.attendanceMetrics.gatherEvents,
      { subgroup: canonical, loadStart }
    );

    // Page attendance in bounded chunks so no single read transaction loads more
    // than ATTENDANCE_CHUNK events' worth of rows.
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

    // Compute every range × collaborative-filter snapshot (pure, in-memory).
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

    // Persist, THEN ack the dirty flag — only now that the recompute succeeded,
    // so a failure keeps the retry signal for the next cron.
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

/** Resolve display info (name, subtitle, photo, breakdown fields) per person. */
async function resolvePersons(
  ctx: QueryCtx,
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

  // The Campus/Role metadata fields, so an attendance-only member's home
  // campus and student-leader tag resolve from their metadata (staff get both
  // from their profile). Metadata stores option IDs; map them to labels.
  const metadataFields = await ctx.db.query("attendanceMetadata").collect();
  const campusField = metadataFields.find((f) => f.key === CAMPUS_FIELD_KEY);
  const roleField = metadataFields.find((f) => f.key === ROLE_FIELD_KEY);
  const memberCampus = (
    metadata: Record<string, string> | undefined
  ): string | undefined => {
    const raw = campusField ? metadata?.[campusField._id] : undefined;
    if (!raw) return undefined;
    const label = campusField?.values?.[raw] ?? raw;
    // "Other" is a real option but not a campus — no home campus to compare.
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
      const profile = matchProfile(email);
      const roles = profile
        ? [...new Set(assignmentsOf(profile).map((a) => a.role))]
        : [];
      // Staff-ness follows the CURRENT staff year: someone with no profile this
      // year, or a profile that carries no assignment (no role), is treated as a
      // Member from this year on — even if they were staff previously.
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
      persons.push({
        key,
        kind: isStaff ? "staff" : "member",
        name: personDisplayName(profile?.name, email),
        subtitle: isStaff ? roles.join(" · ") || undefined : undefined,
        photo: user?.image ?? null,
        breakdown: isStaff
          ? buildBreakdown(roles[0], campuses[0])
          : buildBreakdown("Member", undefined),
        isStudentLeader: roles.some(roleNeedsUniversity),
        // Every campus the profile holds a campus role at is a home campus;
        // org-side staff have none and stay out of the campus-mix chart.
        campuses,
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

/**
 * Persist a batch of computed snapshots for one sub-group (from the recompute
 * action). Resilient upsert per (range, collaborative): the
 * `by_subgroup_and_range` index isn't a uniqueness constraint, so racing
 * recomputes (weekly cron + dirty cron + manual refresh) could leave duplicate
 * rows. Collect all matches, patch the first, delete any extras — never
 * `.unique()`, which would throw and break both recompute and later reads.
 */
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
        .withIndex("by_subgroup_and_range", (q) =>
          q
            .eq("subgroup", subgroup)
            .eq("rangeWeeks", snap.rangeWeeks)
            .eq("includeCollaborative", snap.includeCollaborative)
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

/**
 * Clear a sub-group's dirty flags once its recompute has succeeded — but only
 * those dirtied at/before `upTo` (the recompute's start). A change that landed
 * mid-recompute bumped `since` past `upTo` (see markSubgroupsDirty) and is left
 * in place so the next cron reprocesses it.
 */
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
 * Cron entry (short interval): recompute every sub-group flagged dirty by a
 * roll-call / event change since the last run, then clear the flags. Fans out
 * one bounded recompute per sub-group (like {@link recomputeAll}); the dirty set
 * is small (at most one row per sub-group), so this stays cheap between runs.
 */
export const recomputeDirty = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const dirty = await ctx.db.query("attendanceMetricsDirty").collect();
    // Dedupe by sub-group (a rare duplicate row must not fan out twice) and
    // leave the flags in place: each recompute clears its own once it succeeds
    // (see clearDirty), so a recompute that throws keeps its retry signal for
    // the next run instead of being silently dropped here.
    for (const subgroup of new Set(dirty.map((r) => r.subgroup))) {
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
    // Public (1.7.0): signed-out / non-staff callers get a limited campus preview
    // only — never the org-wide SOW view, and only the short 1–2 week ranges.
    // (The follow-up list, which names individuals, is stripped below.)
    const isPublic = !(await optionalProfile(ctx));
    if (isPublic && (isOrgWideSubgroup(subgroup) || rangeWeeks > 2)) return null;
    const rows = await ctx.db
      .query("attendanceMetricsSnapshots")
      .withIndex("by_subgroup_and_range", (q) =>
        q
          .eq("subgroup", canonicalSubgroup(subgroup))
          .eq("rangeWeeks", rangeWeeks)
          .eq("includeCollaborative", includeCollaborative)
      )
      .collect();
    if (rows.length === 0) return null;
    // Resilient to a rare duplicate row (the index isn't a uniqueness
    // constraint; see writeSnapshots): take the newest rather than `.unique()`,
    // which would throw and take down the Insights tab.
    const row = rows.reduce((a, b) => (b.computedAt > a.computedAt ? b : a));
    // Snapshots are keyed by (subgroup, range, collaborative) but not by staff
    // year, so a row computed before the Oct 1 rollover would otherwise linger
    // and show last year's aggregates until the next recompute. Treat a
    // stale-year snapshot as "not ready" (null) so the UI prompts a refresh
    // rather than presenting outdated numbers.
    if (row.staffYear !== currentStaffYear()) return null;
    // The follow-up list names individuals (a per-campus pastoral tool), so it
    // never leaves the server for a public caller — the preview UI hides it too.
    const data = isPublic ? { ...row.data, followUps: [] } : row.data;
    return {
      subgroup: row.subgroup,
      rangeWeeks: row.rangeWeeks,
      includeCollaborative: row.includeCollaborative,
      staffYear: row.staffYear,
      computedAt: row.computedAt,
      data,
    };
  },
});

/**
 * Average weekly-meeting attendance for every campus, for the org-wide (SOW)
 * view. Rather than re-deriving per-campus turnout from the org-wide snapshot's
 * events (which are only the SOW-tagged gatherings), this reads each campus's
 * OWN already-computed snapshot and pulls its `avgWeeklyAttendance` — so it's a
 * cheap fan-out over precomputed rows with no extra recompute. Campuses with no
 * snapshot, a stale prior-year one, or no weekly meetings in range are omitted.
 */
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

    // The per-campus snapshot reads are independent, so fan them out in parallel.
    const perCampus = await Promise.all(
      universities.map(async (uni) => {
        const rows = await ctx.db
          .query("attendanceMetricsSnapshots")
          .withIndex("by_subgroup_and_range", (q) =>
            q
              .eq("subgroup", canonicalSubgroup(uni.name))
              .eq("rangeWeeks", rangeWeeks)
              .eq("includeCollaborative", includeCollaborative)
          )
          .collect();
        if (rows.length === 0) return null;
        const row = rows.reduce((a, b) => (b.computedAt > a.computedAt ? b : a));
        if (row.staffYear !== year) return null;
        const avg = row.data.summary.avgWeeklyAttendance;
        return avg === null ? null : { campus: uni.name, avgWeekly: avg };
      })
    );
    return perCampus
      .filter((c): c is { campus: string; avgWeekly: number } => c !== null)
      .sort((a, b) => b.avgWeekly - a.avgWeekly);
  },
});

/**
 * Force a refresh now (campus leaders + admins). Schedules the same bounded
 * per-sub-group recompute the weekly cron uses, so the dashboard can be brought
 * up to date on demand without waiting for Thursday.
 *
 * Throttled to once per week per sub-group ({@link MANUAL_REFRESH_COOLDOWN_MS}):
 * the cron already keeps snapshots current, so this is a recovery path, not a
 * button to hammer. A group with no snapshot yet (or only a stale prior-year
 * one) can always be built.
 */
export const recomputeNow = mutation({
  args: { subgroup: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { subgroup }) => {
    await requireAttendanceManager(ctx);
    if (subgroup) {
      const canonical = canonicalSubgroup(subgroup);
      // The cooldown anchor is the NEWEST current-year snapshot for the group.
      // The rows are few (one per range × collaborative variant), so collect and
      // take the max `computedAt` rather than `.first()` — a stray/duplicate row
      // or a prior-year one then can't under-enforce the throttle. Only a
      // current-year snapshot gates it; a group with none, or only a stale
      // prior-year one, can always be (re)built (matching the UI's "not ready").
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
