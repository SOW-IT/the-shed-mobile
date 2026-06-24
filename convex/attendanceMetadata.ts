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
import { mutation, query } from "./_generated/server";
import { optionalProfile, requireProfile } from "./model";

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

/** List metadata field definitions for a staff year, ordered. */
export const list = query({
  args: { year: v.number(), subgroup: v.optional(v.string()) },
  handler: async (ctx, { year, subgroup }) => {
    if (!(await optionalProfile(ctx))) return [];
    const [rows, universities, roleRows] = await Promise.all([
      ctx.db
        .query("attendanceMetadata")
        .withIndex("by_year", (q) => q.eq("year", year))
        .collect(),
      ctx.db
        .query("universities")
        .withIndex("by_year_and_name", (q) => q.eq("year", year))
        .collect(),
      ctx.db
        .query("roles")
        .withIndex("by_year_and_name", (q) => q.eq("year", year))
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
          lockedValues: [...new Set([...(field.lockedValues ?? []), ...universityNames])],
        };
      }
      if (field.key === "Role" && field.type === "select") {
        const values = mergeSelectValues(field.values ?? {}, orgRoles);
        return {
          ...field,
          values,
          subgroup: undefined,
          lockedValues: [...new Set([...(field.lockedValues ?? []), ...orgRoles])],
        };
      }
        return field;
      });
  },
});

/** Seed Year, Gender, Campus, Role fields when none exist for the year. */
export const ensureDefaults = mutation({
  args: { year: v.number() },
  handler: async (ctx, { year }) => {
    await requireProfile(ctx);
    const existing = await ctx.db
      .query("attendanceMetadata")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect();
    if (existing.length > 0) return existing.length;

    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .collect();
    const campusValues: Record<string, string> = {};
    universities.forEach((u, i) => {
      campusValues[String(i + 1)] = u.name;
    });

    const roleRows = await ctx.db
      .query("roles")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .collect();
    const roleValues: Record<string, string> = {};
    const lockedRoles = [...new Set([...ROLES, ...roleRows.map((r) => r.name)])];
    lockedRoles.forEach((name, i) => {
      roleValues[String(i + 1)] = name;
    });

    await ctx.db.insert("attendanceMetadata", {
      year,
      key: STUDENT_YEAR_FIELD_KEY,
      type: "select",
      order: 0,
      values: STUDENT_YEAR_VALUES,
      subgroup: undefined,
      lockedValues: [...STUDENT_YEAR_LEVELS],
    });
    await ctx.db.insert("attendanceMetadata", {
      year,
      key: GENDER_FIELD_KEY,
      type: "select",
      order: 1,
      values: GENDER_VALUES,
      subgroup: undefined,
      lockedValues: [...GENDER_OPTION_IDS],
    });
    await ctx.db.insert("attendanceMetadata", {
      year,
      key: "Campus",
      type: "select",
      order: 2,
      values: campusValues,
      subgroup: undefined,
      lockedValues: universities.map((u) => u.name),
    });
    await ctx.db.insert("attendanceMetadata", {
      year,
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

/** Replace all metadata fields for a year (settings editor). */
export const saveAll = mutation({
  args: {
    year: v.number(),
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
  handler: async (ctx, { year, fields, deleteIds }) => {
    await requireProfile(ctx);
    for (const id of deleteIds) {
      const row = await ctx.db.get(id);
      if (!row || row.year !== year) continue;
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
    }
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .collect();
    const universityNames = universities.map((u) => u.name);
    const roleRows = await ctx.db
      .query("roles")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .collect();
    const orgRoles = [...new Set([...ROLES, ...roleRows.map((r) => r.name)])];

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

      let values = field.type === "select" ? { ...(field.values ?? {}) } : undefined;
      const subgroup = LOCKED_FIELD_KEYS.has(key)
        ? undefined
        : field.subgroup?.trim()
          ? canonicalSubgroup(field.subgroup.trim())
          : undefined;
      if (key === GENDER_FIELD_KEY && values) {
        values = canonicalizeGenderValues(values);
      } else if (key === STUDENT_YEAR_FIELD_KEY) {
        values = STUDENT_YEAR_VALUES;
      } else if (key === "Campus" && values) {
        values = mergeSelectValues(values, universityNames);
      } else if (key === "Role" && values) {
        values = mergeSelectValues(values, orgRoles);
      }

      const lockedValues =
        key === GENDER_FIELD_KEY
          ? [...GENDER_OPTION_IDS, "Male", "Female"]
          : key === STUDENT_YEAR_FIELD_KEY
            ? [...STUDENT_YEAR_LEVELS]
            : key === "Campus"
          ? [...new Set([...(field.lockedValues ?? []), ...universityNames])]
          : key === "Role"
            ? [...new Set([...(field.lockedValues ?? []), ...orgRoles])]
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
        if (!existing || existing.year !== year) continue;
        await ctx.db.patch(field.id, {
          key,
          type: field.type,
          order: field.order,
          values: field.type === "select" ? values : undefined,
          subgroup,
          lockedValues,
        });
      } else {
        await ctx.db.insert("attendanceMetadata", {
          year,
          key,
          type: field.type,
          order: field.order,
          values: field.type === "select" ? values : undefined,
          subgroup,
          lockedValues,
        });
      }
    }
  },
});
