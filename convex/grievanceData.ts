import { v } from "convex/values";

export const grievanceStatusValidator = v.union(
  v.literal("SUBMITTED"),
  v.literal("RECEIVED"),
  v.literal("IN_PROGRESS"),
  v.literal("RESOLVED"),
  v.literal("NOT_PROCEEDING")
);

export const grievanceFields = {
  name: v.string(),
  email: v.string(),
  phone: v.optional(v.string()),
  campus: v.optional(v.string()),
  category: v.string(),
  details: v.string(),
  happenedWhen: v.optional(v.string()),
  peopleInvolved: v.optional(v.string()),
  hopedOutcome: v.optional(v.string()),
};
