import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
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

export async function teamsFor(ctx: Ctx, year: number): Promise<Teams> {
  const teams: Teams = { ...DEFAULT_TEAMS };
  for (const row of await rowsFor(ctx, year)) teams[row.job] = row.department;
  return teams;
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
  const teams = await teamsFor(ctx, year);
  for (const job of jobsOfDepartment(teams, oldName)) await writeJob(ctx, year, job, newName);
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

export async function copyTeams(ctx: MutationCtx, from: number, to: number) {
  const teams = await teamsFor(ctx, from);
  for (const job of TEAM_JOBS) await writeJob(ctx, to, job, teams[job]);
}
