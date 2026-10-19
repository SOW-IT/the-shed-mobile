import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { assignmentsOf, departmentsOf, divisionsOf } from "../shared/flow";
import {
  currentStaffYear,
  isOrgEmail,
  optionalEmail,
  optionalProfile,
  optionalUser,
  rolesOf,
} from "./model";
import { hasSignedIn, lastOnlineAt } from "./presence";
import { canonicalEmailKey } from "../shared/rollcallImport";
import { viewOf } from "./churches";
import { isAssigned } from "./staffMembers";
import { AVATAR_SMALL_ENOUGH_BYTES, photoUrl } from "./photo";

export const get = query({
  args: { email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const callerEmail = await optionalEmail(ctx);
    if (!callerEmail && !args.email) {
      const user = await optionalUser(ctx);
      return user ? await ownProfileWithoutEmail(ctx, user) : null;
    }
    const email = (args.email ?? callerEmail ?? "").trim().toLowerCase();

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    const dirUser = await ctx.db
      .query("directoryUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

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
    const isMe =
      callerEmail !== null && canonicalEmailKey(email) === canonicalEmailKey(callerEmail);
    const seesPrivate = isMe || (await optionalProfile(ctx)) !== null;
    // A member's church (no staff profile this year) is only for staff and
    // campus leaders, as on the Churches page.
    const onStaff = serviceHistory.some((h) => h.year === currentStaffYear() && isAssigned(h));
    const church =
      user?.churchId && (onStaff || seesPrivate) ? await ctx.db.get("churches", user.churchId) : null;
    const directorySync = isMe && dirUser
      ? await ctx.db
          .query("syncState")
          .withIndex("by_key", (q) => q.eq("key", "directory"))
          .unique()
      : null;
    const directorySyncedAt =
      directorySync?.lastSuccessAt ??
      (directorySync?.detail?.startsWith("synced") ? directorySync.at : null);
    const googleSignInAt = isOrgEmail(email) ? (user?.emailVerificationTime ?? null) : null;
    const googleSyncTimes = [googleSignInAt, directorySyncedAt].filter(
      (at): at is number => at !== null
    );
    return {
      email,
      // Either staff email spelling is the same person.
      isMe,
      reminderEmails: isMe ? user?.reminderEmails !== false : null,
      googleSyncedAt: isMe && googleSyncTimes.length ? Math.max(...googleSyncTimes) : null,
      name: user?.name ?? dirUser?.name ?? anyProfile?.name ?? null,
      photo: await photoUrl(ctx, user, dirUser),
      church: church ? viewOf(church) : null,
      // Only for signed-in staff.
      lastOnlineAt: seesPrivate ? await lastOnlineAt(ctx, email) : null,
      hasSignedIn: seesPrivate ? await hasSignedIn(ctx, email) : null,
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

async function ownProfileWithoutEmail(ctx: QueryCtx, user: Doc<"users">) {
  const church = user.churchId ? await ctx.db.get("churches", user.churchId) : null;
  return {
    email: "",
    isMe: true,
    reminderEmails: user.reminderEmails !== false,
    googleSyncedAt: null,
    name: user.name ?? null,
    photo: await photoUrl(ctx, user, null),
    church: church ? viewOf(church) : null,
    lastOnlineAt: null,
    hasSignedIn: true,
    serviceHistory: [],
  };
}

async function requireOwnUser(ctx: MutationCtx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  const user = userId === null ? null : await ctx.db.get("users", userId);
  if (!user) throw new ConvexError("You must be signed in.");
  return user;
}

/** Picks your church from the list, or clears it (null). */
export const setChurch = mutation({
  args: { churchId: v.union(v.id("churches"), v.null()) },
  returns: v.null(),
  handler: async (ctx, { churchId }) => {
    const user = await requireOwnUser(ctx);
    if (churchId && !(await ctx.db.get("churches", churchId))) {
      throw new ConvexError("That church isn't in the list any more.");
    }
    await ctx.db.patch("users", user._id, { churchId: churchId ?? undefined });
    return null;
  },
});

export const setReminderEmails = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { enabled }) => {
    const user = await requireOwnUser(ctx);
    await ctx.db.patch("users", user._id, { reminderEmails: enabled ? undefined : false });
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
    if (user.avatarId && (await ctx.db.system.get(user.avatarId))) {
      await ctx.storage.delete(user.avatarId);
    }
    await ctx.db.patch("users", user._id, { avatarId: args.storageId });
    const file = await ctx.db.system.get(args.storageId);
    if (file && file.size > AVATAR_SMALL_ENOUGH_BYTES) {
      await ctx.scheduler.runAfter(0, internal.avatars.shrink, {
        userId: user._id,
        storageId: args.storageId,
      });
    }
    return null;
  },
});

export const replaceAvatar = internalMutation({
  args: { userId: v.id("users"), from: v.id("_storage"), to: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { userId, from, to }) => {
    const user = await ctx.db.get("users", userId);
    if (user?.avatarId !== from) {
      await ctx.storage.delete(to);
      return null;
    }
    await ctx.db.patch("users", userId, { avatarId: to });
    await ctx.storage.delete(from);
    return null;
  },
});

export const avatarsToShrink = internalQuery({
  args: {},
  returns: v.array(v.object({ userId: v.id("users"), storageId: v.id("_storage") })),
  handler: async (ctx) => {
    const found: { userId: Id<"users">; storageId: Id<"_storage"> }[] = [];
    for await (const user of ctx.db.query("users")) {
      if (!user.avatarId) continue;
      const file = await ctx.db.system.get(user.avatarId);
      if (file && file.size > AVATAR_SMALL_ENOUGH_BYTES) {
        found.push({ userId: user._id, storageId: user.avatarId });
      }
    }
    return found;
  },
});
