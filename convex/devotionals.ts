import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireEmail } from "./model";
import { parseDayKey } from "../shared/calendar";
import {
  hasDevotionalContent,
  latestDevotionalDate,
  monthBounds,
  sameDevotionalContent,
  validateDevotionalDate,
  validateDevotionalInput,
  validateDevotionalMonth,
} from "../shared/devotionals";

const devotionalRowValidator = v.object({
  date: v.string(),
  passage: v.string(),
  notes: v.string(),
  prayerPoints: v.string(),
  updatedAt: v.number(),
});

export const byDate = query({
  args: { date: v.string() },
  returns: v.union(v.null(), devotionalRowValidator),
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const key = parseDayKey(args.date);
    if (!key) return null;
    const row = await ctx.db
      .query("devotionals")
      .withIndex("by_email_and_date", (q) => q.eq("email", email).eq("date", key))
      .unique();
    if (!row) return null;
    return {
      date: row.date,
      passage: row.passage,
      notes: row.notes,
      prayerPoints: row.prayerPoints,
      updatedAt: row.updatedAt,
    };
  },
});

export const byMonth = query({
  args: { year: v.number(), month: v.number() },
  returns: v.array(devotionalRowValidator),
  handler: async (ctx, { year, month }) => {
    const email = await requireEmail(ctx);
    if (!validateDevotionalMonth(year, month)) {
      throw new ConvexError("Invalid month.");
    }
    const { from, to } = monthBounds(year, month);
    const rows = await ctx.db
      .query("devotionals")
      .withIndex("by_email_and_date", (q) => q.eq("email", email).gte("date", from).lte("date", to))
      .take(31);
    return rows.map((row) => ({
      date: row.date,
      passage: row.passage,
      notes: row.notes,
      prayerPoints: row.prayerPoints,
      updatedAt: row.updatedAt,
    }));
  },
});

export const save = mutation({
  args: {
    date: v.string(),
    passage: v.string(),
    notes: v.string(),
    prayerPoints: v.string(),
    base: v.union(v.number(), v.null()),
  },
  returns: v.union(
    v.object({
      status: v.literal("saved"),
      date: v.string(),
      passage: v.string(),
      deleted: v.boolean(),
      updatedAt: v.number(),
    }),
    v.object({ status: v.literal("conflict"), date: v.string() })
  ),
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const now = Date.now();
    const dateCheck = validateDevotionalDate(args.date, latestDevotionalDate(now));
    if (!dateCheck.ok) throw new ConvexError(dateCheck.error);

    const contentCheck = validateDevotionalInput({
      passage: args.passage,
      notes: args.notes,
      prayerPoints: args.prayerPoints,
    });
    if (!contentCheck.ok) throw new ConvexError(contentCheck.error);

    const content = contentCheck.normalized;
    const date = dateCheck.date;
    const existing = await ctx.db
      .query("devotionals")
      .withIndex("by_email_and_date", (q) => q.eq("email", email).eq("date", date))
      .unique();
    const keep = hasDevotionalContent(content);

    if (existing ? sameDevotionalContent(existing, content) : !keep) {
      return {
        status: "saved" as const,
        date,
        passage: content.passage,
        deleted: !existing,
        updatedAt: existing?.updatedAt ?? now,
      };
    }
    if ((existing?.updatedAt ?? null) !== args.base) return { status: "conflict" as const, date };

    if (!keep) {
      if (existing) await ctx.db.delete("devotionals", existing._id);
      return { status: "saved" as const, date, passage: "", deleted: true, updatedAt: now };
    }
    if (existing) {
      await ctx.db.patch("devotionals", existing._id, { ...content, updatedAt: now });
    } else {
      await ctx.db.insert("devotionals", { email, date, ...content, updatedAt: now });
    }
    return { status: "saved" as const, date, passage: content.passage, deleted: false, updatedAt: now };
  },
});
