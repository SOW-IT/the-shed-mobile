import { ConvexError, v } from "convex/values";
import { ROLES } from "../shared/flow";
import {
  CAMPUS_FIELD_KEY,
  canonicalizeGenderValues,
  GENDER_FIELD_KEY,
  GENDER_OPTION_IDS,
  GENDER_VALUES,
  ROLE_FIELD_KEY,
  STUDENT_YEAR_FIELD_KEY,
  STUDENT_YEAR_LEVELS,
  STUDENT_YEAR_VALUES,
} from "../shared/attendanceMemberMeta";
import { canonicalSubgroup, subgroupMatches } from "../shared/rollcall";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  currentStaffYear,
  optionalProfile,
  requireAttendanceManager,
} from "./model";
import { logAttendanceAction } from "./attendanceAudit";

const LOCKED_FIELD_KEYS = new Set([
  STUDENT_YEAR_FIELD_KEY,
  GENDER_FIELD_KEY,
  CAMPUS_FIELD_KEY,
  ROLE_FIELD_KEY,
]);

/** A locked token may be a select option id (key) or its display label. */
const lockedValuePresent = (
  values: Record<string, string>,
  locked: string
): boolean => values[locked] !== undefined || Object.values(values).includes(locked);

const nextNumericKey = (values: Record<string, string>): number =>
  Math.max(0, ...Object.keys(values).map(Number).filter(Number.isFinite)) + 1;

/** Add org-sourced labels to a select map, preserving custom entries. */
const mergeSelectValues = (
  values: Record<string, string>,
  labels: string[]
): Record<string, string> => {
  const out = { ...values };
  const existing = new Set(Object.values(out));
  let nextKey = nextNumericKey(out);
  for (const label of labels) {
    if (!existing.has(label)) {
      out[String(nextKey++)] = label;
      existing.add(label);
    }
  }
  return out;
};

/**
 * List the (global) metadata field definitions, ordered. Campus/Role select
 * options are kept in sync with the CURRENT staff year's universities/roles.
 */
export const list = query({
  args: { subgroup: v.optional(v.string()) },
  handler: async (ctx, { subgroup }) => {
    if (!(await optionalProfile(ctx))) return [];
    const orgYear = currentStaffYear();
    const [rows, universities, roleRows] = await Promise.all([
      ctx.db.query("attendanceMetadata").collect(),
      ctx.db
        .query("universities")
        .withIndex("by_year_and_name", (q) => q.eq("year", orgYear))
        .collect(),
      ctx.db
        .query("roles")
        .withIndex("by_year_and_name", (q) => q.eq("year", orgYear))
        .collect(),
    ]);
    const universityNames = universities.map((u) => u.name);
    const orgRoles = [...new Set([...ROLES, ...roleRows.map((r) => r.name)])];

    return rows
      .filter(
        (field) =>
          !subgroup || !field.subgroup || subgroupMatches(field.subgroup, subgroup)
      )
      .sort((a, b) => a.order - b.order)
      .map((field) => {
      if (field.key === GENDER_FIELD_KEY && field.type === "select") {
        const values = canonicalizeGenderValues(field.values);
        return {
          ...field,
          values,
          subgroup: undefined,
          lockedValues: [...GENDER_OPTION_IDS, "Male", "Female"],
        };
      }
      if (field.key === STUDENT_YEAR_FIELD_KEY && field.type === "select") {
        return {
          ...field,
          values: STUDENT_YEAR_VALUES,
          subgroup: undefined,
          lockedValues: [...STUDENT_YEAR_LEVELS],
        };
      }
      if (field.key === "Campus" && field.type === "select") {
        const values = mergeSelectValues(field.values ?? {}, universityNames);
        return {
          ...field,
          values,
          subgroup: undefined,
          // Synced to the year's `universities` table — not the stored snapshot —
          // so a campus removed there is no longer locked here.
          lockedValues: universityNames,
        };
      }
      if (field.key === "Role" && field.type === "select") {
        const values = mergeSelectValues(field.values ?? {}, orgRoles);
        return {
          ...field,
          values,
          subgroup: undefined,
          // Synced to the year's `roles` table (plus the base ROLES) — not the
          // stored snapshot — so a role removed there is no longer locked here.
          lockedValues: orgRoles,
        };
      }
        return field;
      });
  },
});

/** Seed the global Year, Gender, Campus, Role fields when none exist yet. */
export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAttendanceManager(ctx);
    const existing = await ctx.db.query("attendanceMetadata").collect();
    if (existing.length > 0) return existing.length;

    const orgYear = currentStaffYear();
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", orgYear))
      .collect();
    const campusValues: Record<string, string> = {};
    universities.forEach((u, i) => {
      campusValues[String(i + 1)] = u.name;
    });

    const roleRows = await ctx.db
      .query("roles")
      .withIndex("by_year_and_name", (q) => q.eq("year", orgYear))
      .collect();
    const roleValues: Record<string, string> = {};
    const lockedRoles = [...new Set([...ROLES, ...roleRows.map((r) => r.name)])];
    lockedRoles.forEach((name, i) => {
      roleValues[String(i + 1)] = name;
    });

    await ctx.db.insert("attendanceMetadata", {
      key: STUDENT_YEAR_FIELD_KEY,
      type: "select",
      order: 0,
      values: STUDENT_YEAR_VALUES,
      subgroup: undefined,
      lockedValues: [...STUDENT_YEAR_LEVELS],
    });
    await ctx.db.insert("attendanceMetadata", {
      key: GENDER_FIELD_KEY,
      type: "select",
      order: 1,
      values: GENDER_VALUES,
      subgroup: undefined,
      lockedValues: [...GENDER_OPTION_IDS],
    });
    await ctx.db.insert("attendanceMetadata", {
      key: "Campus",
      type: "select",
      order: 2,
      values: campusValues,
      subgroup: undefined,
      lockedValues: universities.map((u) => u.name),
    });
    await ctx.db.insert("attendanceMetadata", {
      key: "Role",
      type: "select",
      order: 3,
      values: roleValues,
      subgroup: undefined,
      lockedValues: lockedRoles,
    });
    return 4;
  },
});

/** Replace all (global) metadata fields (settings editor). */
export const saveAll = mutation({
  args: {
    fields: v.array(
      v.object({
        id: v.optional(v.id("attendanceMetadata")),
        key: v.string(),
        type: v.union(v.literal("select"), v.literal("input")),
        order: v.number(),
        values: v.optional(v.record(v.string(), v.string())),
        subgroup: v.optional(v.string()),
        lockedValues: v.optional(v.array(v.string())),
      })
    ),
    deleteIds: v.array(v.id("attendanceMetadata")),
  },
  handler: async (ctx, { fields, deleteIds }) => {
    const { email: actorEmail } = await requireAttendanceManager(ctx);
    const orgYear = currentStaffYear();
    for (const id of deleteIds) {
      const row = await ctx.db.get(id);
      if (!row) continue;
      if (LOCKED_FIELD_KEYS.has(row.key)) {
        throw new ConvexError(`Cannot delete locked metadata field "${row.key}".`);
      }
      const members = await ctx.db
        .query("attendanceMembers")
        .collect();
      for (const member of members) {
        if (!member.metadata?.[id]) continue;
        const metadata = { ...member.metadata };
        delete metadata[id];
        await ctx.db.patch(member._id, { metadata });
      }
      await ctx.db.delete(id);
      await logAttendanceAction(ctx, {
        actorEmail,
        entityType: "metadata",
        action: "metadata.delete",
        summary: `Deleted member field "${row.key}"`,
      });
    }
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", orgYear))
      .collect();
    const universityNames = universities.map((u) => u.name);
    const roleRows = await ctx.db
      .query("roles")
      .withIndex("by_year_and_name", (q) => q.eq("year", orgYear))
      .collect();
    const orgRoles = [...new Set([...ROLES, ...roleRows.map((r) => r.name)])];

    // The canonical select-values for a field, applying the same syncing the
    // `list` query does on read (Campus/Role fold in the live universities/roles).
    // Used both when writing and when diffing, so a re-save of an unchanged
    // Campus/Role field isn't mistaken for an edit just because the stored row
    // predates a university/role that `list` now merges in.
    const normalizeSelectValues = (
      fieldKey: string,
      raw: Record<string, string>
    ): Record<string, string> =>
      fieldKey === GENDER_FIELD_KEY
        ? canonicalizeGenderValues(raw)
        : fieldKey === STUDENT_YEAR_FIELD_KEY
          ? STUDENT_YEAR_VALUES
          : fieldKey === "Campus"
            ? mergeSelectValues(raw, universityNames)
            : fieldKey === "Role"
              ? mergeSelectValues(raw, orgRoles)
              : raw;

    // Fields whose ONLY change this save is their position. Collected here and
    // reported as a single reorder event, rather than vague per-field "updates".
    const reorders: { key: string; from: number; to: number }[] = [];
    // Prior→new order of every field that already existed, to tell a genuine
    // reorder (the relative sequence changed) from a mere renumber (adding a
    // field or closing a delete gap shifts absolute orders but not the sequence).
    const persistedOrder: { id: string; from: number; to: number }[] = [];
    const keys = new Set<string>();
    for (const field of fields) {
      const rawKey = field.key.trim();
      if (!rawKey) throw new ConvexError("Every metadata field needs a name.");
      // Canonicalize reserved key names regardless of input casing.
      const lk = rawKey.toLowerCase();
      const key =
        lk === CAMPUS_FIELD_KEY.toLowerCase() ? CAMPUS_FIELD_KEY :
        lk === ROLE_FIELD_KEY.toLowerCase() ? ROLE_FIELD_KEY :
        lk === GENDER_FIELD_KEY.toLowerCase() ? GENDER_FIELD_KEY :
        lk === STUDENT_YEAR_FIELD_KEY.toLowerCase() ? STUDENT_YEAR_FIELD_KEY :
        rawKey;
      if (keys.has(lk)) {
        throw new ConvexError(`Duplicate metadata field "${key}".`);
      }
      keys.add(lk);

      const values =
        field.type === "select"
          ? normalizeSelectValues(key, { ...(field.values ?? {}) })
          : undefined;
      const subgroup = LOCKED_FIELD_KEYS.has(key)
        ? undefined
        : field.subgroup?.trim()
          ? canonicalSubgroup(field.subgroup.trim())
          : undefined;

      const lockedValues =
        key === GENDER_FIELD_KEY
          ? [...GENDER_OPTION_IDS, "Male", "Female"]
          : key === STUDENT_YEAR_FIELD_KEY
            ? [...STUDENT_YEAR_LEVELS]
            : // Campus/Role lock sets are the live universities/roles tables for
              // this staff year, not the (possibly stale) incoming snapshot.
              key === "Campus"
          ? universityNames
          : key === "Role"
            ? orgRoles
            : field.lockedValues;

      if (field.type === "select" && values) {
        for (const locked of lockedValues ?? []) {
          if (!lockedValuePresent(values, locked)) {
            throw new ConvexError(
              `Cannot remove locked value "${locked}" from ${key}.`
            );
          }
        }
      }
      if (field.id) {
        const existing = await ctx.db.get(field.id);
        if (!existing) continue;
        persistedOrder.push({ id: field.id, from: existing.order, to: field.order });
        const nextValues = field.type === "select" ? values : undefined;
        // Diff against the existing values run through the SAME normalisation as
        // the write, so a synced Campus/Role field re-saved unchanged doesn't
        // look edited just because its stored snapshot predates a merged label.
        const existingValues =
          existing.type === "select"
            ? normalizeSelectValues(key, { ...(existing.values ?? {}) })
            : undefined;
        // saveAll rewrites every field on each save; classify what actually
        // changed so the trail isn't flooded with no-op "updates" and so a pure
        // reorder reads as a reorder rather than a generic field update.
        const orderChanged = existing.order !== field.order;
        const contentChanged =
          existing.key !== key ||
          existing.type !== field.type ||
          (existing.subgroup ?? undefined) !== (subgroup ?? undefined) ||
          JSON.stringify(existingValues ?? null) !==
            JSON.stringify(nextValues ?? null);
        await ctx.db.patch(field.id, {
          key,
          type: field.type,
          order: field.order,
          values: nextValues,
          subgroup,
          lockedValues,
        });
        if (contentChanged) {
          await logAttendanceAction(ctx, {
            actorEmail,
            entityType: "metadata",
            action: "metadata.update",
            summary:
              existing.key !== key
                ? `Renamed member field "${existing.key}" → "${key}"`
                : `Updated member field "${key}"`,
          });
        } else if (orderChanged) {
          // Position-only change: defer to one consolidated reorder event below.
          reorders.push({ key, from: existing.order, to: field.order });
        }
      } else {
        await ctx.db.insert("attendanceMetadata", {
          key,
          type: field.type,
          order: field.order,
          values: field.type === "select" ? values : undefined,
          subgroup,
          lockedValues,
        });
        await logAttendanceAction(ctx, {
          actorEmail,
          entityType: "metadata",
          action: "metadata.create",
          summary: `Created member field "${key}"`,
        });
      }
    }

    // Only a genuine reorder — the relative sequence of the surviving fields
    // changed — is logged. Adding a field or deleting one renumbers absolute
    // orders (the client reindexes to 0..N) without moving anything relative to
    // the others, and must not spam a "Reordered…" entry.
    const sequenceKey = (by: "from" | "to") =>
      persistedOrder
        .slice()
        .sort((a, b) => a[by] - b[by])
        .map((p) => p.id)
        .join(",");
    const relativeOrderChanged = sequenceKey("from") !== sequenceKey("to");
    if (reorders.length && relativeOrderChanged) {
      // A clean two-field exchange (e.g. moving a field up/down one slot) reads
      // as a swap; anything larger is a general reorder.
      const isSwap =
        reorders.length === 2 &&
        reorders[0].from === reorders[1].to &&
        reorders[1].from === reorders[0].to;
      await logAttendanceAction(ctx, {
        actorEmail,
        entityType: "metadata",
        action: "metadata.reorder",
        summary: isSwap
          ? `Swapped order of member fields "${reorders[0].key}" and "${reorders[1].key}"`
          : `Reordered member fields: ${reorders
              .map((r) => `"${r.key}"`)
              .join(", ")}`,
      });
    }
  },
});

/**
 * Collapse any duplicate metadata rows into a single global set — one row per
 * (key, sub-group). Member metadata keys are remapped to the surviving field id;
 * for select fields the stored option ids are remapped BY LABEL, so a member's
 * value keeps its meaning even when two rows numbered their options differently.
 * Idempotent: re-run `npx convex run
 * attendanceMetadata:consolidateAttendanceMetadata` (and --prod) until it reports
 * `merged: 0`.
 *
 * Originally the per-year → global consolidation (it also cleared the now-removed
 * `year` column); kept as an idempotent dedupe safety net.
 */
export const consolidateAttendanceMetadata = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("attendanceMetadata").collect();
    const groupKey = (r: (typeof rows)[number]) =>
      `${r.key} ${canonicalSubgroup(r.subgroup ?? "")}`;
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const g = groups.get(groupKey(r)) ?? [];
      g.push(r);
      groups.set(groupKey(r), g);
    }

    const members = await ctx.db.query("attendanceMembers").collect();
    let merged = 0;

    for (const group of groups.values()) {
      // Deterministic survivor: lowest order, then earliest created.
      const sorted = [...group].sort(
        (a, b) => a.order - b.order || a._creationTime - b._creationTime
      );
      const survivor = sorted[0];
      const losers = sorted.slice(1);

      const survivorValues = { ...(survivor.values ?? {}) };
      const idForLabel = new Map<string, string>();
      for (const [id, label] of Object.entries(survivorValues)) {
        if (!idForLabel.has(label)) idForLabel.set(label, id);
      }
      const ensureLabel = (label: string): string => {
        const existing = idForLabel.get(label);
        if (existing) return existing;
        const id = String(nextNumericKey(survivorValues));
        survivorValues[id] = label;
        idForLabel.set(label, id);
        return id;
      };

      for (const loser of losers) {
        for (const label of Object.values(loser.values ?? {})) ensureLabel(label);
        const remapOption = (value: string): string => {
          if (loser.type !== "select") return value;
          const label = loser.values?.[value];
          // No label ⇒ not an option id (e.g. a Year commencement year) — keep.
          return label === undefined ? value : ensureLabel(label);
        };
        for (const member of members) {
          const meta = member.metadata;
          if (!meta || meta[loser._id] === undefined) continue;
          const next = { ...meta };
          const value = next[loser._id];
          delete next[loser._id];
          // Don't clobber a value already stored under the survivor id.
          if (next[survivor._id] === undefined) {
            next[survivor._id] = remapOption(value);
          }
          await ctx.db.patch(member._id, { metadata: next });
          member.metadata = next; // keep in sync for later groups
        }
        await ctx.db.delete(loser._id);
        merged++;
      }

      if (survivor.type === "select") {
        await ctx.db.patch(survivor._id, { values: survivorValues });
      }
    }

    return { groups: groups.size, merged };
  },
});
