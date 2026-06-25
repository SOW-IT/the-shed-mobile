import { ConvexError, v } from "convex/values";
import { staffYearStartMs } from "../shared/flow";
import { normalizeSubgroups } from "../shared/rollcall";
import { mutation, query } from "./_generated/server";
import { optionalProfile, requireProfile } from "./model";

export const list = query({
  args: { year: v.number() },
  handler: async (ctx, { year }) => {
    if (!(await optionalProfile(ctx))) return [];
    const rows = await ctx.db
      .query("attendanceTags")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const saveAll = mutation({
  args: {
    year: v.number(),
    tags: v.array(
      v.object({
        id: v.optional(v.id("attendanceTags")),
        name: v.string(),
        colour: v.optional(v.string()),
        subgroups: v.optional(v.array(v.string())),
      })
    ),
    deleteIds: v.array(v.id("attendanceTags")),
  },
  handler: async (ctx, { year, tags, deleteIds }) => {
    await requireProfile(ctx);
    for (const id of deleteIds) {
      const row = await ctx.db.get(id);
      if (!row || row.year !== year) continue;
      // Events of this staff year, by start-date range (events store no year).
      const events = await ctx.db
        .query("events")
        .withIndex("by_dateStart", (q) =>
          q
            .gte("dateStart", staffYearStartMs(year))
            .lt("dateStart", staffYearStartMs(year + 1))
        )
        .collect();
      for (const event of events) {
        if (!event.tagIds?.includes(id)) continue;
        const tagIds = event.tagIds.filter((tagId) => tagId !== id);
        await ctx.db.patch(event._id, {
          tagIds: tagIds.length > 0 ? tagIds : undefined,
        });
      }
      await ctx.db.delete(id);
    }
    const names = new Set<string>();
    for (const tag of tags) {
      const name = tag.name.trim();
      if (!name) throw new ConvexError("Every tag needs a name.");
      const lower = name.toLowerCase();
      if (names.has(lower)) throw new ConvexError(`Duplicate tag "${name}".`);
      names.add(lower);
      if (tag.id) {
        const existing = await ctx.db.get(tag.id);
        if (!existing || existing.year !== year) continue;
        await ctx.db.patch(tag.id, {
          name,
          colour: tag.colour,
          subgroups: tag.subgroups?.length
            ? normalizeSubgroups(tag.subgroups)
            : undefined,
        });
      } else {
        await ctx.db.insert("attendanceTags", {
          year,
          name,
          colour: tag.colour,
          subgroups: tag.subgroups?.length
            ? normalizeSubgroups(tag.subgroups)
            : undefined,
        });
      }
    }
  },
});
