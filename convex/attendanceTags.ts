import { ConvexError, v } from "convex/values";
import { isWeekliesTagName, tagListOf, tagScope, type TagList } from "../shared/rollcall";
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

const tagListValidator = v.union(v.literal("weeklies"), v.literal("events"));

const nameKey = (list: TagList, name: string) => `${list}:${name.trim().toLowerCase()}`;

export const saveAll = mutation({
  args: {
    tags: v.array(
      v.object({
        id: v.optional(v.id("attendanceTags")),
        name: v.string(),
        colour: v.optional(v.string()),
        subgroups: v.optional(v.array(v.string())),
        list: v.optional(tagListValidator),
      })
    ),
    deleteIds: v.array(v.id("attendanceTags")),
  },
  handler: async (ctx, { tags, deleteIds }) => {
    const { email: actorEmail } = await requireAttendanceManager(ctx);
    const deleteRows = (
      await Promise.all(deleteIds.map((id) => ctx.db.get(id)))
    ).filter((row): row is NonNullable<typeof row> => row !== null);
    if (deleteRows.some((row) => isWeekliesTagName(row.name))) {
      throw new ConvexError("The Weeklies tag can't be deleted; every weekly gets it.");
    }
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
    const rows = (await ctx.db.query("attendanceTags").collect()).filter(
      (row) => !deletedIds.has(row._id)
    );
    const rowsById = new Map(rows.map((row) => [row._id, row]));
    const existingByName = new Map<string, Id<"attendanceTags">>();
    for (const row of rows) existingByName.set(nameKey(tagListOf(row), row.name), row._id);
    const names = new Set<string>();
    for (const tag of tags) {
      const name = tag.name.trim();
      if (!name) throw new ConvexError("Every tag needs a name.");
      const saved = tag.id ? rowsById.get(tag.id) : undefined;
      const list = tag.list ?? (saved ? tagListOf(saved) : "events");
      const key = nameKey(list, name);
      const listLabel = list === "weeklies" ? "Weeklies" : "Other events";
      if (names.has(key)) throw new ConvexError(`Duplicate tag "${name}" in ${listLabel}.`);
      const conflict = existingByName.get(key);
      if (conflict !== undefined && conflict !== tag.id) {
        throw new ConvexError(`${listLabel} already has a tag named "${name}".`);
      }
      names.add(key);
      const keepsWeeklies = !!saved && isWeekliesTagName(saved.name);
      if (isWeekliesTagName(name) && !keepsWeeklies) {
        throw new ConvexError(`"${name}" is the automatic tag every weekly gets; pick another name.`);
      }
      if (tag.id) {
        const existing = saved ?? (await ctx.db.get(tag.id));
        if (!existing) continue;
        if (isWeekliesTagName(existing.name) && existing.name !== name) {
          throw new ConvexError("The Weeklies tag can't be renamed; every weekly gets it.");
        }
        const nextSubgroups = tagScope(list, tag.subgroups);
        const changed =
          existing.name !== name ||
          tagListOf(existing) !== list ||
          (existing.colour ?? undefined) !== (tag.colour ?? undefined) ||
          JSON.stringify([...(existing.subgroups ?? [])].sort()) !==
            JSON.stringify([...(nextSubgroups ?? [])].sort());
        await ctx.db.patch(tag.id, {
          name,
          colour: tag.colour,
          subgroups: nextSubgroups,
          ...(tag.list ? { list: tag.list } : {}),
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
          list,
          colour: tag.colour,
          subgroups: tagScope(list, tag.subgroups),
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
