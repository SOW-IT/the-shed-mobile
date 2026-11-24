import { v } from "convex/values";
import { query } from "./_generated/server";
import { optionalEmail } from "./model";
import { worldLookValidator } from "./worldData";

export const myLook = query({
  args: {},
  returns: v.union(v.null(), worldLookValidator),
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    const row = await ctx.db
      .query("worldLooks")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    return row?.look ?? null;
  },
});
