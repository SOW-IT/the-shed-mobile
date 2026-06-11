import { v } from "convex/values";
import { DIRECTOR, FINANCE } from "../shared/flow";
import { query } from "./_generated/server";
import {
  currentStaffYear,
  departmentsHeadedBy,
  getApprovers,
  getProfile,
  isAdminProfile,
  nextStaffYear,
  requireEmail,
} from "./model";

/**
 * Public health/info query — used by the sign-in screen to prove the app is
 * talking to Convex end-to-end before authentication.
 */
export const serverInfo = query({
  args: {},
  handler: async (ctx) => {
    const year = currentStaffYear();
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    const divisions = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    return {
      staffYear: year,
      nextStaffYear: nextStaffYear(),
      divisions: divisions.map((d) => d.name),
      departments: departments.map((d) => ({ name: d.name, division: d.division })),
    };
  },
});

/** The signed-in caller's profile and capabilities for the current year. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.email) return null;
    const email = identity.email.toLowerCase();
    const year = currentStaffYear();
    const profile = await getProfile(ctx, email, year);
    if (!profile) {
      return { email, year, name: identity.name ?? null, profile: null };
    }
    const approvers = await getApprovers(ctx, year, profile.department);
    const headedDepartments = (await departmentsHeadedBy(ctx, year, email)).map(
      (d) => d.name
    );
    return {
      email,
      year,
      name: identity.name ?? null,
      profile: { role: profile.role, department: profile.department },
      isAdmin: await isAdminProfile(ctx, profile),
      isFinance: profile.department === FINANCE,
      isDirector: profile.role === DIRECTOR,
      isBudgetManager: approvers.budgetManagerEmail === email,
      isFinanceHead: approvers.financeHeadEmail === email,
      headedDepartments,
      isApprover:
        headedDepartments.some((d) => d !== FINANCE) ||
        approvers.budgetManagerEmail === email ||
        approvers.financeHeadEmail === email ||
        profile.role === DIRECTOR,
    };
  },
});

/** Departments + divisions for a year (signed-in users; admin UI pickers). */
export const yearStructure = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    await requireEmail(ctx);
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
      .take(200);
    const divisions = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
      .take(200);
    const settings = await ctx.db
      .query("yearSettings")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .unique();
    return {
      divisions: divisions.map((d) => d.name),
      departments: departments.map((d) => ({
        name: d.name,
        division: d.division,
        headEmail: d.headEmail ?? null,
        colour: d.colour ?? null,
      })),
      budgetManagerEmail: settings?.budgetManagerEmail ?? null,
    };
  },
});
