import { v } from "convex/values";

export const worldLookValidator = v.object({
  skin: v.number(),
  hair: v.number(),
  hairColour: v.number(),
  shirt: v.number(),
  // Added with the character editor; looks from before have neither.
  hat: v.optional(v.number()),
  accessory: v.optional(v.number()),
  // Version 2 (the Mii-style editor): face, body and extras. All optional, so
  // older looks stay valid and older apps simply don't draw them.
  v: v.optional(v.number()),
  face: v.optional(v.number()),
  eyes: v.optional(v.number()),
  eyeColour: v.optional(v.number()),
  brows: v.optional(v.number()),
  nose: v.optional(v.number()),
  mouth: v.optional(v.number()),
  height: v.optional(v.number()),
  build: v.optional(v.number()),
  freckles: v.optional(v.number()),
  blush: v.optional(v.number()),
  beard: v.optional(v.number()),
  outfit: v.optional(v.number()),
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

/** A mutual action someone asked for: to whom, and when (server time). */
export const worldAskValidator = v.object({ kind: v.string(), to: v.id("worldMembers"), at: v.number() });

/** An accepted ask, naming the asker and the ask's time so it can't match a later one. */
export const worldReplyValidator = v.object({
  kind: v.string(),
  to: v.id("worldMembers"),
  askAt: v.number(),
  at: v.number(),
});
