import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { isAdminProfile, optionalEmail, optionalProfile, requireAdmin } from "./model";

const MESSAGE_LIMIT = 500;
const STACK_LIMIT = 4000;
const ROUTE_LIMIT = 200;
const PLATFORM_LIMIT = 16;
const VERSION_LIMIT = 32;
const NEW_ERRORS_PER_HOUR = 200;
const HOUR_MS = 60 * 60 * 1000;
const REPEAT_WINDOW_MS = 5000;
const RECENT_DAYS = 7;
const RECENT_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

const isAdminCaller = async (ctx: QueryCtx): Promise<boolean> => {
  const caller = await optionalProfile(ctx);
  return !!caller && (await isAdminProfile(ctx, caller.profile));
};

const trimTo = (value: string | undefined, limit: number) =>
  value === undefined ? undefined : value.length > limit ? value.slice(0, limit) : value;

const hash = (input: string): string => {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

const stripVolatile = (message: string): string =>
  message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b[a-z0-9]{32}\b/gi, "<id>")
    .replace(/\d{3,}/g, "<n>");

export const fingerprintOf = (input: {
  message: string;
  platform: string;
  version?: string;
  route?: string;
}): string =>
  hash(
    [
      stripVolatile(input.message.trim()),
      input.platform,
      input.version ?? "",
      stripVolatile(input.route ?? ""),
    ].join("\n")
  );

export const report = mutation({
  args: {
    message: v.string(),
    stack: v.optional(v.string()),
    route: v.optional(v.string()),
    platform: v.string(),
    version: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const message = trimTo(args.message.trim(), MESSAGE_LIMIT) ?? "";
    if (!message) throw new ConvexError("An error needs a message.");
    const platform = trimTo(args.platform.trim(), PLATFORM_LIMIT) || "unknown";
    const version = trimTo(args.version?.trim(), VERSION_LIMIT) || undefined;
    const route = trimTo(args.route, ROUTE_LIMIT);
    const email = (await optionalEmail(ctx)) ?? undefined;
    const now = Date.now();
    const fingerprint = fingerprintOf({ message, platform, version, route });
    const existing = await ctx.db
      .query("appErrors")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
      .unique();
    if (existing) {
      if (now - existing.lastAt < REPEAT_WINDOW_MS) return { fingerprint, repeated: true };
      await ctx.db.patch("appErrors", existing._id, {
        count: existing.count + 1,
        lastAt: now,
        ...(args.stack ? { stack: trimTo(args.stack, STACK_LIMIT) } : {}),
        ...(email ? { lastEmail: email } : {}),
      });
      return { fingerprint, repeated: false };
    }
    const busyHour = await ctx.db
      .query("appErrors")
      .withIndex("by_lastAt", (q) => q.gte("lastAt", now - HOUR_MS))
      .take(NEW_ERRORS_PER_HOUR);
    if (busyHour.length >= NEW_ERRORS_PER_HOUR) return { fingerprint, repeated: true };
    await ctx.db.insert("appErrors", {
      fingerprint,
      message,
      stack: trimTo(args.stack, STACK_LIMIT),
      route,
      platform,
      version,
      lastEmail: email,
      count: 1,
      firstAt: now,
      lastAt: now,
    });
    return { fingerprint, repeated: false };
  },
});

export const recent = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isAdminCaller(ctx))) return null;
    const since = Date.now() - RECENT_DAYS * DAY_MS;
    const rows = await ctx.db
      .query("appErrors")
      .withIndex("by_lastAt", (q) => q.gte("lastAt", since))
      .order("desc")
      .take(RECENT_LIMIT);
    return {
      days: RECENT_DAYS,
      errors: rows.map((row) => ({
        id: row._id,
        message: row.message,
        stack: row.stack ?? null,
        route: row.route ?? null,
        platform: row.platform,
        version: row.version ?? null,
        lastEmail: row.lastEmail ?? null,
        count: row.count,
        firstAt: row.firstAt,
        lastAt: row.lastAt,
      })),
    };
  },
});

export const dismiss = mutation({
  args: { id: v.id("appErrors") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get("appErrors", args.id);
    if (!row) throw new ConvexError("That error has already been cleared.");
    await ctx.db.delete("appErrors", args.id);
    return null;
  },
});
