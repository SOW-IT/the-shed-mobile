import { ConvexError, v } from "convex/values";
import { dedupeAssignments, ROLES } from "../shared/flow";
import { internalMutation } from "./_generated/server";
import { currentStaffYear, findProfileForYear } from "./model";

const assignmentValidator = v.object({
  role: v.string(),
  department: v.optional(v.string()),
  division: v.optional(v.string()),
  university: v.optional(v.string()),
});

const assertPastYear = (year: number) => {
  if (year >= currentStaffYear()) {
    throw new ConvexError(
      `${year} isn't a past staff year. Change ${currentStaffYear()} and later in Admin.`
    );
  }
};

export const setRoleTitle = internalMutation({
  args: { year: v.number(), title: v.string(), standsFor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertPastYear(args.year);
    const title = args.title.trim();
    if (!title) throw new ConvexError("Enter the role's title.");
    if (args.standsFor !== undefined && !(ROLES as readonly string[]).includes(args.standsFor)) {
      throw new ConvexError(`"${args.standsFor}" isn't one of the app's roles.`);
    }
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year).eq("name", title))
      .unique();
    if (existing) {
      await ctx.db.patch("roles", existing._id, { standsFor: args.standsFor });
      return existing._id;
    }
    return await ctx.db.insert("roles", {
      year: args.year,
      name: title,
      standsFor: args.standsFor,
    });
  },
});

export const setPastAssignments = internalMutation({
  args: {
    year: v.number(),
    email: v.string(),
    assignments: v.array(assignmentValidator),
    name: v.optional(v.string()),
    importId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertPastYear(args.year);
    if (args.assignments.length === 0) throw new ConvexError("Give at least one assignment.");
    const email = args.email.trim().toLowerCase();
    const assignments = dedupeAssignments(args.assignments);
    const existing = await findProfileForYear(ctx, email, args.year);
    if (existing) {
      await ctx.db.patch("staffProfiles", existing._id, { assignments });
      return existing._id;
    }
    return await ctx.db.insert("staffProfiles", {
      email,
      year: args.year,
      assignments,
      name: args.name,
      importId: args.importId,
    });
  },
});
