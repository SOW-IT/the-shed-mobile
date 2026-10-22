import { v } from "convex/values";

export const designStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("DECLINED"),
  v.literal("COMPLETED"),
  v.literal("CANCELLED")
);

export const designAnswerValidator = v.union(
  v.string(),
  v.number(),
  v.boolean(),
  v.array(v.string())
);

export const designAnswersValidator = v.record(v.string(), designAnswerValidator);
