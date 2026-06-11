import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internalMutation, MutationCtx } from "./_generated/server";

/**
 * Re-keys every email-keyed reference from oldEmail to newEmail: staff
 * profiles, requests, department headships, Budget Manager assignments and
 * push tokens. Runs when a signed-in account's Google email changes.
 */
async function rekeyEmail(ctx: MutationCtx, oldEmail: string, newEmail: string) {
  const profiles = await ctx.db
    .query("staffProfiles")
    .withIndex("by_email_and_year", (q) => q.eq("email", oldEmail))
    .take(100);
  for (const profile of profiles) {
    await ctx.db.patch("staffProfiles", profile._id, { email: newEmail });
  }

  const requests = await ctx.db
    .query("requests")
    .withIndex("by_requester", (q) => q.eq("requesterEmail", oldEmail))
    .take(1000);
  for (const request of requests) {
    await ctx.db.patch("requests", request._id, { requesterEmail: newEmail });
  }

  const departments = await ctx.db.query("departments").take(2000);
  for (const department of departments) {
    if (department.headEmail === oldEmail) {
      await ctx.db.patch("departments", department._id, { headEmail: newEmail });
    }
  }

  const settings = await ctx.db.query("yearSettings").take(100);
  for (const setting of settings) {
    if (setting.budgetManagerEmail === oldEmail) {
      await ctx.db.patch("yearSettings", setting._id, {
        budgetManagerEmail: newEmail,
      });
    }
  }

  const tokens = await ctx.db
    .query("pushTokens")
    .withIndex("by_email", (q) => q.eq("email", oldEmail))
    .take(50);
  for (const token of tokens) {
    await ctx.db.patch("pushTokens", token._id, { email: newEmail });
  }
}

/**
 * Called on every sign-in (Convex Auth's afterUserCreatedOrUpdated):
 * 1. If profiles bound to this user id carry a different email, the Google
 *    account was renamed — re-key everything from the old email to the new.
 * 2. Bind any not-yet-bound profiles for this email (pre-provisioned rows)
 *    to the user id, making it the durable anchor from then on.
 */
export async function linkUserProfiles(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get("users", userId);
  const email = user?.email?.toLowerCase();
  if (!email) return;

  const bound = await ctx.db
    .query("staffProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(100);
  const oldEmails = [...new Set(bound.map((p) => p.email))].filter(
    (e) => e !== email
  );
  for (const oldEmail of oldEmails) {
    await rekeyEmail(ctx, oldEmail, email);
  }

  const unbound = await ctx.db
    .query("staffProfiles")
    .withIndex("by_email_and_year", (q) => q.eq("email", email))
    .take(100);
  for (const profile of unbound) {
    if (profile.userId === undefined) {
      await ctx.db.patch("staffProfiles", profile._id, { userId });
    }
  }
}

/** Test/maintenance entry point for the sign-in linking logic. */
export const link = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await linkUserProfiles(ctx, args.userId);
    return null;
  },
});
