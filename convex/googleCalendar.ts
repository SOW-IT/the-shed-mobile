import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalQuery, QueryCtx } from "./_generated/server";
import { calendarCategoryOf, googleEventBody, googleEventId } from "../shared/calendar";
import { googleAccessToken, googleServiceAccountConfigured } from "./googleAuth";
import { appUrl } from "./requests";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const BACKFILL_LIMIT = 1000;
const DAY_MS = 86_400_000;

// The shared calendar's id (Google Calendar → Settings → Integrate calendar),
// shared with the service account with "Make changes to events".
export const calendarSyncConfigured = (): boolean =>
  !!process.env.GOOGLE_CALENDAR_ID && googleServiceAccountConfigured();

type GoogleBody = ReturnType<typeof googleEventBody>;

async function bodyFor(ctx: QueryCtx, event: Doc<"events">): Promise<GoogleBody> {
  const tags = (await Promise.all((event.tagIds ?? []).map((id) => ctx.db.get(id)))).filter(
    (tag): tag is Doc<"attendanceTags"> => tag !== null
  );
  return googleEventBody(
    event,
    calendarCategoryOf(event, tags),
    appUrl(`/attendance/event/${event._id}`)
  );
}

export const eventBody = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    return event ? await bodyFor(ctx, event) : null;
  },
});

export const bodiesFrom = internalQuery({
  args: { from: v.number() },
  handler: async (ctx, { from }) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) => q.gte("dateStart", from))
      .take(BACKFILL_LIMIT);
    return await Promise.all(
      events.map(async (event) => ({ eventId: event._id, body: await bodyFor(ctx, event) }))
    );
  },
});

const eventUrl = (eventId: Id<"events">) =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    process.env.GOOGLE_CALENDAR_ID as string
  )}/events/${googleEventId(eventId)}`;

async function call(token: string, method: string, url: string, body?: object) {
  return await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function fail(response: Response, what: string): Promise<never> {
  throw new Error(`Google Calendar ${what} failed: ${response.status} ${await response.text()}`);
}

// Update first: it also brings back an event that was deleted earlier.
async function push(token: string, eventId: Id<"events">, body: GoogleBody) {
  const updated = await call(token, "PUT", eventUrl(eventId), body);
  if (updated.ok) return;
  if (updated.status !== 404) await fail(updated, "update");
  const inserted = await call(
    token,
    "POST",
    eventUrl(eventId).replace(/\/[^/]+$/, ""),
    { ...body, id: googleEventId(eventId) }
  );
  if (!inserted.ok) await fail(inserted, "insert");
}

async function remove(token: string, eventId: Id<"events">) {
  const response = await call(token, "DELETE", eventUrl(eventId));
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    await fail(response, "delete");
  }
}

export const syncEvent = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    if (!calendarSyncConfigured()) return null;
    const body: GoogleBody | null = await ctx.runQuery(internal.googleCalendar.eventBody, {
      eventId,
    });
    const token = await googleAccessToken(SCOPE);
    if (body) await push(token, eventId, body);
    else await remove(token, eventId);
    return null;
  },
});

// Copies events from `daysBack` days ago onwards; safe to run again.
// npx convex run googleCalendar:backfill '{"daysBack": 90}'
export const backfill = internalAction({
  args: { daysBack: v.number() },
  handler: async (ctx, { daysBack }) => {
    if (!calendarSyncConfigured()) {
      throw new Error("Set GOOGLE_CALENDAR_ID (and the service account) first.");
    }
    const rows: { eventId: Id<"events">; body: GoogleBody }[] = await ctx.runQuery(
      internal.googleCalendar.bodiesFrom,
      { from: Date.now() - daysBack * DAY_MS }
    );
    const token = await googleAccessToken(SCOPE);
    for (const row of rows) await push(token, row.eventId, row.body);
    return { synced: rows.length };
  },
});
