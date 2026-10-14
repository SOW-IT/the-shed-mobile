import { ConvexError, v } from "convex/values";
import { normalizeSubgroups } from "../shared/rollcall";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { optionalProfile, requireAttendanceManager } from "./model";
import { logAttendanceAction } from "./attendanceAudit";

export const list = query({
  args: {},
  handler: async (ctx) => {
    if (!(await optionalProfile(ctx))) return [];
    const rows = await ctx.db.query("attendanceTags").collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const saveAll = mutation({
  args: {
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
  handler: async (ctx, { tags, deleteIds }) => {
    const { email: actorEmail } = await requireAttendanceManager(ctx);
    const deleteRows = (
      await Promise.all(deleteIds.map((id) => ctx.db.get(id)))
    ).filter((row): row is NonNullable<typeof row> => row !== null);
    if (deleteRows.length > 0) {
      const deleteSet = new Set(deleteRows.map((row) => row._id));
      for (const event of await ctx.db.query("events").collect()) {
        if (!event.tagIds?.some((tagId) => deleteSet.has(tagId))) continue;
        const tagIds = event.tagIds.filter((tagId) => !deleteSet.has(tagId));
        await ctx.db.patch(event._id, {
          tagIds: tagIds.length > 0 ? tagIds : undefined,
        });
      }
      for (const row of deleteRows) {
        await ctx.db.delete(row._id);
        await logAttendanceAction(ctx, {
          actorEmail,
          entityType: "tag",
          action: "tag.delete",
          summary: `Deleted tag "${row.name}"`,
        });
      }
    }
    const deletedIds = new Set(deleteRows.map((row) => row._id));
    const existingByName = new Map<string, Id<"attendanceTags">>();
    for (const row of await ctx.db.query("attendanceTags").collect()) {
      if (deletedIds.has(row._id)) continue;
      existingByName.set(row.name.trim().toLowerCase(), row._id);
    }
    const names = new Set<string>();
    for (const tag of tags) {
      const name = tag.name.trim();
      if (!name) throw new ConvexError("Every tag needs a name.");
      const lower = name.toLowerCase();
      if (names.has(lower)) throw new ConvexError(`Duplicate tag "${name}".`);
      const conflict = existingByName.get(lower);
      if (conflict !== undefined && conflict !== tag.id) {
        throw new ConvexError(`A tag named "${name}" already exists.`);
      }
      names.add(lower);
      if (tag.id) {
        const existing = await ctx.db.get(tag.id);
        if (!existing) continue;
        const nextSubgroups = tag.subgroups?.length
          ? normalizeSubgroups(tag.subgroups)
          : undefined;
        const changed =
          existing.name !== name ||
          (existing.colour ?? undefined) !== (tag.colour ?? undefined) ||
          JSON.stringify([...(existing.subgroups ?? [])].sort()) !==
            JSON.stringify([...(nextSubgroups ?? [])].sort());
        await ctx.db.patch(tag.id, {
          name,
          colour: tag.colour,
          subgroups: nextSubgroups,
        });
        if (changed) {
          await logAttendanceAction(ctx, {
            actorEmail,
            entityType: "tag",
            action: "tag.update",
            summary:
              existing.name !== name
                ? `Renamed tag "${existing.name}" → "${name}"`
                : `Updated tag "${name}"`,
          });
        }
      } else {
        await ctx.db.insert("attendanceTags", {
          name,
          colour: tag.colour,
          subgroups: tag.subgroups?.length
            ? normalizeSubgroups(tag.subgroups)
            : undefined,
        });
        await logAttendanceAction(ctx, {
          actorEmail,
          entityType: "tag",
          action: "tag.create",
          summary: `Created tag "${name}"`,
        });
      }
    }
  },
});
