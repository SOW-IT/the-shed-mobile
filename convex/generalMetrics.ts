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

/** Percent with one decimal (e.g. 33.3). */
const pct1 = (numerator: number, denominator: number): number =>
  Math.round((numerator / denominator) * 1000) / 10;

/**
 * Durable person key across staff years. Prefer `importId` (survives email
 * renames); fall back to the normalised profile email when the person was
 * never imported or linked. Email is lowercased + trimmed so case/whitespace
 * alone can't register as a leave + join.
 */
export const profilePersonKey = (p: {
  email: string;
  importId?: string;
}): string =>
  p.importId
    ? `import:${p.importId}`
    : `email:${p.email.trim().toLowerCase()}`;

/**
 * Share of `prior` people missing from `current` (standard year-over-year
 * turnover). `null` when there is no prior roster to measure against.
 */
export const turnoverRate = (
  prior: ReadonlySet<string>,
  current: ReadonlySet<string>
): number | null => {
  if (prior.size === 0) return null;
  let leavers = 0;
  for (const key of prior) if (!current.has(key)) leavers += 1;
  return pct1(leavers, prior.size);
};

/**
 * Share of `prior` people still present in `current` (year-over-year retention).
 * Complement of {@link turnoverRate}; `null` when there is no prior roster.
 */
export const retentionRate = (
  prior: ReadonlySet<string>,
  current: ReadonlySet<string>
): number | null => {
  if (prior.size === 0) return null;
  let stayers = 0;
  for (const key of prior) if (current.has(key)) stayers += 1;
  return pct1(stayers, prior.size);
};

/** Count of distinct career years ≤ asOfYear for one person. */
const yearsServedAsOf = (
  years: ReadonlySet<number> | undefined,
  asOfYear: number
): number => {
  if (!years) return 0;
  let n = 0;
  for (const y of years) if (y <= asOfYear) n += 1;
  return n;
};

/**
 * Of people present in a category, the share whose career in that category
 * spans at least `minYears` distinct staff years (as of `asOfYear`, only years
 * ≤ asOfYear count). `null` when nobody is present in the lens (so charts don't
 * plot an empty roster as a real 0%).
 */
export const tenureAtLeastPct = (
  present: ReadonlySet<string>,
  yearsByPerson: ReadonlyMap<string, ReadonlySet<number>>,
  asOfYear: number,
  minYears = 2
): number | null => {
  if (present.size === 0) return null;
  let count = 0;
  for (const key of present) {
    if (yearsServedAsOf(yearsByPerson.get(key), asOfYear) >= minYears) {
      count += 1;
    }
  }
  return pct1(count, present.size);
};

/**
 * Mean number of staff years served so far (as of `asOfYear`) among people
 * present. One decimal; `null` when nobody is present in the lens.
 */
export const avgTenureYears = (
  present: ReadonlySet<string>,
  yearsByPerson: ReadonlyMap<string, ReadonlySet<number>>,
  asOfYear: number
): number | null => {
  if (present.size === 0) return null;
  let total = 0;
  for (const key of present) {
    total += yearsServedAsOf(yearsByPerson.get(key), asOfYear);
  }
  return Math.round((total / present.size) * 10) / 10;
};

/** Lifetime share of people (ever in the map) with ≥ `minYears` years. */
export const lifetimeTenureAtLeastPct = (
  yearsByPerson: ReadonlyMap<string, ReadonlySet<number>>,
  minYears = 2
): number => {
  if (yearsByPerson.size === 0) return 0;
  let count = 0;
  for (const years of yearsByPerson.values()) {
    if (years.size >= minYears) count += 1;
  }
  return pct1(count, yearsByPerson.size);
};

/** Lifetime mean career length (distinct staff years) across everyone ever. */
export const lifetimeAvgTenureYears = (
  yearsByPerson: ReadonlyMap<string, ReadonlySet<number>>
): number => {
  if (yearsByPerson.size === 0) return 0;
  let total = 0;
  for (const years of yearsByPerson.values()) total += years.size;
  return Math.round((total / yearsByPerson.size) * 10) / 10;
};

const emptyPersonSets = () => ({
  all: new Set<string>(),
  staff: new Set<string>(),
  studentLeaders: new Set<string>(),
});

const rateSeries = v.object({
  overall: v.array(v.union(v.number(), v.null())),
  staff: v.array(v.union(v.number(), v.null())),
  studentLeaders: v.array(v.union(v.number(), v.null())),
});

// Per-year rates/averages: null when that lens has nobody present that year
// (distinct from a real 0% / 0.0 average).
const pctSeries = v.object({
  overall: v.array(v.union(v.number(), v.null())),
  staff: v.array(v.union(v.number(), v.null())),
  studentLeaders: v.array(v.union(v.number(), v.null())),
});

const lifetimePct = v.object({
  overall: v.number(),
  staff: v.number(),
  studentLeaders: v.number(),
});

const avgYearsSeries = v.object({
  overall: v.array(v.union(v.number(), v.null())),
  staff: v.array(v.union(v.number(), v.null())),
  studentLeaders: v.array(v.union(v.number(), v.null())),
});

const lifetimeAvgYears = v.object({
  overall: v.number(),
  staff: v.number(),
  studentLeaders: v.number(),
});

/**
 * Org-wide "General" insights, plotted one point per staff year (staff roles and
 * campus assignments are stored per year in `staffProfiles`, so the staff year
 * is the only meaningful time axis). All rates below are **staffProfiles only**
 * (org-chart staff + student leaders), not attendance members.
 *
 *  - `allStaff`      — every distinct person with a profile that year.
 *  - `staff` / `studentLeaders` — the same staff-vs-student-leader split the
 *    attendance Members filter uses (`roleFilterMatches`): a person is a student
 *    leader if they hold any university-scoped role, staff if they hold a
 *    non-university staff-profile role. A person can match both lenses (rare), so
 *    the two series aren't required to sum to `allStaff`.
 *  - `studentLeadersByCampus` — distinct student leaders per university, per year.
 *  - `turnover` / `retention` — year-over-year leave / stay rates (people in
 *    year Y−1 missing from / still in Y). First year is `null` (no prior).
 *  - `tenure2Plus` — of people present that year, the % with ≥2 staff years of
 *    service in that lens so far (years ≤ that year).
 *  - `avgTenureYears` — mean career length (distinct staff years so far) among
 *    people present that year.
 *  - `lifetimeTenure2Plus` / `lifetimeAvgTenureYears` — same lenses over
 *    everyone ever in the history (≤ current staff year).
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
      // Aligned to `years`; first year (and empty prior roster) is null.
      turnover: rateSeries,
      retention: rateSeries,
      // Aligned to `years`; 0 when nobody is present in that lens that year.
      tenure2Plus: pctSeries,
      avgTenureYears: avgYearsSeries,
      lifetimeTenure2Plus: lifetimePct,
      lifetimeAvgTenureYears: lifetimeAvgYears,
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

    // Distinct people per year (for turnover) and career years per person (for
    // tenure). Person identity follows importId when present so email renames
    // don't look like a leave + join.
    const peopleByYear = new Map<
      number,
      ReturnType<typeof emptyPersonSets>
    >();
    const yearsAll = new Map<string, Set<number>>();
    const yearsStaff = new Map<string, Set<number>>();
    const yearsStudentLeaders = new Map<string, Set<number>>();

    const addYear = (
      map: Map<string, Set<number>>,
      key: string,
      year: number
    ) => {
      const set = map.get(key) ?? new Set<number>();
      set.add(year);
      map.set(key, set);
    };

    for (const profile of profiles) {
      const roles = (profile.assignments ?? []).map((a) => a.role);
      const tally =
        totals.get(profile.year) ?? { all: 0, staff: 0, studentLeaders: 0 };
      tally.all += 1;
      const isStaff = roleFilterMatches(STAFF_ROLE_FILTER_LABEL, roles);
      if (isStaff) tally.staff += 1;
      const isStudentLeader = roleFilterMatches(
        STUDENT_LEADER_ROLE_FILTER_LABEL,
        roles
      );
      if (isStudentLeader) tally.studentLeaders += 1;
      totals.set(profile.year, tally);

      const key = profilePersonKey(profile);
      const sets = peopleByYear.get(profile.year) ?? emptyPersonSets();
      sets.all.add(key);
      if (isStaff) sets.staff.add(key);
      if (isStudentLeader) sets.studentLeaders.add(key);
      peopleByYear.set(profile.year, sets);

      addYear(yearsAll, key, profile.year);
      if (isStaff) addYear(yearsStaff, key, profile.year);
      if (isStudentLeader) addYear(yearsStudentLeaders, key, profile.year);

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

    const empty = emptyPersonSets();

    // Year-over-year leave/stay for each lens; first year has no prior roster.
    const yoyRate = (
      rateFn: typeof turnoverRate,
      lens: keyof ReturnType<typeof emptyPersonSets>
    ) =>
      years.map((year, i) => {
        if (i === 0) return null;
        return rateFn(
          peopleByYear.get(years[i - 1])?.[lens] ?? empty[lens],
          peopleByYear.get(year)?.[lens] ?? empty[lens]
        );
      });

    const turnover = {
      overall: yoyRate(turnoverRate, "all"),
      staff: yoyRate(turnoverRate, "staff"),
      studentLeaders: yoyRate(turnoverRate, "studentLeaders"),
    };
    const retention = {
      overall: yoyRate(retentionRate, "all"),
      staff: yoyRate(retentionRate, "staff"),
      studentLeaders: yoyRate(retentionRate, "studentLeaders"),
    };

    const tenure2Plus = {
      overall: years.map((year) =>
        tenureAtLeastPct(
          peopleByYear.get(year)?.all ?? empty.all,
          yearsAll,
          year
        )
      ),
      staff: years.map((year) =>
        tenureAtLeastPct(
          peopleByYear.get(year)?.staff ?? empty.staff,
          yearsStaff,
          year
        )
      ),
      studentLeaders: years.map((year) =>
        tenureAtLeastPct(
          peopleByYear.get(year)?.studentLeaders ?? empty.studentLeaders,
          yearsStudentLeaders,
          year
        )
      ),
    };

    const avgTenureYearsSeries = {
      overall: years.map((year) =>
        avgTenureYears(peopleByYear.get(year)?.all ?? empty.all, yearsAll, year)
      ),
      staff: years.map((year) =>
        avgTenureYears(
          peopleByYear.get(year)?.staff ?? empty.staff,
          yearsStaff,
          year
        )
      ),
      studentLeaders: years.map((year) =>
        avgTenureYears(
          peopleByYear.get(year)?.studentLeaders ?? empty.studentLeaders,
          yearsStudentLeaders,
          year
        )
      ),
    };

    return {
      computedAt: Date.now(),
      years,
      allStaff: years.map((y) => totals.get(y)!.all),
      staff: years.map((y) => totals.get(y)!.staff),
      studentLeaders: years.map((y) => totals.get(y)!.studentLeaders),
      campuses,
      studentLeadersByCampus,
      turnover,
      retention,
      tenure2Plus,
      avgTenureYears: avgTenureYearsSeries,
      lifetimeTenure2Plus: {
        overall: lifetimeTenureAtLeastPct(yearsAll),
        staff: lifetimeTenureAtLeastPct(yearsStaff),
        studentLeaders: lifetimeTenureAtLeastPct(yearsStudentLeaders),
      },
      lifetimeAvgTenureYears: {
        overall: lifetimeAvgTenureYears(yearsAll),
        staff: lifetimeAvgTenureYears(yearsStaff),
        studentLeaders: lifetimeAvgTenureYears(yearsStudentLeaders),
      },
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
    // Before 2025 this yields no years (and an empty result), which is correct —
    // there's no attendance history to average then.
    const currentYear = currentStaffYear();
    const years: number[] = [];
    for (let y = CAMPUS_ATTENDANCE_START_YEAR; y <= currentYear; y++) {
      years.push(y);
    }

    // Weekly meetings live from the 2025 staff-year start onward; a by_dateStart
    // range read stands in for the dropped by_year index (see staffYearStartMs).
    const events = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) =>
        q.gte("dateStart", staffYearStartMs(CAMPUS_ATTENDANCE_START_YEAR))
      )
      .take(MAX_EVENTS_SCAN);

    // Resolve which events are Weekly Meetings — any tag named "Weekly Meeting"
    // (tags are global; the name is what marks the pattern).
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

    // Resolve each meeting's campuses (org-wide SOW dropped) and staff year up
    // front, keeping only meetings that belong to a campus. `year` is bounded to
    // [2025, currentYear] by the date-range read + the year filter above.
    const meetings = weeklyMeetings
      .map((e) => ({
        id: e._id,
        year: eventStaffYear(e.dateStart),
        campuses: normalizeSubgroups(e.subgroups).filter(
          (s) => !isOrgWideSubgroup(s)
        ),
      }))
      .filter((m) => m.campuses.length > 0);

    // Turnout per meeting, read in parallel (one bounded by_event index read
    // each) rather than sequentially. The number of Weekly-Meeting events is
    // inherently small — at most ~one per campus per week — so this stays well
    // within a query's read budget without a denormalised per-event counter.
    const turnouts = await Promise.all(
      meetings.map((m) =>
        ctx.db
          .query("attendance")
          .withIndex("by_event", (q) => q.eq("eventId", m.id))
          .collect()
          .then((rows) => rows.length)
      )
    );

    // (year, campus) -> running total attendance + meeting count, for the mean.
    type Bucket = { total: number; meetings: number };
    const buckets = new Map<string, Bucket>();
    const campusSet = new Set<string>();
    const key = (campus: string, year: number) => `${campus}|${year}`;

    meetings.forEach((m, i) => {
      for (const campus of m.campuses) {
        campusSet.add(campus);
        const b = buckets.get(key(campus, m.year)) ?? { total: 0, meetings: 0 };
        b.total += turnouts[i];
        b.meetings += 1;
        buckets.set(key(campus, m.year), b);
      }
    });

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
