import { v } from "convex/values";
import { query } from "./_generated/server";
import { optionalProfile } from "./model";
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
    if (!(await optionalProfile(ctx))) return null;

    const profiles = await ctx.db.query("staffProfiles").collect();

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

    // `optionalProfile` already guaranteed the caller has a profile this year, so
    // `profiles` (which includes that row) is non-empty and `years` has ≥1 entry.
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
