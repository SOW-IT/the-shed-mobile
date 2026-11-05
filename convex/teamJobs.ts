import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assignmentsOf, departmentsOf, DIRECTOR, isMemberOfDepartment } from "../shared/flow";
import {
  DEFAULT_TEAMS,
  jobsOfDepartment,
  TEAM_JOB_INFO,
  TEAM_JOBS,
  type TeamJob,
  type Teams,
} from "../shared/teams";

type Ctx = QueryCtx | MutationCtx;

export const teamJobValidator = v.union(...TEAM_JOBS.map((job) => v.literal(job)));

const rowsFor = (ctx: Ctx, year: number) =>
  ctx.db
    .query("teamJobs")
    .withIndex("by_year_and_job", (q) => q.eq("year", year))
    .take(TEAM_JOBS.length * 2);

const INHERITED_ROWS = TEAM_JOBS.length * 10;

// A year with no choice of its own for a job uses the latest earlier year's, so a
// new staff year starts with last year's teams and 1 October changes nothing.
export async function teamsFor(ctx: Ctx, year: number): Promise<Teams> {
  const teams: Teams = { ...DEFAULT_TEAMS };
  const chosen = new Set<TeamJob>();
  for (const row of await ctx.db
    .query("teamJobs")
    .withIndex("by_year_and_job", (q) => q.lte("year", year))
    .order("desc")
    .take(INHERITED_ROWS)) {
    if (chosen.has(row.job)) continue;
    chosen.add(row.job);
    teams[row.job] = row.department;
  }
  return teams;
}

export async function ownJobs(ctx: Ctx, year: number): Promise<Set<TeamJob>> {
  return new Set((await rowsFor(ctx, year)).map((row) => row.job));
}

export async function writeJob(ctx: MutationCtx, year: number, job: TeamJob, department: string) {
  const existing = await ctx.db
    .query("teamJobs")
    .withIndex("by_year_and_job", (q) => q.eq("year", year).eq("job", job))
    .unique();
  if (existing) await ctx.db.patch("teamJobs", existing._id, { department });
  else await ctx.db.insert("teamJobs", { year, job, department });
}

export async function renameTeamDepartment(
  ctx: MutationCtx,
  year: number,
  oldName: string,
  newName: string
) {
  const jobs = jobsOfDepartment(await teamsFor(ctx, year), oldName);
  // Next year follows this year's choices, but it has its own departments: while
  // it still has one with the old name, keep its jobs there.
  const next = year + 1;
  const nextStillHasOld = await ctx.db
    .query("departments")
    .withIndex("by_year_and_name", (q) => q.eq("year", next).eq("name", oldName))
    .first();
  if (nextStillHasOld) {
    const nextOwn = await ownJobs(ctx, next);
    for (const job of jobs) if (!nextOwn.has(job)) await writeJob(ctx, next, job, oldName);
  }
  for (const job of jobs) await writeJob(ctx, year, job, newName);
}

export async function assertNoTeamJobs(ctx: Ctx, year: number, department: string) {
  const jobs = jobsOfDepartment(await teamsFor(ctx, year), department);
  if (jobs.length > 0) {
    const titles = jobs.map((job) => TEAM_JOB_INFO[job].title).join(", ");
    throw new ConvexError(
      `${department} is the department for ${titles} in ${year}. Choose another department for that first (Admin → Teams).`
    );
  }
}

// Copying a year needs no team rows: a year without its own choices follows the
// latest earlier year's. A Budget Manager who isn't on its finance team is cleared.
export async function settleTeamsAfterCopy(ctx: MutationCtx, to: number) {
  await clearBudgetManagerOutside(ctx, to, (await teamsFor(ctx, to)).finance);
}

export async function clearBudgetManagerOutside(ctx: MutationCtx, year: number, department: string) {
  const settings = await ctx.db
    .query("yearSettings")
    .withIndex("by_year", (q) => q.eq("year", year))
    .first();
  const email = settings?.budgetManagerEmail;
  if (!settings || !email) return;
  const profile = await ctx.db
    .query("staffProfiles")
    .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", year))
    .first();
  if (profile && isMemberOfDepartment(profile, department)) return;
  await ctx.db.patch("yearSettings", settings._id, { budgetManagerEmail: undefined });
}

// Moving the always-admin job must leave someone who can move it back: a
// chosen admin, the Director, or someone in the new department.
export async function assertAdminsRemain(ctx: Ctx, year: number, department: string) {
  if ((await ctx.db.query("admins").first()) !== null) return;
  for await (const profile of ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", year))) {
    if (assignmentsOf(profile).some((a) => a.role === DIRECTOR)) return;
    if (departmentsOf(profile).includes(department)) return;
  }
  throw new ConvexError(
    `Nobody would be an admin in ${year}: ${department} has no staff, and there's no Director or chosen admin. Add someone to ${department} first.`
  );
}
