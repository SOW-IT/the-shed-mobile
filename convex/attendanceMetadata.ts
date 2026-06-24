import { ConvexError, v } from "convex/values";
import { ROLES } from "../shared/flow";
import {
  sanitizeGenderValues,
  STUDENT_YEAR_FIELD_KEY,
  STUDENT_YEAR_LEVELS,
} from "../shared/attendanceMemberMeta";
import { mutation, query } from "./_generated/server";
import { optionalProfile, requireProfile } from "./model";

const DEFAULT_GENDERS = ["1", "2"];
const DEFAULT_GENDER_LABELS: Record<string, string> = {
  "1": "Male",
  "2": "Female",
};

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
  args: { year: v.number() },
  handler: async (ctx, { year }) => {
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

    return rows.sort((a, b) => a.order - b.order).map((field) => {
      if (field.key === "Gender" && field.type === "select") {
        const values = sanitizeGenderValues(field.values ?? DEFAULT_GENDER_LABELS);
        return {
          ...field,
          values,
          lockedValues: [...DEFAULT_GENDERS, "Male", "Female"],
        };
      }
      if (field.key === STUDENT_YEAR_FIELD_KEY && field.type === "select") {
        return {
          ...field,
          lockedValues: [...STUDENT_YEAR_LEVELS],
        };
      }
      if (field.key === "Campus" && field.type === "select") {
        const values = mergeSelectValues(field.values ?? {}, universityNames);
        return {
          ...field,
          values,
          lockedValues: [...new Set([...(field.lockedValues ?? []), ...universityNames])],
        };
      }
      if (field.key === "Role" && field.type === "select") {
        const values = mergeSelectValues(field.values ?? {}, orgRoles);
        return {
          ...field,
          values,
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

    const yearValues: Record<string, string> = {};
    STUDENT_YEAR_LEVELS.forEach((label, i) => {
      yearValues[String(i + 1)] = label;
    });

    await ctx.db.insert("attendanceMetadata", {
      year,
      key: STUDENT_YEAR_FIELD_KEY,
      type: "select",
      order: 0,
      values: yearValues,
      lockedValues: [...STUDENT_YEAR_LEVELS],
    });
    await ctx.db.insert("attendanceMetadata", {
      year,
      key: "Gender",
      type: "select",
      order: 1,
      values: DEFAULT_GENDER_LABELS,
      lockedValues: DEFAULT_GENDERS,
    });
    await ctx.db.insert("attendanceMetadata", {
      year,
      key: "Campus",
      type: "select",
      order: 2,
      values: campusValues,
      lockedValues: universities.map((u) => u.name),
    });
    await ctx.db.insert("attendanceMetadata", {
      year,
      key: "Role",
      type: "select",
      order: 3,
      values: roleValues,
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
        lockedValues: v.optional(v.array(v.string())),
      })
    ),
    deleteIds: v.array(v.id("attendanceMetadata")),
  },
  handler: async (ctx, { year, fields, deleteIds }) => {
    await requireProfile(ctx);
    for (const id of deleteIds) {
      const row = await ctx.db.get(id);
      if (row?.year === year) await ctx.db.delete(id);
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
      const key = field.key.trim();
      if (!key) throw new ConvexError("Every metadata field needs a name.");
      if (keys.has(key.toLowerCase())) {
        throw new ConvexError(`Duplicate metadata field "${key}".`);
      }
      keys.add(key.toLowerCase());

      let values = field.type === "select" ? { ...(field.values ?? {}) } : undefined;
      if (key === "Gender" && values) {
        values = sanitizeGenderValues(values);
      } else if (key === "Campus" && values) {
        values = mergeSelectValues(values, universityNames);
      } else if (key === "Role" && values) {
        values = mergeSelectValues(values, orgRoles);
      }

      const lockedValues =
        key === "Gender"
          ? [...DEFAULT_GENDERS, "Male", "Female"]
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
          lockedValues,
        });
      } else {
        await ctx.db.insert("attendanceMetadata", {
          year,
          key,
          type: field.type,
          order: field.order,
          values: field.type === "select" ? values : undefined,
          lockedValues,
        });
      }
    }
  },
});
