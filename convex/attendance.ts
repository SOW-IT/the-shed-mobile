import { ConvexError, v } from "convex/values";
import { assignmentsOf, roleNeedsUniversity } from "../shared/flow";
import { mutation, query } from "./_generated/server";
import { getProfile, optionalProfile, requireProfile } from "./model";

/**
 * The shared member pool for a year: every `staffProfile`, regardless of
 * sub-group — all the campuses share one roster. Each entry carries the roles
 * and campuses derived from the profile's assignments, for the row subtitle.
 * Read-only here: roles/metadata are managed in the org/admin flows, not the
 * roll-call.
 */
export const roster = query({
  args: { year: v.number() },
  handler: async (ctx, { year }) => {
    // Staff-only: an authenticated user without a staff profile sees nothing.
    if (!(await optionalProfile(ctx))) return [];
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect();
    return profiles
      .map((p) => {
        const assignments = assignmentsOf(p);
        return {
          email: p.email,
          name: p.name ?? p.email,
          roles: [...new Set(assignments.map((a) => a.role))],
          campuses: [
            ...new Set(
              assignments.flatMap((a) =>
                a.university && roleNeedsUniversity(a.role) ? [a.university] : []
              )
            ),
          ],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * The roll-call for an event: who's signed in, newest first, each joined with
 * the person's display name for that year (falls back to the email).
 */
export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    // Staff-only: an authenticated user without a staff profile sees nothing.
    if (!(await optionalProfile(ctx))) return [];
    const event = await ctx.db.get(eventId);
    if (!event) return [];
    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    const withNames = await Promise.all(
      rows.map(async (row) => {
        const profile = await getProfile(ctx, row.email, event.year);
        return { ...row, name: profile?.name ?? row.email };
      })
    );
    return withNames.sort((a, b) => b.signInTime - a.signInTime);
  },
});

/** Sign a person in. Idempotent: re-signing an already-present person is a no-op. */
export const signIn = mutation({
  args: { eventId: v.id("events"), email: v.string() },
  handler: async (ctx, { eventId, email }) => {
    await requireProfile(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) throw new ConvexError("Event not found.");
    const lower = email.trim().toLowerCase();
    if (!lower) throw new ConvexError("A person's email is required.");
    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_event_and_email", (q) =>
        q.eq("eventId", eventId).eq("email", lower)
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("attendance", {
      eventId,
      email: lower,
      year: event.year,
      signInTime: Date.now(),
    });
  },
});

/** Remove a person from an event's roll-call. */
export const signOut = mutation({
  args: { eventId: v.id("events"), email: v.string() },
  handler: async (ctx, { eventId, email }) => {
    await requireProfile(ctx);
    const lower = email.trim().toLowerCase();
    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_event_and_email", (q) =>
        q.eq("eventId", eventId).eq("email", lower)
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
