import { v } from "convex/values";

export const designStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("DECLINED"),
  v.literal("COMPLETED"),
  v.literal("CANCELLED")
);

/** One answer: text, a date (YYYY-MM-DD), an amount, yes/no, or ticked choices. */
export const designAnswerValidator = v.union(
  v.string(),
  v.number(),
  v.boolean(),
  v.array(v.string())
);

/** A request's answers, keyed by the question's `key` (see designRequestForm.ts). */
export const designAnswersValidator = v.record(v.string(), designAnswerValidator);
