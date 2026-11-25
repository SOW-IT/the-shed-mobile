import { v } from "convex/values";

export const devotionalSharingLevelValidator = v.union(
  v.literal("count"),
  v.literal("passage"),
  v.literal("everything")
);

export const devotionalMemberStatusValidator = v.union(
  v.literal("invited"),
  v.literal("member")
);
