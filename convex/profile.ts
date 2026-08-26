import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, MutationCtx, query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { assignmentsOf, departmentsOf, divisionsOf } from "../shared/flow";
import { currentStaffYear, optionalEmail, rolesOf } from "./model";

export const get = query({
  args: { email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const callerEmail = await optionalEmail(ctx);
    if (!callerEmail && !args.email) return null;
    const email = (args.email ?? callerEmail ?? "").trim().toLowerCase();

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    const avatarUrl = user?.avatarId ? await ctx.storage.getUrl(user.avatarId) : null;
    const dirUser = await ctx.db
      .query("directoryUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

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
    const serviceHistory = [...history.values()]
      .filter((h) => h.year <= currentStaffYear())
      .sort((a, b) => b.year - a.year);

    const anyProfile = serviceHistory.find((h) => h.name) ?? null;
    const dirPhoto = dirUser?.photoId
      ? await ctx.storage.getUrl(dirUser.photoId)
      : null;
    return {
      email,
      isMe: email === callerEmail,
      name: user?.name ?? dirUser?.name ?? anyProfile?.name ?? null,
      photo: avatarUrl ?? user?.image ?? dirPhoto,
      localChurch: callerEmail ? (user?.localChurch ?? null) : null,
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

async function requireOwnUser(ctx: MutationCtx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  const user = userId === null ? null : await ctx.db.get("users", userId);
  if (!user) throw new ConvexError("You must be signed in.");
  return user;
}

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
