import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireEmail } from "./model";
import { parseDayKey } from "../shared/calendar";
import {
  hasDevotionalContent,
  monthBounds,
  todayDevotionalDate,
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
  },
  returns: v.object({
    date: v.string(),
    passage: v.string(),
    deleted: v.boolean(),
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const now = Date.now();
    const today = todayDevotionalDate(now);
    const dateCheck = validateDevotionalDate(args.date, today);
    if (!dateCheck.ok) throw new ConvexError(dateCheck.error);

    const contentCheck = validateDevotionalInput({
      passage: args.passage,
      notes: args.notes,
      prayerPoints: args.prayerPoints,
    });
    if (!contentCheck.ok) throw new ConvexError(contentCheck.error);

    const { passage, notes, prayerPoints } = contentCheck.normalized;
    const existing = await ctx.db
      .query("devotionals")
      .withIndex("by_email_and_date", (q) => q.eq("email", email).eq("date", dateCheck.date))
      .unique();

    if (!hasDevotionalContent({ passage, notes, prayerPoints })) {
      if (existing) await ctx.db.delete("devotionals", existing._id);
      return { date: dateCheck.date, passage: "", deleted: true, updatedAt: now };
    }

    if (existing) {
      await ctx.db.patch("devotionals", existing._id, {
        passage,
        notes,
        prayerPoints,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("devotionals", {
        email,
        date: dateCheck.date,
        passage,
        notes,
        prayerPoints,
        updatedAt: now,
      });
    }
    return { date: dateCheck.date, passage, deleted: false, updatedAt: now };
  },
});
