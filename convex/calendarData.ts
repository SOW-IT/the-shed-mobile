import { v } from "convex/values";

export const calendarCategoryValidator = v.union(
  v.literal("campus"),
  v.literal("sow"),
  v.literal("marketing"),
  v.literal("deadline"),
  v.literal("other")
);
