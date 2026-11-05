import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { isMemberOfDepartment } from "../shared/flow";
import { TEAM_JOB_INFO, TEAM_JOBS } from "../shared/teams";
import { teamJobValidator, teamsFor, writeJob } from "./teamJobs";
import {
  assertManagedYear,
  currentStaffYear,
  getDepartment,
  getProfile,
  getYearSettings,
  isAdminProfile,
  nextStaffYear,
  optionalProfile,
  requireAdmin,
} from "./model";

const MAX_DEPARTMENTS = 200;

async function clearBudgetManagerOutside(ctx: MutationCtx, year: number, department: string) {
  const settings = await getYearSettings(ctx, year);
  const email = settings?.budgetManagerEmail;
  if (!settings || !email) return;
  const profile = await getProfile(ctx, email, year);
  if (profile && isMemberOfDepartment(profile, department)) return;
  await ctx.db.patch("yearSettings", settings._id, { budgetManagerEmail: undefined });
}

export const view = query({
  args: { year: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      year: v.number(),
      editable: v.boolean(),
      jobs: v.array(
        v.object({
          job: teamJobValidator,
          title: v.string(),
          does: v.string(),
          department: v.string(),
          exists: v.boolean(),
        })
      ),
      departments: v.array(v.string()),
    })
  ),
  handler: async (ctx, { year }) => {
    const caller = await optionalProfile(ctx);
    if (!caller || !(await isAdminProfile(ctx, caller.profile))) return null;
    const teams = await teamsFor(ctx, year);
    const departments = (
      await ctx.db
        .query("departments")
        .withIndex("by_year_and_name", (q) => q.eq("year", year))
        .take(MAX_DEPARTMENTS)
    ).map((d) => d.name);
    return {
      year,
      editable: year === currentStaffYear() || year === nextStaffYear(),
      jobs: TEAM_JOBS.map((job) => ({
        job,
        ...TEAM_JOB_INFO[job],
        department: teams[job],
        exists: departments.includes(teams[job]),
      })),
      departments: departments.sort((a, b) => a.localeCompare(b)),
    };
  },
});

export const set = mutation({
  args: { year: v.number(), job: teamJobValidator, department: v.string() },
  returns: v.null(),
  handler: async (ctx, { year, job, department }) => {
    await requireAdmin(ctx);
    assertManagedYear(year);
    const name = department.trim();
    if (!(await getDepartment(ctx, year, name))) {
      throw new ConvexError(`Department "${name}" doesn't exist in ${year}.`);
    }
    await writeJob(ctx, year, job, name);
    if (job === "finance") await clearBudgetManagerOutside(ctx, year, name);
    return null;
  },
});
