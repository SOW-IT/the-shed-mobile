import { ConvexError, v } from "convex/values";
import { auditEventName, canReverseSignIn } from "../shared/rollcall";
import { EVENT_GUEST_NAME_MAX, EVENT_GUESTS_MAX } from "../shared/eventGuests";
import { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query } from "./_generated/server";
import { logAttendanceAction } from "./attendanceAudit";
import { adjustEventAttendanceCount } from "./attendanceCounts";
import { optionalProfile, requireProfile } from "./model";

// Guests are people signed in to a single event by name only. They count toward
// that event's headcount (convex/attendanceCounts.ts) but have no attendance
// member, so member lists, search, merges and member stats never see them.

const MAX_GUESTS_PER_EVENT = EVENT_GUESTS_MAX;

const guestValidator = v.object({
  _id: v.id("eventGuests"),
  name: v.string(),
  addedAt: v.number(),
});

export const listByEvent = query({
  args: { eventId: v.string() },
  returns: v.array(guestValidator),
  handler: async (ctx, { eventId: rawEventId }) => {
    if (!(await optionalProfile(ctx))) return [];
    const eventId = ctx.db.normalizeId("events", rawEventId);
    if (!eventId) return [];
    const guests = await ctx.db
      .query("eventGuests")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(MAX_GUESTS_PER_EVENT);
    return guests
      .map((g) => ({ _id: g._id, name: g.name, addedAt: g.addedAt }))
      .sort((a, b) => b.addedAt - a.addedAt);
  },
});

export const add = mutation({
  args: { eventId: v.id("events"), name: v.string() },
  returns: v.id("eventGuests"),
  handler: async (ctx, { eventId, name }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    const event = await ctx.db.get("events", eventId);
    if (!event) throw new ConvexError("Event not found.");
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (!trimmed) throw new ConvexError("A guest's name is required.");
    if (trimmed.length > EVENT_GUEST_NAME_MAX) {
      throw new ConvexError(`Keep a guest's name under ${EVENT_GUEST_NAME_MAX} characters.`);
    }
    const existing = await ctx.db
      .query("eventGuests")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(MAX_GUESTS_PER_EVENT);
    if (existing.length >= MAX_GUESTS_PER_EVENT) {
      throw new ConvexError("This event already has as many guests as it can hold.");
    }
    const id = await ctx.db.insert("eventGuests", {
      eventId,
      name: trimmed,
      addedAt: Date.now(),
      addedBy: actorEmail,
    });
    await adjustEventAttendanceCount(ctx, eventId, 1);
    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "attendance",
      action: "attendance.guestAdd",
      summary: `${trimmed} (guest) signed in to ${auditEventName(event)}`,
      eventId,
    });
    return id;
  },
});

export const remove = mutation({
  args: { guestId: v.id("eventGuests") },
  returns: v.null(),
  handler: async (ctx, { guestId }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    const guest = await ctx.db.get("eventGuests", guestId);
    if (!guest) return null;
    const event = await ctx.db.get("events", guest.eventId);
    if (event && !canReverseSignIn(event, guest.addedAt)) {
      throw new ConvexError(
        "This guest can't be removed. After an event ends, only guests added in the last 10 minutes or after it ended can be removed."
      );
    }
    await ctx.db.delete("eventGuests", guestId);
    await adjustEventAttendanceCount(ctx, guest.eventId, -1);
    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "attendance",
      action: "attendance.guestRemove",
      summary: `Removed ${guest.name} (guest) from ${auditEventName(event)}`,
      eventId: guest.eventId,
    });
    return null;
  },
});

// For deleting an event: removes its guests and returns their names for the log.
export async function deleteEventGuests(
  ctx: MutationCtx,
  eventId: Id<"events">
): Promise<string[]> {
  const guests = await ctx.db
    .query("eventGuests")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(MAX_GUESTS_PER_EVENT);
  for (const guest of guests) await ctx.db.delete("eventGuests", guest._id);
  return guests.map((g) => g.name);
}
