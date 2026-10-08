import { v } from "convex/values";

// Validators for announcements (rules in shared/announcements.ts).

export const audienceValidator = v.object({
  campuses: v.array(v.string()),
  divisions: v.array(v.string()),
  departments: v.array(v.string()),
  roles: v.array(v.string()),
});

export const announcementStatusValidator = v.union(
  v.literal("scheduled"),
  v.literal("sent"),
  v.literal("cancelled")
);
