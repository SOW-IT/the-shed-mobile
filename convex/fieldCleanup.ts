import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { churchByName, churchNameKey } from "./churches";

const MAX_USERS = 5000;
const IMPORT_ID_PAGE = 500;
const ADDED_BY = "system:typed-church";

const typedChurchResult = v.object({
  userId: v.id("users"),
  email: v.union(v.string(), v.null()),
  typed: v.string(),
  church: v.union(v.string(), v.null()),
  action: v.union(
    v.literal("linked"),
    v.literal("added and linked"),
    v.literal("already had a church"),
    v.literal("cleared blank")
  ),
});

export const linkTypedChurches = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.object({ dryRun: v.boolean(), results: v.array(typedChurchResult) }),
  handler: async (ctx, { dryRun = true }) => {
    const users = (await ctx.db.query("users").take(MAX_USERS)).filter((u) => u.localChurch !== undefined);
    const added = new Map<string, Id<"churches"> | null>();
    const results = [];
    for (const user of users) {
      const typed = user.localChurch!.trim().replace(/\s+/g, " ");
      const base = { userId: user._id, email: user.email ?? null, typed };
      const current = user.churchId ? await ctx.db.get("churches", user.churchId) : null;
      if (current || !typed) {
        results.push({
          ...base,
          church: current?.name ?? null,
          action: current ? ("already had a church" as const) : ("cleared blank" as const),
        });
        if (!dryRun) await ctx.db.patch("users", user._id, { localChurch: undefined });
        continue;
      }
      const key = churchNameKey(typed);
      const existing = await churchByName(ctx, typed);
      let churchId = existing?._id ?? added.get(key) ?? null;
      const action = existing || added.has(key) ? ("linked" as const) : ("added and linked" as const);
      if (!existing && !added.has(key)) {
        churchId = dryRun ? null : await ctx.db.insert("churches", { name: typed, nameKey: key, addedBy: ADDED_BY });
        added.set(key, churchId);
      }
      results.push({ ...base, church: existing?.name ?? typed, action });
      if (!dryRun) await ctx.db.patch("users", user._id, { churchId: churchId!, localChurch: undefined });
    }
    return { dryRun, results };
  },
});

export const clearImportIds = internalMutation({
  args: {
    table: v.union(v.literal("events"), v.literal("attendanceMembers")),
    cursor: v.optional(v.union(v.string(), v.null())),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    dryRun: v.boolean(),
    found: v.number(),
    next: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { table, cursor, dryRun = true }) => {
    const page = await ctx.db.query(table).paginate({ numItems: IMPORT_ID_PAGE, cursor: cursor ?? null });
    let found = 0;
    for (const row of page.page) {
      if (row.sourceImportId === undefined) continue;
      found++;
      if (!dryRun) await ctx.db.patch(row._id, { sourceImportId: undefined });
    }
    return { dryRun, found, next: page.isDone ? null : page.continueCursor };
  },
});
