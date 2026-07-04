import { v } from "convex/values";
import { query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { currentStaffYear } from "./model";
import { eventStaffYear, staffYearStartMs } from "../shared/flow";
import {
  isOrgWideSubgroup,
  normalizeSubgroups,
  WEEKLY_MEETING_TAG_NAME,
} from "../shared/rollcall";
import {
  roleFilterMatches,
  STAFF_ROLE_FILTER_LABEL,
  STUDENT_LEADER_ROLE_FILTER_LABEL,
  STUDENT_LEADER_ROLE_FILTER_ROLES,
} from "../shared/attendanceMemberMeta";

/**
 * Org-wide "General" insights, plotted one point per staff year (staff roles and
 * campus assignments are stored per year in `staffProfiles`, so the staff year
 * is the only meaningful time axis):
 *
 *  - `allStaff`      — every distinct person with a profile that year.
 *  - `staff` / `studentLeaders` — the same staff-vs-student-leader split the
 *    attendance Members filter uses (`roleFilterMatches`): a person is a student
 *    leader if they hold any university-scoped role, staff if they hold a
 *    non-university staff-profile role. A person can match both lenses (rare), so
 *    the two series aren't required to sum to `allStaff`.
 *  - `studentLeadersByCampus` — distinct student leaders per university, per year.
 *
 * Reads every `staffProfiles` row once (one row per person per year). The table
 * holds a single row per person-year, so this stays comfortably within a query's
 * read budget for a staff org's history.
 */
export const staffTrends = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      computedAt: v.number(),
      years: v.array(v.number()),
      allStaff: v.array(v.number()),
      staff: v.array(v.number()),
      studentLeaders: v.array(v.number()),
      campuses: v.array(v.string()),
      // One entry per campus; `counts` is aligned to `years` (0 where absent).
      studentLeadersByCampus: v.array(
        v.object({ campus: v.string(), counts: v.array(v.number()) })
      ),
    })
  ),
  handler: async (ctx) => {
    // Public (1.7.0): org-wide head-count trends are open to everyone — these are
    // aggregate counts per staff year, no individuals. The Insights General tab
    // shows a sign-in prompt for the fuller per-year breakdown, but the trend
    // charts themselves need no account.

    // Exclude the upcoming staff year: staff for next year are only partially
    // pre-assigned, so its counts are incomplete and would read as a misleading
    // dip on the trend. (The org chart surfaces next year explicitly; the trend
    // deliberately stops at the current year.)
    const currentYear = currentStaffYear();
    const profiles = (await ctx.db.query("staffProfiles").collect()).filter(
      (p) => p.year <= currentYear
    );

    // year -> tallies. campusByYear tracks distinct student-leader emails per
    // campus so a leader with two campus roles isn't double-counted.
    const totals = new Map<
      number,
      { all: number; staff: number; studentLeaders: number }
    >();
    const campusByYear = new Map<number, Map<string, Set<string>>>();
    const campusSet = new Set<string>();

    for (const profile of profiles) {
      const roles = (profile.assignments ?? []).map((a) => a.role);
      const tally =
        totals.get(profile.year) ?? { all: 0, staff: 0, studentLeaders: 0 };
      tally.all += 1;
      if (roleFilterMatches(STAFF_ROLE_FILTER_LABEL, roles)) tally.staff += 1;
      const isStudentLeader = roleFilterMatches(
        STUDENT_LEADER_ROLE_FILTER_LABEL,
        roles
      );
      if (isStudentLeader) tally.studentLeaders += 1;
      totals.set(profile.year, tally);

      if (isStudentLeader) {
        const campuses = new Set(
          (profile.assignments ?? [])
            .filter(
              (a) =>
                a.university &&
                STUDENT_LEADER_ROLE_FILTER_ROLES.includes(
                  a.role as (typeof STUDENT_LEADER_ROLE_FILTER_ROLES)[number]
                )
            )
            .map((a) => a.university as string)
        );
        let perCampus = campusByYear.get(profile.year);
        if (!perCampus) campusByYear.set(profile.year, (perCampus = new Map()));
        for (const campus of campuses) {
          campusSet.add(campus);
          (perCampus.get(campus) ?? setDefault(perCampus, campus)).add(
            profile.email
          );
        }
      }
    }

    // `years` is empty only when there are no staff profiles on record at all;
    // the caller (GeneralMetricsTab) renders a "no history yet" empty state then.
    const years = [...totals.keys()].sort((a, b) => a - b);
    const campuses = [...campusSet].sort((a, b) => a.localeCompare(b));
    const studentLeadersByCampus = campuses.map((campus) => ({
      campus,
      counts: years.map(
        (year) => campusByYear.get(year)?.get(campus)?.size ?? 0
      ),
    }));

    return {
      computedAt: Date.now(),
      years,
      allStaff: years.map((y) => totals.get(y)!.all),
      staff: years.map((y) => totals.get(y)!.staff),
      studentLeaders: years.map((y) => totals.get(y)!.studentLeaders),
      campuses,
      studentLeadersByCampus,
    };
  },
});

function setDefault<K>(map: Map<K, Set<string>>, key: K): Set<string> {
  const set = new Set<string>();
  map.set(key, set);
  return set;
}

/**
 * Attendance recording only started in staff year 2025, so weekly-meeting
 * averages are meaningless before it — the chart and cards begin here.
 */
export const CAMPUS_ATTENDANCE_START_YEAR = 2025;

// Guardrail on the event scan: two-plus staff years of weekly meetings across a
// handful of campuses is a few hundred events, well under this. Capping the
// range read keeps the query bounded even if unrelated events pile up.
const MAX_EVENTS_SCAN = 4000;

/**
 * Average weekly-meeting attendance per campus, one point per staff year from
 * {@link CAMPUS_ATTENDANCE_START_YEAR} to the current year. "Average" is the
 * mean head-count across that campus's Weekly-Meeting-tagged events in the year
 * (attendance rows per event ÷ number of meetings). The current staff year is
 * naturally a year-to-date average since only meetings held so far exist.
 *
 * Buckets by each campus sub-group an event carries (excluding org-wide SOW), so
 * the series self-limit to the campuses that actually run weekly meetings
 * (USYD/UNSW/MACQ/UTS). Public — like `staffTrends`, these are aggregate counts.
 */
export const campusWeeklyAttendance = query({
  args: {},
  returns: v.object({
    years: v.array(v.number()),
    // One entry per campus; `averages` is aligned to `years` (0 where no
    // meetings were held that year).
    campuses: v.array(
      v.object({ campus: v.string(), averages: v.array(v.number()) })
    ),
  }),
  handler: async (ctx) => {
    const currentYear = currentStaffYear();
    if (currentYear < CAMPUS_ATTENDANCE_START_YEAR) {
      return { years: [], campuses: [] };
    }
    const years: number[] = [];
    for (let y = CAMPUS_ATTENDANCE_START_YEAR; y <= currentYear; y++) {
      years.push(y);
    }
    const yearIndex = new Map(years.map((y, i) => [y, i]));

    // Weekly meetings live from the 2025 staff-year start onward; a by_dateStart
    // range read stands in for the dropped by_year index (see staffYearStartMs).
    const events = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) =>
        q.gte("dateStart", staffYearStartMs(CAMPUS_ATTENDANCE_START_YEAR))
      )
      .take(MAX_EVENTS_SCAN);

    // Resolve which events are Weekly Meetings — any tag named "Weekly Meeting"
    // (year-scoped in the catalogue, but the name is what marks the pattern).
    const tagIds = new Set<Id<"attendanceTags">>();
    for (const e of events) for (const id of e.tagIds ?? []) tagIds.add(id);
    const tagDocs = await Promise.all([...tagIds].map((id) => ctx.db.get(id)));
    const weeklyTagIds = new Set(
      tagDocs
        .filter(
          (t): t is Doc<"attendanceTags"> =>
            !!t && t.name === WEEKLY_MEETING_TAG_NAME
        )
        .map((t) => t._id)
    );
    const weeklyMeetings = events.filter(
      (e) =>
        (e.tagIds ?? []).some((id) => weeklyTagIds.has(id)) &&
        eventStaffYear(e.dateStart) <= currentYear
    );

    // (year, campus) -> running total attendance + meeting count, for the mean.
    type Bucket = { total: number; meetings: number };
    const buckets = new Map<string, Bucket>();
    const campusSet = new Set<string>();
    const key = (campus: string, year: number) => `${campus} ${year}`;

    for (const e of weeklyMeetings) {
      const year = eventStaffYear(e.dateStart);
      if (!yearIndex.has(year)) continue;
      const campuses = normalizeSubgroups(e.subgroups).filter(
        (s) => !isOrgWideSubgroup(s)
      );
      if (campuses.length === 0) continue;
      const attendeeCount = (
        await ctx.db
          .query("attendance")
          .withIndex("by_event", (q) => q.eq("eventId", e._id))
          .collect()
      ).length;
      for (const campus of campuses) {
        campusSet.add(campus);
        const b = buckets.get(key(campus, year)) ?? { total: 0, meetings: 0 };
        b.total += attendeeCount;
        b.meetings += 1;
        buckets.set(key(campus, year), b);
      }
    }

    const campuses = [...campusSet]
      .sort((a, b) => a.localeCompare(b))
      .map((campus) => ({
        campus,
        averages: years.map((year) => {
          const b = buckets.get(key(campus, year));
          if (!b || b.meetings === 0) return 0;
          return Math.round((b.total / b.meetings) * 10) / 10;
        }),
      }));

    return { years, campuses };
  },
});
