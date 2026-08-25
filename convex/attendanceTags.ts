import { ConvexError, v } from "convex/values";
import { normalizeSubgroups } from "../shared/rollcall";
import { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
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

export const consolidateAttendanceTags = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("attendanceTags").collect();
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.name.trim().toLowerCase();
      const g = groups.get(key) ?? [];
      g.push(row);
      groups.set(key, g);
    }

    const remap = new Map<Id<"attendanceTags">, Id<"attendanceTags">>();
    let merged = 0;

    for (const group of groups.values()) {
      const sorted = [...group].sort(
        (a, b) => a._creationTime - b._creationTime
      );
      const survivor = sorted[0];

      let global = false;
      const scopes = new Set<string>();
      for (const tag of sorted) {
        if (!tag.subgroups?.length) global = true;
        else for (const s of tag.subgroups) scopes.add(s);
      }
      const mergedSubgroups = global
        ? undefined
        : normalizeSubgroups([...scopes]);
      const colour = sorted.find((tag) => tag.colour)?.colour;

      for (const loser of sorted.slice(1)) {
        remap.set(loser._id, survivor._id);
        await ctx.db.delete(loser._id);
        merged++;
      }

      const subgroupsChanged =
        JSON.stringify([...(survivor.subgroups ?? [])].sort()) !==
        JSON.stringify([...(mergedSubgroups ?? [])].sort());
      const colourChanged =
        (survivor.colour ?? undefined) !== (colour ?? undefined);
      if (subgroupsChanged || colourChanged) {
        await ctx.db.patch(survivor._id, {
          subgroups: mergedSubgroups,
          colour,
        });
      }
    }

    let eventsRemapped = 0;
    if (remap.size > 0) {
      for (const event of await ctx.db.query("events").collect()) {
        if (!event.tagIds?.length) continue;
        const next = [
          ...new Set(event.tagIds.map((id) => remap.get(id) ?? id)),
        ];
        const changed =
          next.length !== event.tagIds.length ||
          next.some((id, i) => id !== event.tagIds![i]);
        if (changed) {
          await ctx.db.patch(event._id, { tagIds: next });
          eventsRemapped++;
        }
      }
    }

    return { groups: groups.size, merged, eventsRemapped };
  },
});
