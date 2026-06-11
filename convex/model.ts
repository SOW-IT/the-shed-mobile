import { ConvexError } from "convex/values";
import {
  ADMIN_DEPARTMENTS,
  DIRECTOR,
  FINANCE,
  staffYearForDate,
} from "../shared/flow";
import { Doc } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

export const currentStaffYear = () => staffYearForDate(new Date());
export const nextStaffYear = () => currentStaffYear() + 1;

export async function requireEmail(ctx: Ctx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || !identity.email) {
    throw new ConvexError("You must be signed in.");
  }
  return identity.email.toLowerCase();
}

export async function getProfile(
  ctx: Ctx,
  email: string,
  year: number
): Promise<Doc<"staffProfiles"> | null> {
  return await ctx.db
    .query("staffProfiles")
    .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", year))
    .unique();
}

export interface CallerContext {
  email: string;
  year: number;
  profile: Doc<"staffProfiles">;
}

/** The signed-in caller plus their profile for the current staff year. */
export async function requireProfile(ctx: Ctx): Promise<CallerContext> {
  const email = await requireEmail(ctx);
  const year = currentStaffYear();
  const profile = await getProfile(ctx, email, year);
  if (!profile) {
    throw new ConvexError(
      `No role/department assigned to ${email} for ${year}. Ask an admin to set you up.`
    );
  }
  return { email, year, profile };
}

export const isAdminProfile = (profile: Doc<"staffProfiles">): boolean =>
  ADMIN_DEPARTMENTS.includes(profile.department);

/** Admins are the members of the Human Resources and Data and IT departments. */
export async function requireAdmin(ctx: Ctx): Promise<CallerContext> {
  const caller = await requireProfile(ctx);
  if (!isAdminProfile(caller.profile)) {
    throw new ConvexError("Only admins (Human Resources / Data and IT) can do this.");
  }
  return caller;
}

export async function getDepartment(
  ctx: Ctx,
  year: number,
  name: string
): Promise<Doc<"departments"> | null> {
  return await ctx.db
    .query("departments")
    .withIndex("by_year_and_name", (q) => q.eq("year", year).eq("name", name))
    .unique();
}

export async function getYearSettings(
  ctx: Ctx,
  year: number
): Promise<Doc<"yearSettings"> | null> {
  return await ctx.db
    .query("yearSettings")
    .withIndex("by_year", (q) => q.eq("year", year))
    .unique();
}

export interface Approvers {
  hodEmail?: string;
  budgetManagerEmail?: string;
  financeHeadEmail?: string;
  directorEmail?: string;
}

/** Resolves who approves each step for a request in a department this year. */
export async function getApprovers(
  ctx: Ctx,
  year: number,
  departmentName: string
): Promise<Approvers> {
  const department = await getDepartment(ctx, year, departmentName);
  const finance = await getDepartment(ctx, year, FINANCE);
  const settings = await getYearSettings(ctx, year);
  const directorProfile = await ctx.db
    .query("staffProfiles")
    .withIndex("by_year_and_role", (q) => q.eq("year", year).eq("role", DIRECTOR))
    .first();
  return {
    hodEmail: department?.headEmail,
    budgetManagerEmail: settings?.budgetManagerEmail,
    financeHeadEmail: finance?.headEmail,
    directorEmail: directorProfile?.email,
  };
}

/** Departments the given email heads this year (Finance included). */
export async function departmentsHeadedBy(
  ctx: Ctx,
  year: number,
  email: string
): Promise<Doc<"departments">[]> {
  const departments = await ctx.db
    .query("departments")
    .withIndex("by_year_and_name", (q) => q.eq("year", year))
    .take(200);
  return departments.filter((d) => d.headEmail === email);
}
