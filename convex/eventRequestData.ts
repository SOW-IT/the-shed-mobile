import { v } from "convex/values";

export const eventStatusValidator = v.union(
  v.literal("IN_PROGRESS"),
  v.literal("APPROVED"),
  v.literal("CANCELLED")
);

export const subFormKindValidator = v.union(
  v.literal("marketing"),
  v.literal("risk"),
  v.literal("finance")
);

export const subFormStatusValidator = v.union(
  v.literal("DRAFT"),
  v.literal("PENDING"),
  v.literal("CHANGES_REQUESTED"),
  v.literal("APPROVED"),
  v.literal("NOT_REQUIRED")
);

export const financeStepValidator = v.union(v.literal("director"), v.literal("financeHead"));

export const riskCategoryValidator = v.union(
  v.literal("safety"),
  v.literal("people"),
  v.literal("reputation"),
  v.literal("finance")
);

/** One risk on the Risk form; levels 1–5 come from SOW's Risk Management Standard. */
export const riskRowValidator = v.object({
  description: v.string(),
  category: v.optional(riskCategoryValidator),
  consequence: v.optional(v.number()),
  likelihood: v.optional(v.number()),
  mitigation: v.optional(v.string()),
  legacyRating: v.optional(v.string()),
});

export const riskDataValidator = v.object({
  noRisks: v.boolean(),
  risks: v.array(riskRowValidator),
  contingencies: v.optional(v.string()),
});

export const financeLineValidator = v.object({
  label: v.string(),
  amount: v.number(),
});

export const financeDataValidator = v.object({
  income: v.array(financeLineValidator),
  expenses: v.array(financeLineValidator),
  spreadsheetUrl: v.optional(v.string()),
});
