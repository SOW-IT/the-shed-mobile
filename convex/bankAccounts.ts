import { ConvexError, v } from "convex/values";
import { mutation, MutationCtx, query } from "./_generated/server";
import { optionalEmail, requireEmail } from "./model";

/**
 * Remembers a bank account the caller used on a receipt so they don't have to
 * re-type it next time. Deduped per (email, bsb, accountNumber): a repeat use
 * just refreshes the account name and bumps it to the top of the picker.
 * Called from submitReceipt for every recipient on the requester's behalf.
 */
export async function rememberBankAccount(
  ctx: MutationCtx,
  email: string,
  account: { accountName: string; bsb: string; accountNumber: string }
): Promise<void> {
  // Canonicalise the owner key and account fields so case/whitespace
  // differences can't split one logical account into duplicate rows.
  const ownerEmail = email.trim().toLowerCase();
  const accountName = account.accountName.trim();
  const bsb = account.bsb.trim();
  const accountNumber = account.accountNumber.trim();
  const existing = await ctx.db
    .query("savedBankAccounts")
    .withIndex("by_email_bsb_accountNumber", (q) =>
      q.eq("email", ownerEmail).eq("bsb", bsb).eq("accountNumber", accountNumber)
    )
    .unique();
  if (existing) {
    await ctx.db.patch("savedBankAccounts", existing._id, {
      accountName,
      lastUsedAt: Date.now(),
    });
    return;
  }
  await ctx.db.insert("savedBankAccounts", {
    email: ownerEmail,
    accountName,
    bsb,
    accountNumber,
    lastUsedAt: Date.now(),
  });
}

/** The caller's saved bank accounts, most-recently-used first. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    if (!email) return null; // auth still attaching
    const accounts = await ctx.db
      .query("savedBankAccounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .take(100);
    const sorted = accounts.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    // If only one account, it is implicitly preferred.
    const hasExplicitPreferred = sorted.some((a) => a.preferred === true);
    return sorted.map((a, i) => ({
      id: a._id,
      accountName: a.accountName,
      bsb: a.bsb,
      accountNumber: a.accountNumber,
      preferred: a.preferred === true || (!hasExplicitPreferred && i === 0),
    }));
  },
});

/** Marks one of the caller's saved accounts as preferred, clearing the others. */
export const setPreferred = mutation({
  args: { id: v.id("savedBankAccounts") },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const account = await ctx.db.get("savedBankAccounts", args.id);
    if (!account || account.email !== email) {
      throw new ConvexError("You can only set your own saved accounts as preferred.");
    }
    const all = await ctx.db
      .query("savedBankAccounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    for (const a of all) {
      await ctx.db.patch("savedBankAccounts", a._id, { preferred: a._id === args.id ? true : undefined });
    }
    return null;
  },
});

/**
 * Adds a bank account the caller typed in directly (e.g. from the Bank tab).
 * By default the account is saved without changing which account is preferred;
 * pass `makePreferred: true` to make it the new auto-fill account. Reuses an
 * existing row with the same BSB + account number rather than duplicating it.
 */
export const addAccount = mutation({
  args: {
    accountName: v.string(),
    bsb: v.string(),
    accountNumber: v.string(),
    makePreferred: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const accountName = args.accountName.trim();
    const bsb = args.bsb.trim();
    const accountNumber = args.accountNumber.trim();
    if (!accountName) throw new ConvexError("Account name is required.");
    if (!bsb) throw new ConvexError("BSB is required.");
    if (!accountNumber) throw new ConvexError("Account number is required.");

    // Snapshot the caller's accounts *before* inserting so we can tell which one
    // is currently the effective preferred: the explicitly-flagged account, or
    // (per listMine's fallback) the most-recently-used one. Adding without
    // opting in must not change which account is preferred.
    const before = await ctx.db
      .query("savedBankAccounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    const hadExplicitPreferred = before.some((a) => a.preferred === true);
    const priorPreferredId =
      before.find((a) => a.preferred === true)?._id ??
      [...before].sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0]?._id;

    const existing = before.find(
      (a) => a.bsb === bsb && a.accountNumber === accountNumber
    );
    let targetId;
    if (existing) {
      await ctx.db.patch("savedBankAccounts", existing._id, {
        accountName,
        lastUsedAt: Date.now(),
      });
      targetId = existing._id;
    } else {
      targetId = await ctx.db.insert("savedBankAccounts", {
        email,
        accountName,
        bsb,
        accountNumber,
        lastUsedAt: Date.now(),
      });
    }

    // Opting in makes the added account preferred. Otherwise keep whatever was
    // already preferred — but if that was only *implicit* (no explicit flag),
    // pin it explicitly now so the freshly-bumped account can't silently usurp
    // the preferred slot via the most-recently-used fallback.
    const preferredId = args.makePreferred ? targetId : priorPreferredId ?? targetId;
    if (args.makePreferred || !hadExplicitPreferred) {
      const all = await ctx.db
        .query("savedBankAccounts")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();
      for (const a of all) {
        await ctx.db.patch("savedBankAccounts", a._id, {
          preferred: a._id === preferredId ? true : undefined,
        });
      }
    }
    return null;
  },
});

/** Updates the details of one of the caller's saved accounts. */
export const updateAccount = mutation({
  args: {
    id: v.id("savedBankAccounts"),
    accountName: v.string(),
    bsb: v.string(),
    accountNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const account = await ctx.db.get("savedBankAccounts", args.id);
    if (!account || account.email !== email) {
      throw new ConvexError("You can only update your own saved accounts.");
    }
    const accountName = args.accountName.trim();
    const bsb = args.bsb.trim();
    const accountNumber = args.accountNumber.trim();
    if (!accountName) throw new ConvexError("Account name is required.");
    if (!bsb) throw new ConvexError("BSB is required.");
    if (!accountNumber) throw new ConvexError("Account number is required.");
    const duplicate = await ctx.db
      .query("savedBankAccounts")
      .withIndex("by_email_bsb_accountNumber", (q) =>
        q.eq("email", email).eq("bsb", bsb).eq("accountNumber", accountNumber)
      )
      .unique();
    if (duplicate && duplicate._id !== args.id) {
      throw new ConvexError("You already have a saved account with those details.");
    }
    await ctx.db.patch("savedBankAccounts", args.id, { accountName, bsb, accountNumber });
    return null;
  },
});

/** Forgets one of the caller's saved accounts. If it was preferred, promotes the next most-recently-used. */
export const remove = mutation({
  args: { id: v.id("savedBankAccounts") },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const account = await ctx.db.get("savedBankAccounts", args.id);
    if (!account || account.email !== email) {
      throw new ConvexError("You can only remove your own saved accounts.");
    }
    const wasPreferred = account.preferred === true;
    await ctx.db.delete("savedBankAccounts", args.id);
    if (wasPreferred) {
      // Promote the next most-recently-used account as preferred.
      const remaining = (
        await ctx.db
          .query("savedBankAccounts")
          .withIndex("by_email", (q) => q.eq("email", email))
          .take(100)
      ).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
      if (remaining.length > 0) {
        await ctx.db.patch("savedBankAccounts", remaining[0]._id, { preferred: true });
      }
    }
    return null;
  },
});
