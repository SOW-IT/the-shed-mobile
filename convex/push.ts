import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import {
  ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { requireEmail } from "./model";

export const register = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (existing) {
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

/** Expo takes at most this many messages in one request. */
const EXPO_BATCH = 100;

/**
 * Sends one notification to every device token, in Expo-sized batches.
 * Devices Expo says are gone are forgotten; the rest get their receipts
 * checked later, which catches devices that unregister after delivery.
 */
async function pushToTokens(
  ctx: ActionCtx,
  tokens: string[],
  message: { title: string; body: string; url?: string }
): Promise<void> {
  const receipts: { id: string; token: string }[] = [];
  for (let start = 0; start < tokens.length; start += EXPO_BATCH) {
    const batch = tokens.slice(start, start + EXPO_BATCH);
    let result: {
      data?: { status: string; id?: string; details?: { error?: string } }[];
    };
    // One failed batch mustn't stop the rest, or the receipt check for the
    // batches already sent.
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          batch.map((token) => ({
            to: token,
            sound: "default",
            title: message.title,
            body: message.body,
            data: message.url ? { url: message.url } : {},
          }))
        ),
      });
      if (!response.ok) {
        console.error("Expo push error", response.status, await response.text());
        continue;
      }
      result = (await response.json()) as typeof result;
    } catch (error) {
      console.error("Expo push failed", error);
      continue;
    }
    for (let i = 0; i < (result.data ?? []).length; i++) {
      const ticket = result.data![i];
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        await ctx.runMutation(internal.push.removeToken, { token: batch[i] });
      } else if (ticket.status === "ok" && ticket.id) {
        receipts.push({ id: ticket.id, token: batch[i] });
      }
    }
  }
  if (receipts.length > 0) {
    await ctx.scheduler.runAfter(15 * 60 * 1000, internal.push.checkReceipts, {
      receipts,
    });
  }
}

export const send = internalAction({
  args: {
    to: v.string(),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokens: Doc<"pushTokens">[] = await ctx.runQuery(
      internal.push.tokensForEmail,
      { email: args.to }
    );
    await pushToTokens(
      ctx,
      tokens.map((t) => t.token),
      args
    );
    return null;
  },
});

export const tokensForEmails = internalQuery({
  args: { emails: v.array(v.string()) },
  handler: async (ctx, args): Promise<string[]> => {
    const tokens: string[] = [];
    for (const email of args.emails) {
      const rows = await ctx.db
        .query("pushTokens")
        .withIndex("by_email", (q) => q.eq("email", email))
        .take(20);
      tokens.push(...rows.map((row) => row.token));
    }
    return tokens;
  },
});

/** The same notification to many people (an announcement). */
export const sendMany = internalAction({
  args: {
    to: v.array(v.string()),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokens: string[] = await ctx.runQuery(internal.push.tokensForEmails, {
      emails: args.to,
    });
    await pushToTokens(ctx, tokens, { title: args.title, body: args.body, url: args.url });
    return null;
  },
});

export const checkReceipts = internalAction({
  args: {
    receipts: v.array(v.object({ id: v.string(), token: v.string() })),
  },
  handler: async (ctx, args) => {
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
