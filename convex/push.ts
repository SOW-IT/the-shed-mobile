import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { requireEmail } from "./model";

/** Called by the app after sign-in to register this device for pushes. */
export const register = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (existing) {
      // The device changed hands (different account signed in).
      if (existing.email !== email) {
        await ctx.db.patch("pushTokens", existing._id, { email });
      }
      return null;
    }
    await ctx.db.insert("pushTokens", { email, token: args.token });
    return null;
  },
});

export const tokensForEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<Doc<"pushTokens">[]> =>
    await ctx.db
      .query("pushTokens")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .take(20),
});

export const removeToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (existing) await ctx.db.delete("pushTokens", existing._id);
    return null;
  },
});

/**
 * Sends a push notification to every device registered to an email, via the
 * Expo push service. Scheduled from request mutations so flow updates never
 * block on delivery. Dead tokens are pruned on DeviceNotRegistered.
 */
export const send = internalAction({
  args: {
    to: v.string(),
    title: v.string(),
    body: v.string(),
    // In-app route to open when the notification is tapped.
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokens: Doc<"pushTokens">[] = await ctx.runQuery(
      internal.push.tokensForEmail,
      { email: args.to }
    );
    if (tokens.length === 0) return null;

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        tokens.map((t) => ({
          to: t.token,
          sound: "default",
          title: args.title,
          body: args.body,
          data: args.url ? { url: args.url } : {},
        }))
      ),
    });
    if (!response.ok) {
      console.error("Expo push error", response.status, await response.text());
      return null;
    }
    const result = (await response.json()) as {
      data?: { status: string; id?: string; details?: { error?: string } }[];
    };
    // Prune tokens for uninstalled apps. A dead token can surface in the
    // ticket immediately…
    const receiptIdToToken = new Map<string, string>();
    for (let i = 0; i < (result.data ?? []).length; i++) {
      const ticket = result.data![i];
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        await ctx.runMutation(internal.push.removeToken, { token: tokens[i].token });
      } else if (ticket.status === "ok" && ticket.id) {
        receiptIdToToken.set(ticket.id, tokens[i].token);
      }
    }
    // …but per Expo's delivery model most DeviceNotRegistered results only
    // appear in the RECEIPT, fetched after the ticket. Without this follow-up,
    // uninstalled devices' tokens were effectively never pruned — they pile up
    // (crowding the per-email take(20) cap) and repeatedly pushing to dead
    // tokens risks Expo throttling the project. Receipts are available within
    // ~15 minutes; check once, best-effort.
    if (receiptIdToToken.size > 0) {
      await ctx.scheduler.runAfter(15 * 60 * 1000, internal.push.checkReceipts, {
        receipts: [...receiptIdToToken.entries()].map(([id, token]) => ({ id, token })),
      });
    }
    return null;
  },
});

/**
 * Follow-up to `send`: fetch the delivery receipts for its tickets and prune
 * any token whose receipt reports DeviceNotRegistered. Best-effort — a failed
 * fetch just means the token gets another chance at the next send.
 */
export const checkReceipts = internalAction({
  args: {
    receipts: v.array(v.object({ id: v.string(), token: v.string() })),
  },
  handler: async (ctx, args) => {
    // Best-effort means best-effort: a network error or malformed body must not
    // fail the scheduled action — the token just gets another chance at the
    // next send's receipt check.
    let result: {
      data?: Record<string, { status: string; details?: { error?: string } }>;
    };
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: args.receipts.map((r) => r.id) }),
      });
      if (!response.ok) {
        console.error("Expo receipts error", response.status, await response.text());
        return null;
      }
      result = (await response.json()) as typeof result;
    } catch (error) {
      console.error("Expo receipts fetch failed", error);
      return null;
    }
    for (const { id, token } of args.receipts) {
      const receipt = result.data?.[id];
      if (
        receipt?.status === "error" &&
        receipt.details?.error === "DeviceNotRegistered"
      ) {
        await ctx.runMutation(internal.push.removeToken, { token });
      }
    }
    return null;
  },
});
