import { v } from "convex/values";

// The categories an attendance event can be given (TWIG, PPN and Weekly come from its tags and term).
export const calendarCategoryValidator = v.union(
  v.literal("campus"),
  v.literal("sow"),
  v.literal("marketing"),
  v.literal("deadline"),
  v.literal("other")
);

// A calendar-only entry has no tags, so it can be any of these.
export const entryCategoryValidator = v.union(
  v.literal("twig"),
  v.literal("ppn"),
  v.literal("campus"),
  v.literal("sow"),
  v.literal("marketing"),
  v.literal("deadline"),
  v.literal("other")
);

export const entryFields = {
  name: v.string(),
  dateStart: v.number(),
  dateEnd: v.number(),
  subgroups: v.array(v.string()),
  category: entryCategoryValidator,
  notes: v.optional(v.string()),
};
