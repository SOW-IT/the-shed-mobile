import { v } from "convex/values";

export const gameIdValidator = v.union(
  v.literal("shooter"),
  v.literal("runner"),
  v.literal("flappy"),
  v.literal("glider"),
  v.literal("hop")
);
