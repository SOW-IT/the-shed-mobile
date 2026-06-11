import { ConvexError, v } from "convex/values";
import {
  FINANCE,
  HEAD_OF_DIVISION,
  requestCompleted,
  ROLES,
  STAFF_ROLE,
} from "../shared/flow";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  currentStaffYear,
  getDepartment,
  getProfile,
  getYearSettings,
  nextStaffYear,
  requireAdmin,
  rolesOf,
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
 * Assign roles + department/division to a user for a year, by email — works
 * before the user has ever signed in. A person can hold multiple roles (e.g.
 * Head of Division AND Head of Department): division-based roles need a
 * division, everything else needs a department, and both may be set. Only
 * admins; ordinary users can never change their own roles or department.
 */
export const setStaffProfile = mutation({
  args: {
    email: v.string(),
    year: v.number(),
    roles: v.array(v.string()),
    department: v.optional(v.string()),
    division: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) throw new ConvexError("Enter a valid email.");
    const roles = [...new Set(args.roles)];
    if (roles.length === 0) throw new ConvexError("Pick at least one role.");
    for (const role of roles) {
      if (!ROLES.includes(role as (typeof ROLES)[number])) {
        throw new ConvexError(`Roles must be among: ${ROLES.join(", ")}.`);
      }
    }

    const needsDivision = roles.includes(HEAD_OF_DIVISION);
    const needsDepartment = roles.some((role) => role !== HEAD_OF_DIVISION);

    let division: string | undefined;
    if (needsDivision) {
      division = args.division;
      const exists =
        division &&
        (await ctx.db
          .query("divisions")
          .withIndex("by_year_and_name", (q) =>
            q.eq("year", args.year).eq("name", division!)
          )
          .unique());
      if (!exists) {
        throw new ConvexError(
          `A Head of Division needs a division that exists in ${args.year}.`
        );
      }
    }
    let department: string | undefined;
    if (needsDepartment) {
      department = args.department;
      const exists =
        department && (await getDepartment(ctx, args.year, department));
      if (!exists) {
        throw new ConvexError(
          `Department "${args.department ?? ""}" doesn't exist in ${args.year}.`
        );
      }
    }

    // Moving the Budget Manager out of Finance would violate the rule that
    // the Budget Manager must be from the Finance department.
    if (department !== FINANCE) {
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
        roles,
        role: undefined, // retire the legacy single-role field
        department,
        division,
      });
      return existing._id;
    }
    return await ctx.db.insert("staffProfiles", {
      email,
      year: args.year,
      roles,
      department,
      division,
    });
  },
});

export const removeStaffProfile = mutation({
  args: { email: v.string(), year: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const email = args.email.trim().toLowerCase();
    const profile = await getProfile(ctx, email, args.year);
    if (profile) await ctx.db.delete("staffProfiles", profile._id);
    // Don't leave a removed person assigned as the Budget Manager —
    // that would silently deadlock every Budget Manager approval.
    const settings = await getYearSettings(ctx, args.year);
    if (settings?.budgetManagerEmail === email) {
      await ctx.db.patch("yearSettings", settings._id, {
        budgetManagerEmail: undefined,
      });
    }
    return null;
  },
});

export const listStaffProfiles = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(1000);
    return profiles.map((profile) => ({ ...profile, roles: rolesOf(profile) }));
  },
});

/**
 * People who have signed in with Google but have no role/department for the
 * given year — either we never expected them, or they lapsed at rollover.
 * Lets admins spot and assign them instead of needing the email out-of-band.
 */
export const listUnassignedUsers = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(1000);
    const unassigned: { email: string; name: string | null }[] = [];
    for (const user of users) {
      if (!user.email) continue;
      const profile = await getProfile(ctx, user.email, args.year);
      if (!profile) {
        unassigned.push({ email: user.email, name: user.name ?? null });
      }
    }
    return unassigned;
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
    colour: v.optional(v.string()),
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
        colour: args.colour ?? existing.colour,
      });
      return existing._id;
    }
    return await ctx.db.insert("departments", {
      year: args.year,
      name,
      division: args.division,
      headEmail,
      colour: args.colour,
    });
  },
});

export const removeDepartment = mutation({
  args: { year: v.number(), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const department = await getDepartment(ctx, args.year, args.name);
    if (!department) return null;

    // Deleting a department that people or in-flight requests still point at
    // would silently strand them (invisible, unapprovable). Refuse instead.
    const members = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year_and_department", (q) =>
        q.eq("year", args.year).eq("department", args.name)
      )
      .take(1);
    if (members.length > 0) {
      throw new ConvexError(
        `"${args.name}" still has staff assigned in ${args.year} — move them to another department first.`
      );
    }
    const requests = await ctx.db
      .query("requests")
      .withIndex("by_year_and_department", (q) =>
        q.eq("year", args.year).eq("department", args.name)
      )
      .take(200);
    if (requests.some((request) => !requestCompleted(request))) {
      throw new ConvexError(
        `"${args.name}" still has open requests in ${args.year} — complete or cancel them first.`
      );
    }

    await ctx.db.delete("departments", department._id);
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

/** SOW's organisation structure: division -> departments. */
const ORG_STRUCTURE: Record<string, string[]> = {
  Governance: ["Data and IT", FINANCE, "Compliance"],
  Engagement: ["Marketing", "Alumni"],
  "Human Resources": ["People and Culture", "Training and Development"],
  Operations: ["Events", "Missions"],
};

/**
 * Bootstrap: replaces the current staff year's divisions/departments with the
 * SOW org structure (preserving department heads where names match) and makes
 * `adminEmail` an admin (Data and IT).
 * Run with: npx convex run admin:seed '{"adminEmail":"you@sow.org.au"}'
 */
export const seed = internalMutation({
  args: { adminEmail: v.string() },
  handler: async (ctx, args) => {
    const year = currentStaffYear();
    const email = args.adminEmail.trim().toLowerCase();

    const oldDepartments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    const headsByName: Record<string, string | undefined> = {};
    const coloursByName: Record<string, string | undefined> = {};
    for (const department of oldDepartments) {
      headsByName[department.name] = department.headEmail;
      coloursByName[department.name] = department.colour;
      await ctx.db.delete("departments", department._id);
    }
    const oldDivisions = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    for (const division of oldDivisions) {
      await ctx.db.delete("divisions", division._id);
    }

    for (const [division, departments] of Object.entries(ORG_STRUCTURE)) {
      await ctx.db.insert("divisions", { year, name: division });
      for (const name of departments) {
        await ctx.db.insert("departments", {
          year,
          name,
          division,
          headEmail: headsByName[name],
          colour: coloursByName[name],
        });
      }
    }

    const profile = await getProfile(ctx, email, year);
    if (!profile) {
      await ctx.db.insert("staffProfiles", {
        email,
        year,
        roles: [STAFF_ROLE],
        department: "Data and IT",
      });
    }
    return { year, admin: email };
  },
});
