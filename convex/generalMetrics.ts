import { type Infer, v } from "convex/values";
import { internalMutation, query, type QueryCtx } from "./_generated/server";
import { currentStaffYear } from "./model";
import { staffTrendsValidator, viewBlockValidator } from "./metricsData";
import { readSettings } from "./weeklyInsights";
import { buildGeneralView } from "../shared/generalMetricsView";
import { OUTSOURCE, staffYearStartMs, sydneyCalendarYear } from "../shared/flow";
import {
  isOrgWideSubgroup,
  normalizeSubgroups,
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

const emptyPersonSets = () => ({
  all: new Set<string>(),
  staff: new Set<string>(),
  studentLeaders: new Set<string>(),
});

export type StaffTrends = Infer<typeof staffTrendsValidator>;

export async function computeStaffTrends(ctx: QueryCtx): Promise<StaffTrends> {

  const currentYear = currentStaffYear();
  const profiles = (await ctx.db.query("staffProfiles").collect()).filter(
    (p) => p.year <= currentYear
  );

  const campusByYear = new Map<number, Map<string, Set<string>>>();
  const campusSet = new Set<string>();

  const emailToImportId = buildEmailToImportId(profiles);
  const peopleByYear = new Map<
    number,
    ReturnType<typeof emptyPersonSets>
  >();
  const yearsServed = new Map<string, Set<number>>();

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
    const roles = (profile.assignments ?? [])
      .map((a) => a.role)
      .filter((role) => role !== OUTSOURCE);
    const isStaff = roleFilterMatches(STAFF_ROLE_FILTER_LABEL, roles);
    const isStudentLeader = roleFilterMatches(
      STUDENT_LEADER_ROLE_FILTER_LABEL,
      roles
    );
    if (!isStaff && !isStudentLeader) continue;
    const key = profilePersonKey(profile, emailToImportId);
    const sets = peopleByYear.get(profile.year) ?? emptyPersonSets();
    sets.all.add(key);
    if (isStaff) sets.staff.add(key);
    if (isStudentLeader) sets.studentLeaders.add(key);
    peopleByYear.set(profile.year, sets);
    addYear(yearsServed, key, profile.year);

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
        (perCampus.get(campus) ?? setDefault(perCampus, campus)).add(key);
      }
    }
  }

  const years = [...peopleByYear.keys()].sort((a, b) => a - b);
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
    years.map((year) =>
      rateFn(
        peopleByYear.get(year - 1)?.[lens] ?? empty[lens],
        peopleByYear.get(year)?.all ?? empty.all
      )
    );

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

  const perGroup = (
    compute: (
      present: ReadonlySet<string>,
      yearsByPerson: ReadonlyMap<string, ReadonlySet<number>>,
      asOfYear: number
    ) => number | null
  ) => {
    const series = (lens: keyof ReturnType<typeof emptyPersonSets>) =>
      years.map((year) =>
        compute(peopleByYear.get(year)?.[lens] ?? empty[lens], yearsServed, year)
      );
    return { overall: series("all"), staff: series("staff"), studentLeaders: series("studentLeaders") };
  };
  const tenure2Plus = perGroup(tenureAtLeastPct);
  const avgTenureYearsSeries = perGroup(avgTenureYears);

  return {
    computedAt: Date.now(),
    years,
    allStaff: years.map((y) => peopleByYear.get(y)!.all.size),
    staff: years.map((y) => peopleByYear.get(y)!.staff.size),
    studentLeaders: years.map((y) => peopleByYear.get(y)!.studentLeaders.size),
    campuses,
    studentLeadersByCampus,
    turnover,
    retention,
    tenure2Plus,
    avgTenureYears: avgTenureYearsSeries,
  };
}

function setDefault<K>(map: Map<K, Set<string>>, key: K): Set<string> {
  const set = new Set<string>();
  map.set(key, set);
  return set;
}

export const CAMPUS_ATTENDANCE_START_YEAR = 2025;

const MAX_EVENTS_SCAN = 4000;

type CampusWeeklyAttendance = {
  years: number[];
  campuses: { campus: string; averages: number[] }[];
};

export const view = query({
  args: { scope: v.union(v.number(), v.literal("all"), v.null()), lines: v.optional(v.boolean()) },
  returns: v.object({
    years: v.array(v.number()),
    blocks: v.array(viewBlockValidator),
  }),
  handler: async (ctx, { scope, lines }) => {
    const [trends, campusAttendance, identity] = await Promise.all([
      readStaffTrends(ctx),
      readCampusWeeklyAttendance(ctx),
      ctx.auth.getUserIdentity(),
    ]);
    return {
      years: trends.years,
      blocks: buildGeneralView({ trends, campusAttendance, scope, signedIn: identity !== null, lines }),
    };
  },
});

async function readStaffTrends(ctx: QueryCtx): Promise<StaffTrends> {
  const snapshot = await ctx.db.query("staffTrendsSnapshots").first();
  if (snapshot?.staffYear === currentStaffYear()) return snapshot.trends;
  return computeStaffTrends(ctx);
}

export const recomputeStaffTrends = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const doc = { staffYear: currentStaffYear(), trends: await computeStaffTrends(ctx) };
    const existing = await ctx.db.query("staffTrendsSnapshots").take(10);
    if (existing.length === 0) {
      await ctx.db.insert("staffTrendsSnapshots", doc);
    } else {
      await ctx.db.replace("staffTrendsSnapshots", existing[0]._id, doc);
      for (const extra of existing.slice(1)) await ctx.db.delete("staffTrendsSnapshots", extra._id);
    }
    return null;
  },
});

async function readCampusWeeklyAttendance(ctx: QueryCtx): Promise<CampusWeeklyAttendance> {
  const snapshot = await ctx.db.query("campusAttendanceSnapshots").first();
  if (snapshot) return { years: snapshot.years, campuses: snapshot.campuses };
  return computeCampusWeeklyAttendance(ctx);
}

export const recomputeCampusWeeklyAttendance = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const result = await computeCampusWeeklyAttendance(ctx);
    const doc = { computedAt: Date.now(), ...result };
    const existing = await ctx.db.query("campusAttendanceSnapshots").take(10);
    if (existing.length === 0) {
      await ctx.db.insert("campusAttendanceSnapshots", doc);
    } else {
      await ctx.db.replace(existing[0]._id, doc);
      for (const extra of existing.slice(1)) await ctx.db.delete(extra._id);
    }
    return null;
  },
});

// Bucketed by Sydney calendar year (Jan–Dec), not staff year: weekly meetings
// follow the uni calendar.
async function computeCampusWeeklyAttendance(
  ctx: QueryCtx
): Promise<CampusWeeklyAttendance> {
  const currentYear = sydneyCalendarYear(new Date());
  const calendarYear = (ms: number) => sydneyCalendarYear(new Date(ms));
  const years: number[] = [];
  for (let y = CAMPUS_ATTENDANCE_START_YEAR; y <= currentYear; y++) {
    years.push(y);
  }

  const events = await ctx.db
    .query("events")
    .withIndex("by_dateStart", (q) =>
      q.gte("dateStart", staffYearStartMs(CAMPUS_ATTENDANCE_START_YEAR))
    )
    // Newest first: if the scan cap is ever hit it drops the oldest year,
    // not the one currently being led.
    .order("desc")
    .take(MAX_EVENTS_SCAN);

  const { settings } = await readSettings(ctx);
  const weeklyMeetings = events.filter(
    (e) =>
      !!e.weekly &&
      (settings.jointWeeklies || normalizeSubgroups(e.subgroups).length === 1) &&
      calendarYear(e.dateStart) >= CAMPUS_ATTENDANCE_START_YEAR &&
      calendarYear(e.dateStart) <= currentYear
  );

  const meetings = weeklyMeetings
    .map((e) => ({
      id: e._id,
      year: calendarYear(e.dateStart),
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
    // Nobody signed in: the meeting didn't happen, so it isn't averaged in.
    if (turnouts[i] === 0) return;
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
}
