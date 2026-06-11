import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, MutationCtx, query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { requireEmail } from "./model";

/**
 * A person's profile: Google-synced identity, self-editable extras (church,
 * photo) and their service history — the role/department they held each year.
 * Any signed-in user can view anyone's profile (e.g. from the org chart);
 * name, email, role and department are never editable here.
 */
export const get = query({
  args: { email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const callerEmail = await requireEmail(ctx);
    const email = (args.email ?? callerEmail).trim().toLowerCase();

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    const avatarUrl = user?.avatarId ? await ctx.storage.getUrl(user.avatarId) : null;

    // Every year's role + department, newest first (index prefix on email).
    const history = await ctx.db
      .query("staffProfiles")
      .withIndex("by_email_and_year", (q) => q.eq("email", email))
      .order("desc")
      .take(50);

    return {
      email,
      isMe: email === callerEmail,
      name: user?.name ?? null,
      photo: avatarUrl ?? user?.image ?? null,
      localChurch: user?.localChurch ?? null,
      serviceHistory: history.map((h) => ({
        year: h.year,
        role: h.role,
        department: h.department ?? null,
        division: h.division ?? null,
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
