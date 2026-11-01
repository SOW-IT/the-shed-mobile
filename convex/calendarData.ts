import { v } from "convex/values";

// Categories that could be picked before 2.10.14. Kept so stored values and
// older versions of the app still validate; the calendar now works them out.
export const calendarCategoryValidator = v.union(
  v.literal("campus"),
  v.literal("sow"),
  v.literal("marketing"),
  v.literal("deadline"),
  v.literal("other")
);

// Likewise for calendar entries before 2.10.14 (now an Event or a Deadline).
export const entryCategoryValidator = v.union(
  v.literal("twig"),
  v.literal("ppn"),
  v.literal("campus"),
  v.literal("sow"),
  v.literal("marketing"),
  v.literal("deadline"),
  v.literal("other")
);

// A deadline: due on a day, or at a time on it (see Due in shared/calendar.ts).
export const dueValidator = v.union(v.literal("day"), v.literal("time"));

export const entryFields = {
  name: v.string(),
  dateStart: v.number(),
  dateEnd: v.number(),
  // Only from before 2.10.14: entries no longer have a campus or a category.
  subgroups: v.optional(v.array(v.string())),
  category: v.optional(entryCategoryValidator),
  notes: v.optional(v.string()),
  due: v.optional(dueValidator),
};
