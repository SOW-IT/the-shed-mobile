import { describe, expect, test } from "vitest";
import {
  buildMergedFields,
  detectMergeConflicts,
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
