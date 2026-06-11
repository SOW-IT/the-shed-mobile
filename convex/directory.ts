import { v } from "convex/values";
import { DIRECTOR, FINANCE, HEAD_OF_DIVISION } from "../shared/flow";
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
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    const photo = user?.avatarId
      ? await ctx.storage.getUrl(user.avatarId)
      : (user?.image ?? null);
    const profile = await getProfile(ctx, email, year);
    if (!profile) {
      return { email, year, name: identity.name ?? null, photo, profile: null };
    }
    const approvers = await getApprovers(
      ctx,
      year,
      profile.department ?? profile.division ?? ""
    );
    const headedDepartments = (await departmentsHeadedBy(ctx, year, email)).map(
      (d) => d.name
    );
    return {
      email,
      year,
      name: identity.name ?? null,
      photo,
      profile: {
        role: profile.role,
        department: profile.department ?? null,
        division: profile.division ?? null,
      },
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

/** Every year with an org structure, plus the current and next staff years. */
export const availableYears = query({
  args: {},
  handler: async (ctx) => {
    await requireEmail(ctx);
    const divisions = await ctx.db.query("divisions").take(1000);
    return [
      ...new Set([
        ...divisions.map((d) => d.year),
        currentStaffYear(),
        nextStaffYear(),
      ]),
    ].sort((a, b) => b - a);
  },
});

/**
 * The organisation chart for a staff year (defaults to the current one):
 * Director on top, then divisions -> departments (head first) -> members.
 * Names come from the synced Google profile when the person has signed in.
 * Also returns every year that has an org structure, for the year dropdown.
 */
export const orgChart = query({
  args: { year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireEmail(ctx);
    const year = args.year ?? currentStaffYear();

    // Distinct years with any structure (divisions are a handful per year).
    const allDivisions = await ctx.db.query("divisions").take(1000);
    const availableYears = [
      ...new Set([...allDivisions.map((d) => d.year), currentStaffYear()]),
    ].sort((a, b) => b - a);

    const divisions = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", year))
      .take(1000);

    const nameByEmail: Record<string, string | null> = {};
    const photoByEmail: Record<string, string | null> = {};
    for (const profile of profiles) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", profile.email))
        .first();
      nameByEmail[profile.email] = user?.name ?? profile.name ?? null;
      // A custom uploaded photo beats the Google default.
      photoByEmail[profile.email] = user?.avatarId
        ? await ctx.storage.getUrl(user.avatarId)
        : (user?.image ?? null);
    }
    const person = (email: string, role?: string) => ({
      email,
      name: nameByEmail[email] ?? null,
      photo: photoByEmail[email] ?? null,
      role: role ?? null,
    });

    const directorProfile = profiles.find((p) => p.role === DIRECTOR) ?? null;

    return {
      year,
      availableYears,
      director: directorProfile
        ? person(directorProfile.email, DIRECTOR)
        : null,
      divisions: divisions.map((division) => {
        const divisionHead = profiles.find(
          (p) => p.role === HEAD_OF_DIVISION && p.division === division.name
        );
        return {
          name: division.name,
          head: divisionHead ? person(divisionHead.email, HEAD_OF_DIVISION) : null,
          departments: departments
            .filter((department) => department.division === division.name)
            .map((department) => ({
              name: department.name,
              colour: department.colour ?? null,
              head: department.headEmail ? person(department.headEmail) : null,
              members: profiles
                .filter(
                  (p) =>
                    p.department === department.name &&
                    p.email !== department.headEmail &&
                    p.role !== DIRECTOR
                )
                .map((p) => person(p.email, p.role)),
            })),
        };
      }),
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
