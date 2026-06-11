import { ConvexError, v } from "convex/values";
import { FINANCE, ROLES, STAFF_ROLE } from "../shared/flow";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  currentStaffYear,
  getDepartment,
  getProfile,
  getYearSettings,
  nextStaffYear,
  requireAdmin,
} from "./model";

/** Admins may only manage the current staff year and the next one. */
const assertManagedYear = (year: number) => {
  if (year !== currentStaffYear() && year !== nextStaffYear()) {
    throw new ConvexError(
      `You can only manage ${currentStaffYear()} and ${nextStaffYear()}.`
    );
  }
};

/**
 * Assign a role + department to a user for a year, by email — works before
 * the user has ever signed in. Only admins; ordinary users can never change
 * their own role or department.
 */
export const setStaffProfile = mutation({
  args: {
    email: v.string(),
    year: v.number(),
    role: v.string(),
    department: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) throw new ConvexError("Enter a valid email.");
    if (!ROLES.includes(args.role as (typeof ROLES)[number])) {
      throw new ConvexError(`Role must be one of: ${ROLES.join(", ")}.`);
    }
    const department = await getDepartment(ctx, args.year, args.department);
    if (!department) {
      throw new ConvexError(
        `Department "${args.department}" doesn't exist in ${args.year}.`
      );
    }

    // Moving the Budget Manager out of Finance would violate the rule that
    // the Budget Manager must be from the Finance department.
    if (args.department !== FINANCE) {
      const settings = await getYearSettings(ctx, args.year);
      if (settings?.budgetManagerEmail === email) {
        await ctx.db.patch("yearSettings", settings._id, {
          budgetManagerEmail: undefined,
        });
      }
    }

    const existing = await getProfile(ctx, email, args.year);
    if (existing) {
      await ctx.db.patch("staffProfiles", existing._id, {
        role: args.role,
        department: args.department,
      });
      return existing._id;
    }
    return await ctx.db.insert("staffProfiles", {
      email,
      year: args.year,
      role: args.role,
      department: args.department,
    });
  },
});

export const removeStaffProfile = mutation({
  args: { email: v.string(), year: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const profile = await getProfile(ctx, args.email.trim().toLowerCase(), args.year);
    if (profile) await ctx.db.delete("staffProfiles", profile._id);
    return null;
  },
});

export const listStaffProfiles = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(1000);
  },
});

export const upsertDivision = mutation({
  args: { year: v.number(), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Division name is required.");
    const existing = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year).eq("name", name))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("divisions", { year: args.year, name });
  },
});

export const removeDivision = mutation({
  args: { year: v.number(), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const division = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) =>
        q.eq("year", args.year).eq("name", args.name)
      )
      .unique();
    if (!division) return null;
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
      .take(200);
    if (departments.some((d) => d.division === args.name)) {
      throw new ConvexError("Move its departments to another division first.");
    }
    await ctx.db.delete("divisions", division._id);
    return null;
  },
});

export const upsertDepartment = mutation({
  args: {
    year: v.number(),
    name: v.string(),
    division: v.string(),
    headEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Department name is required.");
    const division = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) =>
        q.eq("year", args.year).eq("name", args.division)
      )
      .unique();
    if (!division) {
      throw new ConvexError(`Division "${args.division}" doesn't exist in ${args.year}.`);
    }
    const headEmail = args.headEmail?.trim().toLowerCase() || undefined;
    const existing = await getDepartment(ctx, args.year, name);
    if (existing) {
      await ctx.db.patch("departments", existing._id, {
        division: args.division,
        headEmail,
      });
      return existing._id;
    }
    return await ctx.db.insert("departments", {
      year: args.year,
      name,
      division: args.division,
      headEmail,
    });
  },
});

export const removeDepartment = mutation({
  args: { year: v.number(), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const department = await getDepartment(ctx, args.year, args.name);
    if (department) await ctx.db.delete("departments", department._id);
    return null;
  },
});

/** The Budget Manager must be a member of the Finance department that year. */
export const setBudgetManager = mutation({
  args: { year: v.number(), email: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const email = args.email.trim().toLowerCase();
    const profile = await getProfile(ctx, email, args.year);
    if (!profile || profile.department !== FINANCE) {
      throw new ConvexError(
        `The Budget Manager must be from the ${FINANCE} department in ${args.year}.`
      );
    }
    const settings = await getYearSettings(ctx, args.year);
    if (settings) {
      await ctx.db.patch("yearSettings", settings._id, { budgetManagerEmail: email });
      return settings._id;
    }
    return await ctx.db.insert("yearSettings", {
      year: args.year,
      budgetManagerEmail: email,
    });
  },
});

/**
 * One-time bootstrap: creates the default divisions/departments for the
 * current staff year and makes `adminEmail` an admin (Data and IT).
 * Run with: npx convex run admin:seed '{"adminEmail":"you@sow.org.au"}'
 */
export const seed = internalMutation({
  args: { adminEmail: v.string() },
  handler: async (ctx, args) => {
    const year = currentStaffYear();
    const email = args.adminEmail.trim().toLowerCase();

    const divisions = ["Operations", "People"];
    for (const name of divisions) {
      const existing = await ctx.db
        .query("divisions")
        .withIndex("by_year_and_name", (q) => q.eq("year", year).eq("name", name))
        .unique();
      if (!existing) await ctx.db.insert("divisions", { year, name });
    }

    const departments: { name: string; division: string }[] = [
      { name: FINANCE, division: "Operations" },
      { name: "Data and IT", division: "Operations" },
      { name: "Marketing", division: "Operations" },
      { name: "Human Resources", division: "People" },
    ];
    for (const department of departments) {
      const existing = await getDepartment(ctx, year, department.name);
      if (!existing) {
        await ctx.db.insert("departments", { year, ...department });
      }
    }

    const profile = await getProfile(ctx, email, year);
    if (!profile) {
      await ctx.db.insert("staffProfiles", {
        email,
        year,
        role: STAFF_ROLE,
        department: "Data and IT",
      });
    }
    return { year, admin: email };
  },
});
