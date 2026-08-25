import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { internalMutation, MutationCtx } from "./_generated/server";

const LEGACY_EMAIL_DOMAINS = ["sowaustralia.com"];

const LEGACY_CLAIM_NOTIFY_EMAIL = "it@sow.org.au";

async function rekeyEmail(ctx: MutationCtx, oldEmail: string, newEmail: string) {
  const profiles = await ctx.db
    .query("staffProfiles")
    .withIndex("by_email_and_year", (q) => q.eq("email", oldEmail))
    .take(100);
  for (const profile of profiles) {
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

  for (;;) {
    const requests = await ctx.db
      .query("requests")
      .withIndex("by_requester", (q) => q.eq("requesterEmail", oldEmail))
      .take(500);
    if (requests.length === 0) break;
    for (const request of requests) {
      await ctx.db.patch("requests", request._id, { requesterEmail: newEmail });
    }
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

  const delegations = await ctx.db.query("approverDelegations").take(2000);
  for (const delegation of delegations) {
    const nextFrom = delegation.fromEmail === oldEmail ? newEmail : delegation.fromEmail;
    const nextTo = delegation.toEmail === oldEmail ? newEmail : delegation.toEmail;
    if (nextFrom === delegation.fromEmail && nextTo === delegation.toEmail) continue;
    const collidesWithExisting =
      nextFrom !== nextTo &&
      (await ctx.db
        .query("approverDelegations")
        .withIndex("by_year_and_from_and_to", (q) =>
          q.eq("year", delegation.year).eq("fromEmail", nextFrom).eq("toEmail", nextTo)
        )
        .first()) !== null;
    if (nextFrom === nextTo || collidesWithExisting) {
      await ctx.db.delete("approverDelegations", delegation._id);
    } else {
      await ctx.db.patch("approverDelegations", delegation._id, {
        fromEmail: nextFrom,
        toEmail: nextTo,
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
        if (legacy.some((p) => p.userId !== undefined && p.userId !== userId)) {
          break;
        }
        await rekeyEmail(ctx, legacyEmail, email);
        await ctx.scheduler.runAfter(0, internal.emails.send, {
          to: LEGACY_CLAIM_NOTIFY_EMAIL,
          subject: `Legacy profile claim: ${legacyEmail} → ${email}`,
          body:
            `${email} signed in for the first time and automatically claimed ` +
            `the profiles previously keyed to ${legacyEmail} (${legacy.length} ` +
            `profile year(s), plus their requests and org placements).\n\n` +
            `If these are two different people, this needs to be undone. ` +
            `Contact Data and IT to re-key the affected rows.`,
        });
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

export const link = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await linkUserProfiles(ctx, args.userId);
    return null;
  },
});
