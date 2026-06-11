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
  args: { to: v.string(), title: v.string(), body: v.string() },
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
        }))
      ),
    });
    if (!response.ok) {
      console.error("Expo push error", response.status, await response.text());
      return null;
    }
    const result = (await response.json()) as {
      data?: { status: string; details?: { error?: string } }[];
    };
    // Prune tokens for uninstalled apps.
    for (let i = 0; i < (result.data ?? []).length; i++) {
      const ticket = result.data![i];
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        await ctx.runMutation(internal.push.removeToken, { token: tokens[i].token });
      }
    }
    return null;
  },
});
