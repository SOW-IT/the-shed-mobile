import { v } from "convex/values";

// Validators for the Home tab's blocks (types in shared/homeContent.ts).

const buttonValidator = v.object({
  label: v.string(),
  url: v.string(),
  style: v.union(v.literal("primary"), v.literal("tonal"), v.literal("ghost")),
  icon: v.optional(v.string()),
});

const campusValidator = v.object({
  name: v.string(),
  short: v.string(),
  about: v.string(),
  meetingLabel: v.string(),
  meeting: v.string(),
  programs: v.array(v.string()),
  instagram: v.string(),
});

export const homeBlockValidator = v.union(
  v.object({ type: v.literal("hero"), eyebrow: v.string(), text: v.string() }),
  v.object({ type: v.literal("heading"), text: v.string() }),
  v.object({ type: v.literal("text"), text: v.string() }),
  v.object({
    type: v.literal("card"),
    title: v.string(),
    body: v.string(),
    icon: v.optional(v.string()),
    dot: v.optional(v.boolean()),
    campus: v.optional(v.string()),
    tone: v.optional(v.union(v.literal("default"), v.literal("primary"))),
    buttons: v.array(buttonValidator),
  }),
  v.object({
    type: v.literal("links"),
    links: v.array(v.object({ name: v.string(), url: v.string(), note: v.optional(v.string()) })),
  }),
  v.object({
    type: v.literal("socials"),
    caption: v.string(),
    links: v.array(v.object({ label: v.string(), icon: v.string(), url: v.string() })),
  }),
  v.object({ type: v.literal("campuses"), campuses: v.array(campusValidator) }),
  v.object({ type: v.literal("contact"), title: v.string(), body: v.string() })
);
