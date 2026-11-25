import { v } from "convex/values";

export const cafeSideValidator = v.union(v.literal("a"), v.literal("b"));
export const cafeWinnerValidator = v.union(v.literal("a"), v.literal("b"), v.literal("draw"));

export const cafeBoardValidator = v.object({
  cells: v.array(v.number()),
  boxes: v.array(v.number()),
  turn: cafeSideValidator,
  missed: v.object({ a: v.number(), b: v.number() }),
  last: v.optional(v.number()),
  line: v.optional(v.array(v.number())),
});

export const cafeResultValidator = v.object({
  winner: cafeWinnerValidator,
  why: v.union(v.literal("played"), v.literal("timeout"), v.literal("left"), v.literal("gaveUp"), v.literal("abandoned")),
});
