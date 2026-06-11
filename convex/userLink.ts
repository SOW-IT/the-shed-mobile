import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internalMutation, MutationCtx } from "./_generated/server";

/**
 * The organisation's previous Google Workspace domains. Data imported from
 * the old web app is keyed by addresses on these; when someone first signs
 * in with their renamed account (same local part, new domain), their old
 * profiles are claimed and re-keyed to the new address.
 */
const LEGACY_EMAIL_DOMAINS = ["sowaustralia.com"];

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
    // Never create a second (email, year) profile — if one already exists
    // under the new email for that year, it wins and the old row goes.
    const existing = await ctx.db
      .query("staffProfiles")
      .withIndex("by_email_and_year", (q) =>
        q.eq("email", newEmail).eq("year", profile.year)
      )
      .unique();
    if (existing) {
      await ctx.db.delete("staffProfiles", profile._id);
    } else {
      await ctx.db.patch("staffProfiles", profile._id, { email: newEmail });
    }
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

  const divisions = await ctx.db.query("divisions").take(2000);
  for (const division of divisions) {
    if (division.headEmail === oldEmail) {
      await ctx.db.patch("divisions", division._id, { headEmail: newEmail });
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
 * 3. If nothing matches the email (the org migrated Workspace domains), try
 *    the same local part on the legacy domains and re-key those profiles to
 *    the new address.
 * 4. Profiles imported from the old web app carry an importId shared by all
 *    of the same person's years — bind those too, and re-key any years that
 *    were imported under one of the person's older email addresses.
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

  let unbound = await ctx.db
    .query("staffProfiles")
    .withIndex("by_email_and_year", (q) => q.eq("email", email))
    .take(100);
  if (bound.length === 0 && unbound.length === 0) {
    const localPart = email.split("@")[0];
    for (const domain of LEGACY_EMAIL_DOMAINS) {
      const legacyEmail = `${localPart}@${domain}`;
      const legacy = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", legacyEmail))
        .take(100);
      if (legacy.length > 0) {
        await rekeyEmail(ctx, legacyEmail, email);
        unbound = await ctx.db
          .query("staffProfiles")
          .withIndex("by_email_and_year", (q) => q.eq("email", email))
          .take(100);
        break;
      }
    }
  }
  for (const profile of unbound) {
    if (profile.userId === undefined) {
      await ctx.db.patch("staffProfiles", profile._id, { userId });
    }
  }

  // The person behind this user id, as known from the import. Any of their
  // profiles still keyed by an older email belong to this account too.
  const importIds = new Set<string>();
  for (const profile of [...bound, ...unbound]) {
    if (profile.importId !== undefined) importIds.add(profile.importId);
  }
  for (const importId of importIds) {
    const siblings = await ctx.db
      .query("staffProfiles")
      .withIndex("by_importId", (q) => q.eq("importId", importId))
      .take(100);
    const siblingEmails = new Set<string>();
    for (const profile of siblings) {
      if (profile.userId !== userId) {
        await ctx.db.patch("staffProfiles", profile._id, { userId });
      }
      if (profile.email !== email) siblingEmails.add(profile.email);
    }
    for (const oldEmail of siblingEmails) {
      await rekeyEmail(ctx, oldEmail, email);
    }
  }

  // Every profile of this person ends up with the durable person key: their
  // imported id when one exists, otherwise their user id (people who joined
  // after the migration from the old app).
  const personKey = [...importIds][0] ?? userId;
  const mine = await ctx.db
    .query("staffProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(100);
  for (const profile of mine) {
    if (profile.importId === undefined) {
      await ctx.db.patch("staffProfiles", profile._id, { importId: personKey });
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
