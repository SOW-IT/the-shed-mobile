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
    // Tags are global (not year-scoped) — one shared catalogue for every year.
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
    for (const id of deleteIds) {
      const row = await ctx.db.get(id);
      if (!row) continue;
      // Tags are global, so a deleted tag can be referenced by an event in any
      // year — scrub it from every event that carries it, not just one year's.
      const events = await ctx.db.query("events").collect();
      for (const event of events) {
        if (!event.tagIds?.includes(id)) continue;
        const tagIds = event.tagIds.filter((tagId) => tagId !== id);
        await ctx.db.patch(event._id, {
          tagIds: tagIds.length > 0 ? tagIds : undefined,
        });
      }
      await ctx.db.delete(id);
      await logAttendanceAction(ctx, {
        actorEmail,
        entityType: "tag",
        action: "tag.delete",
        summary: `Deleted tag "${row.name}"`,
      });
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
        if (!existing) continue;
        const nextSubgroups = tag.subgroups?.length
          ? normalizeSubgroups(tag.subgroups)
          : undefined;
        // The client sends every tag on each save, so classify what actually
        // changed and only log a real edit — otherwise adding/editing one tag
        // floods the audit trail with a "tag.update" for every untouched tag.
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

/**
 * Consolidate the tag catalogue: merge every row sharing a (case-insensitive)
 * name into a single survivor — take the UNION of their sub-group scopes (an
 * unscoped/global member wins → the merged tag is global), remap event `tagIds`
 * from the losers to the survivor (de-duplicated), and delete the losers.
 *
 * Originally the per-year → global consolidation (it also cleared the
 * now-removed `year` column); kept as an idempotent dedupe of same-named rows.
 * Idempotent: re-run `npx convex run
 * attendanceTags:consolidateAttendanceTags` (and --prod) until `merged: 0`.
 */
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

    // loser tag id -> survivor tag id, applied to events in a single pass below.
    const remap = new Map<Id<"attendanceTags">, Id<"attendanceTags">>();
    let merged = 0;

    for (const group of groups.values()) {
      // Deterministic survivor: earliest created (year-independent, stable).
      const sorted = [...group].sort(
        (a, b) => a._creationTime - b._creationTime
      );
      const survivor = sorted[0];

      // Union the sub-group scopes; a global (unscoped) member makes the whole
      // merged tag global, since "all groups" already covers any narrower set.
      let global = false;
      const scopes = new Set<string>();
      for (const tag of sorted) {
        if (!tag.subgroups?.length) global = true;
        else for (const s of tag.subgroups) scopes.add(s);
      }
      const mergedSubgroups = global
        ? undefined
        : normalizeSubgroups([...scopes]);
      // Keep the survivor's colour, else the earliest-created one that has any.
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

    // One pass over events, remapping any loser tag id to its survivor.
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
