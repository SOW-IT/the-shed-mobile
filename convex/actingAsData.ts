import { v } from "convex/values";

export const personaValidator = v.union(
  v.object({ role: v.literal("staff"), department: v.string() }),
  v.object({ role: v.literal("head"), department: v.string() }),
  v.object({ role: v.literal("director") }),
  v.object({ role: v.literal("budgetManager") }),
  v.object({ role: v.literal("praiseManager") }),
);
