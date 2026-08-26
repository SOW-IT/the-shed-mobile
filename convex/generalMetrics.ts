import { v } from "convex/values";
import { query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { currentStaffYear } from "./model";
import {
  eventStaffYear,
  staffYearStartMs,
  withinRolloverRateGrace,
} from "../shared/flow";
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

const pct1 = (numerator: number, denominator: number): number =>
  Math.round((numerator / denominator) * 1000) / 10;

export const profilePersonKey = (
  p: { email: string; importId?: string },
  emailToImportId?: ReadonlyMap<string, string>
): string => {
  const email = p.email.trim().toLowerCase();
  const importId = p.importId ?? emailToImportId?.get(email);
  return importId ? `import:${importId}` : `email:${email}`;
};

export const buildEmailToImportId = (
  profiles: readonly { email: string; importId?: string }[]
): Map<string, string> => {
  const map = new Map<string, string>();
  for (const p of profiles) {
    if (!p.importId) continue;
    map.set(p.email.trim().toLowerCase(), p.importId);
  }
  return map;
};

export const turnoverRate = (
  prior: ReadonlySet<string>,
  current: ReadonlySet<string>
): number | null => {
  if (prior.size === 0) return null;
  let leavers = 0;
  for (const key of prior) if (!current.has(key)) leavers += 1;
  return pct1(leavers, prior.size);
};

export const retentionRate = (
  prior: ReadonlySet<string>,
  current: ReadonlySet<string>
): number | null => {
  if (prior.size === 0) return null;
  let stayers = 0;
  for (const key of prior) if (current.has(key)) stayers += 1;
  return pct1(stayers, prior.size);
};

const yearsServedAsOf = (
  years: ReadonlySet<number> | undefined,
  asOfYear: number
): number => {
  if (!years) return 0;
  let n = 0;
  for (const y of years) if (y <= asOfYear) n += 1;
  return n;
};

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
      studentLeadersByCampus: v.array(
        v.object({ campus: v.string(), counts: v.array(v.number()) })
      ),
      turnover: rateSeries,
      retention: rateSeries,
      tenure2Plus: pctSeries,
      avgTenureYears: avgYearsSeries,
      lifetimeTenure2Plus: lifetimePct,
      lifetimeAvgTenureYears: lifetimeAvgYears,
    })
  ),
  handler: async (ctx) => {

    const currentYear = currentStaffYear();
    const latestCompleteYear = withinRolloverRateGrace(currentYear)
      ? currentYear - 1
      : currentYear;
    const profiles = (await ctx.db.query("staffProfiles").collect()).filter(
      (p) => p.year <= currentYear
    );

    const totals = new Map<
      number,
      { all: number; staff: number; studentLeaders: number }
    >();
    const campusByYear = new Map<number, Map<string, Set<string>>>();
    const campusSet = new Set<string>();

    const emailToImportId = buildEmailToImportId(profiles);
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

      if (profile.year <= latestCompleteYear) {
        const key = profilePersonKey(profile, emailToImportId);
        const sets = peopleByYear.get(profile.year) ?? emptyPersonSets();
        sets.all.add(key);
        if (isStaff) sets.staff.add(key);
        if (isStudentLeader) sets.studentLeaders.add(key);
        peopleByYear.set(profile.year, sets);

        addYear(yearsAll, key, profile.year);
        if (isStaff) addYear(yearsStaff, key, profile.year);
        if (isStudentLeader) addYear(yearsStudentLeaders, key, profile.year);
      }

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

    const years = [...totals.keys()].sort((a, b) => a - b);
    const campuses = [...campusSet].sort((a, b) => a.localeCompare(b));
    const studentLeadersByCampus = campuses.map((campus) => ({
      campus,
      counts: years.map(
        (year) => campusByYear.get(year)?.get(campus)?.size ?? 0
      ),
    }));

    const empty = emptyPersonSets();

    const yoyRate = (
      rateFn: typeof turnoverRate,
      lens: keyof ReturnType<typeof emptyPersonSets>
    ) =>
      years.map((year, i) => {
        if (i === 0 || year > latestCompleteYear) return null;
        return rateFn(
          peopleByYear.get(years[i - 1])?.[lens] ?? empty[lens],
          peopleByYear.get(year)?.[lens] ?? empty[lens]
        );
      });
    const rateForYear = (year: number, compute: () => number | null) =>
      year > latestCompleteYear ? null : compute();

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
        rateForYear(year, () =>
          tenureAtLeastPct(
            peopleByYear.get(year)?.all ?? empty.all,
            yearsAll,
            year
          )
        )
      ),
      staff: years.map((year) =>
        rateForYear(year, () =>
          tenureAtLeastPct(
            peopleByYear.get(year)?.staff ?? empty.staff,
            yearsStaff,
            year
          )
        )
      ),
      studentLeaders: years.map((year) =>
        rateForYear(year, () =>
          tenureAtLeastPct(
            peopleByYear.get(year)?.studentLeaders ?? empty.studentLeaders,
            yearsStudentLeaders,
            year
          )
        )
      ),
    };

    const avgTenureYearsSeries = {
      overall: years.map((year) =>
        rateForYear(year, () =>
          avgTenureYears(peopleByYear.get(year)?.all ?? empty.all, yearsAll, year)
        )
      ),
      staff: years.map((year) =>
        rateForYear(year, () =>
          avgTenureYears(
            peopleByYear.get(year)?.staff ?? empty.staff,
            yearsStaff,
            year
          )
        )
      ),
      studentLeaders: years.map((year) =>
        rateForYear(year, () =>
          avgTenureYears(
            peopleByYear.get(year)?.studentLeaders ?? empty.studentLeaders,
            yearsStudentLeaders,
            year
          )
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

export const CAMPUS_ATTENDANCE_START_YEAR = 2025;

const MAX_EVENTS_SCAN = 4000;

export const campusWeeklyAttendance = query({
  args: {},
  returns: v.object({
    years: v.array(v.number()),
    campuses: v.array(
      v.object({ campus: v.string(), averages: v.array(v.number()) })
    ),
  }),
  handler: async (ctx) => {
    const currentYear = currentStaffYear();
    const years: number[] = [];
    for (let y = CAMPUS_ATTENDANCE_START_YEAR; y <= currentYear; y++) {
      years.push(y);
    }

    const events = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) =>
        q.gte("dateStart", staffYearStartMs(CAMPUS_ATTENDANCE_START_YEAR))
      )
      .take(MAX_EVENTS_SCAN);

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

    const meetings = weeklyMeetings
      .map((e) => ({
        id: e._id,
        year: eventStaffYear(e.dateStart),
        campuses: normalizeSubgroups(e.subgroups).filter(
          (s) => !isOrgWideSubgroup(s)
        ),
      }))
      .filter((m) => m.campuses.length > 0);

    const turnouts = await Promise.all(
      meetings.map((m) =>
        ctx.db
          .query("attendance")
          .withIndex("by_event", (q) => q.eq("eventId", m.id))
          .collect()
          .then((rows) => rows.length)
      )
    );

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

    if (years.length > 0 && years[years.length - 1] === currentYear) {
      const last = years.length - 1;
      const empty = campuses.length === 0 || campuses.every((c) => c.averages[last] === 0);
      if (empty) {
        years.pop();
        for (const campus of campuses) campus.averages.pop();
      }
    }

    return { years, campuses };
  },
});
