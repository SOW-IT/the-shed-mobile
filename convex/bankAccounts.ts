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
  const accountName = account.accountName.trim();
  const existing = (
    await ctx.db
      .query("savedBankAccounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .take(100)
  ).find(
    (a) => a.bsb === account.bsb && a.accountNumber === account.accountNumber
  );
  if (existing) {
    await ctx.db.patch("savedBankAccounts", existing._id, {
      accountName,
      lastUsedAt: Date.now(),
    });
    return;
  }
  await ctx.db.insert("savedBankAccounts", {
    email,
    accountName,
    bsb: account.bsb,
    accountNumber: account.accountNumber,
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
    return accounts
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .map((a) => ({
        id: a._id,
        accountName: a.accountName,
        bsb: a.bsb,
        accountNumber: a.accountNumber,
      }));
  },
});

/** Forgets one of the caller's saved accounts. */
export const remove = mutation({
  args: { id: v.id("savedBankAccounts") },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const account = await ctx.db.get("savedBankAccounts", args.id);
    if (!account || account.email !== email) {
      throw new ConvexError("You can only remove your own saved accounts.");
    }
    await ctx.db.delete("savedBankAccounts", args.id);
    return null;
  },
});
