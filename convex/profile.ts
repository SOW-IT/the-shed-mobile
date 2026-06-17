import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, MutationCtx, query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { assignmentsOf, departmentsOf, divisionsOf } from "../shared/flow";
import { currentStaffYear, optionalEmail, rolesOf } from "./model";

/**
 * A person's profile: Google-synced identity, self-editable extras (church,
 * photo) and their service history — the role/department they held each year.
 * Any signed-in user can view anyone's profile (e.g. from the org chart);
 * name, email, role and department are never editable here.
 */
export const get = query({
  args: { email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const callerEmail = await optionalEmail(ctx);
    if (!callerEmail) return null; // auth still attaching
    const email = (args.email ?? callerEmail).trim().toLowerCase();

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    const avatarUrl = user?.avatarId ? await ctx.storage.getUrl(user.avatarId) : null;

    // Every year's role + department, newest first. The email finds the
    // person; their bound user id and imported person id then pull in years
    // they served under an older email address.
    const byEmail = await ctx.db
      .query("staffProfiles")
      .withIndex("by_email_and_year", (q) => q.eq("email", email))
      .take(50);
    const history = new Map(byEmail.map((h) => [h._id, h]));
    const userIds = new Set(byEmail.flatMap((h) => (h.userId ? [h.userId] : [])));
    if (user) userIds.add(user._id);
    for (const userId of userIds) {
      const bound = await ctx.db
        .query("staffProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(50);
      for (const h of bound) history.set(h._id, h);
    }
    const importIds = new Set(
      [...history.values()].flatMap((h) => (h.importId ? [h.importId] : []))
    );
    for (const importId of importIds) {
      const imported = await ctx.db
        .query("staffProfiles")
        .withIndex("by_importId", (q) => q.eq("importId", importId))
        .take(50);
      for (const h of imported) history.set(h._id, h);
    }
    // Future years (admins pre-provision the next staff year) stay hidden
    // until the year actually starts at the September 1st rollover.
    const serviceHistory = [...history.values()]
      .filter((h) => h.year <= currentStaffYear())
      .sort((a, b) => b.year - a.year);

    const anyProfile = serviceHistory.find((h) => h.name) ?? null;
    const dirUser = await ctx.db
      .query("directoryUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    return {
      email,
      isMe: email === callerEmail,
      name: user?.name ?? dirUser?.name ?? anyProfile?.name ?? null,
      photo: avatarUrl ?? user?.image ?? null,
      localChurch: user?.localChurch ?? null,
      serviceHistory: serviceHistory.map((h) => ({
        year: h.year,
        roles: rolesOf(h),
        assignments: assignmentsOf(h),
        department: departmentsOf(h)[0] ?? null,
        division: divisionsOf(h)[0] ?? null,
        university: assignmentsOf(h).find((a) => a.university)?.university ?? null,
      })),
    };
  },
});

/** The signed-in caller's own users row. */
async function requireOwnUser(ctx: MutationCtx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  const user = userId === null ? null : await ctx.db.get("users", userId);
  if (!user) throw new ConvexError("You must be signed in.");
  return user;
}

/** Users may edit their own church. Nothing else on the profile is editable. */
export const updateChurch = mutation({
  args: { localChurch: v.string() },
  handler: async (ctx, args) => {
    const user = await requireOwnUser(ctx);
    await ctx.db.patch("users", user._id, {
      localChurch: args.localChurch.trim() || undefined,
    });
    return null;
  },
});

export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOwnUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const user = await requireOwnUser(ctx);
    if (user.avatarId) {
      await ctx.storage.delete(user.avatarId);
    }
    await ctx.db.patch("users", user._id, { avatarId: args.storageId });
    return null;
  },
});
