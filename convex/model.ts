import { ConvexError } from "convex/values";
import {
  ADMIN_DEPARTMENTS,
  ADMIN_DIVISIONS,
  DIRECTOR,
  FINANCE,
  HEAD_OF_DIVISION,
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

/**
 * The caller's email, or null when unauthenticated. QUERIES should use this
 * and return null rather than throwing: the client briefly runs queries
 * before/while auth tokens attach, and a thrown query crashes the React tree.
 * Mutations (user-initiated) keep the throwing requireEmail/requireProfile.
 */
export async function optionalEmail(ctx: Ctx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.email?.toLowerCase() ?? null;
}

/** Caller context for queries: null when unauthenticated or unprovisioned. */
export async function optionalProfile(ctx: Ctx): Promise<CallerContext | null> {
  const email = await optionalEmail(ctx);
  if (!email) return null;
  const year = currentStaffYear();
  const profile = await getProfile(ctx, email, year);
  if (!profile) return null;
  return { email, year, profile };
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

/** A profile's roles; reads the legacy single-role field transparently. */
export const rolesOf = (profile: Doc<"staffProfiles">): string[] =>
  profile.roles ?? (profile.role ? [profile.role] : []);

/**
 * Admins: the Director, the Head of the Human Resources division, the
 * Data and IT department, and any department in the Human Resources division.
 */
export async function isAdminProfile(
  ctx: Ctx,
  profile: Doc<"staffProfiles">
): Promise<boolean> {
  const roles = rolesOf(profile);
  if (roles.includes(DIRECTOR)) return true;
  if (
    roles.includes(HEAD_OF_DIVISION) &&
    profile.division !== undefined &&
    ADMIN_DIVISIONS.includes(profile.division)
  ) {
    return true;
  }
  if (!profile.department) return false;
  if (ADMIN_DEPARTMENTS.includes(profile.department)) return true;
  const department = await getDepartment(ctx, profile.year, profile.department);
  return department !== null && ADMIN_DIVISIONS.includes(department.division);
}

export async function requireAdmin(ctx: Ctx): Promise<CallerContext> {
  const caller = await requireProfile(ctx);
  if (!(await isAdminProfile(ctx, caller.profile))) {
    throw new ConvexError(
      "Only admins (Data and IT / Human Resources division) can do this."
    );
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
  // Roles are arrays now, so the Director is found by scanning the year's
  // profiles (small table) rather than via the legacy role index.
  const profiles = await ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", year))
    .take(1000);
  const directorProfile = profiles.find((p) => rolesOf(p).includes(DIRECTOR));
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
