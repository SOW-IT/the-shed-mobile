import { describe, expect, test } from "vitest";
import {
  buildMergedFields,
  detectMergeConflicts,
  fieldsTakenFromRemoved,
  mergeNotes,
  type MergeSide,
} from "./memberMerge";

const FIELDS = [
  { _id: "year", key: "Year" },
  { _id: "campus", key: "Campus" },
  { _id: "uni", key: "University" },
];

const side = (over: Partial<MergeSide> = {}): MergeSide => ({
  name: "Jeremy Lim",
  metadata: {},
  ...over,
});

describe("detectMergeConflicts", () => {
  test("names that differ only by case or spacing are not a conflict", () => {
    expect(
      detectMergeConflicts(side(), side({ name: "  jeremy   lim " }), FIELDS)
    ).toEqual([]);
  });

  test("flags different names, emails and metadata values", () => {
    const conflicts = detectMergeConflicts(
      side({ email: "a@x.com", metadata: { year: "1", uni: "USYD" } }),
      side({ name: "Jez Lim", email: "B@x.com", metadata: { year: "2", uni: "USYD" } }),
      FIELDS
    );
    expect(conflicts.map((c) => c.field)).toEqual(["name", "email", "year"]);
    expect(conflicts[2]).toMatchObject({
      label: "Year",
      keepValue: "1",
      removeValue: "2",
      metadataFieldId: "year",
    });
  });

  test("emails that differ only by case are not a conflict", () => {
    expect(
      detectMergeConflicts(side({ email: "a@x.com" }), side({ email: "A@X.com" }), FIELDS)
    ).toEqual([]);
  });

  test("a blank on either side is filled, not a conflict", () => {
    expect(
      detectMergeConflicts(
        side({ metadata: { year: "1" } }),
        side({ email: "b@x.com", metadata: { uni: "UNSW" } }),
        FIELDS
      )
    ).toEqual([]);
  });

  test("a staff person's identity and locked fields never conflict", () => {
    expect(
      detectMergeConflicts(
        side({ name: "Staff", email: "s@sow.org.au", metadata: { campus: "A" } }),
        side({ name: "Member", email: "m@x.com", metadata: { campus: "B" } }),
        FIELDS,
        { identityLocked: true, lockedFieldIds: ["campus"] }
      )
    ).toEqual([]);
  });
});

describe("buildMergedFields", () => {
  test("keeps the kept person's values unless told otherwise, and fills blanks", () => {
    const merged = buildMergedFields(
      side({ metadata: { year: "1" } }),
      side({ name: "Jez", email: "Jez@X.com", metadata: { year: "2", uni: "UNSW" } }),
      FIELDS,
      {}
    );
    expect(merged).toEqual({
      name: "Jeremy Lim",
      email: "jez@x.com",
      metadata: { year: "1", uni: "UNSW" },
    });
  });

  test("applies 'remove' resolutions", () => {
    const merged = buildMergedFields(
      side({ email: "a@x.com", metadata: { year: "1" } }),
      side({ name: "Jez", email: "b@x.com", metadata: { year: "2" } }),
      FIELDS,
      { name: "remove", email: "remove", year: "remove" }
    );
    expect(merged).toEqual({
      name: "Jez",
      email: "b@x.com",
      metadata: { year: "2" },
    });
  });

  test("falls back to the other name when the kept name is blank", () => {
    expect(buildMergedFields(side({ name: " " }), side(), FIELDS, {}).name).toBe(
      "Jeremy Lim"
    );
  });

  test("a staff person's identity and locked fields are left alone", () => {
    const merged = buildMergedFields(
      side({ name: "Staff", email: "s@sow.org.au", metadata: { campus: "A" } }),
      side({ name: "Member", email: "m@x.com", metadata: { campus: "B", year: "3" } }),
      FIELDS,
      { name: "remove", email: "remove", campus: "remove" },
      { identityLocked: true, lockedFieldIds: ["campus"] }
    );
    expect(merged).toEqual({
      name: "Staff",
      email: "s@sow.org.au",
      metadata: { campus: "A", year: "3" },
    });
  });
});

describe("mergeNotes", () => {
  test("combines without repeating", () => {
    expect(mergeNotes(undefined, " late ")).toBe("late");
    expect(mergeNotes(" ", undefined)).toBeUndefined();
    expect(mergeNotes("left early", "")).toBe("left early");
    expect(mergeNotes("left early, late", "late")).toBe("left early, late");
    expect(mergeNotes("left early", "late")).toBe("left early\nlate");
  });
});

describe("choosing metadata where both people have a value", () => {
  const MANY = [
    { _id: "year", key: "Year" },
    { _id: "gender", key: "Gender" },
    { _id: "campus", key: "Campus" },
    { _id: "diet", key: "Dietary" },
    { _id: "phone", key: "Phone" },
  ];
  const keep = side({
    name: "Jeremy Lim",
    email: "jeremy@x.com",
    metadata: { year: "2", gender: "m", campus: "usyd", diet: "none", phone: "111" },
  });
  const remove = side({
    name: "Jez Lim",
    email: "jez@x.com",
    metadata: { year: "3", gender: "m", campus: "unsw", diet: "vegan", uni: "x" },
  });

  test("every differing field is offered, in field order, and matching ones aren't", () => {
    const conflicts = detectMergeConflicts(keep, remove, MANY);
    expect(conflicts.map((c) => c.field)).toEqual(["name", "email", "year", "campus", "diet"]);
    expect(conflicts.find((c) => c.field === "diet")).toMatchObject({
      label: "Dietary",
      keepValue: "none",
      removeValue: "vegan",
    });
  });

  test("a mix of choices is honoured field by field; blanks still fill", () => {
    const merged = buildMergedFields(keep, remove, MANY, {
      name: "keep",
      email: "remove",
      year: "remove",
      campus: "keep",
      diet: "remove",
    });
    expect(merged).toEqual({
      name: "Jeremy Lim",
      email: "jez@x.com",
      metadata: { year: "3", gender: "m", campus: "usyd", diet: "vegan", phone: "111" },
    });
  });

  test("choosing 'remove' on a field that isn't a conflict changes nothing", () => {
    const merged = buildMergedFields(keep, side({ metadata: {} }), MANY, {
      phone: "remove",
      gender: "remove",
    });
    expect(merged.metadata).toEqual(keep.metadata);
  });

  test("values that read the same are not a conflict and keep the kept value", () => {
    const sameValue = (fieldId: string, a: string, b: string) =>
      fieldId === "gender" ? a.toLowerCase()[0] === b.toLowerCase()[0] : a === b;
    const k = side({ metadata: { gender: "f" } });
    const r = side({ metadata: { gender: "Female" } });
    expect(detectMergeConflicts(k, r, MANY, { sameValue })).toEqual([]);
    expect(
      buildMergedFields(k, r, MANY, { gender: "remove" }, { sameValue }).metadata
    ).toEqual({ gender: "f" });
  });

  test("whitespace-only values count as blank", () => {
    const k = side({ metadata: { diet: "   " } });
    const r = side({ metadata: { diet: " vegan " } });
    expect(detectMergeConflicts(k, r, MANY)).toEqual([]);
    expect(buildMergedFields(k, r, MANY, {}).metadata.diet).toBe("vegan");
  });
});

describe("fieldsTakenFromRemoved", () => {
  test("names each detail the kept person took, including filled blanks", () => {
    const k = side({ email: "a@x.com", metadata: { year: "1" } });
    const merged = buildMergedFields(
      k,
      side({ name: "Jez", email: "b@x.com", metadata: { year: "2", campus: "unsw" } }),
      FIELDS,
      { name: "remove", year: "remove" }
    );
    expect(fieldsTakenFromRemoved(k, merged, FIELDS)).toEqual(["Name", "Year", "Campus"]);
    expect(fieldsTakenFromRemoved(k, k, FIELDS)).toEqual([]);
  });
});
