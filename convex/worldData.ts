import { v } from "convex/values";

export const worldLookValidator = v.object({
  skin: v.number(),
  hair: v.number(),
  hairColour: v.number(),
  shirt: v.number(),
});

export const worldBucketValidator = v.object({ tokens: v.number(), at: v.number() });

export const worldWalkFields = {
  fromX: v.number(),
  fromZ: v.number(),
  toX: v.number(),
  toZ: v.number(),
  startedAt: v.number(),
};

export const worldReportLineValidator = v.object({
  name: v.string(),
  text: v.string(),
  at: v.number(),
  reported: v.boolean(),
});
