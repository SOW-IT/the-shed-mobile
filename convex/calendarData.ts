import { v } from "convex/values";

// A deadline: due on a day, or at a time on it (see Due in shared/calendar.ts).
export const dueValidator = v.union(v.literal("day"), v.literal("time"));

export const entryFields = {
  name: v.string(),
  dateStart: v.number(),
  dateEnd: v.number(),
  notes: v.optional(v.string()),
  due: v.optional(dueValidator),
};
