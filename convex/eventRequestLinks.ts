import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";
import { type FormAnswers, msFromSydneyDateTimeAnswer } from "../shared/forms";
import { SOW_SUBGROUP } from "../shared/rollcall";
import { syncEntry } from "./calendar";
import { deleteEvent, insertEvent, retimeEvent } from "./events";

export const takesAttendance = (answers: FormAnswers): boolean => {
  const value = answers.takeAttendance;
  return Array.isArray(value) && value.includes("yes");
};

const requestWindow = (request: Doc<"eventRequests">) => {
  const dateStart = msFromSydneyDateTimeAnswer(request.startsAt);
  const dateEnd = msFromSydneyDateTimeAnswer(request.endsAt);
  if (dateStart === null || dateEnd === null || dateEnd <= dateStart) return null;
  return { dateStart, dateEnd };
};

const hasSignIns = async (ctx: MutationCtx, eventId: Id<"events">) =>
  ((
    await ctx.db
      .query("eventAttendanceCounts")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .unique()
  )?.count ?? 0) > 0;

// Keeps what an event request put on the Calendar in step with it. Approving
// it adds an SOW attendance event when it takes attendance, or a calendar event
// when it doesn't; editing the request renames and moves it, ticking or
// unticking attendance swaps one for the other, and cancelling removes it. An
// attendance event someone was signed in to is never removed.
export async function syncEventRequestLinks(
  ctx: MutationCtx,
  requestId: Id<"eventRequests">,
  actorEmail: string
) {
  const request = await ctx.db.get("eventRequests", requestId);
  if (!request) return;
  const entry = request.calendarEntryId
    ? await ctx.db.get("calendarEntries", request.calendarEntryId)
    : null;
  const event = request.attendanceEventId ? await ctx.db.get("events", request.attendanceEventId) : null;

  const removeEntry = async () => {
    if (!entry) return;
    await ctx.db.delete("calendarEntries", entry._id);
    await syncEntry(ctx, entry._id);
  };
  // False when people were signed in, so it stays.
  const removeEvent = async () => {
    if (!event) return true;
    if (await hasSignIns(ctx, event._id)) return false;
    await deleteEvent(ctx, actorEmail, event._id);
    return true;
  };

  if (request.status === "CANCELLED") {
    await removeEntry();
    const eventGone = await removeEvent();
    await ctx.db.patch("eventRequests", request._id, {
      calendarEntryId: undefined,
      ...(eventGone ? { attendanceEventId: undefined } : {}),
    });
    return;
  }
  // Nothing goes on the Calendar until it's approved the first time.
  if (request.status !== "APPROVED" && !entry && !event) return;
  const window = requestWindow(request);
  if (!window) return;
  const fields = { name: request.name, ...window };

  if (takesAttendance(request.answers) || (event && !(await removeEvent()))) {
    let eventId = event?._id;
    if (event) await retimeEvent(ctx, actorEmail, event._id, fields);
    else eventId = await insertEvent(ctx, actorEmail, { ...fields, subgroups: [SOW_SUBGROUP] }, request._id);
    await removeEntry();
    await ctx.db.patch("eventRequests", request._id, {
      attendanceEventId: eventId,
      calendarEntryId: undefined,
    });
    return;
  }

  let entryId = entry?._id;
  if (entry) {
    if (entry.name !== fields.name || entry.dateStart !== fields.dateStart || entry.dateEnd !== fields.dateEnd) {
      await ctx.db.patch("calendarEntries", entry._id, fields);
      await syncEntry(ctx, entry._id);
    }
  } else {
    entryId = await ctx.db.insert("calendarEntries", {
      ...fields,
      createdBy: request.requesterEmail,
      eventRequestId: request._id,
    });
    await syncEntry(ctx, entryId);
  }
  await ctx.db.patch("eventRequests", request._id, {
    calendarEntryId: entryId,
    attendanceEventId: undefined,
  });
}
